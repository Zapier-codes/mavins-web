'use client';

import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { formatCents, formatNumber } from '@/lib/campaign/pricing';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { 
  Wallet, TrendingUp, Clock, DollarSign, ArrowUpRight, 
  BarChart3, Activity, ChevronRight, ArrowDownRight, Minus,
  PiggyBank, CreditCard, Zap, Globe, Music, Play, PauseCircle, CheckCircle2,
  PlusCircle
} from 'lucide-react';

const UNREAD_POLL_MS = 60_000;

interface EarningsEntry {
  id: string;
  campaign_id: string;
  amount_cents: number;
  status: string;
  created_at: string;
  campaign?: {
    resolved_song_id: string;
    source_url: string;
    campaign_name?: string | null;
  };
}

interface CampaignEarning {
  campaignId: string;
  songTitle: string;
  totalEarned: number;
  streams: number;
  status: string;
}

export default function EarningsPage() {
  const { user, isAuthenticated } = useAuth();
  const [balanceCents, setBalanceCents] = useState(0);
  const [totalEarned, setTotalEarned] = useState(0);
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [campaignEarnings, setCampaignEarnings] = useState<CampaignEarning[]>([]);
  const [recentTransactions, setRecentTransactions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  // WITHDRAWALS DISABLED — see Task 21. State kept commented, not
  // deleted, so the feature can be restored without reconstructing it.
  // const [withdrawAmount, setWithdrawAmount] = useState('');
  // const [isWithdrawing, setIsWithdrawing] = useState(false);
  // const [withdrawSuccess, setWithdrawSuccess] = useState(false);

  /** Read balance from users.wallet JSONB */
  const loadBalance = useCallback(async () => {
    if (!user?.id) return;
    const { data, error } = await supabase
      .from('users')
      .select('wallet')
      .eq('id', user.id)
      .single();
    if (!error && data?.wallet) {
      const wallet = typeof data.wallet === 'string' ? JSON.parse(data.wallet) : data.wallet;
      setBalanceCents(wallet?.balance || 0);
    }
  }, [user?.id]);

  const loadEarnings = useCallback(async () => {
    if (!user?.id) return;
    setIsLoading(true);

    // Load wallet ledger entries from changeset JSONB
    const { data: ledgerData } = await supabase
      .from('wallet_ledger')
      .select('*')
      .eq('user_id', user.id)
      .order('create_time', { ascending: false })
      .limit(50);

    // Parse changeset JSONB into readable transactions
    const transactions = (ledgerData || []).map((entry: any) => {
      const cs = typeof entry.changeset === 'string' ? JSON.parse(entry.changeset) : entry.changeset;
      return {
        id: entry.id,
        amount_cents: cs?.amount || 0,
        type: cs?.type || 'unknown',
        description: cs?.description || 'Transaction',
        created_at: entry.create_time,
      };
    });

    setRecentTransactions(transactions);

    // Calculate totals from changeset amounts
    const totalCredits = transactions
      .filter((t: any) => (t.amount_cents || 0) > 0)
      .reduce((sum: number, t: any) => sum + (t.amount_cents || 0), 0);
    const totalDebits = transactions
      .filter((t: any) => (t.amount_cents || 0) < 0)
      .reduce((sum: number, t: any) => sum + Math.abs(t.amount_cents || 0), 0);

    setTotalEarned(totalCredits);
    setPendingWithdrawals(totalDebits);

    // Campaign earnings
    const { data: campaigns } = await supabase
      .from('track_campaigns')
      .select('id, campaign_name, resolved_song_id, source_url, total_streams, spent_cents, total_budget_cents, is_active, is_paused')
      .eq('artist_id', user.id)
      .order('created_at', { ascending: false });

    const earnings = (campaigns || []).map((campaign: any) => ({
      campaignId: campaign.id,
      // Task 65 Part B-ii (handover.md) — a user-assigned campaign_name
      // now takes priority over the raw resolved_song_id fallback,
      // matching this task's own point directly: once an artist names
      // a campaign, that's what should show, not an auto-derived value.
      songTitle: campaign.campaign_name || campaign.resolved_song_id || 'Untitled Track',
      totalEarned: campaign.spent_cents || 0,
      streams: campaign.total_streams || 0,
      status: campaign.is_paused ? 'paused' : campaign.is_active ? 'active' : 'completed',
    }));

    setCampaignEarnings(earnings);
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) { setIsLoading(false); return; }
    loadBalance();
    loadEarnings();
    const interval = setInterval(() => { loadBalance(); loadEarnings(); }, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.id, loadBalance, loadEarnings]);

  // WITHDRAWALS DISABLED — see Task 21. Handler kept commented, not
  // deleted, so the feature can be restored without reconstructing it
  // from git history alone.
  // const handleWithdraw = async (e: React.FormEvent) => {
  //   e.preventDefault();
  //   if (!user?.id || !withdrawAmount) return;
  //   const amount = Math.round(parseFloat(withdrawAmount) * 100);
  //   if (amount <= 0 || amount > balanceCents) { alert('Invalid amount'); return; }
  //
  //   setIsWithdrawing(true);
  //   try {
  //     const res = await fetch('/api/withdrawal/request', {
  //       method: 'POST',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({ userId: user.id, amountCents: amount }),
  //     });
  //     const data = await res.json();
  //     if (data.success) {
  //       setWithdrawSuccess(true);
  //       setWithdrawAmount('');
  //       loadBalance();
  //       loadEarnings();
  //       setTimeout(() => setWithdrawSuccess(false), 3000);
  //     } else {
  //       alert(data.error || 'Withdrawal failed');
  //     }
  //   } catch (error) {
  //     alert('Network error');
  //   } finally {
  //     setIsWithdrawing(false);
  //   }
  // };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <Wallet className="w-12 h-12 text-[var(--accent)] mx-auto" />
          <h1 className="text-2xl font-bold">Wallet</h1>
          <p className="text-[var(--muted-foreground)]">Sign in to view your earnings and wallet balance.</p>
          <a href="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all">
            Sign In
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="ambient-blob absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[#1db954]/5 rounded-full blur-3xl animate-ambient" />
        <div className="ambient-blob absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient-slow" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3">
          <Wallet className="w-6 h-6 text-[var(--accent)]" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Wallet</h1>
            <p className="text-[var(--muted-foreground)] text-sm">Track your campaign revenue and wallet</p>
          </div>
        </div>

        {/* WITHDRAWALS DISABLED — see Task 21. Banner kept commented,
            not deleted, so it can be restored without reconstructing
            it from git history alone. */}
        {/* {withdrawSuccess && (
          <div className="glass-strong border-[#1db954]/30 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 slide-in-from-right">
            <CheckCircle2 className="w-5 h-5 text-[#1db954]" />
            <span className="font-semibold text-sm">Withdrawal request submitted!</span>
          </div>
        )} */}

        <Link
          href="/fund-wallet"
          className="glass-card rounded-xl p-4 flex items-center justify-between gap-3 hover:bg-[var(--accent)]/5 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)]">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="font-semibold text-sm">Fund Wallet</p>
              <p className="text-[11px] text-[var(--subtle-foreground)]">Add funds to launch or top up a campaign</p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--subtle-foreground)] group-hover:text-[var(--accent)] transition-colors" />
        </Link>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { icon: Wallet, label: 'Wallet Balance', value: balanceCents, color: '#1db954', compact: true },
            { icon: TrendingUp, label: 'Total Earned', value: totalEarned, color: '#3d91f4', compact: true },
            { icon: PiggyBank, label: 'Pending', value: pendingWithdrawals, color: '#f59e0b', compact: true },
            { icon: CreditCard, label: 'Available', value: Math.max(0, balanceCents - pendingWithdrawals), color: '#a855f7', compact: true },
          ].map((stat) => (
            <div key={stat.label} className="glass-card rounded-xl p-4 flex flex-col gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${stat.color}1a`, color: stat.color }}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold tabular-nums">
                  <AnimatedCounter value={stat.value} formatFn={stat.compact ? formatCents : undefined} duration={1600} />
                </p>
                <p className="text-[11px] text-[var(--subtle-foreground)]">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* WITHDRAWALS DISABLED — see Task 21. Form kept commented,
            not deleted, so it can be restored without reconstructing
            it from git history alone. */}
        {/* <div className="glass-strong rounded-2xl p-5 sm:p-6">
          <h3 className="font-bold mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-[var(--accent)]" />Withdraw Funds</h3>
          <form onSubmit={handleWithdraw} className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--subtle-foreground)] font-semibold">$</span>
              <input type="number" min="1" step="0.01" max={balanceCents / 100} value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} placeholder="0.00" className="w-full pl-9 pr-4 py-3 rounded-xl glass-input text-sm font-semibold" required />
            </div>
            <button type="submit" disabled={isWithdrawing || !withdrawAmount} className="px-6 py-3 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all disabled:opacity-50 flex items-center gap-2">
              {isWithdrawing ? <><div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />Processing...</> : <><Zap className="w-4 h-4" />Withdraw</>}
            </button>
          </form>
          <p className="text-xs text-[var(--subtle-foreground)] mt-2">Min: $1.00 · Available: {formatCents(balanceCents)}</p>
        </div> */}

        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><BarChart3 className="w-5 h-5 text-[var(--accent)]" />Campaign Performance</h2>
          <div className="space-y-3">
            {campaignEarnings.map((earning) => (
              <div key={earning.campaignId} className="glass-card rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{earning.songTitle}</p>
                  <p className="text-[11px] text-[var(--subtle-foreground)]">{formatNumber(earning.streams)} streams</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold">{formatCents(earning.totalEarned)}</p>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${earning.status === 'active' ? 'bg-[#1db954]/10 text-[#1db954] border-[#1db954]/20' : earning.status === 'paused' ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' : 'bg-gray-400/10 text-gray-400 border-gray-400/20'}`}>
                    {earning.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-bold flex items-center gap-2"><Activity className="w-5 h-5 text-[var(--accent)]" />Recent Transactions</h2>
          <div className="space-y-2">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="glass-card rounded-xl p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${(tx.amount_cents || 0) >= 0 ? 'bg-[#1db954]/10 text-[#1db954]' : 'bg-red-400/10 text-red-400'}`}>
                    {(tx.amount_cents || 0) >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{tx.description}</p>
                    <p className="text-[10px] text-[var(--subtle-foreground)]">{new Date(tx.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold tabular-nums flex-shrink-0 ${(tx.amount_cents || 0) >= 0 ? 'text-[#1db954]' : 'text-red-400'}`}>
                  {(tx.amount_cents || 0) >= 0 ? '+' : ''}{formatCents(Math.abs(tx.amount_cents || 0))}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
