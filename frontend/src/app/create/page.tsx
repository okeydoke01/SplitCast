'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/Navigation';
import { useWallet } from '@/context/WalletContext';
import { Contract, xdr } from '@stellar/stellar-sdk';
import { toAddressScVal, toSymbolScVal, prepareTx, submitTx, fetchSplitCounter } from '@/utils/soroban';
import { Plus, Trash2, Loader2, Sparkles, CheckCircle2, AlertCircle, Copy, Check, CreditCard, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface RecipientInput {
  address: string;
  percentage: string; // user input as string e.g. "50" for 50%
}

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_REGISTRY_CONTRACT_ADDRESS || '';

export default function CreateSplit() {
  const router = useRouter();
  const { publicKey, connected, connect, signTx } = useWallet();
  const [name, setName] = useState('');
  const [recipients, setRecipients] = useState<RecipientInput[]>([
    { address: '', percentage: '' },
  ]);
  const [totalPercentage, setTotalPercentage] = useState(0);
  
  // Quick Split ID lookup state
  const [quickSplitId, setQuickSplitId] = useState('');

  // Tx states
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [createdSplitId, setCreatedSplitId] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
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

  const handleQuickPayJump = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickSplitId.trim() && !isNaN(Number(quickSplitId))) {
      router.push(`/pay?id=${quickSplitId.trim()}`);
    }
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
    setCreatedSplitId(null);

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

      // 5. Fetch assigned Split ID from contract counter
      const newSplitId = await fetchSplitCounter();

      setTxHash(hash);
      setCreatedSplitId(newSplitId > 0 ? newSplitId : null);
      
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
          <p className="text-sm text-text-secondary mb-6">
            Define recipients and configure their percentage cuts. The total must equal exactly 100% to submit.
          </p>

          {/* Quick Split ID Pay Jump */}
          <div className="mb-8 p-4 rounded-xl bg-[#0d0c11] border border-border-subtle flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-accent-primary/10 text-accent-primary shrink-0">
                <CreditCard className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Have an existing Split ID?</h4>
                <p className="text-[11px] text-text-secondary">Enter a Split ID to open it in the Pay Gateway directly.</p>
              </div>
            </div>
            <form onSubmit={handleQuickPayJump} className="flex gap-2 w-full sm:w-auto">
              <input
                type="number"
                min="1"
                value={quickSplitId}
                onChange={(e) => setQuickSplitId(e.target.value)}
                placeholder="Split ID (e.g. 3)"
                className="w-full sm:w-32 bg-bg-surface border border-border-subtle px-3 py-1.5 rounded-lg text-xs font-mono text-white focus:outline-none focus:border-accent-primary"
              />
              <button
                type="submit"
                className="px-3.5 py-1.5 bg-accent-primary text-white font-semibold text-xs rounded-lg hover:opacity-90 transition-opacity cursor-pointer shrink-0"
              >
                Open in Pay &rarr;
              </button>
            </form>
          </div>

          {/* Success message with assigned Split ID */}
          {txHash && (
            <div className="mb-6 p-5 rounded-2xl bg-accent-success/10 border border-accent-success/30 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-accent-success shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-white font-space-grotesk text-base">
                    Split {createdSplitId ? `#${createdSplitId}` : ''} Created Successfully!
                  </h4>
                  <p className="text-xs text-text-secondary mt-1">
                    Your split configuration has been registered on Stellar Testnet.
                  </p>
                </div>
              </div>

              {createdSplitId && (
                <div className="bg-[#0d0c11] border border-accent-success/20 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] text-text-secondary uppercase font-bold tracking-wider">Your Assigned Split ID</span>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-bold font-mono text-accent-success">#{createdSplitId}</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(createdSplitId.toString());
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }}
                        className="px-2.5 py-1 text-xs bg-accent-success/20 hover:bg-accent-success/30 text-accent-success rounded-lg font-medium transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? 'Copied!' : 'Copy Split ID'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Link
                      href={`/pay?id=${createdSplitId}`}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent-success text-black font-bold text-xs hover:bg-accent-success/90 transition-colors shadow-lg shadow-accent-success/20"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Pay into Split #{createdSplitId} &rarr;</span>
                    </Link>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 text-xs">
                <a
                  href={`https://stellar.expert/explorer/testnet/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent-secondary hover:underline font-semibold flex items-center gap-1"
                >
                  View Transaction on Stellar Expert <ExternalLink className="w-3 h-3" />
                </a>
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
                placeholder="e.g. Band_Royalties_Q3"
                className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl px-4 py-3 text-sm text-white placeholder-text-secondary transition-all outline-none"
                disabled={loading}
              />
            </div>

            {/* Recipients Section */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-text-primary">
                  Recipients & Percentage Cuts
                </label>
                <span className={`text-xs font-mono font-semibold ${totalPercentage === 100 ? 'text-accent-success' : 'text-accent-warning'}`}>
                  Total: {totalPercentage.toFixed(1)}% / 100%
                </span>
              </div>

              {recipients.map((recipient, index) => (
                <div key={index} className="flex gap-3 items-center">
                  <div className="flex-1">
                    <input
                      type="text"
                      value={recipient.address}
                      onChange={(e) => handleInputChange(index, 'address', e.target.value)}
                      placeholder="Stellar Public Key (starts with G or C...)"
                      className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl px-4 py-3 text-xs sm:text-sm font-mono text-white placeholder-text-secondary transition-all outline-none"
                      disabled={loading}
                    />
                  </div>
                  <div className="w-24 sm:w-28 relative">
                    <input
                      type="number"
                      step="any"
                      min="0.1"
                      max="100"
                      value={recipient.percentage}
                      onChange={(e) => handleInputChange(index, 'percentage', e.target.value)}
                      placeholder="0"
                      className="w-full bg-[#0d0c11] border border-border-subtle hover:border-accent-primary/30 focus:border-accent-primary focus:ring-1 focus:ring-accent-primary rounded-xl pl-4 pr-7 py-3 text-sm font-mono text-white placeholder-text-secondary transition-all outline-none"
                      disabled={loading}
                    />
                    <span className="absolute right-3 top-3.5 text-xs text-text-secondary">%</span>
                  </div>
                  {recipients.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRecipient(index)}
                      className="p-3 text-text-secondary hover:text-accent-danger hover:bg-accent-danger/10 rounded-xl transition-colors cursor-pointer"
                      disabled={loading}
                      title="Remove Recipient"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={handleAddRecipient}
                disabled={loading || recipients.length >= 10}
                className="inline-flex items-center gap-2 text-xs font-semibold text-accent-primary hover:text-accent-primary-end transition-colors cursor-pointer pt-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Recipient (Max 10)</span>
              </button>
            </div>

            {/* Submit Button */}
            {connected ? (
              <button
                type="submit"
                disabled={loading || !isFormValid}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none text-white font-semibold py-3.5 rounded-xl cursor-pointer shadow-lg shadow-accent-primary/10 text-sm tracking-wide transition-opacity"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Deploying Split to Soroban...</span>
                  </>
                ) : (
                  <span>Register Split Config</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={connect}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-primary to-accent-primary-end hover:opacity-90 text-white font-semibold py-3.5 rounded-xl cursor-pointer text-sm"
              >
                <span>Connect Wallet to Create</span>
              </button>
            )}
          </form>
        </div>
      </main>
    </div>
  );
}
