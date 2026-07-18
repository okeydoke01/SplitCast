#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, Vec, Symbol, Address};

// Define split registry mock to deploy alongside splitter
#[contract]
pub struct MockRegistry;

#[contractimpl]
impl MockRegistry {
    pub fn get_split(env: Env, split_id: u64) -> SplitConfig {
        let r1 = Address::generate(&env);
        let r2 = Address::generate(&env);
        let r3 = Address::generate(&env);

        if split_id == 1 {
            // 50/50 split
            SplitConfig {
                id: 1,
                owner: Address::generate(&env),
                name: Symbol::new(&env, "split_50_50"),
                recipients: Vec::from_array(&env, [r1, r2]),
                shares_bps: Vec::from_array(&env, [5000, 5000]),
            }
        } else if split_id == 2 {
            // 70/20/10 split
            SplitConfig {
                id: 2,
                owner: Address::generate(&env),
                name: Symbol::new(&env, "split_70_20_10"),
                recipients: Vec::from_array(&env, [r1, r2, r3]),
                shares_bps: Vec::from_array(&env, [7000, 2000, 1000]),
            }
        } else if split_id == 3 {
            // Single recipient split (100%)
            SplitConfig {
                id: 3,
                owner: Address::generate(&env),
                name: Symbol::new(&env, "single_recipient"),
                recipients: Vec::from_array(&env, [r1]),
                shares_bps: Vec::from_array(&env, [10000]),
            }
        } else if split_id == 4 {
            // Split with a zero-share recipient (70/30/0)
            SplitConfig {
                id: 4,
                owner: Address::generate(&env),
                name: Symbol::new(&env, "zero_share_split"),
                recipients: Vec::from_array(&env, [r1, r2, r3]),
                shares_bps: Vec::from_array(&env, [7000, 3000, 0]),
            }
        } else {
            panic!("SplitNotFound");
        }
    }
}

#[test]
fn test_splitter_initialize() {
    let env = Env::default();
    env.mock_all_auths();

    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    let registry = Address::generate(&env);

    splitter_client.initialize(&admin, &registry);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_splitter_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    let registry = Address::generate(&env);

    splitter_client.initialize(&admin, &registry);
    splitter_client.initialize(&admin, &registry);
}

#[test]
fn test_pay_50_50() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy mock registry
    let registry_id = env.register_contract(None, MockRegistry);

    // Deploy splitter
    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    splitter_client.initialize(&admin, &registry_id);

    // Deploy Stellar Asset Contract (SAC) for mock token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = soroban_sdk::token::Client::new(&env, &token_id);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);

    let payer = Address::generate(&env);
    token_admin_client.mint(&payer, &1000);

    // Get recipients from mock registry config for split_id = 1
    let config: SplitConfig = env.invoke_contract(&registry_id, &Symbol::new(&env, "get_split"), soroban_sdk::vec![&env, 1u64.into_val(&env)]);
    let r1 = config.recipients.get(0).unwrap();
    let r2 = config.recipients.get(1).unwrap();

    // Pay 100 tokens
    splitter_client.pay(&payer, &1, &token_id, &100);

    // Verify balances
    assert_eq!(token_client.balance(&payer), 900);
    assert_eq!(token_client.balance(&r1), 50);
    assert_eq!(token_client.balance(&r2), 50);

    // Verify cumulative totals
    assert_eq!(splitter_client.total_earned(&1, &r1), 50);
    assert_eq!(splitter_client.total_earned(&1, &r2), 50);
}

#[test]
fn test_pay_dust_routing() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy mock registry
    let registry_id = env.register_contract(None, MockRegistry);

    // Deploy splitter
    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    splitter_client.initialize(&admin, &registry_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = soroban_sdk::token::Client::new(&env, &token_id);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);

    let payer = Address::generate(&env);
    token_admin_client.mint(&payer, &1000);

    // Get split_id = 2 configuration (70/20/10)
    let config: SplitConfig = env.invoke_contract(&registry_id, &Symbol::new(&env, "get_split"), soroban_sdk::vec![&env, 2u64.into_val(&env)]);
    let r1 = config.recipients.get(0).unwrap();
    let r2 = config.recipients.get(1).unwrap();
    let r3 = config.recipients.get(2).unwrap();

    // Pay 99 tokens (uneven, produces dust)
    // 99 * 70% = 69.3 -> 69
    // 99 * 20% = 19.8 -> 19
    // Remaining dust goes to r3 (last recipient) -> 99 - (69 + 19) = 11
    splitter_client.pay(&payer, &2, &token_id, &99);

    // Verify balances
    assert_eq!(token_client.balance(&payer), 901);
    assert_eq!(token_client.balance(&r1), 69);
    assert_eq!(token_client.balance(&r2), 19);
    assert_eq!(token_client.balance(&r3), 11);

    // Verify cumulative totals
    assert_eq!(splitter_client.total_earned(&2, &r1), 69);
    assert_eq!(splitter_client.total_earned(&2, &r2), 19);
    assert_eq!(splitter_client.total_earned(&2, &r3), 11);
}

