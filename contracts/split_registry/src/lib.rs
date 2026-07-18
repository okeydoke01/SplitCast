#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, contracterror, Symbol, Env, Address, Vec, panic_with_error};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    InvalidAmount = 1,
    SplitNotFound = 2,
    SharesInvalid = 3,
    RecipientMismatch = 4,
    NotOwner = 5,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SplitConfig {
    pub id: u64,
    pub owner: Address,
    pub name: Symbol,
    pub recipients: Vec<Address>,
    pub shares_bps: Vec<u32>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    Counter,
    Split(u64),
    OwnerSplits(Address),
}

#[contract]
pub struct SplitRegistry;

#[contractimpl]
impl SplitRegistry {
    pub fn initialize(env: Env, admin: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Counter, &0u64);
    }

    pub fn create_split(
        env: Env,
        owner: Address,
        name: Symbol,
        recipients: Vec<Address>,
        shares_bps: Vec<u32>,
    ) -> u64 {
        owner.require_auth();

        if recipients.len() != shares_bps.len() {
            panic_with_error!(env, Error::RecipientMismatch);
        }

        let mut sum: u32 = 0;
        for val in shares_bps.iter() {
            sum += val;
        }
        if sum != 10_000 {
            panic_with_error!(env, Error::SharesInvalid);
        }

        let mut counter: u64 = env.storage().instance().get(&DataKey::Counter).unwrap_or(0);
        counter += 1;
        env.storage().instance().set(&DataKey::Counter, &counter);

        let config = SplitConfig {
            id: counter,
            owner: owner.clone(),
            name,
            recipients,
            shares_bps,
        };

        env.storage().persistent().set(&DataKey::Split(counter), &config);

        // Store split in owner's list
        let mut owner_splits: Vec<u64> = env
            .storage()
            .persistent()
            .get(&DataKey::OwnerSplits(owner.clone()))
            .unwrap_or(Vec::new(&env));
        owner_splits.push_back(counter);
        env.storage().persistent().set(&DataKey::OwnerSplits(owner), &owner_splits);

        counter
    }

    pub fn update_split(
        env: Env,
        owner: Address,
        split_id: u64,
        recipients: Vec<Address>,
        shares_bps: Vec<u32>,
    ) {
        owner.require_auth();

        let split_key = DataKey::Split(split_id);
        if !env.storage().persistent().has(&split_key) {
            panic_with_error!(env, Error::SplitNotFound);
        }

        let mut config: SplitConfig = env.storage().persistent().get(&split_key).unwrap();

        if config.owner != owner {
            panic_with_error!(env, Error::NotOwner);
        }

        if recipients.len() != shares_bps.len() {
            panic_with_error!(env, Error::RecipientMismatch);
        }

        let mut sum: u32 = 0;
        for val in shares_bps.iter() {
            sum += val;
        }
        if sum != 10_000 {
            panic_with_error!(env, Error::SharesInvalid);
        }

        config.recipients = recipients;
        config.shares_bps = shares_bps;

        env.storage().persistent().set(&split_key, &config);
    }

    pub fn get_split(env: Env, split_id: u64) -> SplitConfig {
        let split_key = DataKey::Split(split_id);
        if !env.storage().persistent().has(&split_key) {
            panic_with_error!(env, Error::SplitNotFound);
        }
        env.storage().persistent().get(&split_key).unwrap()
    }

    pub fn list_splits_for_owner(env: Env, owner: Address) -> Vec<u64> {
        env.storage()
            .persistent()
            .get(&DataKey::OwnerSplits(owner))
            .unwrap_or(Vec::new(&env))
    }
}

mod test;
