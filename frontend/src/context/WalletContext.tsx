'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { isConnected, getAddress, signTransaction } from '@stellar/freighter-api';
import { Horizon } from '@stellar/stellar-sdk';

interface WalletContextType {
  publicKey: string | null;
  connected: boolean;
  connecting: boolean;
  hasFreighter: boolean;
  xlmBalance: string;
  castBalance: string;
  hasCastTrustline: boolean;
  error: string | null;
  connect: () => Promise<string | null>;
  disconnect: () => void;
  refreshBalances: () => Promise<void>;
  addCastTrustline: () => Promise<boolean>;
  signTx: (xdr: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const CAST_ISSUER = process.env.NEXT_PUBLIC_CAST_ISSUER_ADDRESS || '';
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [connecting, setConnecting] = useState<boolean>(false);
  const [hasFreighter, setHasFreighter] = useState<boolean>(true);
  const [xlmBalance, setXlmBalance] = useState<string>('0');
  const [castBalance, setCastBalance] = useState<string>('0');
  const [hasCastTrustline, setHasCastTrustline] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Check if Freighter is installed
  useEffect(() => {
    const checkFreighter = async () => {
      try {
        const connectedVal = await isConnected();
        setHasFreighter(!!connectedVal);
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
      setXlmBalance('0.0000');
      setCastBalance('0.0000');
      setHasCastTrustline(false);
    }
  }, []);

  const refreshBalances = useCallback(async () => {
    if (publicKey) {
      await fetchBalances(publicKey);
    }
  }, [publicKey, fetchBalances]);

  // Connect wallet
  const connect = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      if (!(await isConnected())) {
        setError('Freighter wallet extension not detected.');
        setConnecting(false);
        return null;
      }

      const res = await getAddress();
      const pubKey = res.address;
      if (!pubKey) {
        setError('Failed to get public key from Freighter.');
        setConnecting(false);
        return null;
      }

      setPublicKey(pubKey);
      setConnected(true);
      setError(null);
      await fetchBalances(pubKey);
      setConnecting(false);
      return pubKey;
    } catch (err: any) {
      console.error('Freighter connection error:', err);
      setError(err?.message || 'Failed to connect to Freighter.');
      setConnecting(false);
      return null;
    }
  }, [fetchBalances]);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setPublicKey(null);
    setConnected(false);
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
      const server = new Horizon.Server(HORIZON_URL);
      const account = await server.loadAccount(publicKey);
      
      // Build transaction to establish trustline
      const { TransactionBuilder, Asset, Operation, TimeoutInfinite } = require('@stellar/stellar-sdk');
      const tx = new TransactionBuilder(account, {
        fee: '1000', // 1000 stroops
        networkPassphrase: 'Test SDF Network ; September 2015',
      })
        .addOperation(
          Operation.changeTrust({
            asset: new Asset('CAST', CAST_ISSUER),
          })
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const signedXdrRes = await signTransaction(tx.toXDR(), {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
      const signedXdr = signedXdrRes.signedTxXdr;

      const txResult = await server.submitTransaction(
        TransactionBuilder.fromXDR(signedXdr, 'Test SDF Network ; September 2015')
      );
      
      console.log('Trustline added successfully:', txResult.hash);
      await fetchBalances(publicKey);
      return true;
    } catch (err: any) {
      console.error('Error adding CAST trustline:', err);
      setError(err?.message || 'Transaction rejected or failed in wallet.');
      return false;
    }
  }, [publicKey, fetchBalances]);

  // Sign Transaction helper
  const signTx = useCallback(async (xdr: string): Promise<string> => {
    setError(null);
    try {
      const signed = await signTransaction(xdr, {
        networkPassphrase: 'Test SDF Network ; September 2015',
      });
      return signed.signedTxXdr;
    } catch (err: any) {
      console.error('Signing error:', err);
      setError(err?.message || 'Transaction signing rejected.');
      throw err;
    }
  }, []);

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
        xlmBalance,
        castBalance,
        hasCastTrustline,
        error,
        connect,
        disconnect,
        refreshBalances,
        addCastTrustline,
        signTx,
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
