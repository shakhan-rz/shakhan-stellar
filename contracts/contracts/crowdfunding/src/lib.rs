#![no_std]
use soroban_sdk::{
    contract, contractclient, contracterror, contractevent, contractimpl, contracttype, token,
    Address, Env, Val,
};

/// The slice of the badge registry's interface this contract calls.
///
/// Declared here rather than depending on the badge crate: linking that crate
/// in would pull its `#[contractimpl]` exports into this wasm, where its
/// `initialize` would collide with ours. The return value is left as a raw
/// `Val` because the awarded badge is of no use to the campaign — the frontend
/// reads it from the registry directly.
#[contractclient(name = "BadgeClient")]
pub trait BadgeRegistry {
    fn award(env: Env, campaign: Address, supporter: Address, amount: i128) -> Val;
}

/// Error types returned by the crowdfunding contract.
/// (The Yellow Belt challenge asks for at least 3 handled error types.)
#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidAmount = 3,
    DeadlinePassed = 4,
    GoalNotReached = 5,
    DeadlineNotReached = 6,
    NothingToRefund = 7,
}

/// Storage keys for the contract state.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Recipient,             // who receives the funds when the goal is met
    Token,                 // the token (XLM SAC) used for contributions
    Goal,                  // target amount (in stroops)
    Deadline,              // unix timestamp after which contributions stop
    TotalRaised,           // running total contributed so far
    Contribution(Address), // amount contributed by a given donor
    Badge,                 // optional badge registry to notify on each contribution
}

// ---- events ---------------------------------------------------------------
// Published so the frontend can update live instead of re-reading the ledger.

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Contributed {
    #[topic]
    pub donor: Address,
    pub amount: i128,
    /// Campaign total after this contribution.
    pub total_raised: i128,
    pub goal_reached: bool,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Withdrawn {
    #[topic]
    pub recipient: Address,
    pub amount: i128,
}

#[contractevent]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Refunded {
    #[topic]
    pub donor: Address,
    pub amount: i128,
}

#[contract]
pub struct CrowdfundingContract;

#[contractimpl]
impl CrowdfundingContract {
    /// Set up a new campaign. Can only be called once.
    pub fn initialize(
        env: Env,
        recipient: Address,
        token: Address,
        goal: i128,
        deadline: u64,
    ) -> Result<(), Error> {
        let store = env.storage().instance();
        if store.has(&DataKey::Recipient) {
            return Err(Error::AlreadyInitialized);
        }
        if goal <= 0 {
            return Err(Error::InvalidAmount);
        }
        store.set(&DataKey::Recipient, &recipient);
        store.set(&DataKey::Token, &token);
        store.set(&DataKey::Goal, &goal);
        store.set(&DataKey::Deadline, &deadline);
        store.set(&DataKey::TotalRaised, &0i128);
        Ok(())
    }

    /// Contribute `amount` to the campaign. The donor must authorize the call;
    /// the tokens are pulled from the donor into the contract.
    pub fn contribute(env: Env, donor: Address, amount: i128) -> Result<(), Error> {
        donor.require_auth();
        let store = env.storage().instance();
        if !store.has(&DataKey::Recipient) {
            return Err(Error::NotInitialized);
        }
        if amount <= 0 {
            return Err(Error::InvalidAmount);
        }
        let deadline: u64 = store.get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() > deadline {
            return Err(Error::DeadlinePassed);
        }

        let token: Address = store.get(&DataKey::Token).unwrap();
        let client = token::Client::new(&env, &token);
        client.transfer(&donor, &env.current_contract_address(), &amount);

        let total: i128 = store.get(&DataKey::TotalRaised).unwrap();
        store.set(&DataKey::TotalRaised, &(total + amount));

        let prev: i128 = env
            .storage()
            .persistent()
            .get(&DataKey::Contribution(donor.clone()))
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&DataKey::Contribution(donor.clone()), &(prev + amount));

        let new_total = total + amount;

