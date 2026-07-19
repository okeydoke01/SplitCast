'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { useWallet } from '@/context/WalletContext';
import { Contract, xdr } from '@stellar/stellar-sdk';
import { toAddressScVal, toSymbolScVal, prepareTx, submitTx } from '@/utils/soroban';
import { Plus, Trash2, Loader2, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';

interface RecipientInput {
  address: string;
  percentage: string; // user input as string e.g. "50" for 50%
}

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS || '';

export default function CreateSplit() {
  const { publicKey, connected, connect, signTx } = useWallet();
  const [name, setName] = useState('');
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { address: '', percentage: '' },
  ]);
  const [totalPercentage, setTotalPercentage] = useState(0);
  
  // Tx states
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Recipient address format validator (starts with G or C, 56 characters)
  const isValidAddress = (addr: string) => {
    return /^[GC][A-Z2-7]{55}$/.test(addr);
  };

  // Calculate total percentage on inputs change
  useEffect(() => {
    const total = recipients.reduce((sum, r) => {
      const val = parseFloat(r.percentage);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    setTotalPercentage(total);
  }, [recipients]);

  const handleAddRecipient = () => {
    setRecipients([...recipients, { address: '', percentage: '' }]);
  };

  const handleRemoveRecipient = (index: number) => {
    const updated = [...recipients];
    updated.splice(index, 1);
    setRecipients(updated);
  };

  const handleInputChange = (index: number, field: keyof RecipientInput, value: string) => {
    const updated = [...recipients];
    updated[index][field] = value;
    setRecipients(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!connected || !publicKey) {
      setErrorMsg('Please connect your wallet first.');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setTxHash(null);

    // Form validation
    if (!name.trim()) {
      setErrorMsg('Please enter a split name.');
      setLoading(false);
      return;
    }

    const trimmedName = name.trim().replace(/\s+/g, '_'); // sanitize name to be symbol friendly

    if (totalPercentage !== 100) {
      setErrorMsg('Total percentage must equal exactly 100%.');
      setLoading(false);
      return;
    }

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i];
      if (!isValidAddress(r.address.trim())) {
        setErrorMsg(`Recipient #${i + 1} has an invalid Stellar address. Must be a 56-character G or C address.`);
        setLoading(false);
        return;
      }
      const pct = parseFloat(r.percentage);
      if (isNaN(pct) || pct <= 0) {
        setErrorMsg(`Recipient #${i + 1} must have a percentage greater than 0%.`);
        setLoading(false);
        return;
      }
    }

    try {
      // 1. Build the contract operation
      const contract = new Contract(REGISTRY_ADDRESS);
      
      const addressesSc = recipients.map(r => toAddressScVal(r.address.trim()));
      
      // Convert percentages (e.g. 70%) to basis points (e.g. 7000)
      const sharesBpsSc = recipients.map(r => {
        const bps = Math.round(parseFloat(r.percentage) * 100);
        return xdr.ScVal.scvU32(bps);
      });

      const op = contract.call(
        'create_split',
        toAddressScVal(publicKey),
        toSymbolScVal(trimmedName),
        xdr.ScVal.scvVec(addressesSc),
        xdr.ScVal.scvVec(sharesBpsSc)
      );

      // 2. Prepare transaction (simulates and adds fees)
      const preparedTx = await prepareTx(publicKey, op);

      // 3. Sign transaction on Freighter
      const signedXdr = await signTx(preparedTx.toXDR());

      // 4. Submit to testnet RPC
      const hash = await submitTx(signedXdr);

      setTxHash(hash);
      // Reset form
      setName('');
      setRecipients([{ address: '', percentage: '' }]);
    } catch (err: any) {
      console.error('Create split failure:', err);
      // Friendly Freighter reject checking
      if (err?.message?.includes('User rejected') || err?.message?.includes('rejected')) {
        setErrorMsg('Transaction rejected in wallet. Form data is preserved.');
      } else {
        setErrorMsg(err?.message || 'Failed to submit transaction on-chain. Please verify contract addresses.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isFormValid = name.trim().length > 0 && 
    totalPercentage === 100 && 
    recipients.every(r => isValidAddress(r.address.trim()) && parseFloat(r.percentage) > 0);

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0c]">
      <Navigation />

      <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-12 sm:px-6 lg:px-8">
        <div className="bg-bg-surface border border-border-subtle rounded-2xl p-6 sm:p-8 relative">
          <div className="inline-flex items-center gap-1 bg-accent-primary/10 px-3 py-1 rounded-full text-xs font-semibold text-accent-primary mb-6">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Create New Split Config</span>
          </div>

          <h2 className="text-2xl sm:text-3xl font-bold font-space-grotesk text-white mb-2">Build a Split</h2>
          <p className="text-sm text-text-secondary mb-8">
            Define recipients and configure their percentage cuts. The total must equal exactly 100% to submit.
          </p>

          {/* Success message */}
          {txHash && (
            <div className="mb-6 p-4 rounded-xl bg-accent-success/10 border border-accent-success/30 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-accent-success shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-white font-space-grotesk text-sm">Split Created Successfully!</h4>
                <p className="text-xs text-text-secondary mt-1">
                  Your split configuration has been registered on Stellar Testnet.
                </p>
                <div className="mt-3 flex items-center gap-4">
                  <a
                    href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-accent-secondary hover:underline font-semibold"
                  >
                    View on Stellar Expert
                  </a>
                </div>
              </div>
            </div>
          )}

          {/* Error boundary */}
          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-accent-danger/10 border border-accent-danger/30 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-accent-danger shrink-0 mt-0.5" />
              <div className="text-xs text-accent-danger font-medium leading-relaxed">
                {errorMsg}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Split Name */}
            <div>
              <label htmlFor="split-name" className="block text-sm font-semibold text-text-primary mb-2">
                Split Name
              </label>
              <input
                type="text"
                id="split-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Collaborator_Pool"
                className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl px-4 py-3 text-sm text-white placeholder-text-secondary transition-all outline-none"
                disabled={loading}
              />
            </div>

            {/* Recipients List */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-text-primary">Recipients</span>
                <button
                  type="button"
                  onClick={handleAddRecipient}
                  disabled={loading}
                  className="flex items-center gap-1.5 text-xs font-semibold text-accent-secondary hover:underline cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Add Recipient
                </button>
              </div>

              {recipients.map((recipient, index) => (
                <div key={index} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <div className="flex-1 w-full">
                    <input
                      type="text"
                      value={recipient.address}
                      onChange={(e) => handleInputChange(index, 'address', e.target.value)}
                      placeholder="Stellar public address (G... / C...)"
                      className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl px-4 py-3 text-sm text-white placeholder-text-secondary transition-all outline-none font-mono"
                      disabled={loading}
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-32">
                    <div className="relative flex-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={recipient.percentage}
                        onChange={(e) => handleInputChange(index, 'percentage', e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl pl-4 pr-8 py-3 text-sm text-white placeholder-text-secondary transition-all outline-none font-variant-numeric-tabular-nums"
                        disabled={loading}
                      />
                      <span className="absolute right-3 top-3.5 text-xs text-text-secondary">%</span>
                    </div>

                    {recipients.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(index)}
                        disabled={loading}
                        className="p-3 rounded-xl border border-border-subtle hover:border-accent-danger/30 hover:bg-accent-danger/10 text-text-secondary hover:text-accent-danger transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Running Total Tracker */}
            <div className="border-t border-border-subtle pt-6 flex items-center justify-between">
              <div>
                <p className="text-xs text-text-secondary">Running Allocation Total</p>
                <p className={`text-xl font-bold font-space-grotesk mt-1 ${
                  totalPercentage === 100 ? 'text-accent-success' : 'text-accent-danger'
                }`}>
                  {totalPercentage.toFixed(2)}%
                </p>
              </div>

              {totalPercentage !== 100 && (
                <div className="text-right">
                  <p className="text-[10px] text-accent-danger font-medium">
                    {totalPercentage < 100 
                      ? `Missing ${(100 - totalPercentage).toFixed(2)}%` 
                      : `Exceeds by ${(totalPercentage - 100).toFixed(2)}%`}
                  </p>
                  <p className="text-[10px] text-text-secondary">Must equal exactly 100%</p>
                </div>
              )}
            </div>

            {/* Submit Button */}
            {connected ? (
              <button
                type="submit"
                disabled={!isFormValid || loading}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none text-white font-semibold py-3.5 rounded-xl cursor-pointer shadow-lg shadow-accent-primary/10 text-sm tracking-wide transition-opacity"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Preparing & Deploying Split...</span>
                  </>
                ) : (
                  <span>Create Split Router</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold py-3.5 rounded-xl cursor-pointer text-sm"
              >
                <span>Connect Wallet to Submit</span>
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
