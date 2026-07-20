'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigation } from '@/components/Navigation';
import { useWallet } from '@/context/WalletContext';
import { fetchSplitConfig, fetchTotalEarned, fetchEvents, getLatestLedger, OnChainSplitConfig, SplitEvent } from '@/utils/soroban';
import { Loader2, Sparkles, TrendingUp, User, Wallet, History, AlertCircle, ArrowUpRight } from 'lucide-react';

interface DashboardSplit extends OnChainSplitConfig {
  userSharePct: number;
  userRole: 'Owner' | 'Recipient' | 'Both';
  cumulativeEarned: number;
  isFlashing?: boolean;
}

export default function Dashboard() {
  const { publicKey, connected, connect, castBalance, xlmBalance, hasCastTrustline, addCastTrustline } = useWallet();

  const [splits, setSplits] = useState<DashboardSplit[]>([]);
  const [loadingSplits, setLoadingSplits] = useState(false);
  const [activities, setActivities] = useState<SplitEvent[]>([]);
  const [loadingActivity, setLoadingActivity] = useState(false);

  const lastLedgerRef = useRef<number>(0);
  const splitsRef = useRef<DashboardSplit[]>([]);

  // Keep ref in sync
  useEffect(() => {
    splitsRef.current = splits;
  }, [splits]);

  // Dynamic split scanning & cumulative earnings loading
  const loadDashboardData = useCallback(async (userAddress: string) => {
    setLoadingSplits(true);
    try {
      const scannedSplits: DashboardSplit[] = [];
      let currentId = 1;
      let consecutiveNulls = 0;

      // Scan contracts sequentially until we hit consecutive missing IDs
      while (consecutiveNulls < 2 && currentId < 15) {
        const config = await fetchSplitConfig(currentId);
        if (config) {
          consecutiveNulls = 0;
          const isOwner = config.owner.toLowerCase() === userAddress.toLowerCase();
          const recipientIndex = config.recipients.findIndex(
            (r) => r.toLowerCase() === userAddress.toLowerCase()
          );
          const isRecipient = recipientIndex !== -1;

          if (isOwner || isRecipient) {
            const shareBps = isRecipient ? config.shares_bps[recipientIndex] : 0;
            const earned = isRecipient ? await fetchTotalEarned(config.id, userAddress) : 0;

            scannedSplits.push({
              ...config,
              userSharePct: shareBps / 100,
              userRole: isOwner && isRecipient ? 'Both' : isOwner ? 'Owner' : 'Recipient',
              cumulativeEarned: earned,
            });
          }
        } else {
          consecutiveNulls++;
        }
        currentId++;
      }

      setSplits(scannedSplits);
    } catch (err) {
      console.error('Error scanning dashboard splits:', err);
    } finally {
      setLoadingSplits(false);
    }
  }, []);

  // Fetch initial events history on mount
  const loadRecentActivities = useCallback(async () => {
    setLoadingActivity(true);
    try {
      const latest = await getLatestLedger();
      if (latest > 0) {
        // Poll last 2000 ledgers for history
        const startLedger = Math.max(1, latest - 2000);
        lastLedgerRef.current = latest;
        const events = await fetchEvents(startLedger);
        
        // Reverse history so new items slide in from top
        setActivities(events.reverse());
      }
    } catch (err) {
      console.error('Error loading recent activities:', err);
    } finally {
      setLoadingActivity(false);
    }
  }, []);

  // Initialize data on wallet connection
  useEffect(() => {
    if (connected && publicKey) {
      loadDashboardData(publicKey);
      loadRecentActivities();
    }
  }, [connected, publicKey, loadDashboardData, loadRecentActivities]);

  // Real-time Event Polling (2-4s)
  useEffect(() => {
    if (!connected || !publicKey) return;

    const pollInterval = setInterval(async () => {
      if (lastLedgerRef.current === 0) return;
      try {
        const latest = await getLatestLedger();
        let nextLedger = lastLedgerRef.current + 1;

        if (latest > 0 && nextLedger < latest - 1000) {
          nextLedger = latest - 10;
        }

        if (latest > 0 && nextLedger > latest) {
          return;
        }

        const newEvents = await fetchEvents(nextLedger);

        if (newEvents.length > 0) {
          const maxLedger = Math.max(...newEvents.map((e) => e.ledger));
          lastLedgerRef.current = maxLedger;

          setActivities((prev) => [...newEvents.reverse(), ...prev]);

          let splitsUpdated = false;
          const currentSplits = [...splitsRef.current];

          for (const event of newEvents) {
            if (event.type === 'earned' && event.recipient.toLowerCase() === publicKey.toLowerCase()) {
              const splitIdx = currentSplits.findIndex((s) => s.id === event.splitId);
              if (splitIdx !== -1) {
                currentSplits[splitIdx].cumulativeEarned += event.amount;
                currentSplits[splitIdx].isFlashing = true;
                splitsUpdated = true;
              }
            }
          }

          if (splitsUpdated) {
            setSplits(currentSplits);
            setTimeout(() => {
              setSplits((prevSplits) =>
                prevSplits.map((s) => ({ ...s, isFlashing: false }))
              );
            }, 2000);
          }
        }
      } catch (err) {
        console.error('Error in event polling loop:', err);
      }
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [connected, publicKey]);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0c]">
      <Navigation />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {!connected ? (
          /* Locked State UI */
          <div className="text-center py-20 bg-bg-surface border border-border-subtle rounded-2xl p-8 max-w-md mx-auto my-12">
            <Wallet className="w-12 h-12 text-text-secondary mx-auto mb-4" />
            <h3 className="text-xl font-bold font-space-grotesk text-white">Connect Your Wallet</h3>
            <p className="text-sm text-text-secondary mt-2 mb-6">
              Connect your wallet to view your active split definitions, cumulative earnings, and real-time payments feed.
            </p>
            <button
              onClick={connect}
              className="bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold text-sm px-6 py-2.5 rounded-full cursor-pointer shadow-lg shadow-accent-primary/20"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          /* Dashboard Layout Grid */
          <div className="space-y-8">
            {/* Header section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-3xl font-bold font-space-grotesk text-white">Creator Dashboard</h2>
                <p className="text-sm text-text-secondary mt-1">
                  Manage your configurations and watch payments route atomically.
                </p>
              </div>

              {!hasCastTrustline && (
                <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-xl p-3.5 flex items-center gap-3 max-w-md">
                  <AlertCircle className="w-5 h-5 text-accent-danger shrink-0" />
                  <div className="text-xs text-accent-danger font-medium">
                    You need to establish the <span className="font-bold">CAST</span> trustline to receive payouts.
                    <button
                      onClick={addCastTrustline}
                      className="ml-2 font-bold underline hover:no-underline cursor-pointer"
                    >
                      Enable Trustline
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Stats Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-secondary uppercase font-semibold">CAST Balance</p>
                  <h3 className="text-2xl font-bold font-space-grotesk mt-1 text-white font-variant-numeric-tabular-nums">
                    {castBalance}
                  </h3>
                </div>
                <div className="w-10 h-10 bg-accent-primary/10 rounded-xl flex items-center justify-center text-accent-primary">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-secondary uppercase font-semibold">Stellar XLM Balance</p>
                  <h3 className="text-2xl font-bold font-space-grotesk mt-1 text-white font-variant-numeric-tabular-nums">
                    {xlmBalance}
                  </h3>
                </div>
                <div className="w-10 h-10 bg-accent-secondary/10 rounded-xl flex items-center justify-center text-accent-secondary">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>

              <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 flex items-center justify-between">
                <div>
                  <p className="text-xs text-text-secondary uppercase font-semibold">Cumulative Earnings</p>
                  <h3 className="text-2xl font-bold font-space-grotesk mt-1 text-accent-success font-variant-numeric-tabular-nums">
                    {splits.reduce((sum, s) => sum + s.cumulativeEarned, 0).toFixed(4)} CAST
                  </h3>
                </div>
                <div className="w-10 h-10 bg-accent-success/10 rounded-xl flex items-center justify-center text-accent-success">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
            </div>

            {/* Dashboard Sections Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Splits List Section (Left 2 columns) */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold font-space-grotesk text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-accent-secondary" />
                    <span>Your Split Routers</span>
                  </h3>
                  <button
                    onClick={() => publicKey && loadDashboardData(publicKey)}
                    className="text-xs text-accent-secondary hover:underline cursor-pointer"
                  >
                    Refresh
                  </button>
                </div>

                {loadingSplits ? (
                  <div className="bg-bg-surface border border-border-subtle rounded-2xl p-12 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-accent-secondary mb-2" />
                    <p className="text-xs text-text-secondary">Scanning split configurations on-chain...</p>
                  </div>
                ) : splits.length === 0 ? (
                  <div className="bg-bg-surface border border-border-subtle rounded-2xl p-12 text-center">
                    <p className="text-sm text-text-secondary">You aren't associated with any active split routers yet.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {splits.map((split) => (
                      <div
                        key={split.id}
                        className={`bg-bg-surface border rounded-2xl p-5 space-y-4 relative transition-all duration-500 overflow-hidden ${
                          split.isFlashing 
                            ? 'border-accent-success bg-accent-success/5 shadow-lg shadow-accent-success/5 scale-[1.01]' 
                            : 'border-border-subtle hover:border-accent-primary/20'
                        }`}
                      >
                        {/* Flashing entry background overlay */}
                        {split.isFlashing && (
                          <div className="absolute inset-0 bg-accent-success/10 animate-pulse pointer-events-none" />
                        )}

                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] bg-bg-surface-hover border border-border-subtle text-text-secondary px-2 py-0.5 rounded-full uppercase tracking-wider font-semibold">
                              ID #{split.id}
                            </span>
                            <h4 className="text-md font-bold font-space-grotesk text-white mt-1.5 truncate max-w-[160px]">
                              {split.name}
                            </h4>
                          </div>

                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            split.userRole === 'Owner' 
                              ? 'bg-accent-secondary/15 text-accent-secondary border border-accent-secondary/20' 
                              : split.userRole === 'Recipient' 
                              ? 'bg-accent-primary/15 text-accent-primary border border-accent-primary/20' 
                              : 'bg-accent-success/15 text-accent-success border border-accent-success/20'
                          }`}>
                            {split.userRole}
                          </span>
                        </div>

                        <div className="border-t border-border-subtle/50 pt-3.5 flex justify-between items-center text-xs">
                          <div>
                            <p className="text-text-secondary font-medium">Your Allocation</p>
                            <p className="text-sm font-bold text-white mt-0.5">{split.userSharePct.toFixed(2)}%</p>
                          </div>
                          <div className="text-right">
                            <p className="text-text-secondary font-medium">Accumulated Earnings</p>
                            <p className="text-sm font-bold text-accent-success mt-0.5 font-variant-numeric-tabular-nums">
                              {split.cumulativeEarned.toFixed(4)} CAST
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2.5 pt-1.5">
                          <a
                            href={`/split/${split.id}`}
                            className="flex-1 text-center py-2 bg-bg-surface-hover border border-border-subtle hover:border-accent-primary/20 text-xs font-semibold text-text-primary rounded-xl transition-colors"
                          >
                            Transparency Page
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Activity Feed (Right 1 column) */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold font-space-grotesk text-white flex items-center gap-2">
                    <History className="w-4 h-4 text-accent-primary" />
                    <span>Live Routing Feed</span>
                  </h3>
                  <button
                    onClick={loadRecentActivities}
                    className="text-xs text-accent-primary hover:underline cursor-pointer"
                  >
                    Refresh Feed
                  </button>
                </div>

                <div className="bg-bg-surface border border-border-subtle rounded-2xl p-4 h-[460px] overflow-y-auto flex flex-col gap-3 relative">
                  {loadingActivity ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-accent-primary mb-2" />
                      <p className="text-xs text-text-secondary">Syncing live routing records from Stellar...</p>
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-2">
                      <History className="w-8 h-8 text-text-muted opacity-40" />
                      <p className="text-xs font-semibold text-white">No Routing Events Recorded Yet</p>
                      <p className="text-[11px] text-text-secondary">Execute a split payment on the Pay page to watch real-time events route here.</p>
                    </div>
                  ) : (
                    activities.map((event, idx) => {
                      const isEarned = event.type === 'earned';
                      const isMyEarned = isEarned && publicKey && event.recipient.toLowerCase() === publicKey.toLowerCase();

                      return (
                        <div
                          key={event.ledger + '-' + idx}
                          className={`p-3.5 rounded-xl border transition-all duration-300 shadow-md ${
                            isMyEarned
                              ? 'bg-accent-success/15 border-accent-success/40 text-white'
                              : 'bg-[#121118] border-border-subtle hover:border-accent-primary/40'
                          }`}
                        >
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-accent-primary/20 text-accent-primary border border-accent-primary/30 font-mono">
                              Split #{event.splitId}
                            </span>
                            <span className="text-xs font-mono text-text-secondary font-medium">
                              Ledger #{event.ledger}
                            </span>
                          </div>

                          {isEarned ? (
                            <div className="flex justify-between items-center text-xs pt-1">
                              <span className="font-semibold text-white truncate max-w-[140px]">
                                {isMyEarned ? '🎉 You Earned' : `Payout to ${event.recipient.slice(0,4)}...${event.recipient.slice(-4)}`}
                              </span>
                              <span className={`font-bold font-mono text-sm ${
                                isMyEarned ? 'text-accent-success' : 'text-text-primary'
                              }`}>
                                +{event.amount.toFixed(4)} CAST
                              </span>
                            </div>
                          ) : (
                            <div className="space-y-1.5 pt-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="font-semibold text-white">Routed Payment</span>
                                <span className="font-bold font-mono text-sm text-accent-secondary">
                                  {event.amount.toFixed(4)} CAST
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-text-secondary pt-0.5">
                                <span className="font-mono">Payer: {event.payer.slice(0,4)}...{event.payer.slice(-4)}</span>
                                <a
                                  href={`https://stellar.expert/explorer/testnet/tx/${event.ledger}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center gap-1 text-accent-secondary hover:text-white font-medium transition-colors"
                                >
                                  <span>Atomic Split</span>
                                  <ArrowUpRight className="w-3 h-3" />
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
