'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Navigation } from '@/components/Navigation';
import { fetchSplitConfig, fetchTotalEarned, fetchEvents, getLatestLedger, OnChainSplitConfig, PaymentSplitEvent } from '@/utils/soroban';
import { Loader2, Sparkles, TrendingUp, User, History, ArrowRight, Share2, Clipboard } from 'lucide-react';

interface RecipientDetail {
  address: string;
  percentage: number;
  cumulativeEarned: number;
}

export default function SplitDetails() {
  const params = useParams();
  const router = useRouter();
  const splitId = Number(params.id);

  const [splitConfig, setSplitConfig] = useState<OnChainSplitConfig | null>(null);
  const [recipientsData, setRecipientsData] = useState<RecipientDetail[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  
  const [history, setHistory] = useState<PaymentSplitEvent[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch split details and recipient earnings
  const loadSplitDetails = useCallback(async () => {
    if (isNaN(splitId)) {
      setErrorMsg('Invalid Split ID provided.');
      setLoadingConfig(false);
      return;
    }

    setLoadingConfig(true);
    setErrorMsg(null);
    try {
      const config = await fetchSplitConfig(splitId);
      if (config) {
        setSplitConfig(config);
        
        // Fetch cumulative total earned for each recipient
        const details: RecipientDetail[] = [];
        for (let i = 0; i < config.recipients.length; i++) {
          const recipient = config.recipients[i];
          const pct = config.shares_bps[i] / 100;
          const earned = await fetchTotalEarned(splitId, recipient);
          details.push({
            address: recipient,
            percentage: pct,
            cumulativeEarned: earned,
          });
        }
        setRecipientsData(details);
      } else {
        setErrorMsg(`Split configuration with ID #${splitId} does not exist.`);
      }
    } catch (err) {
      console.error('Error fetching split details:', err);
      setErrorMsg('Failed to query split registry.');
    } finally {
      setLoadingConfig(false);
    }
  }, [splitId]);

  // Load history from event logs
  const loadSplitHistory = useCallback(async () => {
    if (isNaN(splitId)) return;
    setLoadingHistory(true);
    try {
      const latest = await getLatestLedger();
      if (latest > 0) {
        // Query recent 1000 ledgers (~1.5 hours) for history
        const startLedger = Math.max(1, latest - 1000);
        const events = await fetchEvents(startLedger);
        
        // Filter for payment_split events on this specific splitId
        const splitPayments = events.filter(
          (e): e is PaymentSplitEvent => e.type === 'payment_split' && e.splitId === splitId
        );
        
        setHistory(splitPayments);
      }
    } catch (err) {
      console.error('Error fetching split history:', err);
    } finally {
      setLoadingHistory(false);
    }
  }, [splitId]);

  useEffect(() => {
    loadSplitDetails();
    loadSplitHistory();
  }, [loadSplitDetails, loadSplitHistory]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalValueRouted = recipientsData.reduce((sum, r) => sum + r.cumulativeEarned, 0);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0c]">
      <Navigation />

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        {loadingConfig ? (
          <div className="text-center py-20">
            <Loader2 className="w-10 h-10 animate-spin mx-auto text-accent-primary mb-4" />
            <p className="text-sm text-text-secondary">Loading split registry details...</p>
          </div>
        ) : errorMsg ? (
          <div className="bg-bg-surface border border-border-subtle rounded-2xl p-8 max-w-md mx-auto text-center my-12">
            <TrendingUp className="w-12 h-12 text-accent-danger mx-auto mb-4" />
            <h3 className="text-xl font-bold font-space-grotesk text-white">Split Not Found</h3>
            <p className="text-sm text-text-secondary mt-2 mb-6">
              {errorMsg}
            </p>
            <button
              onClick={() => router.push('/pay')}
              className="bg-bg-surface hover:bg-bg-surface-hover border border-border-subtle text-white font-semibold text-sm px-6 py-2.5 rounded-full cursor-pointer"
            >
              Back to Pay
            </button>
          </div>
        ) : splitConfig ? (
          <div className="space-y-8">
            {/* Header / Meta */}
            <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <span className="text-[10px] bg-accent-primary/10 border border-accent-primary/20 text-accent-primary font-bold px-2.5 py-1 rounded-full uppercase tracking-wider">
                  Public Transparency Page
                </span>
                <h2 className="text-3xl font-bold font-space-grotesk text-white mt-4">
                  {splitConfig.name}
                </h2>
                <div className="flex flex-col sm:flex-row gap-2 sm:gap-6 text-xs text-text-secondary mt-2 font-mono">
                  <span>Split ID: #{splitConfig.id}</span>
                  <span>Owner: {splitConfig.owner}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={handleCopyLink}
                  className="bg-bg-surface hover:bg-bg-surface-hover border border-border-subtle text-white font-semibold text-xs px-5 py-3 rounded-xl flex items-center gap-2 cursor-pointer transition-colors"
                >
                  {copied ? (
                    <>
                      <Clipboard className="w-4 h-4 text-accent-success" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4" />
                      <span>Share Split</span>
                    </>
                  )}
                </button>

                <button
                  onClick={() => router.push(`/pay?id=${splitConfig.id}`)}
                  className="bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold text-xs px-5 py-3 rounded-xl flex items-center gap-2 cursor-pointer shadow-lg shadow-accent-primary/10"
                >
                  <span>Pay Split</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Recipients and Cumulative Earnings List (Left 2 columns) */}
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 space-y-6">
                  <h3 className="text-lg font-bold font-space-grotesk text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-accent-secondary" />
                    <span>Recipients & Cuts</span>
                  </h3>

                  <div className="space-y-4">
                    {recipientsData.map((item, idx) => (
                      <div key={idx} className="space-y-2 bg-[#0d0c11] border border-border-subtle p-4 rounded-xl">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-mono text-text-secondary truncate max-w-[200px] sm:max-w-none">
                            {item.address}
                          </span>
                          <span className="font-bold text-white">
                            {item.percentage.toFixed(2)}%
                          </span>
                        </div>

                        {/* Progress Bar (Visual Detail) */}
                        <div className="relative w-full h-2 bg-bg-surface-hover rounded-full overflow-hidden">
                          <div
                            style={{ width: `${item.percentage}%` }}
                            className="absolute h-full rounded-full bg-gradient-to-r from-accent-primary to-accent-primary-end"
                          />
                        </div>

                        {/* Cumulative total */}
                        <div className="flex justify-between items-center text-[10px] pt-1">
                          <span className="text-text-secondary font-medium">Distributed to Date</span>
                          <span className="font-bold text-accent-success font-variant-numeric-tabular-nums">
                            {item.cumulativeEarned.toFixed(4)} CAST
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Stats & History (Right 1 column) */}
              <div className="space-y-6">
                
                {/* Total Value Routed Card */}
                <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6">
                  <p className="text-xs text-text-secondary uppercase font-semibold">Total Value Routed</p>
                  <h3 className="text-2xl font-bold font-space-grotesk mt-2 text-accent-success font-variant-numeric-tabular-nums">
                    {totalValueRouted.toFixed(4)} CAST
                  </h3>
                  <div className="border-t border-border-subtle/50 mt-4 pt-4 text-xs text-text-secondary">
                    Allocations and distributions synced with smart contracts in real-time.
                  </div>
                </div>

                {/* Split History Section */}
                <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-bold font-space-grotesk text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-accent-primary" />
                    <span>Split History</span>
                  </h3>

                  <div className="max-h-[250px] overflow-y-auto space-y-3 pr-1">
                    {loadingHistory ? (
                      <div className="text-center py-6">
                        <Loader2 className="w-4 h-4 animate-spin mx-auto text-accent-primary" />
                      </div>
                    ) : history.length === 0 ? (
                      <p className="text-xs text-text-secondary text-center py-4">No payments routed yet.</p>
                    ) : (
                      history.map((event, idx) => (
                        <div key={idx} className="bg-[#0d0c11] border border-border-subtle p-3 rounded-xl text-xs space-y-1">
                          <div className="flex justify-between items-center text-[10px] text-text-secondary">
                            <span>Ledger {event.ledger}</span>
                            <span>{new Date(event.ledgerClosedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-[10px] text-text-secondary">Payer: {event.payer.slice(0,4)}...{event.payer.slice(-4)}</span>
                            <span className="font-bold text-accent-primary font-variant-numeric-tabular-nums">
                              {event.amount.toFixed(2)} CAST
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

              </div>

            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
