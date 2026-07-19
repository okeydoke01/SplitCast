'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useWallet } from '@/context/WalletContext';
import { 
  Home, 
  PlusSquare, 
  CreditCard, 
  Repeat, 
  LayoutDashboard, 
  Wallet, 
  LogOut, 
  Loader2, 
  AlertCircle,
  X,
  ExternalLink,
  Zap,
  ShieldCheck
} from 'lucide-react';

export const Navigation: React.FC = () => {
  const pathname = usePathname();
  const { 
    publicKey, 
    connected, 
    connecting, 
    hasFreighter, 
    isDemoWallet, 
    error, 
    connect, 
    connectDemoWallet, 
    disconnect, 
    castBalance, 
    hasCastTrustline, 
    addCastTrustline,
    clearError
  } = useWallet();

  const [showModal, setShowModal] = useState(false);

  const navItems = [
    { name: 'Home', href: '/', icon: Home },
    { name: 'Create', href: '/create', icon: PlusSquare },
    { name: 'Pay', href: '/pay', icon: CreditCard },
    { name: 'Swap', href: '/swap', icon: Repeat },
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  ];

  const handleFreighterConnect = async () => {
    const res = await connect();
    if (res) {
      setShowModal(false);
    }
  };

  const handleDemoConnect = async () => {
    await connectDemoWallet();
    setShowModal(false);
  };

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
                  <div className="flex items-center gap-1">
                    {isDemoWallet && (
                      <span className="text-[10px] bg-accent-secondary/20 text-accent-secondary px-1.5 py-0.2 rounded font-semibold">
                        Demo
                      </span>
                    )}
                    <span className="font-semibold text-text-primary font-variant-numeric-tabular-nums">{castBalance} CAST</span>
                  </div>
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
                onClick={() => setShowModal(true)}
                disabled={connecting}
                className="flex items-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 disabled:opacity-50 text-white font-medium text-sm px-4 py-2 rounded-full transition-all cursor-pointer shadow-lg shadow-accent-primary/20"
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

      {/* Wallet Selector Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => {
                setShowModal(false);
                clearError();
              }}
              className="absolute top-4 right-4 p-1 text-text-secondary hover:text-text-primary rounded-lg hover:bg-bg-surface-hover transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-accent-primary/10 border border-accent-primary/20">
                <Wallet className="w-5 h-5 text-accent-primary" />
              </div>
              <div>
                <h3 className="text-lg font-bold font-space-grotesk text-text-primary">Connect Wallet</h3>
                <p className="text-xs text-text-secondary">Select your preferred connection method</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-accent-danger/10 border border-accent-danger/30 text-accent-danger text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {/* Option 1: Freighter Extension */}
              <div className="p-4 rounded-xl border border-border-subtle bg-bg-primary/50 hover:border-accent-primary/40 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-accent-primary" />
                    <span className="font-semibold text-sm text-text-primary">Freighter Extension</span>
                  </div>
                  {hasFreighter ? (
                    <span className="text-[10px] bg-accent-success/20 text-accent-success px-2 py-0.5 rounded-full font-medium">
                      Installed
                    </span>
                  ) : (
                    <span className="text-[10px] bg-accent-danger/20 text-accent-danger px-2 py-0.5 rounded-full font-medium">
                      Not Detected
                    </span>
                  )}
                </div>
                <p className="text-xs text-text-secondary mb-3">
                  Official Stellar browser wallet extension for signing transactions securely.
                </p>

                {hasFreighter ? (
                  <button
                    onClick={handleFreighterConnect}
                    disabled={connecting}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end text-white font-medium text-xs py-2.5 rounded-lg hover:opacity-90 transition-opacity"
                  >
                    {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wallet className="w-3.5 h-3.5" />}
                    <span>Connect Freighter</span>
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <a
                      href="https://www.freighter.app/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 flex items-center justify-center gap-1.5 border border-accent-primary text-accent-primary font-medium text-xs py-2 rounded-lg hover:bg-accent-primary/10 transition-colors text-center"
                    >
                      <span>Install Freighter</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    <button
                      onClick={handleFreighterConnect}
                      className="px-3 border border-border-subtle text-text-secondary hover:text-text-primary font-medium text-xs py-2 rounded-lg hover:bg-bg-surface-hover transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </div>

              {/* Option 2: Instant Testnet Demo Account */}
              <div className="p-4 rounded-xl border border-border-subtle bg-bg-primary/50 hover:border-accent-secondary/40 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-accent-secondary" />
                    <span className="font-semibold text-sm text-text-primary">Instant Testnet Demo Wallet</span>
                  </div>
                  <span className="text-[10px] bg-accent-secondary/20 text-accent-secondary px-2 py-0.5 rounded-full font-medium">
                    Pre-funded
                  </span>
                </div>
                <p className="text-xs text-text-secondary mb-3">
                  Instantly test all features on Testnet without installing browser extensions. Comes loaded with XLM & CAST tokens!
                </p>
                <button
                  onClick={handleDemoConnect}
                  className="w-full flex items-center justify-center gap-2 bg-bg-surface border border-accent-secondary/40 text-accent-secondary hover:bg-accent-secondary/10 font-medium text-xs py-2.5 rounded-lg transition-colors cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5" />
                  <span>Connect Testnet Demo Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
