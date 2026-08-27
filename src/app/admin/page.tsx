'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { formatCents, formatNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import {
  Shield, Users, BarChart3, Wallet, Activity,
  TrendingUp, AlertCircle, CheckCircle2, PauseCircle, PlayCircle,
  XCircle, RefreshCw
} from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalStreams: number;
  totalRevenueCents: number;
  totalWalletBalanceCents: number;
}

export default function AdminPage() {
  const { isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'users' | 'ledger'>('overview');

  useEffect(() => {
    // Wait for the session to actually resolve before deciding anything —
    // redirecting while auth is still loading would kick out real admins
    // on every hard refresh.
    if (authLoading) return;
    if (!isAuthenticated || !isAdmin) {
      router.push('/');
      return;
    }
    loadData();
  }, [authLoading, isAuthenticated, isAdmin]);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    // Goes through a server route using the service-role client — the
    // regular client-side query this used to run directly against
    // users/track_campaigns/wallet_ledger only ever returns the caller's
    // own row under RLS ("own row only" policy), which is why this page
    // could look nearly empty even for a real admin.
    const res = await fetch('/api/admin/dashboard');
    const json = await res.json();

    if (!res.ok) {
      setLoadError(json?.error || 'Failed to load admin data');
      setIsLoading(false);
      return;
    }

    const usersData = json.users ?? [];
    const campaignsData = json.campaigns ?? [];
    const ledgerData = json.ledger ?? [];

    setUsers(usersData);
    setCampaigns(campaignsData);
    setLedger(ledgerData);

    // Calculate stats
    const totalStreams = campaignsData.reduce((sum: number, c: any) => sum + (c.total_streams || 0), 0);
    const totalRevenue = campaignsData.reduce((sum: number, c: any) => sum + (c.spent_cents || 0), 0);
    const activeCount = campaignsData.filter((c: any) => c.is_active && !c.is_paused).length;
    const walletTotal = ledgerData.reduce((sum: number, e: any) => sum + (e.amount_cents || 0), 0);

    setStats({
      totalUsers: usersData.length,
      totalCampaigns: campaignsData.length,
      activeCampaigns: activeCount,
      totalStreams,
      totalRevenueCents: totalRevenue,
      totalWalletBalanceCents: walletTotal,
    });
    setIsLoading(false);
  }

  async function togglePause(campaign: any) {
    const { error } = await supabase
      .from('track_campaigns')
      .update({ is_paused: !campaign.is_paused })
      .eq('id', campaign.id);
    if (!error) loadData();
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-[#1db954]" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-[var(--muted-foreground)] text-sm">Platform health and management</p>
          </div>
        </div>

        {loadError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{loadError}</span>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={Users} label="Total Users" value={stats?.totalUsers || 0} />
          <StatCard icon={BarChart3} label="Campaigns" value={stats?.totalCampaigns || 0} />
          <StatCard icon={Activity} label="Active" value={stats?.activeCampaigns || 0} color="text-emerald-400" />
          <StatCard icon={TrendingUp} label="Total Streams" value={formatNumber(stats?.totalStreams || 0)} />
          <StatCard icon={Wallet} label="Revenue" value={formatCents(stats?.totalRevenueCents || 0)} />
          <StatCard icon={Wallet} label="Wallet Total" value={formatCents(stats?.totalWalletBalanceCents || 0)} color="text-blue-400" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {(['overview', 'campaigns', 'users', 'ledger'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all',
                activeTab === tab ? 'bg-[#1db954] text-black' : 'glass-card text-[var(--muted-foreground)]'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Campaigns Tab */}
        {activeTab === 'campaigns' && (
          <div className="glass-strong rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-[var(--muted-foreground)]">
                    <th className="text-left px-4 py-3 font-medium">Artist</th>
                    <th className="text-left px-4 py-3 font-medium">Stage</th>
                    <th className="text-left px-4 py-3 font-medium">Streams</th>
                    <th className="text-left px-4 py-3 font-medium">Budget</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    <th className="text-left px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">
                        <div className="font-medium">{c.artist?.artist_name || 'Unknown'}</div>
                        <div className="text-xs text-[var(--subtle-foreground)]">{c.artist?.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'px-2 py-1 rounded-lg text-xs font-medium',
                          c.current_stage === 'planting' && 'bg-emerald-400/10 text-emerald-400',
                          c.current_stage === 'germination' && 'bg-blue-400/10 text-blue-400',
                          c.current_stage === 'root_system' && 'bg-violet-400/10 text-violet-400',
                          c.current_stage === 'branching' && 'bg-amber-400/10 text-amber-400',
                          c.current_stage === 'full_bloom' && 'bg-rose-400/10 text-rose-400',
                          c.current_stage === 'completed' && 'bg-gray-400/10 text-gray-400',
                        )}>
                          {c.current_stage}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatNumber(c.total_streams || 0)}</td>
                      <td className="px-4 py-3">{formatCents(c.total_budget_cents || 0)}</td>
                      <td className="px-4 py-3">
                        {c.is_active ? (
                          c.is_paused ? (
                            <span className="flex items-center gap-1 text-amber-400 text-xs">
                              <PauseCircle className="w-3 h-3" /> Paused
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-emerald-400 text-xs">
                              <CheckCircle2 className="w-3 h-3" /> Active
                            </span>
                          )
                        ) : (
                          <span className="flex items-center gap-1 text-gray-400 text-xs">
                            <XCircle className="w-3 h-3" /> Ended
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => togglePause(c)}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        >
                          {c.is_paused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && (
          <div className="glass-strong rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-[var(--muted-foreground)]">
                    <th className="text-left px-4 py-3 font-medium">Artist</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Genre</th>
                    <th className="text-left px-4 py-3 font-medium">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3 font-medium">{u.artist_name || '—'}</td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)]">{u.email}</td>
                      <td className="px-4 py-3">{u.primary_genre || '—'}</td>
                      <td className="px-4 py-3 text-[var(--subtle-foreground)]">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Ledger Tab */}
        {activeTab === 'ledger' && (
          <div className="glass-strong rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-[var(--muted-foreground)]">
                    <th className="text-left px-4 py-3 font-medium">User</th>
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">Description</th>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((e) => (
                    <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="px-4 py-3">{e.user?.artist_name || e.user?.email || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'px-2 py-0.5 rounded text-xs font-medium',
                          e.type === 'bonus' && 'bg-emerald-400/10 text-emerald-400',
                          e.type === 'fee' && 'bg-rose-400/10 text-rose-400',
                          e.type === 'withdrawal' && 'bg-amber-400/10 text-amber-400',
                          e.type === 'earning' && 'bg-blue-400/10 text-blue-400',
                        )}>
                          {e.type}
                        </span>
                      </td>
                      <td className={cn('px-4 py-3 font-medium', e.amount_cents >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                          {e.amount_cents >= 0 ? '+' : ''}{formatCents(e.amount_cents)}
                      </td>
                      <td className="px-4 py-3 text-[var(--muted-foreground)] max-w-xs truncate">{e.description}</td>
                      <td className="px-4 py-3 text-[var(--subtle-foreground)]">{new Date(e.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = 'text-white' }: { icon: any; label: string; value: string | number; color?: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <Icon className="w-5 h-5 text-[var(--subtle-foreground)] mb-2" />
      <div className={cn('text-xl font-bold', color)}>{value}</div>
      <div className="text-xs text-[var(--subtle-foreground)]">{label}</div>
    </div>
  );
}
