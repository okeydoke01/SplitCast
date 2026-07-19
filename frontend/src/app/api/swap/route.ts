import { NextResponse } from 'next/server';
import { Account, TransactionBuilder, Asset, Operation, Keypair, TimeoutInfinite } from '@stellar/stellar-sdk';

export const runtime = 'edge';

const CAST_ISSUER_SECRET = process.env.CAST_ISSUER_SECRET || 'SBCR47DEA23L3BENXW5UPX6FMGYEDLUQOHEEJK3A2FRRYQ2QIUMSILVJ';
const CAST_ISSUER_PUBLIC = process.env.NEXT_PUBLIC_CAST_ISSUER_ADDRESS || 'GB62STQZEV3ETLYGD34PIDOY4MILBYW5PUMHWGP435Y4RVUOTZUUD3FD';
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
    
    // Load issuer account sequence via REST
    const accRes = await fetch(`${HORIZON_URL}/accounts/${issuerKeypair.publicKey()}`);
    if (!accRes.ok) {
      return NextResponse.json(
        { error: 'Failed to query issuer account sequence from Stellar Horizon' },
        { status: 500 }
      );
    }
    const accData = await accRes.json();
    const account = new Account(accData.account_id, accData.sequence);

    const isXlmToCast = mode !== 'CAST_TO_XLM';
    const numAmount = parseFloat(amount);

    let paymentOp;
    let receiveStr;

    if (isXlmToCast) {
      // Swap XLM -> CAST (Rate: 1 XLM = 10 CAST)
      const castAmount = (numAmount * 10).toFixed(7);
      const castAsset = new Asset('CAST', CAST_ISSUER_PUBLIC);
      paymentOp = Operation.payment({
        destination: destination,
        asset: castAsset,
        amount: castAmount,
      });
      receiveStr = `${(numAmount * 10).toFixed(2)} CAST`;
    } else {
      // Swap CAST -> XLM (Rate: 10 CAST = 1 XLM)
      const xlmAmount = (numAmount / 10).toFixed(7);
      paymentOp = Operation.payment({
        destination: destination,
        asset: Asset.native(),
        amount: xlmAmount,
      });
      receiveStr = `${(numAmount / 10).toFixed(2)} XLM`;
    }

    const tx = new TransactionBuilder(account, {
      fee: '10000',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
      .addOperation(paymentOp)
      .setTimeout(TimeoutInfinite)
      .build();

    tx.sign(issuerKeypair);
    const xdr = tx.toXDR();

    // Submit XDR directly to Horizon REST endpoint
    const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `tx=${encodeURIComponent(xdr)}`,
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
