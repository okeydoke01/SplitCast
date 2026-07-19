'use client';

import React, { useState } from 'react';
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

  const [xlmAmount, setXlmAmount] = useState<string>('10');
  const [swapping, setSwapping] = useState<boolean>(false);
  const [addingTrustline, setAddingTrustline] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successHash, setSuccessHash] = useState<string | null>(null);

  // Conversion Rate: 1 XLM = 10 CAST
  const CONVERSION_RATE = 10;
  const castReceived = (parseFloat(xlmAmount) || 0) * CONVERSION_RATE;

  const handleMaxClick = () => {
    const balance = parseFloat(xlmBalance);
    // Leave 1 XLM for gas fees
    const maxUsable = Math.max(0, balance - 1);
    setXlmAmount(maxUsable.toFixed(2));
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

    const numXlm = parseFloat(xlmAmount);
    if (isNaN(numXlm) || numXlm <= 0) {
      setErrorMsg('Please enter a valid amount of XLM to swap.');
      return;
    }

    if (numXlm > parseFloat(xlmBalance)) {
      setErrorMsg(`Insufficient XLM balance. You have ${xlmBalance} XLM available.`);
      return;
    }

    if (!hasCastTrustline) {
      setErrorMsg('You need to establish a CAST trustline before receiving CAST tokens.');
      return;
    }

    setSwapping(true);

    try {
      const res = await fetch('/api/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          destination: publicKey,
          castAmount: castReceived.toString(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute swap transaction.');
      }

      setSuccessHash(data.hash);
      await refreshBalances();
    } catch (err: any) {
      console.error('Swap execution error:', err);
      setErrorMsg(err?.message || 'Transaction failed. Please try again.');
    } finally {
      setSwapping(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-bg-primary py-12 px-4 sm:px-6 lg:px-8 flex flex-col justify-center">
      <div className="max-w-xl mx-auto w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-accent-primary/10 border border-accent-primary/20 mb-4">
            <Sparkles className="w-4 h-4 text-accent-primary animate-pulse" />
            <span className="text-xs font-semibold text-accent-primary tracking-wide uppercase">Instant Testnet Faucet Swap</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold font-space-grotesk text-text-primary tracking-tight">
            Swap XLM to CAST
          </h1>
          <p className="mt-2 text-sm text-text-secondary">
            Convert your Stellar Testnet XLM directly into <span className="font-semibold text-text-primary">CAST</span> tokens to fund payment routes & splits.
          </p>
        </div>

        {/* Swap Card */}
        <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Subtle Ambient Background Blur */}
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
            {/* From Token (XLM) */}
            <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-4 transition-all focus-within:border-accent-primary/50">
              <div className="flex justify-between items-center text-xs text-text-secondary mb-2">
                <span className="font-medium">You Pay</span>
                {connected && (
                  <span className="flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-text-muted" />
                    Balance: <strong className="text-text-primary font-mono">{xlmBalance} XLM</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  value={xlmAmount}
                  onChange={(e) => setXlmAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full bg-transparent text-2xl font-bold font-mono text-text-primary focus:outline-none placeholder-text-muted/40"
                  required
                />
                {connected && (
                  <button
                    type="button"
                    onClick={handleMaxClick}
                    className="px-2.5 py-1 text-[10px] font-bold tracking-wide uppercase bg-bg-surface border border-border-subtle text-accent-primary hover:bg-accent-primary/10 rounded-md transition-colors"
                  >
                    MAX
                  </button>
                )}
                <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle px-3 py-2 rounded-xl shrink-0">
                  <div className="w-6 h-6 rounded-full bg-accent-secondary/20 flex items-center justify-center text-accent-secondary font-bold text-xs">
                    🚀
                  </div>
                  <span className="font-semibold text-sm text-text-primary">XLM</span>
                </div>
              </div>
            </div>

            {/* Swap Divider Button */}
            <div className="flex justify-center -my-2 relative z-10">
              <div className="p-2 bg-bg-surface border border-border-subtle rounded-full text-text-secondary shadow-md hover:border-accent-primary/50 transition-colors">
                <ArrowUpDown className="w-4 h-4 text-accent-primary" />
              </div>
            </div>

            {/* To Token (CAST) */}
            <div className="bg-bg-primary/60 border border-border-subtle rounded-xl p-4 transition-all">
              <div className="flex justify-between items-center text-xs text-text-secondary mb-2">
                <span className="font-medium">You Receive (Estimated)</span>
                {connected && (
                  <span className="flex items-center gap-1">
                    <Coins className="w-3 h-3 text-text-muted" />
                    Balance: <strong className="text-text-primary font-mono">{castBalance} CAST</strong>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  readOnly
                  value={castReceived.toFixed(2)}
                  className="w-full bg-transparent text-2xl font-bold font-mono text-accent-primary focus:outline-none cursor-default"
                />
                <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle px-3 py-2 rounded-xl shrink-0">
                  <div className="w-6 h-6 rounded-full bg-accent-primary/20 flex items-center justify-center text-accent-primary font-bold text-xs">
                    ⚡
                  </div>
                  <span className="font-semibold text-sm text-text-primary">CAST</span>
                </div>
              </div>
            </div>

            {/* Rate & Fee Info */}
            <div className="bg-bg-primary/40 rounded-xl p-3.5 border border-border-subtle/50 space-y-2 text-xs">
              <div className="flex justify-between text-text-secondary">
                <span>Exchange Rate</span>
                <span className="font-medium text-text-primary font-mono">1 XLM = 10 CAST</span>
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
                  Transferred <strong className="text-white">{castReceived.toFixed(2)} CAST</strong> tokens to your wallet.
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
                disabled={swapping || !hasCastTrustline || parseFloat(xlmAmount) <= 0}
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
                    <span>Convert {xlmAmount || '0'} XLM to {castReceived.toFixed(2)} CAST</span>
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
    </div>
  );
}
