'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import { Home, PlusSquare, CreditCard, Repeat, LayoutDashboard, Wallet, LogOut, Loader2, AlertCircle } from 'lucide-react';

export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const { publicKey, connected, connecting, error, connect, disconnect, castBalance, hasCastTrustline, addCastTrustline } = useWallet();

  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Create', href: '/create', icon: PlusSquare },
    { name: 'Pay', href: '/pay', icon: CreditCard },
    { name: 'Swap', href: '/swap', icon: Repeat },
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  ];

  return (
    <>
      {/* Top Header (Desktop & Mobile) */}
      <header className="sticky top-0 z-40 w-full border-b border-border-subtle bg-bg-primary/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="bg-gradient-to-r from-accent-primary to-accent-primary-end bg-clip-text text-2xl font-bold tracking-tight text-transparent font-space-grotesk">
              SplitCast
            </span>
            <span className="hidden sm:inline-block rounded-full bg-accent-secondary/10 px-2 py-0.5 text-xs font-semibold text-accent-secondary">
              Testnet
            </span>
          </Link>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-bg-surface border border-border-subtle px-1.5 py-1 rounded-full">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-gradient-to-r from-accent-primary to-accent-primary-end text-white'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-surface-hover'
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>

          {/* Wallet Connection */}
          <div className="flex items-center gap-3">
            {connected && publicKey ? (
              <div className="flex items-center gap-2">
                {/* CAST balance badge */}
                <div className="hidden sm:flex flex-col items-end text-xs">
                  <span className="font-semibold text-text-primary font-variant-numeric-tabular-nums">{castBalance} CAST</span>
                  {!hasCastTrustline && (
                    <button
                      onClick={addCastTrustline}
                      className="text-[10px] text-accent-danger hover:underline flex items-center gap-0.5"
                    >
                      <AlertCircle className="w-2.5 h-2.5" /> Set Trustline
                    </button>
                  )}
                </div>

                {/* Connection Pill */}
                <div className="flex items-center gap-2 bg-bg-surface border border-border-subtle pl-3 pr-2 py-1.5 rounded-full">
                  <span className="text-xs font-mono text-text-secondary">
                    {publicKey.slice(0, 4)}...{publicKey.slice(-4)}
                  </span>
                  <button
                    onClick={disconnect}
                    className="p-1 rounded-full text-text-secondary hover:text-accent-danger hover:bg-bg-surface-hover transition-colors"
                    title="Disconnect"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={connect}
                disabled={connecting}
                className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 disabled:opacity-50 text-white font-medium text-sm px-4 py-2 rounded-full transition-opacity cursor-pointer"
              >
                {connecting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Wallet className="w-4 h-4" />
                )}
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-bg-surface/95 backdrop-blur-md pb-safe">
        <nav className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-accent-primary' : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                <Icon className={`w-5 h-5 mb-1 ${isActive ? 'stroke-accent-primary' : 'stroke-text-secondary'}`} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Space padding for bottom tab bar on mobile */}
      <div className="md:hidden h-16" />
    </>
  );
};
