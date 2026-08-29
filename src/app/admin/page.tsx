'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { formatCents, formatNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { AdminCrudTable, type AdminCrudColumn } from '@/components/admin/AdminCrudTable';
import { AffinityMatrix, type AffinityRow } from '@/components/admin/AffinityMatrix';
import { FeeSettingsPanel, type FeeSettingsRow } from '@/components/admin/FeeSettingsPanel';
import { REFERENCE_DATA_QUERY_KEY } from '@/hooks/campaign/useReferenceData';
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

// Task 46a (handover.md), Part A of this session's own UI split.
// Raw table shape (snake_case, matching migration 010 exactly) — kept
// distinct from PricingTier/DurationSlot in pricing.ts, which
// deliberately drop id/color/sort_order since calculatePricing() never
// needed them. This admin UI needs those fields back (id for PATCH/
// DELETE, sort_order to actually control display order), so it reads
// the raw tables directly via the browser Supabase client rather than
// through useReferenceData() — RLS already permits public SELECT on
// both (migration 010's own "Public read" policies), so no new GET
// route was needed for this.
interface PricingTierRow {
  id: string;
  min_views: number;
  max_views: number;
  price_per_1k_cents: number;
  label: string;
  description: string;
  color: string | null;
  sort_order: number;
}

interface DurationSlotRow {
  id: string;
  label: string;
  weeks: number;
  days: number;
  max_daily_drip: number;
  max_views: number;
  description: string;
  badge: string;
  sort_order: number;
}

const PRICING_TIER_COLUMNS: AdminCrudColumn<PricingTierRow>[] = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'min_views', label: 'Min Views', type: 'number' },
  { key: 'max_views', label: 'Max Views', type: 'number' },
  { key: 'price_per_1k_cents', label: '¢ / 1K', type: 'number' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'description', label: 'Description', type: 'text' },
];

const DURATION_SLOT_COLUMNS: AdminCrudColumn<DurationSlotRow>[] = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'weeks', label: 'Weeks', type: 'number' },
  { key: 'days', label: 'Days', type: 'number' },
  { key: 'max_daily_drip', label: 'Max Daily Drip', type: 'number' },
  { key: 'max_views', label: 'Max Views', type: 'number' },
  { key: 'badge', label: 'Badge', type: 'text' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'description', label: 'Description', type: 'text' },
];

// Task 46a Part B-i (handover.md) — countries/genres, the two of Part
// B's three remaining tables that fit AdminCrudTable's generalized
// shape (see that component's own header comment for the idKey/
// text-array additions this required). genre_country_affinity (Part
// B-ii) does not, and isn't attempted here.
interface CountryRow {
  code: string;
  country: string;
  flag: string;
  sort_order: number;
  korapay_channels: string[] | null;
  korapay_default_channel: string | null;
}

interface GenreRow {
  id: string;
  label: string;
  sort_order: number;
}

const COUNTRY_COLUMNS: AdminCrudColumn<CountryRow>[] = [
  { key: 'code', label: 'Code', type: 'text' },
  { key: 'country', label: 'Country', type: 'text' },
  { key: 'flag', label: 'Flag', type: 'text' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'korapay_channels', label: 'Korapay Channels', type: 'text-array' },
  { key: 'korapay_default_channel', label: 'Korapay Default', type: 'text' },
];

const GENRE_COLUMNS: AdminCrudColumn<GenreRow>[] = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'sort_order', label: 'Order', type: 'number' },
];

const CASCADE_DELETE_WARNING = 'Delete? This also removes every genre-country affinity row for it.';

