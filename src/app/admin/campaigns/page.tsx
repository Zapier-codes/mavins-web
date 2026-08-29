'use client';

// Task 46d (handover.md): split verbatim from the old admin/page.tsx
// monolith's 'campaigns' tab — same table, same togglePause() call,
// only the data source changed from shared closure state to this
// page's own useAdminDashboardData() call.
//
// Task 46c (this session, 2026-08-29): added the inline "Override"
// edit row — delivered stream counts + demographic targeting, via the
// new PATCH /api/admin/campaigns/[id] route. See that route's own
// header comment for the full reasoning (what's covered, what's
// deliberately NOT — pause/resume/cancel stays out, still blocked on
// an unresolved product decision). togglePause() below is unchanged,
// pre-existing tech debt (direct client write, no requireAdmin() gate,
// no audit log) flagged by 46d's own comment — not addressed by this
// session's 46c work, which is scoped to the two unblocked sub-items
// only.

import { useState, Fragment } from 'react';
import { AlertCircle, PauseCircle, PlayCircle, CheckCircle2, XCircle, Pencil, Check, X, Loader2 } from 'lucide-react';
import { formatCents, formatNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { supabase } from '@/lib/supabase/client';
import { useAdminDashboardData } from '../useAdminDashboardData';

interface OverrideBuffer {
  totalStreams: string;
  realStreams: string;
  seededStreams: string;
  targetCountries: string; // comma-separated in the UI, same convention as the Task 46a reference-data editor's stringArray columns
  targetGenres: string;
}

function toBuffer(c: any): OverrideBuffer {
  return {
    totalStreams: String(c.total_streams ?? 0),
    realStreams: String(c.real_streams ?? 0),
    seededStreams: String(c.seeded_streams ?? 0),
    targetCountries: Array.isArray(c.target_countries) ? c.target_countries.join(', ') : '',
    targetGenres: Array.isArray(c.target_genres) ? c.target_genres.join(', ') : '',
  };
}

export default function AdminCampaignsPage() {
  const { campaigns, isLoading, loadError, reload } = useAdminDashboardData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [buffer, setBuffer] = useState<OverrideBuffer | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  function startEdit(c: any) {
    setEditingId(c.id);
    setBuffer(toBuffer(c));
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setBuffer(null);
    setSaveError(null);
  }

  async function saveOverride(campaignId: string) {
    if (!buffer) return;
    setSaving(true);
    setSaveError(null);
    try {
      const body = {
        totalStreams: Number(buffer.totalStreams),
        realStreams: Number(buffer.realStreams),
        seededStreams: Number(buffer.seededStreams),
        targetCountries: buffer.targetCountries.split(',').map((s) => s.trim()).filter(Boolean),
        targetGenres: buffer.targetGenres.split(',').map((s) => s.trim()).filter(Boolean),
      };
      const res = await fetch(`/api/admin/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed to save (${res.status})`);
      setEditingId(null);
      setBuffer(null);
      reload();
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save override');
    } finally {
      setSaving(false);
    }
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
                <Fragment key={c.id}>
                  <tr className="border-b border-white/5 hover:bg-white/5">
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
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => togglePause(c)}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          title={c.is_paused ? 'Resume' : 'Pause'}
                        >
                          {c.is_paused ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => (editingId === c.id ? cancelEdit() : startEdit(c))}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                          title="Override streams / targeting"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {editingId === c.id && buffer && (
                    <tr className="border-b border-white/5 bg-white/5">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="space-y-3">
                          <p className="text-xs text-[var(--subtle-foreground)]">
                            Task 46c admin override — corrects delivered counts (fraud/reconciliation) or live targeting.
                            Does not touch spend or budget status. Logged to the audit trail.
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <label className="text-xs">
                              <span className="block text-[var(--muted-foreground)] mb-1">Total Streams</span>
                              <input
                                value={buffer.totalStreams}
                                onChange={(e) => setBuffer((b) => b && { ...b, totalStreams: e.target.value })}
                                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                              />
                            </label>
                            <label className="text-xs">
                              <span className="block text-[var(--muted-foreground)] mb-1">Real Streams</span>
                              <input
                                value={buffer.realStreams}
                                onChange={(e) => setBuffer((b) => b && { ...b, realStreams: e.target.value })}
                                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                              />
                            </label>
                            <label className="text-xs">
                              <span className="block text-[var(--muted-foreground)] mb-1">Seeded Streams</span>
                              <input
                                value={buffer.seededStreams}
                                onChange={(e) => setBuffer((b) => b && { ...b, seededStreams: e.target.value })}
                                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                              />
                            </label>
                            <label className="text-xs col-span-2 sm:col-span-1">
                              <span className="block text-[var(--muted-foreground)] mb-1">Target Countries (comma-separated codes)</span>
                              <input
                                value={buffer.targetCountries}
                                onChange={(e) => setBuffer((b) => b && { ...b, targetCountries: e.target.value })}
                                placeholder="NG, GH, US"
                                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                              />
                            </label>
                            <label className="text-xs col-span-2 sm:col-span-1">
                              <span className="block text-[var(--muted-foreground)] mb-1">Target Genres (comma-separated)</span>
                              <input
                                value={buffer.targetGenres}
                                onChange={(e) => setBuffer((b) => b && { ...b, targetGenres: e.target.value })}
                                placeholder="Afrobeats, Amapiano"
                                className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-[#1db954]/50"
                              />
                            </label>
                          </div>
                          {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
                          <div className="flex items-center gap-2">
                            <button
                              disabled={saving}
                              onClick={() => saveOverride(c.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1db954] text-black text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50"
                            >
                              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Save
                            </button>
                            <button
                              disabled={saving}
                              onClick={cancelEdit}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-medium disabled:opacity-50"
                            >
                              <X className="w-3.5 h-3.5" /> Cancel
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
