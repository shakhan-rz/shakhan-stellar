#![cfg(test)]
use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env,
};

fn create_token<'a>(env: &Env, admin: &Address) -> (Address, token::StellarAssetClient<'a>) {
    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let addr = sac.address();
    let admin_client = token::StellarAssetClient::new(env, &addr);
    (addr, admin_client)
}

/// Deploy a badge registry and point `campaign` at it.
fn attach_badges<'a>(
    env: &Env,
    campaign: &Address,
    client: &CrowdfundingContractClient,
    silver_at: i128,
    gold_at: i128,
) -> badge::BadgeContractClient<'a> {
    let admin = Address::generate(env);
    let badge_id = env.register(badge::BadgeContract, ());
    let badges = badge::BadgeContractClient::new(env, &badge_id);

    badges.initialize(&admin, &silver_at, &gold_at);
    badges.register_campaign(campaign);
    client.set_badge_registry(&badge_id);

    badges
}

#[test]
fn contribute_reaches_goal_and_withdraws() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let donor = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    token_admin.mint(&donor, &1_000);

    let id = env.register(CrowdfundingContract, ());
    let client = CrowdfundingContractClient::new(&env, &id);

    let deadline = env.ledger().timestamp() + 1_000;
    client.initialize(&recipient, &token_addr, &500, &deadline);

    client.contribute(&donor, &500);
    assert_eq!(client.total_raised(), 500);
    assert_eq!(client.contribution(&donor), 500);

    // recipient can withdraw because the goal was reached
    client.withdraw();
    let coin = token::Client::new(&env, &token_addr);
    assert_eq!(coin.balance(&recipient), 500);
    assert_eq!(client.total_raised(), 0);
}

#[test]
fn refund_after_failed_campaign() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let donor = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    token_admin.mint(&donor, &1_000);

    let id = env.register(CrowdfundingContract, ());
    let client = CrowdfundingContractClient::new(&env, &id);

    let deadline = env.ledger().timestamp() + 100;
    client.initialize(&recipient, &token_addr, &1_000, &deadline);
    client.contribute(&donor, &400);

    // move past the deadline; goal (1000) was not met
    env.ledger().set_timestamp(deadline + 1);

    client.refund(&donor);
    let coin = token::Client::new(&env, &token_addr);
    assert_eq!(coin.balance(&donor), 1_000);
    assert_eq!(client.contribution(&donor), 0);
}

#[test]
fn contribute_after_deadline_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let donor = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    token_admin.mint(&donor, &1_000);

    let id = env.register(CrowdfundingContract, ());
    let client = CrowdfundingContractClient::new(&env, &id);

    let deadline = env.ledger().timestamp() + 100;
    client.initialize(&recipient, &token_addr, &500, &deadline);

    env.ledger().set_timestamp(deadline + 1);
    let res = client.try_contribute(&donor, &100);
    assert_eq!(res, Err(Ok(Error::DeadlinePassed)));
}

// ---- cross-contract: campaign -> badge registry ---------------------------

#[test]
fn contributing_awards_a_badge() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let donor = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    token_admin.mint(&donor, &10_000);

    let id = env.register(CrowdfundingContract, ());
    let client = CrowdfundingContractClient::new(&env, &id);

    let deadline = env.ledger().timestamp() + 1_000;
    client.initialize(&recipient, &token_addr, &5_000, &deadline);
    let badges = attach_badges(&env, &id, &client, 500, 2_000);

    assert_eq!(client.badge_registry(), Some(badges.address.clone()));

    // Small contribution -> Bronze.
    client.contribute(&donor, &100);
    let held = badges.badge_of(&id, &donor).expect("no badge awarded");
    assert_eq!(held.total, 100);
    assert_eq!(held.tier, badge::Tier::Bronze);
    assert_eq!(held.count, 1);

    // The campaign keeps its own tally in step with the registry.
    assert_eq!(client.contribution(&donor), 100);

    // Cross the silver threshold on a second contribution.
    client.contribute(&donor, &400);
    let held = badges.badge_of(&id, &donor).unwrap();
    assert_eq!(held.total, 500);
    assert_eq!(held.tier, badge::Tier::Silver);
    assert_eq!(held.count, 2);

    // And the donor shows up exactly once on the roster.
    assert_eq!(badges.supporter_count(&id), 1);
}

#[test]
fn campaign_works_without_a_badge_registry() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let donor = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    token_admin.mint(&donor, &1_000);

    let id = env.register(CrowdfundingContract, ());
    let client = CrowdfundingContractClient::new(&env, &id);

    let deadline = env.ledger().timestamp() + 1_000;
    client.initialize(&recipient, &token_addr, &500, &deadline);

    // No registry attached — contributing must still work.
    assert_eq!(client.badge_registry(), None);
    client.contribute(&donor, &250);
    assert_eq!(client.total_raised(), 250);
}

#[test]
fn badge_registry_is_set_once() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let (token_addr, _) = create_token(&env, &admin);

    let id = env.register(CrowdfundingContract, ());
    let client = CrowdfundingContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp() + 1_000;
    client.initialize(&recipient, &token_addr, &500, &deadline);

    attach_badges(&env, &id, &client, 500, 2_000);

    let other = env.register(badge::BadgeContract, ());
    let res = client.try_set_badge_registry(&other);
    assert_eq!(res, Err(Ok(Error::AlreadyInitialized)));
}

#[test]
fn contribute_publishes_an_event() {
    use soroban_sdk::events::Event as _;
    use soroban_sdk::testutils::Events;

    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let recipient = Address::generate(&env);
    let donor = Address::generate(&env);

    let (token_addr, token_admin) = create_token(&env, &admin);
    token_admin.mint(&donor, &1_000);

    let id = env.register(CrowdfundingContract, ());
    let client = CrowdfundingContractClient::new(&env, &id);
    let deadline = env.ledger().timestamp() + 1_000;
    client.initialize(&recipient, &token_addr, &500, &deadline);

    client.contribute(&donor, &500);

    let expected = Contributed {
        donor: donor.clone(),
        amount: 500,
        total_raised: 500,
        goal_reached: true,
    };

    let all = env.events().all();
    let ours = all.filter_by_contract(&id);
    let published = ours.events().last().expect("no event published");

    assert_eq!(*published, expected.to_xdr(&env, &id));
}
