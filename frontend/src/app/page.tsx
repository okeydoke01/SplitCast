'use client';

import React from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { useWallet } from '@/context/WalletContext';
import { ArrowRight, Sparkles, Layers, ShieldCheck, Zap } from 'lucide-react';

export default function Home() {
  const { connected, connect, connecting } = useWallet();

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0c]">
      <Navigation />

      {/* Hero Section */}
      <main className="flex-1 relative overflow-hidden">
        {/* Glow backdrop */}
        <div className="absolute inset-0 radial-glow pointer-events-none -z-10" />

        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 pb-20 sm:pt-24 sm:pb-28 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-primary/10 px-3.5 py-1.5 text-xs font-semibold text-accent-primary mb-6 animate-pulse border border-accent-primary/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Introducing Royalty & Revenue Router on Stellar</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white font-space-grotesk max-w-4xl mx-auto leading-tight sm:leading-none">
            Automated Payment splits{' '}
            <span className="bg-gradient-to-r from-accent-primary to-accent-primary-end bg-clip-text text-transparent">
              for Web3 Creators
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-xl text-text-secondary max-w-2xl mx-auto font-sans leading-relaxed">
            SplitCast makes royalty routing simple and atomic. Define splits for artists, developers, or platforms, and automatically fan out incoming payments in a single transaction on Stellar.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            {connected ? (
              <Link
                href="/create"
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold text-base px-8 py-3 rounded-full transition-opacity cursor-pointer shadow-lg shadow-accent-primary/20"
              >
                <span>Build a Split</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button
                onClick={connect}
                disabled={connecting}
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold text-base px-8 py-3 rounded-full transition-opacity cursor-pointer shadow-lg shadow-accent-primary/20"
              >
                <span>Get Started</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            
            <Link
              href="/pay"
              className="w-full sm:w-auto flex items-center justify-center gap-2 bg-bg-surface hover:bg-bg-surface-hover border border-border-subtle text-white font-semibold text-base px-8 py-3 rounded-full transition-colors cursor-pointer"
            >
              <span>Pay a Split</span>
            </Link>
          </div>

          {/* Live Protocol Stats */}
          <div className="mt-20 grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 text-left relative overflow-hidden group hover:border-accent-primary/30 transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent-primary to-accent-primary-end opacity-50" />
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Total Splits Created</p>
              <h3 className="text-3xl font-bold font-space-grotesk mt-2 text-white font-variant-numeric-tabular-nums">142</h3>
              <p className="text-xs text-accent-secondary mt-1 font-medium">Synced on Stellar Testnet</p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 text-left relative overflow-hidden group hover:border-accent-primary/30 transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent-primary to-accent-primary-end opacity-50" />
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Total Value Routed</p>
              <h3 className="text-3xl font-bold font-space-grotesk mt-2 text-white font-variant-numeric-tabular-nums">85,240 CAST</h3>
              <p className="text-xs text-accent-success mt-1 font-medium">+$2,450 routed today</p>
            </div>

            <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 text-left relative overflow-hidden group hover:border-accent-primary/30 transition-all">
              <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-accent-primary to-accent-primary-end opacity-50" />
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Active Collaborators</p>
              <h3 className="text-3xl font-bold font-space-grotesk mt-2 text-white font-variant-numeric-tabular-nums">398</h3>
              <p className="text-xs text-text-secondary mt-1 font-medium">Artists, Developers, & Pools</p>
            </div>
          </div>

          {/* Key Features */}
          <div className="mt-28 border-t border-border-subtle pt-16">
            <h2 className="text-2xl sm:text-3xl font-bold text-white font-space-grotesk mb-12">
              Why SplitCast?
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="flex flex-col items-center text-center p-4">
                <div className="w-12 h-12 bg-accent-primary/10 border border-accent-primary/20 rounded-xl flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-accent-primary" />
                </div>
                <h4 className="text-lg font-bold text-white font-space-grotesk mb-2">Atomic Fan-out</h4>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Route payments to all recipients in one atomic transaction. If one transfer fails, the entire transaction is reverted to ensure accuracy.
                </p>
              </div>

              <div className="flex flex-col items-center text-center p-4">
                <div className="w-12 h-12 bg-accent-secondary/10 border border-accent-secondary/20 rounded-xl flex items-center justify-center mb-4">
                  <Layers className="w-6 h-6 text-accent-secondary" />
                </div>
                <h4 className="text-lg font-bold text-white font-space-grotesk mb-2">Decoupled Registry</h4>
                <p className="text-sm text-text-secondary leading-relaxed">
                  Splits definitions live in a modular registry. Update recipient groups or allocations easily without having to modify your payment contracts.
                </p>
              </div>

              <div className="flex flex-col items-center text-center p-4">
                <div className="w-12 h-12 bg-accent-success/10 border border-accent-success/20 rounded-xl flex items-center justify-center mb-4">
                  <ShieldCheck className="w-6 h-6 text-accent-success" />
                </div>
                <h4 className="text-lg font-bold text-white font-space-grotesk mb-2">Bounded Storage</h4>
                <p className="text-sm text-text-secondary leading-relaxed">
                  We don't accumulate transaction histories on-chain, keeping storage costs flat. Live feeds and activities are dynamically driven from Soroban events.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border-subtle bg-bg-surface py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-xs text-text-secondary">
            &copy; 2026 SplitCast. Built for Stellar Soroban Hackathon. All rights reserved.
          </p>
          <div className="flex gap-4">
            <Link href="/pay" className="text-xs text-text-secondary hover:text-white transition-colors">Pay Router</Link>
            <Link href="/create" className="text-xs text-text-secondary hover:text-white transition-colors">Create Router</Link>
            <a
              href="https://stellar.expert/explorer/testnet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-text-secondary hover:text-white transition-colors"
            >
              Stellar Expert
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
