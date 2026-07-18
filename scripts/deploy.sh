#!/usr/bin/env bash
set -e

echo "=== SplitCast On-Chain Testnet Deployment ==="

# 1. Build contracts
echo "Building contracts..."
stellar contract build

# 2. Setup Identities
echo "Setting up identities..."
stellar keys generate split_admin --network testnet --fund --overwrite
stellar keys generate collab1 --network testnet --fund --overwrite
stellar keys generate collab2 --network testnet --fund --overwrite
stellar keys generate collab3 --network testnet --fund --overwrite
stellar keys generate test_payer --network testnet --fund --overwrite

ADMIN_ADDR=$(stellar keys address split_admin)
COLLAB1_ADDR=$(stellar keys address collab1)
COLLAB2_ADDR=$(stellar keys address collab2)
COLLAB3_ADDR=$(stellar keys address collab3)
PAYER_ADDR=$(stellar keys address test_payer)

echo "split_admin: $ADMIN_ADDR"
echo "collab1: $COLLAB1_ADDR"
echo "collab2: $COLLAB2_ADDR"
echo "collab3: $COLLAB3_ADDR"
echo "test_payer: $PAYER_ADDR"

# 3. Deploy split_registry
echo "Deploying split_registry..."
REGISTRY_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/split_registry.wasm \
  --source split_admin \
  --network testnet)
echo "split_registry Address: $REGISTRY_ID"

# 4. Deploy splitter
echo "Deploying splitter..."
SPLITTER_ID=$(stellar contract deploy \
  --wasm target/wasm32v1-none/release/splitter.wasm \
  --source split_admin \
  --network testnet)
echo "splitter Address: $SPLITTER_ID"

# 5. Deploy CAST Token (Stellar Asset Contract)
echo "Deploying CAST SAC..."
CAST_TOKEN_ID=$(stellar contract asset deploy \
  --asset CAST:$ADMIN_ADDR \
  --source-account split_admin \
  --network testnet)
echo "CAST Token Address: $CAST_TOKEN_ID"

# 6. Initialize contracts
echo "Initializing split_registry..."
stellar contract invoke \
  --id $REGISTRY_ID \
  --source-account split_admin \
  --network testnet \
  -- initialize \
  --admin $ADMIN_ADDR

echo "Initializing splitter..."
stellar contract invoke \
  --id $SPLITTER_ID \
  --source-account split_admin \
  --network testnet \
  -- initialize \
  --admin $ADMIN_ADDR \
  --registry $REGISTRY_ID

# 7. Create Demo Split
echo "Creating 70/20/10 demo split..."
stellar contract invoke \
  --id $REGISTRY_ID \
  --source-account split_admin \
  --network testnet \
  -- create_split \
  --owner $ADMIN_ADDR \
  --name demo_split \
  --recipients "[ \"$COLLAB1_ADDR\", \"$COLLAB2_ADDR\", \"$COLLAB3_ADDR\" ]" \
  --shares_bps "[ 7000, 2000, 1000 ]"

echo "=== Deployment Complete ==="
echo "Addresses and tx details are logged in deployments/testnet.json"
