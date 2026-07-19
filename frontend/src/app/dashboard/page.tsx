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
        // Poll last 1500 ledgers (~2 hours) for initial history
        const startLedger = Math.max(1, latest - 1500);
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

  // Real-time Event Polling (2-5s, using SWR / setInterval polling pattern)
  useEffect(() => {
    if (!connected || !publicKey) return;

    const pollInterval = setInterval(async () => {
      if (lastLedgerRef.current === 0) return;
      try {
        const latest = await getLatestLedger();
        let nextLedger = lastLedgerRef.current + 1;

        // If nextLedger is too far behind (outside typical testnet event retention window),
        // reset it to the latest ledgers to avoid RPC range errors.
        if (latest > 0 && nextLedger < latest - 1000) {
          nextLedger = latest - 10;
        }

        // If nextLedger is greater than the latest closed ledger, skip this polling tick.
        if (latest > 0 && nextLedger > latest) {
          return;
        }

        const newEvents = await fetchEvents(nextLedger);

        if (newEvents.length > 0) {
          // Update last ledger
          const maxLedger = Math.max(...newEvents.map((e) => e.ledger));
          lastLedgerRef.current = maxLedger;

          // Merge new events into activities (newest at the top)
          setActivities((prev) => [...newEvents.reverse(), ...prev]);

          // Process events to trigger ticker and highlight animations
          let splitsUpdated = false;
          const currentSplits = [...splitsRef.current];

          for (const event of newEvents) {
            // If the user earned tokens on a split
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
            // Clear highlight flash after 2 seconds
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
    }, 4000); // Poll every 4 seconds

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
              Connect your Freighter wallet to view your active split definitions, cumulative earnings, and real-time payments feed.
            </p>
            <button
              onClick={connect}
              className="bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold text-sm px-6 py-2.5 rounded-full cursor-pointer"
            >
              Connect Freighter
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
                <h3 className="text-lg font-bold font-space-grotesk text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-accent-primary" />
                  <span>Live Routing Feed</span>
                </h3>

                <div className="bg-bg-surface border border-border-subtle rounded-2xl p-4 h-[420px] overflow-y-auto flex flex-col gap-3 relative">
                  {loadingActivity ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-accent-primary mb-2" />
                      <p className="text-xs text-text-secondary">Syncing routing records...</p>
                    </div>
                  ) : activities.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-center text-xs text-text-secondary">
                      No routing records recorded.
                    </div>
                  ) : (
                    activities.map((event, idx) => {
                      const isEarned = event.type === 'earned';
                      const isMyEarned = isEarned && publicKey && event.recipient.toLowerCase() === publicKey.toLowerCase();

                      return (
                        <div
                          key={event.ledger + '-' + idx}
                          className={`p-3 rounded-xl border transition-all duration-500 animate-slide-in relative overflow-hidden ${
                            isMyEarned
                              ? 'bg-accent-success/10 border-accent-success/30 shadow shadow-accent-success/10'
                              : 'bg-bg-surface-hover border-border-subtle'
                          }`}
                        >
                          <div className="flex justify-between items-start text-[10px]">
                            <span className="font-semibold text-text-secondary font-mono">
                              Split #{event.splitId}
                            </span>
                            <span className="text-text-secondary">
                              Ledger {event.ledger}
                            </span>
                          </div>

                          {isEarned ? (
                            <div className="mt-1.5 flex justify-between items-center text-xs">
                              <span className="text-text-secondary truncate max-w-[130px] font-mono text-[10px]">
                                {isMyEarned ? 'You Earned' : `Rec: ${event.recipient.slice(0,4)}...${event.recipient.slice(-4)}`}
                              </span>
                              <span className={`font-bold font-variant-numeric-tabular-nums ${
                                isMyEarned ? 'text-accent-success text-sm' : 'text-text-primary'
                              }`}>
                                +{event.amount.toFixed(4)} CAST
                              </span>
                            </div>
                          ) : (
                            <div className="mt-1.5 space-y-1">
                              <div className="flex justify-between items-center text-xs">
                                <span className="text-text-secondary truncate max-w-[130px] font-mono text-[10px]">
                                  Routed Payment
                                </span>
                                <span className="font-bold text-accent-primary font-variant-numeric-tabular-nums">
                                  {event.amount.toFixed(4)} CAST
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[9px] text-text-secondary">
                                <span>Payer: {event.payer.slice(0,4)}...{event.payer.slice(-4)}</span>
                                <span className="flex items-center gap-0.5 text-accent-secondary hover:underline">
                                  Atomic <ArrowUpRight className="w-2.5 h-2.5" />
                                </span>
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
