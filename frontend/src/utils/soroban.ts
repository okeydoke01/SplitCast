import { Contract, TransactionBuilder, Address, rpc, TimeoutInfinite, xdr, nativeToScVal, scValToNative, Transaction } from '@stellar/stellar-sdk';

const RPC_URL = process.env.NEXT_PUBLIC_STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

export const getRpcServer = () => {
  return new rpc.Server(RPC_URL);
};

// Helper to convert JS values to ScVal
export const toAddressScVal = (addr: string) => {
  return Address.fromString(addr).toScVal();
};

export const toSymbolScVal = (sym: string) => {
  return xdr.ScVal.scvSymbol(sym);
};

export const toU32ScVal = (val: number) => {
  return xdr.ScVal.scvU32(val);
};

export const toI128ScVal = (val: bigint | number) => {
  // i128 in Soroban is represented by an Int128 object (high and low 64-bit parts)
  return nativeToScVal(val, { type: 'i128' });
};

// Prepare a transaction: fetch account sequence, simulate resource usage, add fees
export const prepareTx = async (
  signerAddress: string,
  op: xdr.Operation
): Promise<Transaction> => {
  const server = getRpcServer();
  
  // Load account
  const account = await server.getAccount(signerAddress);

  // Build basic transaction
  const tx = new TransactionBuilder(account, {
    fee: '100', // base fee (will be updated by prepareTransaction)
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(op)
    .setTimeout(TimeoutInfinite)
    .build();

  // Prepare: simulate & adjust resources/fees
  const prepared = await server.prepareTransaction(tx);
  return prepared;
};

// Submit a signed transaction
export const submitTx = async (signedXdr: string): Promise<string> => {
  const server = getRpcServer();
  const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);
  
  const response = await server.sendTransaction(tx);
  
  if (response.status === 'ERROR') {
    throw new Error(`Transaction failed: ${JSON.stringify(response.errorResult)}`);
  }

  // Poll for status
  let status: string = response.status;
  let txHash = response.hash;
  let retries = 15;

  while (status === 'PENDING' && retries > 0) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const txStatus = await server.getTransaction(txHash);
    status = txStatus.status;
    if (status === 'SUCCESS') {
      return txHash;
    }
    if (status === 'FAILED') {
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(txStatus)}`);
    }
    retries--;
  }

  if (status === 'PENDING') {
    throw new Error('Transaction execution timed out.');
  }

  return txHash;
};

export const toU64ScVal = (val: number) => {
  return nativeToScVal(val, { type: 'u64' });
};

export interface OnChainSplitConfig {
  id: number;
  owner: string;
  name: string;
  recipients: string[];
  shares_bps: number[];
}

export const fetchSplitConfig = async (splitId: number): Promise<OnChainSplitConfig | null> => {
  const server = getRpcServer();
  const contract = new Contract(process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS || '');
  const dummyAccount = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  try {
    const op = contract.call(
      'get_split',
      toU64ScVal(splitId)
    );

    const { Account } = require('@stellar/stellar-sdk');
    const mockAccount = new Account(dummyAccount, '0');

    const tx = new TransactionBuilder(mockAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(TimeoutInfinite)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
      const retval = sim.result.retval;
      const nativeVal = scValToNative(retval);

      return {
        id: Number(nativeVal.id),
        owner: nativeVal.owner,
        name: nativeVal.name,
        recipients: nativeVal.recipients,
        shares_bps: nativeVal.shares_bps.map((s: any) => Number(s)),
      };
    }
    return null;
  } catch (err) {
    console.error('Error fetching split config:', err);
    return null;
  }
};

export const fetchSplitCounter = async (): Promise<number> => {
  const server = getRpcServer();
  const contract = new Contract(process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS || '');
  const dummyAccount = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  try {
    const op = contract.call('get_split_count');

    const { Account } = require('@stellar/stellar-sdk');
    const mockAccount = new Account(dummyAccount, '0');

    const tx = new TransactionBuilder(mockAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(TimeoutInfinite)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
      const retval = sim.result.retval;
      const nativeVal = scValToNative(retval);
      return Number(nativeVal);
    }
    return 0;
  } catch (err) {
    console.error('Error fetching split count:', err);
    return 0;
  }
};

export interface EarnedEvent {
  type: 'earned';
  ledger: number;
  ledgerClosedAt: string;
  splitId: number;
  recipient: string;
  amount: number;
}

export interface PaymentSplitEvent {
  type: 'payment_split';
  ledger: number;
  ledgerClosedAt: string;
  splitId: number;
  payer: string;
  token: string;
  amount: number;
  recipients: string[];
  shares: number[];
}

export type SplitEvent = EarnedEvent | PaymentSplitEvent;

export const getLatestLedger = async (): Promise<number> => {
  const server = getRpcServer();
  try {
    const latest = await server.getLatestLedger();
    return latest.sequence;
  } catch (err) {
    console.error('Error getting latest ledger:', err);
    return 0;
  }
};

export const fetchEvents = async (startLedger: number): Promise<SplitEvent[]> => {
  const server = getRpcServer();
  const splitterAddress = process.env.NEXT_PUBLIC_SPLITTER_CONTRACT_ADDRESS || '';

  try {
    const response = await server.getEvents({
      startLedger: startLedger,
      filters: [
        {
          type: 'contract',
          contractIds: [splitterAddress],
        },
      ],
      limit: 50,
    });

    const parsedEvents: SplitEvent[] = [];

    for (const event of response.events) {
      try {
        const eventName = scValToNative(event.topic[0]).toString();

        if (eventName === 'earned') {
          const splitId = Number(scValToNative(event.topic[1]));
          const recipient = scValToNative(event.topic[2]).toString();
          const amountRaw = scValToNative(event.value);
          const amount = Number(amountRaw) / 10000000;

          parsedEvents.push({
            type: 'earned',
            ledger: event.ledger,
            ledgerClosedAt: event.ledgerClosedAt,
            splitId,
            recipient,
            amount,
          });
        } else if (eventName === 'payment_split') {
          const splitId = Number(scValToNative(event.topic[1]));
          const payer = scValToNative(event.topic[2]).toString();
          const data = scValToNative(event.value) as any[];

          const token = data[0].toString();
          const amountRaw = data[1];
          const amount = Number(amountRaw) / 10000000;
          
          const recipients = data[2].map((r: any) => r.toString());
          const shares = data[3].map((s: any) => Number(s) / 10000000);

          parsedEvents.push({
            type: 'payment_split',
            ledger: event.ledger,
            ledgerClosedAt: event.ledgerClosedAt,
            splitId,
            payer,
            token,
            amount,
            recipients,
            shares,
          });
        }
      } catch (e) {
        console.error('Error parsing single event XDR:', e);
      }
    }

    return parsedEvents;
  } catch (err) {
    console.warn('Error fetching events:', err);
    return [];
  }
};

export const fetchTotalEarned = async (splitId: number, recipient: string): Promise<number> => {
  const server = getRpcServer();
  const contract = new Contract(process.env.NEXT_PUBLIC_SPLITTER_CONTRACT_ADDRESS || '');
  const dummyAccount = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';

  try {
    const op = contract.call(
      'total_earned',
      toU64ScVal(splitId),
      toAddressScVal(recipient)
    );

    const { Account } = require('@stellar/stellar-sdk');
    const mockAccount = new Account(dummyAccount, '0');

    const tx = new TransactionBuilder(mockAccount, {
      fee: '100',
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(op)
      .setTimeout(TimeoutInfinite)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (rpc.Api.isSimulationSuccess(sim) && sim.result) {
      const retval = sim.result.retval;
      const nativeVal = scValToNative(retval);
      return Number(nativeVal) / 10000000;
    }
    return 0;
  } catch (err) {
    console.error('Error fetching total earned:', err);
    return 0;
  }
};