#[test]
fn test_pay_accumulate_multiple() {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register_contract(None, MockRegistry);
    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    splitter_client.initialize(&admin, &registry_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);

    let payer = Address::generate(&env);
    token_admin_client.mint(&payer, &1000);

    let config: SplitConfig = env.invoke_contract(&registry_id, &Symbol::new(&env, "get_split"), soroban_sdk::vec![&env, 1u64.into_val(&env)]);
    let r1 = config.recipients.get(0).unwrap();

    // Pay twice: 100 then 250
    splitter_client.pay(&payer, &1, &token_id, &100);
    splitter_client.pay(&payer, &1, &token_id, &250);

    assert_eq!(splitter_client.total_earned(&1, &r1), 175); // (50 + 125)
}

#[test]
fn test_pay_invalid_amount() {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register_contract(None, MockRegistry);
    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    splitter_client.initialize(&admin, &registry_id);

    let token_id = Address::generate(&env);
    let payer = Address::generate(&env);

    // Pay zero
    let res = splitter_client.try_pay(&payer, &1, &token_id, &0);
    assert!(res.is_err());

    // Pay negative
    let res = splitter_client.try_pay(&payer, &1, &token_id, &-50);
    assert!(res.is_err());
}

#[test]
fn test_pay_nonexistent_split() {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register_contract(None, MockRegistry);
    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    splitter_client.initialize(&admin, &registry_id);

    let token_id = Address::generate(&env);
    let payer = Address::generate(&env);

    // Split ID 99 doesn't exist in mock registry
    let res = splitter_client.try_pay(&payer, &99, &token_id, &100);
    assert!(res.is_err());
}

#[test]
fn test_pay_single_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register_contract(None, MockRegistry);
    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    splitter_client.initialize(&admin, &registry_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = soroban_sdk::token::Client::new(&env, &token_id);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);

    let payer = Address::generate(&env);
    token_admin_client.mint(&payer, &1000);

    let config: SplitConfig = env.invoke_contract(&registry_id, &Symbol::new(&env, "get_split"), soroban_sdk::vec![&env, 3u64.into_val(&env)]);
    let r1 = config.recipients.get(0).unwrap();

    splitter_client.pay(&payer, &3, &token_id, &500);

    assert_eq!(token_client.balance(&payer), 500);
    assert_eq!(token_client.balance(&r1), 500);
    assert_eq!(splitter_client.total_earned(&3, &r1), 500);
}

#[test]
fn test_pay_with_zero_share_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let registry_id = env.register_contract(None, MockRegistry);
    let splitter_id = env.register_contract(None, Splitter);
    let splitter_client = SplitterClient::new(&env, &splitter_id);

    let admin = Address::generate(&env);
    splitter_client.initialize(&admin, &registry_id);

    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract(token_admin.clone());
    let token_client = soroban_sdk::token::Client::new(&env, &token_id);
    let token_admin_client = soroban_sdk::token::StellarAssetClient::new(&env, &token_id);

    let payer = Address::generate(&env);
    token_admin_client.mint(&payer, &1000);

    let config: SplitConfig = env.invoke_contract(&registry_id, &Symbol::new(&env, "get_split"), soroban_sdk::vec![&env, 4u64.into_val(&env)]);
    let r1 = config.recipients.get(0).unwrap();
    let r2 = config.recipients.get(1).unwrap();
    let r3 = config.recipients.get(2).unwrap();

    // Pay 1000.
    // r1 gets 70% -> 700
    // r2 gets 30% -> 300
    // r3 gets 0% -> 0
    splitter_client.pay(&payer, &4, &token_id, &1000);

    assert_eq!(token_client.balance(&payer), 0);
    assert_eq!(token_client.balance(&r1), 700);
    assert_eq!(token_client.balance(&r2), 300);
    assert_eq!(token_client.balance(&r3), 0);

    assert_eq!(splitter_client.total_earned(&4, &r1), 700);
    assert_eq!(splitter_client.total_earned(&4, &r2), 300);
    assert_eq!(splitter_client.total_earned(&4, &r3), 0);
}

