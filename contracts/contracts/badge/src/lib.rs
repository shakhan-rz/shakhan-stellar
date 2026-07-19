#![no_std]
//! Supporter badge registry.
//!
//! A separate ledger of who backed which campaign and how much. The
//! crowdfunding contract calls `award` on every contribution; this contract
//! keeps the running total per supporter, derives a tier from it, and emits an
//! event so the frontend can react without polling.
//!
//! Records are keyed by (campaign, supporter) rather than supporter alone, so
//! one deployment can serve many campaigns.

use soroban_sdk::{
    contract, contracterror, contractevent, contractimpl, contracttype, Address, Env, Vec,
};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    InvalidThresholds = 4,
    /// A campaign that was never registered tried to award a badge.
    UnknownCampaign = 5,
}

/// Badge level, derived from a supporter's running total for a campaign.
#[contracttype]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
pub enum Tier {
    Bronze = 0,
    Silver = 1,
    Gold = 2,
}

/// What one supporter has done for one campaign.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Badge {
    pub supporter: Address,
    pub total: i128,
    pub tier: Tier,
    /// How many separate contributions they made.
    pub count: u32,
}

/// Emitted when a campaign is allowed to award badges.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CampaignRegistered {
    #[topic]
    pub campaign: Address,
}

/// Emitted on every award. The frontend subscribes to this instead of polling.
#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BadgeAwarded {
    #[topic]
    pub campaign: Address,
    #[topic]
    pub supporter: Address,
    /// Amount credited by this call.
    pub amount: i128,
    /// Running total after this call.
    pub total: i128,
    pub tier: Tier,
    pub count: u32,
}

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Set once; may register campaigns and update thresholds.
    Admin,
    /// Contribution total at which Bronze becomes Silver.
    SilverAt,
    /// Contribution total at which Silver becomes Gold.
    GoldAt,
    /// Marks a campaign contract as allowed to award badges.
    Campaign(Address),
    /// The badge held by `supporter` for `campaign`.
    Held(Address, Address),
    /// Every supporter of `campaign`, in first-contribution order.
    Roster(Address),
}

#[contract]
pub struct BadgeContract;

#[contractimpl]
impl BadgeContract {
    /// Set the admin and the two tier thresholds. Callable once.
    ///
    /// Thresholds are in the campaign token's smallest unit (stroops for XLM).
    pub fn initialize(
        env: Env,
        admin: Address,
        silver_at: i128,
        gold_at: i128,
    ) -> Result<(), Error> {
        let store = env.storage().instance();
        if store.has(&DataKey::Admin) {
            return Err(Error::AlreadyInitialized);
        }
        if silver_at <= 0 || gold_at <= silver_at {
            return Err(Error::InvalidThresholds);
        }
        store.set(&DataKey::Admin, &admin);
        store.set(&DataKey::SilverAt, &silver_at);
        store.set(&DataKey::GoldAt, &gold_at);
        Ok(())
    }

    /// Allow `campaign` to award badges. Admin only.
    pub fn register_campaign(env: Env, campaign: Address) -> Result<(), Error> {
        let admin = Self::admin(&env)?;
        admin.require_auth();
        env.storage()
            .instance()
            .set(&DataKey::Campaign(campaign.clone()), &true);
        CampaignRegistered { campaign }.publish(&env);
        Ok(())
    }

    /// Credit `supporter` with `amount` toward `campaign`, then return the
    /// badge they now hold.
    ///
    /// Only a registered campaign contract may call this. When the crowdfunding
    /// contract invokes it, `campaign.require_auth()` is satisfied by the
    /// invocation itself — a contract authorizes calls it makes on its own
    /// behalf.
    pub fn award(
        env: Env,
        campaign: Address,
        supporter: Address,
        amount: i128,
    ) -> Result<Badge, Error> {
        if !env.storage().instance().has(&DataKey::Admin) {
            return Err(Error::NotInitialized);
        }
        if !env
            .storage()
            .instance()
            .has(&DataKey::Campaign(campaign.clone()))
        {
            return Err(Error::UnknownCampaign);
        }
        campaign.require_auth();

        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }

        let key = DataKey::Held(campaign.clone(), supporter.clone());
        let previous: Option<Badge> = env.storage().persistent().get(&key);

        let (total, count) = match &previous {
            Some(b) => (b.total + amount, b.count + 1),
            None => (amount, 1),
        };

        let badge = Badge {
            supporter: supporter.clone(),
            total,
            tier: Self::tier_for(&env, total),
            count,
        };
        env.storage().persistent().set(&key, &badge);

        // First contribution from this supporter — add them to the roster.
        if previous.is_none() {
            let roster_key = DataKey::Roster(campaign.clone());
            let mut roster: Vec<Address> = env
                .storage()
                .persistent()
                .get(&roster_key)
                .unwrap_or_else(|| Vec::new(&env));
            roster.push_back(supporter.clone());
            env.storage().persistent().set(&roster_key, &roster);
        }

        // Let the frontend update without polling the ledger.
        BadgeAwarded {
            campaign,
            supporter,
            amount,
            total: badge.total,
            tier: badge.tier,
            count: badge.count,
        }
        .publish(&env);

        Ok(badge)
    }

    // ---- reads ------------------------------------------------------------

    /// The badge `supporter` holds for `campaign`, if any.
    pub fn badge_of(env: Env, campaign: Address, supporter: Address) -> Option<Badge> {
        env.storage()
            .persistent()
            .get(&DataKey::Held(campaign, supporter))
    }

    /// Every badge issued for `campaign`, in first-contribution order.
    ///
    /// Ranking is left to the caller: sorting on-chain would cost gas that
    /// grows with the supporter count, and the frontend can order the list for
    /// free.
    pub fn supporters(env: Env, campaign: Address) -> Vec<Badge> {
        let roster: Vec<Address> = env
            .storage()
            .persistent()
            .get(&DataKey::Roster(campaign.clone()))
            .unwrap_or_else(|| Vec::new(&env));

        let mut out = Vec::new(&env);
        for supporter in roster.iter() {
            if let Some(badge) = env
                .storage()
                .persistent()
                .get::<DataKey, Badge>(&DataKey::Held(campaign.clone(), supporter))
            {
                out.push_back(badge);
            }
        }
        out
    }

    /// How many supporters `campaign` has.
    pub fn supporter_count(env: Env, campaign: Address) -> u32 {
        env.storage()
            .persistent()
            .get::<DataKey, Vec<Address>>(&DataKey::Roster(campaign))
            .map(|r| r.len())
            .unwrap_or(0)
    }

    /// The (silver, gold) thresholds.
    pub fn thresholds(env: Env) -> (i128, i128) {
        let store = env.storage().instance();
        (
            store.get(&DataKey::SilverAt).unwrap_or(0),
            store.get(&DataKey::GoldAt).unwrap_or(0),
        )
    }

    pub fn is_registered(env: Env, campaign: Address) -> bool {
        env.storage().instance().has(&DataKey::Campaign(campaign))
    }

    // ---- helpers ----------------------------------------------------------

    fn admin(env: &Env) -> Result<Address, Error> {
        env.storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(Error::NotInitialized)
    }

    fn tier_for(env: &Env, total: i128) -> Tier {
        let store = env.storage().instance();
        let silver: i128 = store.get(&DataKey::SilverAt).unwrap_or(i128::MAX);
        let gold: i128 = store.get(&DataKey::GoldAt).unwrap_or(i128::MAX);
        if total >= gold {
            Tier::Gold
        } else if total >= silver {
            Tier::Silver
        } else {
            Tier::Bronze
        }
    }
}

#[cfg(test)]
mod test;