        // Cross-contract call: credit the donor in the badge registry. The
        // registry checks that this campaign is registered and that the call
        // really came from it — our address authorizes the sub-invocation
        // simply by being the caller.
        if let Some(badge) = store.get::<DataKey, Address>(&DataKey::Badge) {
            BadgeClient::new(&env, &badge).award(&env.current_contract_address(), &donor, &amount);
        }

        let goal: i128 = store.get(&DataKey::Goal).unwrap();
        Contributed {
            donor,
            amount,
            total_raised: new_total,
            goal_reached: new_total >= goal,
        }
        .publish(&env);

        Ok(())
    }

    /// Point this campaign at a badge registry. Recipient only, and only once —
    /// leaving it unset simply disables badges.
    pub fn set_badge_registry(env: Env, badge: Address) -> Result<(), Error> {
        let store = env.storage().instance();
        let recipient: Address = store
            .get(&DataKey::Recipient)
            .ok_or(Error::NotInitialized)?;
        recipient.require_auth();

        if store.has(&DataKey::Badge) {
            return Err(Error::AlreadyInitialized);
        }
        store.set(&DataKey::Badge, &badge);
        Ok(())
    }

    /// The badge registry this campaign reports to, if any.
    pub fn badge_registry(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Badge)
    }

    /// The recipient withdraws all funds once the goal has been reached.
    pub fn withdraw(env: Env) -> Result<(), Error> {
        let store = env.storage().instance();
        if !store.has(&DataKey::Recipient) {
            return Err(Error::NotInitialized);
        }
        let recipient: Address = store.get(&DataKey::Recipient).unwrap();
        recipient.require_auth();

        let goal: i128 = store.get(&DataKey::Goal).unwrap();
        let total: i128 = store.get(&DataKey::TotalRaised).unwrap();
        if total < goal {
            return Err(Error::GoalNotReached);
        }

        let token: Address = store.get(&DataKey::Token).unwrap();
        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &recipient, &total);

        store.set(&DataKey::TotalRaised, &0i128);
        Withdrawn {
            recipient,
            amount: total,
        }
        .publish(&env);
        Ok(())
    }

    /// If the deadline passed and the goal was NOT met, a donor can reclaim
    /// their contribution.
    pub fn refund(env: Env, donor: Address) -> Result<(), Error> {
        donor.require_auth();
        let store = env.storage().instance();
        if !store.has(&DataKey::Recipient) {
            return Err(Error::NotInitialized);
        }
        let deadline: u64 = store.get(&DataKey::Deadline).unwrap();
        if env.ledger().timestamp() <= deadline {
            return Err(Error::DeadlineNotReached);
        }
        let goal: i128 = store.get(&DataKey::Goal).unwrap();
        let total: i128 = store.get(&DataKey::TotalRaised).unwrap();
        if total >= goal {
            return Err(Error::GoalNotReached);
        }

        let key = DataKey::Contribution(donor.clone());
        let amount: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        if amount <= 0 {
            return Err(Error::NothingToRefund);
        }

        let token: Address = store.get(&DataKey::Token).unwrap();
        let client = token::Client::new(&env, &token);
        client.transfer(&env.current_contract_address(), &donor, &amount);

        env.storage().persistent().set(&key, &0i128);
        store.set(&DataKey::TotalRaised, &(total - amount));
        Refunded { donor, amount }.publish(&env);
        Ok(())
    }

    // ---- read-only getters (used by the frontend to show campaign state) ----

    pub fn goal(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::Goal).unwrap_or(0)
    }

    pub fn total_raised(env: Env) -> i128 {
        env.storage()
            .instance()
            .get(&DataKey::TotalRaised)
            .unwrap_or(0)
    }

    pub fn deadline(env: Env) -> u64 {
        env.storage()
            .instance()
            .get(&DataKey::Deadline)
            .unwrap_or(0)
    }

    pub fn recipient(env: Env) -> Option<Address> {
        env.storage().instance().get(&DataKey::Recipient)
    }

    pub fn contribution(env: Env, donor: Address) -> i128 {
        env.storage()
            .persistent()
            .get(&DataKey::Contribution(donor))
            .unwrap_or(0)
    }
}

#[cfg(test)]
mod test;
