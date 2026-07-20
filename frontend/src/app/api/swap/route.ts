import { NextResponse } from 'next/server';
import { Account, TransactionBuilder, Asset, Operation, Keypair, TimeoutInfinite } from '@stellar/stellar-sdk';

export const runtime = 'edge';

const CAST_ISSUER_SECRET = process.env.CAST_ISSUER_SECRET || 'SBCR47DEA23L3BENXW5UPX6FMGYEDLUQOHEEJK3A2FRRYQ2QIUMSILVJ';
const CAST_ISSUER_PUBLIC = process.env.NEXT_PUBLIC_CAST_ISSUER_ADDRESS || 'GB62STQZEV3ETLYGD34PIDOY4MILBYW5PUMHWGP435Y4RVUOTZUUD3FD';
const DEMO_PAYER_SECRET = 'SBLWM7DCPUJVPI4AR6TZF6EEB4OSIBWAYR3ISSKFAFJ5K7L3TFIPTMH4';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

export async function POST(request: Request) {
  try {
    const { destination, mode, amount } = await request.json();

    if (!destination || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return NextResponse.json(
        { error: 'Invalid destination wallet address or amount' },
        { status: 400 }
      );
    }

    const issuerKeypair = Keypair.fromSecret(CAST_ISSUER_SECRET);
    const isXlmToCast = mode !== 'CAST_TO_XLM';
    const numAmount = parseFloat(amount);

    let submitXdr: string;
    let receiveStr: string;

    // Check if destination is Demo Wallet keypair (which we can co-sign automatically)
    if (destination === 'GBREN2KJHTES3VN4FT6GROWIVSOAHWT7QH56IXKUDX7KXM4OYMM3BJBX') {
      const demoKeypair = Keypair.fromSecret(DEMO_PAYER_SECRET);

      const accRes = await fetch(`${HORIZON_URL}/accounts/${demoKeypair.publicKey()}`);
      if (!accRes.ok) {
        return NextResponse.json({ error: 'Failed to query demo account sequence' }, { status: 500 });
      }
      const accData = await accRes.json();
      const account = new Account(accData.account_id, accData.sequence);

      const castAsset = new Asset('CAST', issuerKeypair.publicKey());

      if (isXlmToCast) {
        const castAmount = (numAmount * 10).toFixed(7);
        const xlmAmount = numAmount.toFixed(7);

        // Op 1: User pays XLM to Issuer
        // Op 2: Issuer pays CAST to User
        const tx = new TransactionBuilder(account, {
          fee: '10000',
          networkPassphrase: 'Test SDF Network ; September 2015',
        })
          .addOperation(
            Operation.payment({
              source: demoKeypair.publicKey(),
              destination: issuerKeypair.publicKey(),
              asset: Asset.native(),
              amount: xlmAmount,
            })
          )
          .addOperation(
            Operation.payment({
              source: issuerKeypair.publicKey(),
              destination: demoKeypair.publicKey(),
              asset: castAsset,
              amount: castAmount,
            })
          )
          .setTimeout(TimeoutInfinite)
          .build();

        tx.sign(demoKeypair);
        tx.sign(issuerKeypair);
        submitXdr = tx.toXDR();
        receiveStr = `${(numAmount * 10).toFixed(2)} CAST`;
      } else {
        const xlmAmount = (numAmount / 10).toFixed(7);
        const castAmount = numAmount.toFixed(7);

        // Op 1: User pays CAST to Issuer
        // Op 2: Issuer pays XLM to User
        const tx = new TransactionBuilder(account, {
          fee: '10000',
          networkPassphrase: 'Test SDF Network ; September 2015',
        })
          .addOperation(
            Operation.payment({
              source: demoKeypair.publicKey(),
              destination: issuerKeypair.publicKey(),
              asset: castAsset,
              amount: castAmount,
            })
          )
          .addOperation(
            Operation.payment({
              source: issuerKeypair.publicKey(),
              destination: demoKeypair.publicKey(),
              asset: Asset.native(),
              amount: xlmAmount,
            })
          )
          .setTimeout(TimeoutInfinite)
          .build();

        tx.sign(demoKeypair);
        tx.sign(issuerKeypair);
        submitXdr = tx.toXDR();
        receiveStr = `${(numAmount / 10).toFixed(2)} XLM`;
      }
    } else {
      // External wallet / Freighter
      const accRes = await fetch(`${HORIZON_URL}/accounts/${issuerKeypair.publicKey()}`);
      if (!accRes.ok) {
        return NextResponse.json({ error: 'Failed to query issuer account sequence' }, { status: 500 });
      }
      const accData = await accRes.json();
      const account = new Account(accData.account_id, accData.sequence);

      const castAsset = new Asset('CAST', issuerKeypair.publicKey());

      if (isXlmToCast) {
        const castAmount = (numAmount * 10).toFixed(7);
        const tx = new TransactionBuilder(account, {
          fee: '10000',
          networkPassphrase: 'Test SDF Network ; September 2015',
        })
          .addOperation(
            Operation.payment({
              destination: destination,
              asset: castAsset,
              amount: castAmount,
            })
          )
          .setTimeout(TimeoutInfinite)
          .build();

        tx.sign(issuerKeypair);
        submitXdr = tx.toXDR();
        receiveStr = `${(numAmount * 10).toFixed(2)} CAST`;
      } else {
        const xlmAmount = (numAmount / 10).toFixed(7);
        const tx = new TransactionBuilder(account, {
          fee: '10000',
          networkPassphrase: 'Test SDF Network ; September 2015',
        })
          .addOperation(
            Operation.payment({
              destination: destination,
              asset: Asset.native(),
              amount: xlmAmount,
            })
          )
          .setTimeout(TimeoutInfinite)
          .build();

        tx.sign(issuerKeypair);
        submitXdr = tx.toXDR();
        receiveStr = `${(numAmount / 10).toFixed(2)} XLM`;
      }
    }

    // Submit XDR directly to Horizon REST endpoint
    const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `tx=${encodeURIComponent(submitXdr)}`,
    });

    const submitJson = await submitRes.json();

    if (!submitRes.ok || !submitJson.successful) {
      console.error('Horizon Transaction Submit Error:', submitJson);
      let errorMessage = 'Stellar Testnet swap transaction failed.';
      const opCodes = submitJson?.extras?.result_codes?.operations;
      if (opCodes?.includes('op_no_trust')) {
        errorMessage = 'Your account must establish the CAST trustline before receiving CAST. Click "1-Click Add CAST Trustline".';
      } else if (submitJson?.title) {
        errorMessage = `Stellar error: ${submitJson.title}`;
      }
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      hash: submitJson.hash,
      receiveStr: receiveStr,
    });
  } catch (err: any) {
    console.error('Swap API Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process token swap transaction' },
      { status: 500 }
    );
  }
}
