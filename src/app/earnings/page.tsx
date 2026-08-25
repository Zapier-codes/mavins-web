'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { formatCents } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { 
  Wallet, TrendingUp, ArrowDownToLine, Clock,
  CheckCircle2, Plus, ExternalLink, Loader2
} from 'lucide-react';

interface LedgerEntry {
  id: string;
  amount_cents: number;
  type: 'earning' | 'withdrawal' | 'bonus' | 'fee';
  description: string;
  created_at: string;
}

export default function EarningsPage() {
  const { user, isAuthenticated } = useAuth();
  const [balance, setBalance] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAddFunds, setShowAddFunds] = useState(false);
  const [fundAmount, setFundAmount] = useState('');
  const [isFunding, setIsFunding] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.id) { setIsLoading(false); return; }
    loadData();
  }, [user?.id]);

  async function loadData() {
    if (!user?.id) return;
    const { data } = await supabase
      .from('wallet_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);

    const ledger = data || [];
    setEntries(ledger);
    const total = ledger.reduce((sum: number, e: LedgerEntry) => sum + e.amount_cents, 0);
    setBalance(total);
    setIsLoading(false);
  }

  const handleAddFunds = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(fundAmount);
    if (!amount || amount < 1) {
      alert('Minimum amount is 1 NGN');
      return;
    }

    setIsFunding(true);
    try {
      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amount * 100, currency: 'NGN' }),
      });

      const result = await res.json();
      if (result.success && result.checkout_url) {
        setCheckoutUrl(result.checkout_url);
        // Open in new tab
        window.open(result.checkout_url, '_blank');
      } else {
        alert(result.error || 'Failed to initialize payment');
      }
    } catch (err: any) {
      alert(err.message || 'Payment initialization failed');
    }
    setIsFunding(false);
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Math.round(parseFloat(withdrawAmount) * 100);
    if (!amount || amount <= 0 || amount > balance) {
      alert('Invalid amount or insufficient balance');
      return;
    }

    const { error } = await supabase.from('wallet_ledger').insert({
      user_id: user!.id,
      amount_cents: -amount,
      type: 'withdrawal',
      description: 'Withdrawal request',
    });

    if (error) {
      alert('Withdrawal failed: ' + error.message);
      return;
    }

    setWithdrawAmount('');
    setShowWithdraw(false);
    loadData();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-[#1db954]/4 rounded-full blur-3xl animate-ambient" />
        <div className="absolute -bottom-40 -left-40 w-[400px] h-[400px] bg-[#f59e0b]/4 rounded-full blur-3xl animate-ambient-slow" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Earnings</h1>
          <p className="text-[#a0a0b0] text-sm mt-1">Manage your wallet and withdrawals</p>
        </div>

        {/* Balance Card */}
        <div className="glass-strong rounded-2xl p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#1db954]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="relative">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#a0a0b0] mb-1">Available Balance</p>
                <p className="text-4xl font-bold">{formatCents(balance)}</p>
              </div>
              <div className="w-12 h-12 rounded-xl glass-card flex items-center justify-center">
                <Wallet className="w-6 h-6 text-[#1db954]" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setShowAddFunds(!showAddFunds)}
                className="flex-1 py-3 rounded-xl bg-[#1db954] text-black font-semibold text-sm hover:bg-[#1ed760] transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20"
              >
                <Plus className="w-4 h-4" />
                Add Funds
              </button>
              <button
                onClick={() => setShowWithdraw(!showWithdraw)}
                className="flex-1 py-3 rounded-xl glass-card text-white font-semibold text-sm hover:bg-white/[0.04] transition-all flex items-center justify-center gap-2"
              >
                <ArrowDownToLine className="w-4 h-4" />
                Withdraw
              </button>
            </div>
          </div>
        </div>

        {/* Add Funds Form */}
        {showAddFunds && (
          <div className="glass-strong rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-4">Add Funds via Korapay</h3>
            <form onSubmit={handleAddFunds} className="space-y-4">
              <div>
                <label className="block text-xs text-[#a0a0b0] mb-1">Amount (NGN)</label>
                <input
                  type="number"
                  step="1"
                  min="100"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="1000"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[#6b6b7b]"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isFunding}
                className="w-full py-2.5 rounded-xl bg-[#1db954] text-black font-semibold text-sm hover:bg-[#1ed760] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isFunding ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <ExternalLink className="w-4 h-4" />
                    Pay with Korapay
                  </>
                )}
              </button>
              {checkoutUrl && (
                <a 
                  href={checkoutUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-[#1db954] hover:underline"
                >
                  Open checkout page again
                </a>
              )}
            </form>
          </div>
        )}

        {/* Withdraw Form */}
        {showWithdraw && (
          <div className="glass-strong rounded-2xl p-5">
            <h3 className="font-bold text-sm mb-4">Withdraw Funds</h3>
            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-xs text-[#a0a0b0] mb-1">Amount (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={balance / 100}
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[#6b6b7b]"
                  required
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-[#1db954] text-black font-semibold text-sm hover:bg-[#1ed760] transition-all"
                >
                  Confirm
                </button>
                <button
                  type="button"
                  onClick={() => setShowWithdraw(false)}
                  className="flex-1 py-2.5 rounded-xl glass-card text-white font-semibold text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Transaction History */}
        <div className="glass-strong rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-white/5">
            <h3 className="font-bold text-sm">Transaction History</h3>
          </div>
          <div className="divide-y divide-white/5">
            {entries.length === 0 ? (
              <div className="p-8 text-center text-[#6b6b7b] text-sm">
                <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No transactions yet</p>
              </div>
            ) : (
              entries.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'w-8 h-8 rounded-lg flex items-center justify-center',
                      entry.amount_cents > 0 ? 'bg-[#1db954]/10' : 'bg-[#ef4444]/10'
                    )}>
                      {entry.amount_cents > 0 ? (
                        <TrendingUp className="w-4 h-4 text-[#1db954]" />
                      ) : (
                        <ArrowDownToLine className="w-4 h-4 text-[#ef4444]" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{entry.description || entry.type}</p>
                      <p className="text-xs text-[#6b6b7b]">
                        {new Date(entry.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    'text-sm font-semibold',
                    entry.amount_cents > 0 ? 'text-[#1db954]' : 'text-white'
                  )}>
                    {entry.amount_cents > 0 ? '+' : ''}{formatCents(Math.abs(entry.amount_cents))}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
