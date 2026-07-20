import { NextResponse } from 'next/server';
import { Account, TransactionBuilder, Asset, Operation, Keypair, TimeoutInfinite } from '@stellar/stellar-sdk';

export const runtime = 'edge';

const CAST_ISSUER_SECRET = process.env.CAST_ISSUER_SECRET || 'SBCR47DEA23L3BENXW5UPX6FMGYEDLUQOHEEJK3A2FRRYQ2QIUMSILVJ';
const CAST_ISSUER_PUBLIC = process.env.NEXT_PUBLIC_CAST_ISSUER_ADDRESS || 'GB62STQZEV3ETLYGD34PIDOY4MILBYW5PUMHWGP435Y4RVUOTZUUD3FD';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

// Map of known test identities generated during deployment
const KNOWN_TEST_KEYS: Record<string, string> = {
  'GBHLLKHHSW3YGNKOILXXLFBXG57ZIOK275CC4JKKJ7YQD4QI5DGNEP6L': 'SDOMH76L74A67I6LR4CTOWRAQKHFIWHYV333M4L7FEVYIXCHHZLSK3KL', // collab1
  'GD2X76ELUQAQBBDLUOQKMPTTP72W47U5NAJBCKROHT6KZ4LSOSMRQ43F': 'SAUG3VBZHJDAMAB5B6RBC26X3MCTXMJ63VI4L6OWA4YH4GH524ZCVJYS', // collab2
  'GDQSJGEZPDB54GK2CXC34BU7Z5J2LCG6KBVSPWBOM4YBGLFGC22EM7RS': 'SAW4ZCHRPVEUN4NKZZBYDBXNYRBY7CE2ZQTLRL2A4JM3NXEOSESJFWON', // collab3
  'GBREN2KJHTES3VN4FT6GROWIVSOAHWT7QH56IXKUDX7KXM4OYMM3BJBX': 'SBLWM7DCPUJVPI4AR6TZF6EEB4OSIBWAYR3ISSKFAFJ5K7L3TFIPTMH4', // test_payer
};

export async function POST(request: Request) {
  try {
    const { recipient } = await request.json();

    if (!recipient || typeof recipient !== 'string' || !recipient.startsWith('G') || recipient.length !== 56) {
      return NextResponse.json(
        { error: 'Invalid Stellar wallet address' },
        { status: 400 }
      );
    }

    // 1. Check if recipient account exists on Testnet, if not fund with Friendbot
    let accRes = await fetch(`${HORIZON_URL}/accounts/${recipient}`);
    if (!accRes.ok) {
      console.log(`Funding recipient ${recipient} on Testnet via Friendbot...`);
      await fetch(`https://friendbot.stellar.org?addr=${recipient}`);
      accRes = await fetch(`${HORIZON_URL}/accounts/${recipient}`);
    }

    if (!accRes.ok) {
      return NextResponse.json(
        { error: 'Failed to initialize recipient account on Testnet' },
        { status: 500 }
      );
    }

    const accData = await accRes.json();
    const hasTrustline = accData.balances.some(
      (b: any) => b.asset_code === 'CAST' && b.asset_issuer === CAST_ISSUER_PUBLIC
    );

    if (hasTrustline) {
      return NextResponse.json({
        success: true,
        message: 'Recipient already has an active CAST trustline.',
      });
    }

    // 2. Establish CAST Trustline for recipient
    const recipientSecret = KNOWN_TEST_KEYS[recipient];
    const castAsset = new Asset('CAST', CAST_ISSUER_PUBLIC);
    let signedXdr: string;

    if (recipientSecret) {
      // Known test key: sign changeTrust directly
      const recKeypair = Keypair.fromSecret(recipientSecret);
      const recAccount = new Account(accData.account_id, accData.sequence);

      const tx = new TransactionBuilder(recAccount, {
        fee: '10000',
        networkPassphrase: 'Test SDF Network ; September 2015',
      })
        .addOperation(
          Operation.changeTrust({
            asset: castAsset,
          })
        )
        .setTimeout(TimeoutInfinite)
        .build();

      tx.sign(recKeypair);
      signedXdr = tx.toXDR();
    } else {
      // Sponsor trustline entry via split_admin for external testnet recipient
      const issuerKeypair = Keypair.fromSecret(CAST_ISSUER_SECRET);
      const issuerAccRes = await fetch(`${HORIZON_URL}/accounts/${issuerKeypair.publicKey()}`);
      const issuerAccData = await issuerAccRes.json();
      const issuerAccount = new Account(issuerAccData.account_id, issuerAccData.sequence);

      const opAny = Operation as any;

      const tx = new TransactionBuilder(issuerAccount, {
        fee: '10000',
        networkPassphrase: 'Test SDF Network ; September 2015',
      })
        .addOperation(
          opAny.beginSponsoringEntry({
            sponsoredId: recipient,
          })
        )
        .addOperation(
          opAny.changeTrust({
            asset: castAsset,
            source: recipient,
          })
        )
        .addOperation(
          opAny.endSponsoringEntry({
            source: recipient,
          })
        )
        .setTimeout(TimeoutInfinite)
        .build();

      tx.sign(issuerKeypair);
      signedXdr = tx.toXDR();
    }

    // Submit XDR directly to Horizon REST endpoint
    const submitRes = await fetch(`${HORIZON_URL}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `tx=${encodeURIComponent(signedXdr)}`,
    });

    const submitJson = await submitRes.json();

    if (!submitRes.ok || !submitJson.successful) {
      console.error('Trustline Setup Submit Error:', submitJson);
      return NextResponse.json(
        { error: submitJson?.title || 'Failed to establish CAST trustline on Testnet.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      hash: submitJson.hash,
      message: `Successfully established CAST trustline for recipient ${recipient.slice(0, 4)}...${recipient.slice(-4)}!`,
    });
  } catch (err: any) {
    console.error('Trustline API Error:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to process recipient trustline setup' },
      { status: 500 }
    );
  }
}
