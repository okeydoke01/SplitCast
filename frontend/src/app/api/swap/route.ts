import { NextResponse } from 'next/server';
import { Horizon, TransactionBuilder, Asset, Operation, Keypair, TimeoutInfinite } from '@stellar/stellar-sdk';

export const runtime = 'edge';

const CAST_ISSUER_SECRET = process.env.CAST_ISSUER_SECRET || 'SBCR47DEA23L3BENXW5UPX6FMGYEDLUQOHEEJK3A2FRRYQ2QIUMSILVJ';
const CAST_ISSUER_PUBLIC = process.env.NEXT_PUBLIC_CAST_ISSUER_ADDRESS || 'GB62STQZEV3ETLYGD34PIDOY4MILBYW5PUMHWGP435Y4RVUOTZUUD3FD';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

export async function POST(request: Request) {
  try {
    const { destination, castAmount } = await request.json();

    if (!destination || !castAmount || isNaN(parseFloat(castAmount)) || parseFloat(castAmount) <= 0) {
      return NextResponse.json(
        { error: 'Invalid destination wallet address or swap amount' },
        { status: 400 }
      );
    }

    const server = new Horizon.Server(HORIZON_URL);
    const issuerKeypair = Keypair.fromSecret(CAST_ISSUER_SECRET);
    const issuerAccount = await server.loadAccount(issuerKeypair.publicKey());

    const castAsset = new Asset('CAST', CAST_ISSUER_PUBLIC);
    const amountStr = parseFloat(castAmount).toFixed(7);

    const tx = new TransactionBuilder(issuerAccount, {
      fee: '10000',
      networkPassphrase: 'Test SDF Network ; September 2015',
    })
      .addOperation(
        Operation.payment({
          destination: destination,
          asset: castAsset,
          amount: amountStr,
        })
      )
      .setTimeout(TimeoutInfinite)
      .build();

    tx.sign(issuerKeypair);
    const result = await server.submitTransaction(tx);

    return NextResponse.json({
      success: true,
      hash: result.hash,
      amountSent: amountStr,
    });
  } catch (err: any) {
    console.error('Swap API Error:', err);
    let errorMessage = err?.message || 'Failed to process token swap transaction';
    if (err?.response?.data?.extras?.result_codes?.operations?.includes('op_no_trust')) {
      errorMessage = 'Recipient account does not have a CAST trustline yet. Please click "Add CAST Trustline" first.';
    }
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
