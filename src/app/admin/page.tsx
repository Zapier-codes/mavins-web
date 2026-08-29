'use client';

// Task 46d (handover.md): /admin itself is now the Overview page only
// — the stats grid that used to sit above the old monolith's tab bar,
// with no tab content of its own below it. Auth gating (server-side,
// redirect-before-render) and the shared header + nav now live in
// layout.tsx, not here — see that file's own header comment for why
// the gating moved there.

import { AlertCircle, Users, BarChart3, Activity, TrendingUp, Wallet } from 'lucide-react';
import { formatCents, formatNumber } from '@/lib/campaign/pricing';
import { StatCard } from '@/components/admin/StatCard';
import { useAdminDashboardData } from './useAdminDashboardData';

export default function AdminOverviewPage() {
  const { stats, isLoading, loadError } = useAdminDashboardData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard icon={Users} label="Total Users" value={stats?.totalUsers || 0} />
        <StatCard icon={BarChart3} label="Campaigns" value={stats?.totalCampaigns || 0} />
        <StatCard icon={Activity} label="Active" value={stats?.activeCampaigns || 0} color="text-emerald-400" />
        <StatCard icon={TrendingUp} label="Total Streams" value={formatNumber(stats?.totalStreams || 0)} />
        <StatCard icon={Wallet} label="Revenue" value={formatCents(stats?.totalRevenueCents || 0)} />
        <StatCard icon={Wallet} label="Wallet Total" value={formatCents(stats?.totalWalletBalanceCents || 0)} color="text-blue-400" />
      </div>
    </div>
  );
}
