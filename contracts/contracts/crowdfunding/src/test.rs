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
