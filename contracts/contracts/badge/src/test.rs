#![cfg(test)]
use super::*;
use soroban_sdk::{
    events::Event as _,
    testutils::{Address as _, Events},
    Address, Env,
};

const SILVER_AT: i128 = 500;
const GOLD_AT: i128 = 2_000;

struct Fixture<'a> {
    env: Env,
    client: BadgeContractClient<'a>,
    contract_id: Address,
    campaign: Address,
}

fn setup() -> Fixture<'static> {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let campaign = Address::generate(&env);

    let id = env.register(BadgeContract, ());
    let client = BadgeContractClient::new(&env, &id);
    client.initialize(&admin, &SILVER_AT, &GOLD_AT);
    client.register_campaign(&campaign);

    Fixture {
        env,
        client,
        contract_id: id,
        campaign,
    }
}

#[test]
fn award_accumulates_and_promotes_tier() {
    let f = setup();
    let donor = Address::generate(&f.env);

    // Below the silver threshold — Bronze.
    let badge = f.client.award(&f.campaign, &donor, &100);
    assert_eq!(badge.total, 100);
    assert_eq!(badge.tier, Tier::Bronze);
    assert_eq!(badge.count, 1);

    // Crossing silver promotes, and the total accumulates across calls.
    let badge = f.client.award(&f.campaign, &donor, &400);
    assert_eq!(badge.total, 500);
    assert_eq!(badge.tier, Tier::Silver);
    assert_eq!(badge.count, 2);

    // Crossing gold promotes again.
    let badge = f.client.award(&f.campaign, &donor, &1_500);
    assert_eq!(badge.total, 2_000);
    assert_eq!(badge.tier, Tier::Gold);
    assert_eq!(badge.count, 3);

    assert_eq!(f.client.badge_of(&f.campaign, &donor), Some(badge));
}

#[test]
fn roster_lists_each_supporter_once() {
    let f = setup();
    let alice = Address::generate(&f.env);
    let bob = Address::generate(&f.env);

    f.client.award(&f.campaign, &alice, &100);
    f.client.award(&f.campaign, &bob, &600);
    f.client.award(&f.campaign, &alice, &50); // repeat donor, not a new entry

    assert_eq!(f.client.supporter_count(&f.campaign), 2);

    let supporters = f.client.supporters(&f.campaign);
    assert_eq!(supporters.len(), 2);
    assert_eq!(supporters.get(0).unwrap().supporter, alice);
    assert_eq!(supporters.get(0).unwrap().total, 150);
    assert_eq!(supporters.get(1).unwrap().supporter, bob);
    assert_eq!(supporters.get(1).unwrap().tier, Tier::Silver);
}

#[test]
fn badges_are_scoped_per_campaign() {
    let f = setup();
    let other_campaign = Address::generate(&f.env);
    f.client.register_campaign(&other_campaign);

    let donor = Address::generate(&f.env);
    f.client.award(&f.campaign, &donor, &600);
    f.client.award(&other_campaign, &donor, &100);

    // Same donor, two campaigns, two independent badges.
    assert_eq!(
        f.client.badge_of(&f.campaign, &donor).unwrap().tier,
        Tier::Silver
    );
    assert_eq!(
        f.client.badge_of(&other_campaign, &donor).unwrap().tier,
        Tier::Bronze
    );
}

#[test]
fn unregistered_campaign_cannot_award() {
    let f = setup();
    let stranger = Address::generate(&f.env);
    let donor = Address::generate(&f.env);

    let res = f.client.try_award(&stranger, &donor, &100);
    assert_eq!(res, Err(Ok(Error::UnknownCampaign)));
}

#[test]
fn zero_amount_is_rejected() {
    let f = setup();
    let donor = Address::generate(&f.env);

    let res = f.client.try_award(&f.campaign, &donor, &0);
    assert_eq!(res, Err(Ok(Error::InvalidAmount)));
}

#[test]
fn initialize_is_once_only() {
    let f = setup();
    let other = Address::generate(&f.env);

    let res = f.client.try_initialize(&other, &SILVER_AT, &GOLD_AT);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn award_publishes_an_event() {
    let f = setup();
    let donor = Address::generate(&f.env);

    f.client.award(&f.campaign, &donor, &600);

    let expected = BadgeAwarded {
        campaign: f.campaign.clone(),
        supporter: donor.clone(),
        amount: 600,
        total: 600,
        tier: Tier::Silver,
        count: 1,
    };

    // The last event should be the award, carrying the new total and tier.
    let all = f.env.events().all();
    let published = all.events().last().expect("no event published");

    assert_eq!(*published, expected.to_xdr(&f.env, &f.contract_id));
}

#[test]
fn thresholds_must_ascend() {
    let env = Env::default();
    env.mock_all_auths();
    let admin = Address::generate(&env);
    let id = env.register(BadgeContract, ());
    let client = BadgeContractClient::new(&env, &id);

    let res = client.try_initialize(&admin, &1_000, &500);
    assert_eq!(res, Err(Ok(Error::InvalidThresholds)));
}
