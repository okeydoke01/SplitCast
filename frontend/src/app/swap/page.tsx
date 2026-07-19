'use client';

import React, { useState } from 'react';
import { Navigation } from '@/components/Navigation';
import { useWallet } from '@/context/WalletContext';
import { 
  ArrowUpDown, 
  Wallet, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  ExternalLink,
  Sparkles,
  RefreshCw,
  Coins,
  ShieldCheck
} from 'lucide-react';
import Link from 'next/link';

export default function SwapPage() {
  const { 
    publicKey, 
    connected, 
    connect, 
    xlmBalance, 
    castBalance, 
    hasCastTrustline, 
    addCastTrustline, 
    refreshBalances 
  } = useWallet();

  const [direction, setDirection] = useState<'XLM_TO_CAST' | 'CAST_TO_XLM'>('XLM_TO_CAST');
  const [payAmount, setPayAmount] = useState<string>('10');
  const [swapping, setSwapping] = useState<boolean>(false);
  const [addingTrustline, setAddingTrustline] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);
  const [receivedSummary, setReceivedSummary] = useState<string>('');

  const isXlmToCast = direction === 'XLM_TO_CAST';

  // Conversion rates: 1 XLM = 10 CAST
  const numInput = parseFloat(payAmount) || 0;
  const calculatedOutput = isXlmToCast ? numInput * 10 : numInput / 10;

  const handleToggleDirection = () => {
    setDirection(prev => prev === 'XLM_TO_CAST' ? 'CAST_TO_XLM' : 'XLM_TO_CAST');
    setErrorMsg(null);
    setSuccessHash(null);
  };

  const handleMaxClick = () => {
    if (isXlmToCast) {
      const balance = parseFloat(xlmBalance);
      const maxUsable = Math.max(0, balance - 1);
      setPayAmount(maxUsable.toFixed(2));
    } else {
      const balance = parseFloat(castBalance);
      setPayAmount(balance.toFixed(2));
    }
  };

  const handleTrustlineAction = async () => {
    setAddingTrustline(true);
    setErrorMsg(null);
    try {
      const success = await addCastTrustline();
      if (success) {
        await refreshBalances();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to add CAST trustline.');
    } finally {
      setAddingTrustline(false);
    }
  };

  const handleSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessHash(null);

    if (!connected || !publicKey) {
      setErrorMsg('Please connect your wallet first.');
      return;
    }

    if (isNaN(numInput) || numInput <= 0) {
      setErrorMsg('Please enter a valid swap amount.');
      return;
    }

    const currentBalance = isXlmToCast ? parseFloat(xlmBalance) : parseFloat(castBalance);
    const assetName = isXlmToCast ? 'XLM' : 'CAST';

    if (numInput > currentBalance) {
      setErrorMsg(`Insufficient ${assetName} balance. You have ${currentBalance.toFixed(2)} ${assetName} available.`);
      return;
    }

    if (isXlmToCast && !hasCastTrustline) {
      setErrorMsg('You need to establish a CAST trustline before receiving CAST tokens.');
      return;
    }

    setSwapping(true);

    try {
      let hash: string | null = null;
      let receiveSummary = '';

      // Try API Route first
      try {
        const res = await fetch('/api/swap', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            destination: publicKey,
            mode: direction,
            amount: payAmount,
          }),
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await res.json();
          if (res.ok && data.success) {
            hash = data.hash;
            receiveSummary = data.receiveStr;
          } else if (data.error) {
            throw new Error(data.error);
          }
        }
      } catch (apiErr: any) {
        console.warn('API route failed, using client-side Stellar execution fallback:', apiErr);
      }

      // Fallback: Direct Client-Side Execution to Stellar Horizon
      if (!hash) {
        const { Account, TransactionBuilder, Asset, Operation, Keypair, TimeoutInfinite } = await import('@stellar/stellar-sdk');
        const issuerSecret = 'SBCR47DEA23L3BENXW5UPX6FMGYEDLUQOHEEJK3A2FRRYQ2QIUMSILVJ';
        const issuerPublic = 'GB62STQZEV3ETLYGD34PIDOY4MILBYW5PUMHWGP435Y4RVUOTZUUD3FD';
        const horizonUrl = 'https://horizon-testnet.stellar.org';

        const issuerKeypair = Keypair.fromSecret(issuerSecret);
        const accRes = await fetch(`${horizonUrl}/accounts/${issuerKeypair.publicKey()}`);
        if (!accRes.ok) {
          throw new Error('Failed to query issuer account sequence from Stellar Testnet.');
        }
        const accData = await accRes.json();
        const account = new Account(accData.account_id, accData.sequence);

        let paymentOp;
        if (isXlmToCast) {
          const castAmount = (numInput * 10).toFixed(7);
          paymentOp = Operation.payment({
            destination: publicKey,
            asset: new Asset('CAST', issuerPublic),
            amount: castAmount,
          });
          receiveSummary = `${(numInput * 10).toFixed(2)} CAST`;
        } else {
          const xlmAmount = (numInput / 10).toFixed(7);
          paymentOp = Operation.payment({
            destination: publicKey,
            asset: Asset.native(),
            amount: xlmAmount,
          });
          receiveSummary = `${(numInput / 10).toFixed(2)} XLM`;
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

        const submitRes = await fetch(`${horizonUrl}/transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `tx=${encodeURIComponent(xdr)}`,
        });

        const submitJson = await submitRes.json();
        if (!submitRes.ok || !submitJson.successful) {
          const opCodes = submitJson?.extras?.result_codes?.operations;
          if (opCodes?.includes('op_no_trust')) {
            throw new Error('Recipient account must enable the CAST trustline first.');
          }
          throw new Error(submitJson?.title || 'Stellar Testnet swap transaction failed.');
        }

        hash = submitJson.hash;
      }

      setSuccessHash(hash);
      setReceivedSummary(receiveSummary || `${calculatedOutput.toFixed(2)} ${isXlmToCast ? 'CAST' : 'XLM'}`);
      await refreshBalances();
    } catch (err: any) {
      console.error('Swap execution error:', err);
      setErrorMsg(err?.message || 'Transaction failed. Please try again.');
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <Navigation />

      <main className="flex-1 py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
        <div className="max-w-xl mx-auto w-full">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-primary/10 border border-accent-primary/20 mb-4">
              <Sparkles className="w-4 h-4 text-accent-primary animate-pulse" />
              <span className="text-xs font-semibold text-accent-primary tracking-wide uppercase">Instant Testnet Faucet Swap</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold font-space-grotesk text-text-primary tracking-tight">
              {isXlmToCast ? 'Swap XLM to CAST' : 'Swap CAST to XLM'}
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              Convert between <span className="font-semibold text-text-primary">XLM</span> and <span className="font-semibold text-text-primary">CAST</span> instantly on Stellar Testnet.
            </p>
          </div>

          {/* Swap Card */}
          <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent-primary/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-accent-secondary/10 rounded-full blur-3xl pointer-events-none" />

            {/* Trustline Warning Banner */}
            {connected && !hasCastTrustline && (
              <div className="mb-6 p-4 rounded-xl bg-accent-danger/10 border border-accent-danger/30 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-accent-danger shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <p className="font-semibold text-white">CAST Trustline Required</p>
                  <p className="text-text-secondary mt-0.5">
                    Your wallet must enable the CAST asset trustline to hold swapped tokens on Stellar.
                  </p>
                  <button
                    type="button"
                    onClick={handleTrustlineAction}
                    disabled={addingTrustline}
                    className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-danger text-white font-medium text-xs hover:bg-accent-danger/90 transition-colors disabled:opacity-50"
                  >
                    {addingTrustline ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5" />
                    )}
                    <span>1-Click Add CAST Trustline</span>
                  </button>
                </div>
              </div>
            )}

            <form onSubmit={handleSwap} className="space-y-5">
              {/* You Pay Section */}
              <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-4 transition-all focus-within:border-accent-primary/50">
                <div className="flex justify-between items-center text-xs text-text-secondary mb-2">
                  <span className="font-medium">You Pay</span>
                  {connected && (
                    <span className="flex items-center gap-1">
                      <Wallet className="w-3 h-3 text-text-muted" />
                      Balance: <strong className="text-text-primary font-mono">{isXlmToCast ? xlmBalance : castBalance} {isXlmToCast ? 'XLM' : 'CAST'}</strong>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    step="any"
                    min="0.1"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-transparent text-2xl font-bold font-mono text-text-primary focus:outline-none placeholder-text-muted/40"
                    required
                  />
                  {connected && (
                    <button
                      type="button"
                      onClick={handleMaxClick}
                      className="px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase bg-bg-surface border border-border-subtle text-accent-primary hover:bg-accent-primary/10 rounded-md transition-colors cursor-pointer"
                    >
                      MAX
                    </button>
                  )}
                  <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle px-3 py-2 rounded-xl shrink-0">
                    <div className="w-6 h-6 rounded-full bg-accent-secondary/20 flex items-center justify-center text-accent-secondary font-bold text-[10px]">
                      {isXlmToCast ? 'XLM' : 'CAST'}
                    </div>
                    <span className="font-semibold text-sm text-text-primary">{isXlmToCast ? 'XLM' : 'CAST'}</span>
                  </div>
                </div>
              </div>

              {/* Interactive Direction Toggle Button (Two Arrows) */}
              <div className="flex justify-center -my-2 relative z-10">
                <button
                  type="button"
                  onClick={handleToggleDirection}
                  title="Click to toggle swap direction"
                  className="p-2.5 bg-bg-surface border border-border-subtle hover:border-accent-primary rounded-full text-accent-primary shadow-lg hover:bg-accent-primary/10 transition-all cursor-pointer transform hover:scale-110 active:scale-95 group"
                >
                  <ArrowUpDown className="w-5 h-5 group-hover:rotate-180 transition-transform duration-300" />
                </button>
              </div>

              {/* You Receive Section */}
              <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-4 transition-all">
                <div className="flex justify-between items-center text-xs text-text-secondary mb-2">
                  <span className="font-medium">You Receive (Estimated)</span>
                  {connected && (
                    <span className="flex items-center gap-1">
                      <Coins className="w-3 h-3 text-text-muted" />
                      Balance: <strong className="text-text-primary font-mono">{isXlmToCast ? castBalance : xlmBalance} {isXlmToCast ? 'CAST' : 'XLM'}</strong>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="text"
                    readOnly
                    value={calculatedOutput.toFixed(2)}
                    className="w-full bg-transparent text-2xl font-bold font-mono text-accent-primary focus:outline-none cursor-default"
                  />
                  <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle px-3 py-2 rounded-xl shrink-0">
                    <div className="w-6 h-6 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary font-bold text-[10px]">
                      {isXlmToCast ? 'CAST' : 'XLM'}
                    </div>
                    <span className="font-semibold text-sm text-text-primary">{isXlmToCast ? 'CAST' : 'XLM'}</span>
                  </div>
                </div>
              </div>

              {/* Rate & Fee Info */}
              <div className="bg-bg-primary/40 rounded-xl p-3.5 border border-border-subtle/50 space-y-2 text-xs">
                <div className="flex justify-between text-text-secondary">
                  <span>Exchange Rate</span>
                  <span className="font-medium text-text-primary font-mono">
                    {isXlmToCast ? '1 XLM = 10 CAST' : '10 CAST = 1 XLM'}
                  </span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Slippage Tolerance</span>
                  <span className="font-medium text-accent-success">0.00% (Fixed Rate)</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>Network Fee</span>
                  <span className="font-medium text-text-primary">Covered on Testnet</span>
                </div>
              </div>

              {/* Error Display */}
              {errorMsg && (
                <div className="p-3 rounded-xl bg-accent-danger/10 border border-accent-danger/20 text-accent-danger text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Success Display */}
              {successHash && (
                <div className="p-4 rounded-xl bg-accent-success/10 border border-accent-success/30 text-accent-success text-xs space-y-2">
                  <div className="flex items-center gap-2 font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Swap Executed Successfully!</span>
                  </div>
                  <p className="text-text-secondary text-[11px]">
                    Received <strong className="text-white">{receivedSummary}</strong> in your wallet.
                  </p>
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${successHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent-success hover:underline font-mono text-[11px] mt-1"
                  >
                    View on Stellar Expert Explorer <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              )}

              {/* Action Button */}
              {!connected ? (
                <button
                  type="button"
                  onClick={connect}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end text-white font-semibold py-3.5 rounded-xl hover:opacity-90 transition-opacity cursor-pointer shadow-lg shadow-accent-primary/20"
                >
                  <Wallet className="w-4 h-4" />
                  <span>Connect Wallet to Swap</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={swapping || (isXlmToCast && !hasCastTrustline) || numInput <= 0}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-all cursor-pointer shadow-lg shadow-accent-primary/20"
                >
                  {swapping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Processing Swap...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4" />
                      <span>Convert</span>
                    </>
                  )}
                </button>
              )}
            </form>

            {/* Quick Action Links */}
            <div className="mt-6 pt-4 border-t border-border-subtle/60 flex justify-between items-center text-xs text-text-secondary">
              <span>Ready to route payments?</span>
              <Link href="/pay" className="text-accent-primary hover:underline font-medium">
                Go to Pay Page &rarr;
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
