#![no_std]
use soroban_sdk::{
    contract, contracterror, contractimpl, contracttype, panic_with_error, Address, Env, IntoVal,
    Symbol, Val, Vec,
};

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
    Registry,
    Earned(u64, Address),
}

#[contract]
pub struct Splitter;

#[contractimpl]
impl Splitter {
    pub fn initialize(env: Env, admin: Address, registry: Address) {
        if env.storage().instance().has(&DataKey::Admin) {
            panic!("already initialized");
        }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Registry, &registry);
    }

    pub fn pay(env: Env, payer: Address, split_id: u64, token: Address, amount: i128) {
        payer.require_auth();

        if amount <= 0 {
            panic_with_error!(env, Error::InvalidAmount);
        }

        let registry: Address = env
            .storage()
            .instance()
            .get(&DataKey::Registry)
            .expect("registry not configured");

        // Invoke Split Registry to get split configuration
        let args: Vec<Val> = soroban_sdk::vec![&env, split_id.into_val(&env)];
        let config: SplitConfig =
            env.invoke_contract(&registry, &Symbol::new(&env, "get_split"), args);

        let n = config.recipients.len();
        if n == 0 {
            panic_with_error!(env, Error::RecipientMismatch);
        }

        // Calculate split allocations
        let mut shares = Vec::new(&env);
        let mut total_allocated: i128 = 0;

        for i in 0..n {
            if i == n - 1 {
                // Rounding dust goes to the last recipient so full amount is accounted for
                let share = amount - total_allocated;
                shares.push_back(share);
            } else {
                let bps = config.shares_bps.get(i).unwrap() as i128;
                let share = (amount * bps) / 10_000;
                total_allocated += share;
                shares.push_back(share);
            }
        }

        // Instantiate SAC Token client
        let token_client = soroban_sdk::token::Client::new(&env, &token);

        // Execute payments and update cumulative earned totals
        for i in 0..n {
            let recipient = config.recipients.get(i).unwrap();
            let share = shares.get(i).unwrap();

            if share > 0 {
                // Transfer tokens from payer to recipient
                token_client.transfer(&payer, &recipient, &share);

                // Update cumulative earned total
                let earned_key = DataKey::Earned(split_id, recipient.clone());
                let mut earned: i128 = env.storage().persistent().get(&earned_key).unwrap_or(0);
                earned += share;
                env.storage().persistent().set(&earned_key, &earned);

                // Emit Earned event for live feed
                env.events().publish(
                    (Symbol::new(&env, "earned"), split_id, recipient.clone()),
                    share,
                );
            }
        }

        // Emit PaymentSplit event with full breakdown
        env.events().publish(
            (Symbol::new(&env, "payment_split"), split_id, payer.clone()),
            (token, amount, config.recipients, shares),
        );
    }

    pub fn total_earned(env: Env, split_id: u64, recipient: Address) -> i128 {
        let earned_key = DataKey::Earned(split_id, recipient);
        env.storage().persistent().get(&earned_key).unwrap_or(0)
    }
}

mod test;
