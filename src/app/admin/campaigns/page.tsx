'use client';

// Task 46d (handover.md): split verbatim from the old admin/page.tsx
// monolith's 'campaigns' tab — same table, same togglePause() call,
// only the data source changed from shared closure state to this
// page's own useAdminDashboardData() call.

import { AlertCircle, PauseCircle, PlayCircle, CheckCircle2, XCircle } from 'lucide-react';
import { formatCents, formatNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { supabase } from '@/lib/supabase/client';
import { useAdminDashboardData } from '../useAdminDashboardData';

export default function AdminCampaignsPage() {
  const { campaigns, isLoading, loadError, reload } = useAdminDashboardData();

  // Unchanged from the old monolith — a direct browser-client write
  // to track_campaigns, not a new admin API route. Out of this task's
  // own scope (routes/nav/pages, not an RLS/write-path audit) to
  // change how this works, only where it lives.
  async function togglePause(campaign: any) {
    const { error } = await supabase
      .from('track_campaigns')
      .update({ is_paused: !campaign.is_paused })
      .eq('id', campaign.id);
    if (!error) reload();
  }

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
    </div>
  );
}
