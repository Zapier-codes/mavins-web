'use client';

// Task 46d (handover.md): Overview, Campaigns, Users, and Ledger are
// four separate routes now, but all four derive from the exact same
// /api/admin/dashboard response (the old monolith's own single
// loadData() call populated all of users/campaigns/ledger/stats
// together). Rather than duplicating "fetch, parse response, compute
// stats" four times with four chances to drift, each of those four
// pages calls this one hook instead.
//
// Deliberately NOT a shared cache/context across the four routes —
// navigating between them re-fetches, same as this app already does
// route-to-route elsewhere (e.g. /promote <-> /earnings each fetch
// their own data independently, no shared client-side cache). Wiring
// this through TanStack Query (like useReferenceData() does) would
// avoid the re-fetch on every tab switch, but that's a performance
// nice-to-have outside this task's own scope (routes/nav/pages), not
// something to fold in silently — flagged in handover.md instead of
// built here.

import { useEffect, useState } from 'react';
import type { AdminStats } from '@/lib/admin/adminHelpers';

export function useAdminDashboardData() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setLoadError(null);
    // Goes through a server route using the service-role client — the
    // regular client-side query this used to run directly against
    // users/track_campaigns/wallet_ledger only ever returns the
    // caller's own row under RLS ("own row only" policy), which is why
    // this page could look nearly empty even for a real admin.
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

  useEffect(() => {
    loadData();
  }, []);

  return { stats, campaigns, users, ledger, isLoading, loadError, reload: loadData };
}
