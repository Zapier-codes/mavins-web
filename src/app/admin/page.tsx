'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ADMIN_CONFIG, isAdminEmail } from '@/components/providers/AuthProvider';
import { formatCents, formatNumber, formatCompactNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import {
  Shield, Users, BarChart3, Wallet, Activity, Music, Flame, Megaphone,
  TrendingUp, AlertCircle, CheckCircle2, PauseCircle, PlayCircle,
  XCircle, RefreshCw, Eye, Lock, Unlock, UserPlus, UserX, Trash2,
  ChevronDown, ChevronUp, Search, X, Crown
} from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalStreams: number;
  totalRevenueCents: number;
  totalWalletBalanceCents: number;
  suspendedUsers: number;
}

interface UserRecord {
  id: string;
  email: string;
  artist_name?: string;
  role?: string;
  created_at: string;
  is_suspended?: boolean;
}

export default function AdminPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  // ── Admin Credential Gate ────────────────────────────────────────────
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    if (isAdminEmail(user?.email)) {
      setIsAuthorized(true);
    }
  }, [user]);

  const handleAdminLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (
      loginEmail.trim().toLowerCase() === ADMIN_CONFIG.email.toLowerCase() &&
      loginPassword === ADMIN_CONFIG.password
    ) {
      setIsAuthorized(true);
    } else {
      setLoginError('Invalid admin credentials');
    }
  };

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 mb-4 shadow-lg shadow-amber-500/20">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold">Admin Access</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">Restricted area</p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">Admin Email</label>
              <input
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="bossblingzs@gmail.com"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">Password</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                required
              />
            </div>
            {loginError && (
              <p className="text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> {loginError}
              </p>
            )}
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold hover:brightness-110 transition-all shadow-lg shadow-amber-500/20"
            >
              Access Dashboard
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Main Admin Dashboard ─────────────────────────────────────────────
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'users' | 'ledger' | 'post-free'>('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDashboard, setUserDashboard] = useState<any>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const [freeCampaignUrl, setFreeCampaignUrl] = useState('');
  const [freeCampaignUserId, setFreeCampaignUserId] = useState('');
  const [freeCampaignGenre, setFreeCampaignGenre] = useState('');
  const [freeCampaignViews, setFreeCampaignViews] = useState(5000);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = useCallback(async () => {
    setIsLoading(true);
    const [usersRes, campaignsRes, ledgerRes] = await Promise.all([
      supabase.from('users').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('track_campaigns').select('*, artist:users(artist_name, email)').order('created_at', { ascending: false }).limit(100),
      supabase.from('wallet_ledger').select('*, user:users(artist_name, email)').order('created_at', { ascending: false }).limit(100),
    ]);

    if (usersRes.data) setUsers(usersRes.data);
    if (campaignsRes.data) setCampaigns(campaignsRes.data);
    if (ledgerRes.data) setLedger(ledgerRes.data);

    const totalStreams = campaignsRes.data?.reduce((sum: number, c: any) => sum + (c.total_streams || 0), 0) || 0;
    const totalRevenue = campaignsRes.data?.reduce((sum: number, c: any) => sum + (c.spent_cents || 0), 0) || 0;
    const activeCount = campaignsRes.data?.filter((c: any) => c.is_active && !c.is_paused).length || 0;
    const walletTotal = ledgerRes.data?.reduce((sum: number, e: any) => sum + (e.amount_cents || 0), 0) || 0;
    const suspendedCount = usersRes.data?.filter((u: any) => u.is_suspended).length || 0;

    setStats({
      totalUsers: usersRes.data?.length || 0,
      totalCampaigns: campaignsRes.data?.length || 0,
      activeCampaigns: activeCount,
      totalStreams,
      totalRevenueCents: totalRevenue,
      totalWalletBalanceCents: walletTotal,
      suspendedUsers: suspendedCount,
    });
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const togglePauseCampaign = async (campaign: any) => {
    const { error } = await supabase
      .from('track_campaigns')
      .update({ is_paused: !campaign.is_paused, updated_at: new Date().toISOString() })
      .eq('id', campaign.id);
    if (!error) { showToast(campaign.is_paused ? 'Campaign resumed' : 'Campaign paused'); loadData(); }
    else showToast('Failed', 'error');
  };

  const cancelCampaign = async (campaign: any) => {
    if (!confirm(`Cancel campaign ${campaign.id.slice(0, 8)}?`)) return;
    const unspent = (campaign.total_budget_cents || 0) - (campaign.spent_cents || 0);
    if (unspent > 0 && campaign.artist_id) {
      await supabase.from('wallet_ledger').insert({
        user_id: campaign.artist_id, amount_cents: unspent, type: 'refund',
        description: `Admin cancelled: ${campaign.id.slice(0, 8)}`,
      });
    }
    await supabase.from('track_campaigns').update({
      is_active: false, is_paused: false, current_stage: 'completed',
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', campaign.id);
    showToast('Cancelled & refunded'); loadData();
  };

  const withdrawCampaign = async (campaign: any) => {
    if (!confirm(`Withdraw campaign ${campaign.id.slice(0, 8)}? Funds refunded.`)) return;
    const unspent = (campaign.total_budget_cents || 0) - (campaign.spent_cents || 0);
    if (unspent > 0 && campaign.artist_id) {
      await supabase.from('wallet_ledger').insert({
        user_id: campaign.artist_id, amount_cents: unspent, type: 'refund',
        description: `Admin withdrew: ${campaign.id.slice(0, 8)}`,
      });
    }
    await supabase.from('track_campaigns').update({
      is_active: false, is_paused: false, current_stage: 'completed',
      completed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }).eq('id', campaign.id);
    showToast('Withdrawn & refunded'); loadData();
  };

  const toggleUserSuspend = async (userId: string, currentlySuspended: boolean) => {
    await supabase.from('users').update({
      is_suspended: !currentlySuspended, updated_at: new Date().toISOString(),
    }).eq('id', userId);
    showToast(currentlySuspended ? 'User re-enabled' : 'User suspended'); loadData();
  };

  const toggleAdminRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'artist' : 'admin';
    await supabase.from('users').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', userId);
    showToast(`Now ${newRole}`); loadData();
  };

  const viewUserDashboard = async (userId: string) => {
    const { data: profile } = await supabase.from('users').select('*').eq('id', userId).single();
    const { data: userCampaigns } = await supabase.from('track_campaigns').select('*').eq('artist_id', userId).order('created_at', { ascending: false });
    const { data: balance } = await supabase.rpc('get_wallet_balance', { p_user_id: userId });
    setUserDashboard({ profile, campaigns: userCampaigns || [], balance: balance || 0 });
    setSelectedUserId(userId);
    setShowUserModal(true);
  };

  const postFreeCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!freeCampaignUrl.trim() || !freeCampaignUserId) {
      showToast('URL and user required', 'error'); return;
    }
    await supabase.from('track_campaigns').insert({
      source_url: freeCampaignUrl.trim(), artist_id: freeCampaignUserId,
      total_budget_cents: 0, spent_cents: 0, geographic_tier: 'global',
      target_countries: [], target_genres: freeCampaignGenre ? [freeCampaignGenre] : [],
      current_stage: 'planting', is_active: true, is_paused: false, total_streams: 0,
    });
    showToast('Free campaign posted');
    setFreeCampaignUrl(''); setFreeCampaignUserId(''); setFreeCampaignGenre('');
    loadData();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    );
  }

  const filteredUsers = users.filter((u) =>
    (u.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (u.artist_name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const filteredCampaigns = campaigns.filter((c) =>
    (c.artist?.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (c.artist?.artist_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (c.resolved_song_id || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {toast && (
        <div className={cn(
          'fixed top-20 right-4 z-50 px-4 py-2.5 rounded-xl shadow-2xl text-sm font-semibold slide-in-from-right',
          toast.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'
        )}>
          {toast.msg}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-amber-400" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Dashboard</h1>
            <p className="text-[var(--muted-foreground)] text-sm">Platform consolidation center</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--subtle-foreground)]" />
          <input type="text" placeholder="Search users, campaigns, emails..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-sm" />
          {searchQuery && <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="w-4 h-4 text-[var(--subtle-foreground)]" /></button>}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <StatCard icon={Users} label="Total Users" value={stats?.totalUsers ?? 0} color="text-blue-400" />
          <StatCard icon={BarChart3} label="Total Campaigns" value={stats?.totalCampaigns ?? 0} color="text-emerald-400" />
          <StatCard icon={Activity} label="Active Campaigns" value={stats?.activeCampaigns ?? 0} color="text-amber-400" />
          <StatCard icon={TrendingUp} label="Total Streams" value={formatCompactNumber(stats?.totalStreams ?? 0)} color="text-violet-400" />
          <StatCard icon={Wallet} label="Total Revenue" value={formatCents(stats?.totalRevenueCents ?? 0)} color="text-rose-400" />
          <StatCard icon={Lock} label="Suspended Users" value={stats?.suspendedUsers ?? 0} color="text-red-400" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['overview', 'campaigns', 'users', 'ledger', 'post-free'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 flex-shrink-0', activeTab === tab ? 'bg-amber-500 text-black shadow-lg' : 'chip-card text-[var(--muted-foreground)]')}>
              {tab === 'overview' ? 'Overview' : tab === 'post-free' ? 'Post Free' : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Recent Campaigns</h2>
            <div className="space-y-3">
              {campaigns.slice(0, 10).map((c) => (
                <div key={c.id} className="glass-card rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{c.artist?.artist_name || c.artist?.email || 'Unknown'}</p>
                    <p className="text-[11px] text-[var(--subtle-foreground)]">{c.resolved_song_id || c.source_url} · {formatCents(c.total_budget_cents)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button onClick={() => togglePauseCampaign(c)} className="p-1.5 rounded-lg glass-card hover:bg-white/5">{c.is_paused ? <PlayCircle className="w-4 h-4 text-emerald-400" /> : <PauseCircle className="w-4 h-4 text-amber-400" />}</button>
                    <button onClick={() => cancelCampaign(c)} className="p-1.5 rounded-lg glass-card hover:bg-white/5"><XCircle className="w-4 h-4 text-red-400" /></button>
                    <button onClick={() => withdrawCampaign(c)} className="p-1.5 rounded-lg glass-card hover:bg-white/5"><RefreshCw className="w-4 h-4 text-violet-400" /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'campaigns' && (
          <div className="space-y-3">
            {filteredCampaigns.map((c) => (
              <div key={c.id} className="glass-card rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{c.artist?.artist_name || c.artist?.email || 'Unknown'}</p>
                    <p className="text-[11px] text-[var(--subtle-foreground)]">{c.resolved_song_id || c.source_url}</p>
                  </div>
                  <span className={cn('text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border flex-shrink-0', c.is_active && !c.is_paused ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' : c.is_paused ? 'bg-amber-400/10 text-amber-400 border-amber-400/20' : 'bg-gray-400/10 text-gray-400 border-gray-400/20')}>
                    {c.is_paused ? 'Paused' : c.is_active ? 'Active' : 'Completed'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div><span className="text-[var(--subtle-foreground)]">Budget:</span> {formatCents(c.total_budget_cents)}</div>
                  <div><span className="text-[var(--subtle-foreground)]">Spent:</span> {formatCents(c.spent_cents)}</div>
                  <div><span className="text-[var(--subtle-foreground)]">Streams:</span> {formatNumber(c.total_streams)}</div>
                </div>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button onClick={() => togglePauseCampaign(c)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1">{c.is_paused ? <PlayCircle className="w-3.5 h-3.5" /> : <PauseCircle className="w-3.5 h-3.5" />}{c.is_paused ? 'Resume' : 'Pause'}</button>
                  <button onClick={() => cancelCampaign(c)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-400/10 text-red-400 hover:bg-red-400/20 transition-colors flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Cancel</button>
                  <button onClick={() => withdrawCampaign(c)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-400/10 text-violet-400 hover:bg-violet-400/20 transition-colors flex items-center gap-1"><RefreshCw className="w-3.5 h-3.5" /> Withdraw</button>
                  <button onClick={() => viewUserDashboard(c.artist_id)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-400/10 text-blue-400 hover:bg-blue-400/20 transition-colors flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> View Artist</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-3">
            {filteredUsers.map((u) => (
              <div key={u.id} className={cn('glass-card rounded-xl p-4 flex items-center justify-between gap-3', u.is_suspended && 'opacity-60 border-red-400/20')}>
                <div className="min-w-0 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center text-xs font-bold text-[var(--background)] flex-shrink-0">
                    {(u.artist_name?.charAt(0) || u.email?.charAt(0) || 'U').toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{u.artist_name || u.email}</p>
                    <p className="text-[11px] text-[var(--subtle-foreground)]">{u.email} · {u.role || 'artist'} · {new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                  {u.role === 'admin' && <Crown className="w-4 h-4 text-amber-400 flex-shrink-0" />}
                  {u.is_suspended && <Lock className="w-4 h-4 text-red-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => viewUserDashboard(u.id)} className="p-1.5 rounded-lg glass-card hover:bg-white/5" title="View Dashboard"><Eye className="w-4 h-4 text-blue-400" /></button>
                  <button onClick={() => toggleAdminRole(u.id, u.role || 'artist')} className="p-1.5 rounded-lg glass-card hover:bg-white/5" title={u.role === 'admin' ? 'Demote' : 'Promote'}>{u.role === 'admin' ? <UserX className="w-4 h-4 text-amber-400" /> : <UserPlus className="w-4 h-4 text-emerald-400" />}</button>
                  <button onClick={() => toggleUserSuspend(u.id, !!u.is_suspended)} className="p-1.5 rounded-lg glass-card hover:bg-white/5" title={u.is_suspended ? 'Re-enable' : 'Suspend'}>{u.is_suspended ? <Unlock className="w-4 h-4 text-emerald-400" /> : <Lock className="w-4 h-4 text-red-400" />}</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="space-y-3">
            {ledger.map((entry) => (
              <div key={entry.id} className="glass-card rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-sm">{entry.user?.artist_name || entry.user?.email || 'Unknown'}</p>
                  <p className="text-[11px] text-[var(--subtle-foreground)]">{entry.description || entry.type}</p>
                </div>
                <span className={cn('text-sm font-bold tabular-nums flex-shrink-0', (entry.amount_cents || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                  {(entry.amount_cents || 0) >= 0 ? '+' : ''}{formatCents(Math.abs(entry.amount_cents || 0))}
                </span>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'post-free' && (
          <div className="glass-strong rounded-2xl p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2"><Megaphone className="w-5 h-5 text-[#1db954]" />Post Free Campaign</h2>
              <p className="text-sm text-[var(--muted-foreground)] mt-1">Create a campaign for any user without charging.</p>
            </div>
            <form onSubmit={postFreeCampaign} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">Target User</label>
                <select value={freeCampaignUserId} onChange={(e) => setFreeCampaignUserId(e.target.value)} className="w-full px-4 py-3 rounded-xl glass-input text-sm" required>
                  <option value="">Select user...</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.artist_name || u.email} ({u.email})</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">YouTube URL</label>
                <input type="url" value={freeCampaignUrl} onChange={(e) => setFreeCampaignUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." className="w-full px-4 py-3 rounded-xl glass-input text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">Genre</label>
                <select value={freeCampaignGenre} onChange={(e) => setFreeCampaignGenre(e.target.value)} className="w-full px-4 py-3 rounded-xl glass-input text-sm">
                  <option value="">Select genre...</option>
                  {['Afrobeats', 'Amapiano', 'Hip-Hop', 'R&B', 'Pop', 'Electronic', 'Reggae', 'Gospel', 'Highlife', 'Jazz', 'Rock', 'Afro-fusion', 'Drill', 'Dancehall'].map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">Target Views</label>
                <input type="number" min="1000" max="500000" step="1000" value={freeCampaignViews} onChange={(e) => setFreeCampaignViews(Number(e.target.value))} className="w-full px-4 py-3 rounded-xl glass-input text-sm" />
              </div>
              <button type="submit" className="w-full py-3.5 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all shadow-lg shadow-[#1db954]/20 flex items-center justify-center gap-2"><Megaphone className="w-5 h-5" />Post Free Campaign</button>
            </form>
          </div>
        )}
      </div>

      {showUserModal && userDashboard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 bg-black/60 backdrop-blur-sm" onClick={() => setShowUserModal(false)}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto glass-strong rounded-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold flex items-center gap-2"><Eye className="w-5 h-5 text-blue-400" />User Dashboard</h3>
              <button onClick={() => setShowUserModal(false)} className="p-1.5 rounded-lg glass-card"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-2">
              <p className="text-sm"><span className="text-[var(--subtle-foreground)]">Name:</span> {userDashboard.profile?.artist_name || 'N/A'}</p>
              <p className="text-sm"><span className="text-[var(--subtle-foreground)]">Email:</span> {userDashboard.profile?.email}</p>
              <p className="text-sm"><span className="text-[var(--subtle-foreground)]">Role:</span> {userDashboard.profile?.role || 'artist'}</p>
              <p className="text-sm"><span className="text-[var(--subtle-foreground)]">Wallet:</span> {formatCents(userDashboard.balance)}</p>
              <p className="text-sm"><span className="text-[var(--subtle-foreground)]">Campaigns:</span> {userDashboard.campaigns.length}</p>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {userDashboard.campaigns.map((c: any) => (
                <div key={c.id} className="glass-card rounded-lg p-3 text-xs">
                  <p className="font-semibold truncate">{c.resolved_song_id || c.source_url}</p>
                  <p className="text-[var(--subtle-foreground)]">{formatCents(c.total_budget_cents)} · {formatNumber(c.total_streams)} streams · {c.is_active ? 'Active' : 'Done'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  return (
    <div className="glass-card rounded-xl p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', color.replace('text-', 'bg-').replace('400', '400/10'))}>
        <Icon className={cn('w-5 h-5', color)} />
      </div>
      <div>
        <p className="text-xl font-bold">{value}</p>
        <p className="text-[11px] text-[var(--subtle-foreground)]">{label}</p>
      </div>
    </div>
  );
}
