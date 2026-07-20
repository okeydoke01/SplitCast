'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Navigation } from '@/components/Navigation';
import { useWallet } from '@/context/WalletContext';
import { Contract } from '@stellar/stellar-sdk';
import { toAddressScVal, toU64ScVal, toI128ScVal, prepareTx, submitTx, fetchSplitConfig, OnChainSplitConfig } from '@/utils/soroban';
import { Loader2, Sparkles, CheckCircle2, AlertCircle, Search, CreditCard, ShieldCheck } from 'lucide-react';

const SPLITTER_ADDRESS = process.env.NEXT_PUBLIC_SPLITTER_CONTRACT_ADDRESS || '';
const CAST_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_CAST_TOKEN_ADDRESS || '';
const CAST_ISSUER = process.env.NEXT_PUBLIC_CAST_ISSUER_ADDRESS || 'GB62STQZEV3ETLYGD34PIDOY4MILBYW5PUMHWGP435Y4RVUOTZUUD3FD';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

export default function PaySplit() {
  const { publicKey, connected, connect, signTx, castBalance, refreshBalances } = useWallet();
  
  // Search state
  const [searchId, setSearchId] = useState('');
  const [searching, setSearching] = useState(false);
  const [splitConfig, setSplitConfig] = useState<OnChainSplitConfig | null>(null);
  const [recipientTrustlines, setRecipientTrustlines] = useState<Record<string, boolean>>({});
  const [enablingTrustline, setEnablingTrustline] = useState<string | null>(null);

  // Check recipient trustlines status on Stellar Testnet
  const checkRecipientTrustlines = useCallback(async (recipients: string[]) => {
    const statusMap: Record<string, boolean> = {};
    for (const recipient of recipients) {
      try {
        const res = await fetch(`${HORIZON_URL}/accounts/${recipient}`);
        if (res.ok) {
          const data = await res.json();
          const hasTrust = data.balances.some(
            (b: any) => b.asset_code === 'CAST' && b.asset_issuer === CAST_ISSUER
          );
          statusMap[recipient] = hasTrust;
        } else {
          statusMap[recipient] = false;
        }
      } catch (e) {
        statusMap[recipient] = false;
      }
    }
    setRecipientTrustlines(statusMap);
  }, []);

  // Auto pre-fill Split ID from URL query param (?id=X)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const queryId = params.get('id');
      if (queryId && !isNaN(Number(queryId))) {
        setSearchId(queryId);
        const autoResolve = async () => {
          setSearching(true);
          try {
            const config = await fetchSplitConfig(Number(queryId));
            if (config) {
              setSplitConfig(config);
              await checkRecipientTrustlines(config.recipients);
            }
          } catch (e) {
            console.error('Error auto-resolving split ID:', e);
          } finally {
            setSearching(false);
          }
        };
        autoResolve();
      }
    }
  }, [checkRecipientTrustlines]);
  
  // Payment state
  const [amount, setAmount] = useState('');
  const [paymentPreview, setPaymentPreview] = useState<{ recipient: string; percentage: number; share: number }[]>([]);
  
  // Tx states
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Search split configuration
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchId.trim() || isNaN(Number(searchId))) {
      setErrorMsg('Please enter a valid numeric Split ID.');
      return;
    }

    setSearching(true);
    setErrorMsg(null);
    setSplitConfig(null);
    setTxHash(null);

    try {
      const config = await fetchSplitConfig(Number(searchId));
      if (config) {
        setSplitConfig(config);
        await checkRecipientTrustlines(config.recipients);
      } else {
        setErrorMsg(`Split configuration with ID #${searchId} was not found.`);
      }
    } catch (err) {
      setErrorMsg('Failed to query split registry.');
    } finally {
      setSearching(false);
    }
  };

  // 1-Click enable recipient trustline
  const handleEnableRecipientTrustline = async (recipient: string) => {
    setEnablingTrustline(recipient);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/setup-trustline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to establish trustline for recipient.');
      }
      setRecipientTrustlines(prev => ({ ...prev, [recipient]: true }));
      await checkRecipientTrustlines(splitConfig?.recipients || []);
    } catch (err: any) {
      console.error('Error enabling recipient trustline:', err);
      setErrorMsg(err?.message || 'Failed to enable recipient trustline.');
    } finally {
      setEnablingTrustline(null);
    }
  };

  // Calculate live preview breakdown
  useEffect(() => {
    if (!splitConfig || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      setPaymentPreview([]);
      return;
    }

    const payVal = parseFloat(amount);
    const n = splitConfig.recipients.length;
    let totalAllocated = 0;
    const preview = [];

    for (let i = 0; i < n; i++) {
      const pct = splitConfig.shares_bps[i] / 10000;
      if (i === n - 1) {
        const share = Math.max(0, Math.round((payVal - totalAllocated) * 10000) / 10000);
        preview.push({
          recipient: splitConfig.recipients[i],
          percentage: pct * 100,
          share: share,
        });
      } else {
        const share = Math.round((payVal * pct) * 10000) / 10000;
        totalAllocated += share;
        preview.push({
          recipient: splitConfig.recipients[i],
          percentage: pct * 100,
          share: share,
        });
      }
    }

    setPaymentPreview(preview);
  }, [splitConfig, amount]);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey) {
      setErrorMsg('Please connect your wallet first.');
      return;
    }

    if (!splitConfig) return;

    setLoading(true);
    setErrorMsg(null);
    setTxHash(null);

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setErrorMsg('Please enter a valid amount greater than 0.');
      setLoading(false);
      return;
    }

    // Balance check
    const currentBalance = parseFloat(castBalance);
    if (currentBalance < parsedAmount) {
      setErrorMsg(`Insufficient CAST balance. You need at least ${parsedAmount.toFixed(4)} CAST, but you only have ${currentBalance.toFixed(4)} CAST.`);
      setLoading(false);
      return;
    }

    // Trustline pre-check for recipients
    const missingRecipients = splitConfig.recipients.filter(r => recipientTrustlines[r] === false);
    if (missingRecipients.length > 0) {
      const missingAddr = missingRecipients[0];
      setErrorMsg(
        `Cannot execute payment: Recipient ${missingAddr.slice(0, 6)}...${missingAddr.slice(-4)} is missing a CAST trustline. Please click "Enable" next to their address above to setup their trustline before executing payment.`
      );
      setLoading(false);
      return;
    }

    try {
      // Convert amount to 7 decimal places (Stellar Asset Contract unit)
      const rawAmount = BigInt(Math.round(parsedAmount * 10000000));

      // 1. Build the contract operation
      const contract = new Contract(SPLITTER_ADDRESS);
      const op = contract.call(
        'pay',
        toAddressScVal(publicKey),
        toU64ScVal(splitConfig.id),
        toAddressScVal(CAST_TOKEN_ADDRESS),
        toI128ScVal(rawAmount)
      );

      // 2. Prepare transaction
      const preparedTx = await prepareTx(publicKey, op);

      // 3. Sign transaction on Freighter / Demo wallet
      const signedXdr = await signTx(preparedTx.toXDR());

      // 4. Submit to testnet RPC
      const hash = await submitTx(signedXdr);

      setTxHash(hash);
      setAmount('');
      setPaymentPreview([]);
      
      // Refresh balances after successful payment
      await refreshBalances();
    } catch (err: any) {
      console.error('Payment routing failure:', err);
      const errString = err?.message || JSON.stringify(err);
      if (errString.includes('User rejected') || errString.includes('rejected')) {
        setErrorMsg('Transaction rejected in wallet. Inputs are preserved.');
      } else if (errString.includes('trustline entry is missing for account') || errString.includes('Error(Contract, #13)')) {
        // Find the exact recipient in this split config that lacks a trustline
        const missingRecipient = splitConfig.recipients.find(
          (r) => recipientTrustlines[r] === false
        );
        const missingAddr = missingRecipient || '';

        setErrorMsg(
          `Payment failed: Recipient ${missingAddr ? `${missingAddr.slice(0, 6)}...${missingAddr.slice(-4)}` : 'a recipient'} is missing a CAST trustline. On Stellar, recipients must hold a CAST trustline to receive payouts. Click "Enable" next to their address above.`
        );
      } else {
        setErrorMsg(err?.message || 'Transaction execution failed on-chain.');
      }
    } finally {
      setLoading(false);
    }
  };

  const hasMissingTrustline = splitConfig?.recipients.some(r => recipientTrustlines[r] === false);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0c]">
      <Navigation />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {/* Search Header */}
        <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 mb-6">
          <div className="inline-flex items-center gap-1 bg-accent-secondary/10 px-3 py-1 rounded-full text-xs font-semibold text-accent-secondary mb-6">
            <CreditCard className="w-3.5 h-3.5" />
            <span>Router Payment Gateway</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold font-space-grotesk text-white mb-2">Pay into a Split</h2>
          <p className="text-sm text-text-secondary mb-6">
            Enter a Split ID to resolve the distribution allocations and preview your routing cuts.
          </p>

          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-4 top-3.5 text-text-secondary">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchId}
                onChange={(e) => setSearchId(e.target.value)}
                placeholder="Enter Split ID (e.g. 1)"
                className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl pl-11 pr-4 py-3 text-sm text-white placeholder-text-secondary transition-all outline-none"
                disabled={searching || loading}
              />
            </div>
            <button
              type="submit"
              disabled={searching || loading}
              className="bg-bg-surface hover:bg-bg-surface-hover border border-border-subtle text-white font-semibold text-sm px-6 py-3 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
            >
              {searching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <span>Resolve</span>
              )}
            </button>
          </form>

          {/* Error alerts */}
          {errorMsg && (
            <div className="mt-4 p-4 rounded-xl bg-accent-danger/10 border border-accent-danger/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-accent-danger shrink-0 mt-0.5" />
              <div className="text-xs text-accent-danger font-medium leading-relaxed">
                {errorMsg}
              </div>
            </div>
          )}

          {/* Success payment hash */}
          {txHash && (
            <div className="mt-4 p-4 rounded-xl bg-accent-success/10 border border-accent-success/30 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-accent-success shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-white font-space-grotesk text-sm">Payment Executed Atomically!</h4>
                <p className="text-xs text-text-secondary mt-1">
                  Your funds were divided and routed to all recipients in one block.
                </p>
                <div className="mt-2 flex items-center gap-4">
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-secondary hover:underline font-semibold"
                  >
                    Verify on Stellar Expert
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Resolved Split UI */}
        {splitConfig && (
          <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 space-y-6">
            <div>
              <span className="text-[10px] bg-accent-primary/10 border border-accent-primary/20 text-accent-primary font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Active Router
              </span>
              <h3 className="text-xl font-bold font-space-grotesk text-white mt-2">
                {splitConfig.name.toString()}
              </h3>
              <p className="text-xs text-text-secondary mt-1 font-mono">
                Creator: {splitConfig.owner}
              </p>
            </div>

            {/* Recipient breakdown list with Trustline status */}
            <div className="bg-[#0d0c11] border border-border-subtle rounded-xl p-4">
              <h4 className="text-xs font-semibold uppercase text-text-secondary tracking-wider mb-3">Router Allocations & Trustline Status</h4>
              <div className="space-y-2">
                {splitConfig.recipients.map((recipient, i) => (
                  <div key={i} className="flex justify-between items-center text-xs py-1.5 border-b border-border-subtle/40 last:border-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-text-secondary text-[11px] truncate max-w-[150px] sm:max-w-xs">
                        {recipient}
                      </span>
                      {recipientTrustlines[recipient] === true ? (
                        <span className="text-[10px] bg-accent-success/10 text-accent-success border border-accent-success/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-2.5 h-2.5" /> Trustline Ready
                        </span>
                      ) : recipientTrustlines[recipient] === false ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] bg-accent-danger/10 text-accent-danger border border-accent-danger/30 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                            <AlertCircle className="w-2.5 h-2.5" /> Trustline Missing
                          </span>
                          <button
                            type="button"
                            onClick={() => handleEnableRecipientTrustline(recipient)}
                            disabled={enablingTrustline === recipient}
                            className="text-[10px] bg-accent-primary/20 hover:bg-accent-primary/30 text-accent-primary font-semibold px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            {enablingTrustline === recipient ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <ShieldCheck className="w-2.5 h-2.5" />}
                            Enable
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-text-muted">Checking status...</span>
                      )}
                    </div>
                    <span className="font-semibold text-text-primary font-mono">
                      {(splitConfig.shares_bps[i] / 100).toFixed(2)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Pay form */}
            <form onSubmit={handlePay} className="space-y-6">
              <div>
                <label htmlFor="pay-amount" className="block text-sm font-semibold text-text-primary mb-2">
                  Amount to Route (CAST)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="pay-amount"
                    step="0.0001"
                    min="0.0001"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.0000"
                    className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl px-4 py-3 text-sm text-white placeholder-text-secondary transition-all outline-none font-variant-numeric-tabular-nums"
                    disabled={loading}
                  />
                  <span className="absolute right-4 top-3.5 text-xs text-text-secondary font-bold">CAST</span>
                </div>
              </div>

              {/* Live Preview Breakdown */}
              {paymentPreview.length > 0 && (
                <div className="bg-[#0d0c11]/80 border border-accent-primary/10 rounded-xl p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase text-accent-primary tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Live Routing Preview</span>
                  </h4>
                  <div className="space-y-2">
                    {paymentPreview.map((item, i) => (
                      <div key={i} className="flex justify-between items-center text-xs">
                        <span className="font-mono text-text-secondary text-[11px] truncate max-w-[220px] sm:max-w-none">
                          {item.recipient}
                          {i === paymentPreview.length - 1 && (
                            <span className="text-[10px] text-accent-secondary font-medium ml-1.5">(incl. dust)</span>
                          )}
                        </span>
                        <span className="font-semibold text-text-primary font-mono">
                          {item.share.toFixed(4)} CAST
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit */}
              {!connected ? (
                <button
                  type="button"
                  onClick={connect}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold py-3.5 rounded-xl cursor-pointer text-sm"
                >
                  <span>Connect Wallet to Execute</span>
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={loading || hasMissingTrustline || !amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none text-white font-semibold py-3.5 rounded-xl cursor-pointer shadow-lg shadow-accent-primary/10 text-sm tracking-wide transition-opacity"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Signing & Executing Fan-out...</span>
                    </>
                  ) : hasMissingTrustline ? (
                    <span>Click "Enable" on Missing Recipient Trustlines Above</span>
                  ) : (
                    <span>Execute Split Payment</span>
                  )}
                </button>
              )}
            </form>
          </div>
        )}
      </main>
    </div>
  );
}