export default function AdminPage() {
  const { isAuthenticated, isAdmin, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'campaigns' | 'users' | 'ledger' | 'pricing' | 'duration' | 'countries' | 'genres' | 'affinity' | 'fees'>('overview');

  // Task 46a Part A — pricing_tiers / duration_slots raw rows. Loaded
  // lazily (only once their tab is first opened, see loadPricingTiers/
  // loadDurationSlots below) rather than bundled into the initial
  // loadData() call — this admin page's core (campaigns/users/ledger)
  // shouldn't wait on two tables most page loads won't even look at.
  const [pricingTiers, setPricingTiers] = useState<PricingTierRow[]>([]);
  const [pricingTiersLoaded, setPricingTiersLoaded] = useState(false);
  const [durationSlots, setDurationSlots] = useState<DurationSlotRow[]>([]);
  const [durationSlotsLoaded, setDurationSlotsLoaded] = useState(false);
  // Task 46a Part B-i — same lazy-load-on-first-tab-open pattern as
  // Part A's two tables above.
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [countriesLoaded, setCountriesLoaded] = useState(false);
  const [genres, setGenres] = useState<GenreRow[]>([]);
  const [genresLoaded, setGenresLoaded] = useState(false);
  // Task 46a Part B-ii — genre_country_affinity, all 350 rows loaded at
  // once (cheap — 14 genres x 25 countries) and filtered client-side by
  // AffinityMatrix's own genre selector, rather than re-querying per
  // genre switch. Same lazy-load-on-first-tab-open pattern as every
  // other table on this page.
  const [affinityRows, setAffinityRows] = useState<AffinityRow[]>([]);
  const [affinityLoaded, setAffinityLoaded] = useState(false);
  // Task 46b-d — platform_fee_settings, same lazy-load-on-first-tab-
  // open pattern as every other table on this page. Unlike the five
  // 46a tables, this one goes through the admin GET route (Task
  // 46b-c) instead of a direct browser-client select -- "the current
  // rate" needs an ORDER BY changed_at DESC LIMIT 1, which the route
  // already does server-side, rather than duplicating that query
  // shape here.
  const [feeSettings, setFeeSettings] = useState<FeeSettingsRow | null>(null);
  const [feeSettingsLoaded, setFeeSettingsLoaded] = useState(false);

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

  async function loadPricingTiers() {
    const { data, error } = await supabase.from('pricing_tiers').select('*').order('sort_order');
    if (!error) setPricingTiers(data ?? []);
    setPricingTiersLoaded(true);
  }

  async function loadDurationSlots() {
    const { data, error } = await supabase.from('duration_slots').select('*').order('sort_order');
    if (!error) setDurationSlots(data ?? []);
    setDurationSlotsLoaded(true);
  }

  // Task 46a Part B-i — same "raw table via browser client, RLS
  // already permits public SELECT" reasoning as loadPricingTiers/
  // loadDurationSlots above (see this file's header comment).
  async function loadCountries() {
    const { data, error } = await supabase.from('countries').select('*').order('sort_order');
    if (!error) setCountries(data ?? []);
    setCountriesLoaded(true);
  }

  async function loadGenres() {
    const { data, error } = await supabase.from('genres').select('*').order('sort_order');
    if (!error) setGenres(data ?? []);
    setGenresLoaded(true);
  }

  // Task 46a Part B-ii — genre_country_affinity, RLS already permits
  // public SELECT (migration 010, same as every other table on this
  // page), no scoping by genre server-side since 350 rows is cheap to
  // load whole and filter client-side (see AffinityMatrix.tsx's own
  // header comment for why genre-at-a-time was chosen for the UI shape
  // itself, independent of this decision).
  async function loadAffinity() {
    const { data, error } = await supabase.from('genre_country_affinity').select('genre_id, country_code, score');
    if (!error) setAffinityRows(data ?? []);
    setAffinityLoaded(true);
  }

  // Task 46b-d — goes through the admin route (server-side
  // requireAdmin() + the ORDER BY/LIMIT the route already does), not
  // a direct browser-client select — see this file's own state
  // declaration comment above for why this one table differs from
  // the other five.
  async function loadFeeSettings() {
    const res = await fetch('/api/admin/fees');
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) setFeeSettings(json.feeSettings ?? null);
    setFeeSettingsLoaded(true);
  }

  useEffect(() => {
    if (activeTab === 'pricing' && !pricingTiersLoaded) loadPricingTiers();
    if (activeTab === 'duration' && !durationSlotsLoaded) loadDurationSlots();
    if (activeTab === 'countries' && !countriesLoaded) loadCountries();
    if (activeTab === 'genres' && !genresLoaded) loadGenres();
    // Affinity tab needs genres + countries for its own selector/list,
    // in addition to the affinity rows themselves — load all three if
    // an admin opens this tab directly without visiting Genres/
    // Countries first.
    if (activeTab === 'affinity') {
      if (!genresLoaded) loadGenres();
      if (!countriesLoaded) loadCountries();
      if (!affinityLoaded) loadAffinity();
    }
    if (activeTab === 'fees' && !feeSettingsLoaded) loadFeeSettings();
  }, [activeTab, pricingTiersLoaded, durationSlotsLoaded, countriesLoaded, genresLoaded, affinityLoaded, feeSettingsLoaded]);

  // Task 46a Part A — after any successful write, re-read this page's
  // own local copy AND invalidate Task 45 Part 2's shared reference-
  // data query key, so promote/page.tsx's live pricing slider picks up
  // the change without a manual refresh (this task's own explicit
  // integration requirement — see handover.md). The Realtime
  // subscription in useReferenceData.ts would eventually do this on
  // its own, but calling it directly here means the admin doesn't have
  // to wait on that round-trip for their OWN list to reflect what they
  // just did.
  async function refreshAfterWrite(table: 'pricing_tiers' | 'duration_slots' | 'countries' | 'genres' | 'genre_country_affinity') {
    if (table === 'pricing_tiers') await loadPricingTiers();
    else if (table === 'duration_slots') await loadDurationSlots();
    else if (table === 'countries') await loadCountries();
    else if (table === 'genres') await loadGenres();
    else await loadAffinity();
    queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY });
  }

  async function callAdminRoute(path: string, method: 'POST' | 'PATCH' | 'DELETE', body: Record<string, any>) {
    try {
      const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        return { success: false, error: json?.error || `Request failed (${res.status})` };
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Request failed' };
    }
  }

  // Maps this page's snake_case raw-row field names (matching the DB
  // columns directly, so AdminCrudTable's generic `keyof T` columns
  // work without a separate display-shape type) to the camelCase body
  // keys api/admin/pricing-tiers/route.ts's own fromBody() expects —
  // see that route's header comment for the exact field list.
  function tierRowToBody(row: Record<string, any>) {
    return {
      id: row.id,
      minViews: row.min_views,
      maxViews: row.max_views,
      pricePer1KCents: row.price_per_1k_cents,
      label: row.label,
      description: row.description,
      color: row.color,
      sortOrder: row.sort_order,
    };
  }

  function slotRowToBody(row: Record<string, any>) {
    return {
      id: row.id,
      label: row.label,
      weeks: row.weeks,
      days: row.days,
      maxDailyDrip: row.max_daily_drip,
      maxViews: row.max_views,
      description: row.description,
      badge: row.badge,
      sortOrder: row.sort_order,
    };
  }

  // Task 46a Part B-i — same snake_case-row -> camelCase-body mapping
  // as tierRowToBody/slotRowToBody above, matching api/admin/countries/
  // route.ts and api/admin/genres/route.ts's own fromBody() field lists
  // exactly (see each route's header comment).
  function countryRowToBody(row: Record<string, any>) {
    return {
      code: row.code,
      country: row.country,
      flag: row.flag,
      sortOrder: row.sort_order,
      korapayChannels: row.korapay_channels,
      korapayDefaultChannel: row.korapay_default_channel,
    };
  }

  function genreRowToBody(row: Record<string, any>) {
    return {
      id: row.id,
      label: row.label,
      sortOrder: row.sort_order,
    };
  }

  // Task 46a Part B-ii — api/admin/genre-country-affinity/route.ts's
  // own POST body is { genreId, countryCode, score } (camelCase, same
  // convention as the other four routes' fromBody()), and its POST is
  // an upsert — no separate PATCH, so "save" always calls the same
  // route regardless of whether this (genre, country) pair already had
  // a row. DELETE body is { genreId, countryCode }.
  async function saveAffinity(genreId: string, countryCode: string, score: number) {
    const result = await callAdminRoute('/api/admin/genre-country-affinity', 'POST', { genreId, countryCode, score });
    if (result.success) await refreshAfterWrite('genre_country_affinity');
    return result;
  }

  async function clearAffinity(genreId: string, countryCode: string) {
    const result = await callAdminRoute('/api/admin/genre-country-affinity', 'DELETE', { genreId, countryCode });
    if (result.success) await refreshAfterWrite('genre_country_affinity');
    return result;
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
          {(['overview', 'campaigns', 'users', 'ledger', 'pricing', 'duration', 'countries', 'genres', 'affinity', 'fees'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium capitalize transition-all',
                activeTab === tab ? 'bg-[#1db954] text-black' : 'glass-card text-[var(--muted-foreground)]'
              )}
            >
              {tab === 'pricing' ? 'Pricing Tiers' : tab === 'duration' ? 'Duration Slots' : tab === 'affinity' ? 'Genre Affinity' : tab === 'fees' ? 'Platform Fees' : tab}
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
        {/* Pricing Tiers Tab — Task 46a Part A */}
        {activeTab === 'pricing' && (
          <AdminCrudTable<PricingTierRow>
            title="Pricing Tiers"
            columns={PRICING_TIER_COLUMNS}
            rows={pricingTiers}
            isLoading={!pricingTiersLoaded}
            emptyRow={{ min_views: 0, max_views: 0, price_per_1k_cents: 0, label: '', description: '', color: null, sort_order: pricingTiers.length }}
            onCreate={async (row) => {
              const result = await callAdminRoute('/api/admin/pricing-tiers', 'POST', tierRowToBody(row));
              if (result.success) await refreshAfterWrite('pricing_tiers');
              return result;
            }}
            onUpdate={async (id, updates) => {
              const result = await callAdminRoute('/api/admin/pricing-tiers', 'PATCH', tierRowToBody({ id, ...updates }));
              if (result.success) await refreshAfterWrite('pricing_tiers');
              return result;
            }}
            onDelete={async (id) => {
              const result = await callAdminRoute('/api/admin/pricing-tiers', 'DELETE', { id });
              if (result.success) await refreshAfterWrite('pricing_tiers');
              return result;
            }}
          />
        )}

        {/* Duration Slots Tab — Task 46a Part A */}
        {activeTab === 'duration' && (
          <AdminCrudTable<DurationSlotRow>
            title="Duration Slots"
            columns={DURATION_SLOT_COLUMNS}
            rows={durationSlots}
            isLoading={!durationSlotsLoaded}
            emptyRow={{ label: '', weeks: 1, days: 7, max_daily_drip: 0, max_views: 0, description: '', badge: '', sort_order: durationSlots.length }}
            onCreate={async (row) => {
              const result = await callAdminRoute('/api/admin/duration-slots', 'POST', slotRowToBody(row));
              if (result.success) await refreshAfterWrite('duration_slots');
              return result;
            }}
            onUpdate={async (id, updates) => {
              const result = await callAdminRoute('/api/admin/duration-slots', 'PATCH', slotRowToBody({ id, ...updates }));
              if (result.success) await refreshAfterWrite('duration_slots');
              return result;
            }}
            onDelete={async (id) => {
              const result = await callAdminRoute('/api/admin/duration-slots', 'DELETE', { id });
              if (result.success) await refreshAfterWrite('duration_slots');
              return result;
            }}
          />
        )}

        {/* Countries Tab — Task 46a Part B-i */}
        {activeTab === 'countries' && (
          <AdminCrudTable<CountryRow>
            title="Countries"
            columns={COUNTRY_COLUMNS}
            rows={countries}
            isLoading={!countriesLoaded}
            idKey="code"
            deleteWarning={CASCADE_DELETE_WARNING}
            emptyRow={{ code: '', country: '', flag: '', sort_order: countries.length, korapay_channels: null, korapay_default_channel: null }}
            onCreate={async (row) => {
              const result = await callAdminRoute('/api/admin/countries', 'POST', countryRowToBody(row));
              if (result.success) await refreshAfterWrite('countries');
              return result;
            }}
            onUpdate={async (code, updates) => {
              const result = await callAdminRoute('/api/admin/countries', 'PATCH', countryRowToBody({ code, ...updates }));
              if (result.success) await refreshAfterWrite('countries');
              return result;
            }}
            onDelete={async (code) => {
              const result = await callAdminRoute('/api/admin/countries', 'DELETE', { code });
              if (result.success) await refreshAfterWrite('countries');
              return result;
            }}
          />
        )}

        {/* Genres Tab — Task 46a Part B-i */}
        {activeTab === 'genres' && (
          <AdminCrudTable<GenreRow>
            title="Genres"
            columns={GENRE_COLUMNS}
            rows={genres}
            isLoading={!genresLoaded}
            deleteWarning={CASCADE_DELETE_WARNING}
            emptyRow={{ label: '', sort_order: genres.length }}
            onCreate={async (row) => {
              const result = await callAdminRoute('/api/admin/genres', 'POST', genreRowToBody(row));
              if (result.success) await refreshAfterWrite('genres');
              return result;
            }}
            onUpdate={async (id, updates) => {
              const result = await callAdminRoute('/api/admin/genres', 'PATCH', genreRowToBody({ id, ...updates }));
              if (result.success) await refreshAfterWrite('genres');
              return result;
            }}
            onDelete={async (id) => {
              const result = await callAdminRoute('/api/admin/genres', 'DELETE', { id });
              if (result.success) await refreshAfterWrite('genres');
              return result;
            }}
          />
        )}

        {/* Genre Affinity Tab — Task 46a Part B-ii */}
        {activeTab === 'affinity' && (
          <AffinityMatrix
            genres={genres}
            countries={countries}
            affinityRows={affinityRows}
            isLoading={!affinityLoaded || !genresLoaded || !countriesLoaded}
            onSave={saveAffinity}
            onClear={clearAffinity}
          />
        )}

        {/* Platform Fees Tab — Task 46b-d, stage 1 (read-only) */}
        {activeTab === 'fees' && (
          <FeeSettingsPanel feeSettings={feeSettings} isLoading={!feeSettingsLoaded} />
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
