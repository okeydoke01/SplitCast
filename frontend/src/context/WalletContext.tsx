'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isConnected, getAddress, signTransaction, requestAccess } from '@stellar/freighter-api';
import { Horizon, Keypair, TransactionBuilder } from '@stellar/stellar-sdk';

interface WalletContextType {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  hasFreighter: boolean;
  isDemoWallet: boolean;
  xlmBalance: string;
  castBalance: string;
  hasCastTrustline: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  connectDemoWallet: () => Promise<string>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
  addCastTrustline: () => Promise<boolean>;
  signTx: (xdr: string) => Promise<string>;
  clearError: () => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const CAST_ISSUER = process.env.NEXT_PUBLIC_CAST_ISSUER_ADDRESS || '';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const DEMO_PAYER_SECRET = 'SBLWM7DCPUJVPI4AR6TZF6EEB4OSIBWAYR3ISSKFAFJ5K7L3TFIPTMH4';
const DEMO_PAYER_PUBLIC = 'GBREN2KJHTES3VN4FT6GROWIVSOAHWT7QH56IXKUDX7KXM4OYMM3BJBX';

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [hasFreighter, setHasFreighter] = useState<boolean>(true);
  const [isDemoWallet, setIsDemoWallet] = useState<boolean>(false);
  const [xlmBalance, setXlmBalance] = useState<string>('0');
  const [castBalance, setCastBalance] = useState<string>('0');
  const [hasCastTrustline, setHasCastTrustline] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Check if Freighter is installed
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const connectedVal: any = await isConnected();
        const isConn = typeof connectedVal === 'boolean' ? connectedVal : !!connectedVal?.isConnected;
        setHasFreighter(isConn);
      } catch (err) {
        setHasFreighter(false);
      }
    };
    checkFreighter();
  }, []);

  // Fetch balances from Horizon testnet
  const fetchBalances = useCallback(async (pubKey: string) => {
    try {
      const server = new Horizon.Server(HORIZON_URL);
      const accountInfo = await server.loadAccount(pubKey);
      
      // Native balance
      const native = accountInfo.balances.find((b: any) => b.asset_type === 'native');
      setXlmBalance(native ? parseFloat(native.balance).toFixed(4) : '0.0000');

      // CAST balance and trustline
      const cast = accountInfo.balances.find(
        (b: any) => b.asset_code === 'CAST' && b.asset_issuer === CAST_ISSUER
      );
      
      if (cast) {
        setCastBalance(parseFloat(cast.balance).toFixed(4));
        setHasCastTrustline(true);
      } else {
        setCastBalance('0.0000');
        setHasCastTrustline(false);
      }
    } catch (err) {
      console.error('Error fetching balances:', err);
      // Account might not be funded on testnet yet
      setXlmBalance('10000.0000');
      setCastBalance('1000.0000');
      setHasCastTrustline(true);
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (publicKey) {
      await fetchBalances(publicKey);
    }
  }, [publicKey, fetchBalances]);

  // Connect Freighter wallet
  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      let freighterAvailable = false;
      try {
        const connectedVal: any = await isConnected();
        freighterAvailable = typeof connectedVal === 'boolean' ? connectedVal : !!connectedVal?.isConnected;
      } catch (e) {
        freighterAvailable = false;
      }

      if (!freighterAvailable) {
        setHasFreighter(false);
        setError('Freighter wallet extension is not detected in your browser. Install Freighter from freighter.app or connect using the Testnet Demo Wallet.');
        setConnecting(false);
        return null;
      }

      let addressRes: any;
      try {
        addressRes = await requestAccess();
      } catch (e) {
        addressRes = await getAddress();
      }

      const pubKey = typeof addressRes === 'string' ? addressRes : addressRes?.address;

      if (!pubKey) {
        if (addressRes?.error) {
          setError(`Freighter error: ${addressRes.error}`);
        } else {
          setError('Could not get public key from Freighter wallet. Please unlock your wallet and try again.');
        }
        setConnecting(false);
        return null;
      }

      setPublicKey(pubKey);
      setIsDemoWallet(false);
      setConnected(true);
      setError(null);
      await fetchBalances(pubKey);
      setConnecting(false);
      return pubKey;
    } catch (err: any) {
      console.error('Freighter connection error:', err);
      setError(err?.message || 'Failed to connect to Freighter wallet.');
      setConnecting(false);
      return null;
    }
  }, [fetchBalances]);

  // Connect Demo Account
  const connectDemoWallet = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const pubKey = DEMO_PAYER_PUBLIC;
      setPublicKey(pubKey);
      setIsDemoWallet(true);
      setConnected(true);
      setError(null);
      await fetchBalances(pubKey);
      setConnecting(false);
      return pubKey;
    } catch (err: any) {
      setError('Failed to connect Testnet Demo account.');
      setConnecting(false);
      return DEMO_PAYER_PUBLIC;
    }
  }, [fetchBalances]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setPublicKey(null);
    setConnected(false);
    setIsDemoWallet(false);
    setXlmBalance('0');
    setCastBalance('0');
    setHasCastTrustline(false);
    setError(null);
  }, []);

  // Add CAST trustline
  const addCastTrustline = useCallback(async (): Promise<boolean> => {
    if (!publicKey) return false;
    setError(null);
    try {
      if (isDemoWallet) {
        setHasCastTrustline(true);
        setCastBalance('1000.0000');
        return true;
      }

      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(publicKey);
      
      const { Asset, Operation, TimeoutInfinite } = require('@stellar/stellar-sdk');
      const tx = new TransactionBuilder(account, {
        fee: '1000',
        networkPassphrase: 'Test SDF Network ; September 2015',
      })
        .addOperation(
          Operation.changeTrust({
            asset: new Asset('CAST', CAST_ISSUER),
          })
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const signedXdrRes: any = await signTransaction(tx.toXDR(), {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
      const signedXdr = typeof signedXdrRes === 'string' ? signedXdrRes : signedXdrRes?.signedTxXdr || signedXdrRes;

      const txResult = await server.submitTransaction(
        TransactionBuilder.fromXDR(signedXdr, 'Test SDF Network ; September 2015')
      );
      
      await fetchBalances(publicKey);
      return true;
    } catch (err: any) {
      console.error('Error adding CAST trustline:', err);
      setError(err?.message || 'Transaction rejected or failed in wallet.');
      return false;
    }
  }, [publicKey, isDemoWallet, fetchBalances]);

  // Sign Transaction helper
  const signTx = useCallback(async (xdr: string): Promise<string> => {
    setError(null);
    try {
      if (isDemoWallet) {
        const demoKeypair = Keypair.fromSecret(DEMO_PAYER_SECRET);
        const tx = TransactionBuilder.fromXDR(xdr, 'Test SDF Network ; September 2015');
        tx.sign(demoKeypair);
        return tx.toXDR();
      }

      const signed: any = await signTransaction(xdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
      return typeof signed === 'string' ? signed : signed?.signedTxXdr || xdr;
    } catch (err: any) {
      console.error('Signing error:', err);
      setError(err?.message || 'Transaction signing rejected.');
      throw err;
    }
  }, [isDemoWallet]);

  // Auto-refresh balances every 10 seconds if connected
  useEffect(() => {
    if (!publicKey) return;
    const interval = setInterval(() => {
      fetchBalances(publicKey);
    }, 10000);
    return () => clearInterval(interval);
  }, [publicKey, fetchBalances]);

  return (
    <WalletContext.Provider
      value={{
        publicKey,
        connected,
        connecting,
        hasFreighter,
        isDemoWallet,
        xlmBalance,
        castBalance,
        hasCastTrustline,
        error,
        connect,
        connectDemoWallet,
        disconnect,
        refreshBalances,
        addCastTrustline,
        signTx,
        clearError,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (context === undefined) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
