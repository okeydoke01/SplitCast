#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Env, Vec, Symbol};

#[test]
fn test_initialize() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);
}

#[test]
#[should_panic(expected = "already initialized")]
fn test_initialize_twice() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);
    client.initialize(&admin);
}

#[test]
fn test_create_and_get_split() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let recipients = Vec::from_array(&env, [r1.clone(), r2.clone()]);
    let shares = Vec::from_array(&env, [6000, 4000]);

    let split_id = client.create_split(&owner, &Symbol::new(&env, "album_split"), &recipients, &shares);
    assert_eq!(split_id, 1);

    let config = client.get_split(&split_id);
    assert_eq!(config.id, 1);
    assert_eq!(config.owner, owner);
    assert_eq!(config.name, Symbol::new(&env, "album_split"));
    assert_eq!(config.recipients, recipients);
    assert_eq!(config.shares_bps, shares);
}

#[test]
fn test_create_split_invalid_shares() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let recipients = Vec::from_array(&env, [r1, r2]);

    // Sum is 9900 (less than 10000)
    let shares_low = Vec::from_array(&env, [5900, 4000]);
    let res = client.try_create_split(&owner, &Symbol::new(&env, "fail"), &recipients, &shares_low);
    assert!(res.is_err());

    // Sum is 10100 (more than 10000)
    let shares_high = Vec::from_array(&env, [6100, 4000]);
    let res = client.try_create_split(&owner, &Symbol::new(&env, "fail"), &recipients, &shares_high);
    assert!(res.is_err());
}

#[test]
fn test_create_split_recipient_mismatch() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);

    let recipients = Vec::from_array(&env, [r1]);
    let shares = Vec::from_array(&env, [6000, 4000]); // 2 shares, 1 recipient

    let res = client.try_create_split(&owner, &Symbol::new(&env, "fail"), &recipients, &shares);
    assert!(res.is_err());
}

#[test]
fn test_update_split() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let recipients = Vec::from_array(&env, [r1.clone(), r2.clone()]);
    let shares = Vec::from_array(&env, [5000, 5000]);

    let split_id = client.create_split(&owner, &Symbol::new(&env, "test"), &recipients, &shares);

    // Update to 70/30
    let new_shares = Vec::from_array(&env, [7000, 3000]);
    client.update_split(&owner, &split_id, &recipients, &new_shares);

    let config = client.get_split(&split_id);
    assert_eq!(config.shares_bps, new_shares);
}

#[test]
fn test_update_split_not_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner = Address::generate(&env);
    let other = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let recipients = Vec::from_array(&env, [r1, r2]);
    let shares = Vec::from_array(&env, [5000, 5000]);

    let split_id = client.create_split(&owner, &Symbol::new(&env, "test"), &recipients, &shares);

    // Other tries to update
    let res = client.try_update_split(&other, &split_id, &recipients, &shares);
    assert!(res.is_err());
}

#[test]
fn test_list_splits_for_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);

    let recipients = Vec::from_array(&env, [r1, r2]);
    let shares = Vec::from_array(&env, [5000, 5000]);

    let s1 = client.create_split(&owner1, &Symbol::new(&env, "o1_1"), &recipients, &shares);
    let s2 = client.create_split(&owner1, &Symbol::new(&env, "o1_2"), &recipients, &shares);
    let s3 = client.create_split(&owner2, &Symbol::new(&env, "o2_1"), &recipients, &shares);

    let list1 = client.list_splits_for_owner(&owner1);
    assert_eq!(list1.len(), 2);
    assert_eq!(list1.get(0).unwrap(), s1);
    assert_eq!(list1.get(1).unwrap(), s2);

    let list2 = client.list_splits_for_owner(&owner2);
    assert_eq!(list2.len(), 1);
    assert_eq!(list2.get(0).unwrap(), s3);
}

#[test]
fn test_create_split_single_recipient() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);

    let recipients = Vec::from_array(&env, [r1]);
    let shares = Vec::from_array(&env, [10000]);

    let split_id = client.create_split(&owner, &Symbol::new(&env, "single"), &recipients, &shares);
    let config = client.get_split(&split_id);

    assert_eq!(config.recipients.len(), 1);
    assert_eq!(config.shares_bps.get(0).unwrap(), 10000);
}

#[test]
fn test_update_split_change_recipients_len() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register_contract(None, SplitRegistry);
    let client = SplitRegistryClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(&admin);

    let owner = Address::generate(&env);
    let r1 = Address::generate(&env);
    let r2 = Address::generate(&env);
    let r3 = Address::generate(&env);

    let recipients_old = Vec::from_array(&env, [r1.clone(), r2.clone()]);
    let shares_old = Vec::from_array(&env, [5000, 5000]);

    let split_id = client.create_split(&owner, &Symbol::new(&env, "resize"), &recipients_old, &shares_old);

    // Update to 3 recipients (40/40/20)
    let recipients_new = Vec::from_array(&env, [r1, r2, r3]);
    let shares_new = Vec::from_array(&env, [4000, 4000, 2000]);

    client.update_split(&owner, &split_id, &recipients_new, &shares_new);

    let config = client.get_split(&split_id);
    assert_eq!(config.recipients.len(), 3);
    assert_eq!(config.shares_bps, shares_new);
}

