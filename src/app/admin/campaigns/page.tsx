'use client';

// Task 46d (handover.md): split verbatim from the old admin/page.tsx
// monolith's 'campaigns' tab — same table, only the data source
// changed from shared closure state to this page's own
// useAdminDashboardData() call.
//
// Task 46c (2026-08-29): added the inline "Override" edit row —
// delivered stream counts + demographic targeting, via
// PATCH /api/admin/campaigns/[id]. See that route's own header
// comment for the full reasoning.
//
// Task 46c-cancel-b/c (this session, 2026-08-29): togglePause() no
// longer writes to track_campaigns directly — it now calls the same
// PATCH route (action: 'pause'|'resume'), closing the pre-existing
// gap Task 46d's own comment flagged (no requireAdmin() gate, no
// audit log on the old direct write). Also adds a Cancel button +
// confirmation dialog — cancelling refunds real money and is
// irreversible, exactly the "destructive/high-impact action" 46e's
// confirmation-dialog pattern is meant to cover (46e's own broader,
// reusable version of that pattern hadn't landed yet as of this
// session, so this dialog is purpose-built here rather than left
// unbuilt pending it — a generic 46e version can replace this later
// without changing the route it calls). Requires a reason (see the
// route's own header comment for why a reason is still captured even
// though the refund amount no longer branches on it).

import { useState, Fragment } from 'react';
import { AlertCircle, PauseCircle, PlayCircle, CheckCircle2, XCircle, Pencil, Check, X, Loader2, Ban } from 'lucide-react';
import { formatCents, formatNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { useAdminDashboardData } from '../useAdminDashboardData';
import { TypeToConfirm, isConfirmed } from '@/components/admin/TypeToConfirm';

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
  // Task 46e (this session) — the view-count override is the other
  // action this task's own note named explicitly ("overriding a live
  // campaign's view count") as needing a confirmation gate, same as
  // 46b's fee change. Only totalStreams is gated — targeting-only
  // edits (countries/genres) stay a plain Save, matching this task's
  // own "not every edit needs one" framing; changing what a campaign
  // is worth/how much it delivered is the high-stakes part here, not
  // which countries it's aimed at.
  const [originalTotalStreams, setOriginalTotalStreams] = useState('');
  const [streamsConfirm, setStreamsConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Derived, render-scoped (same pattern FeeSettingsPanel uses) — read
  // by saveOverride below via closure, and by the JSX further down.
  const streamsChanged = buffer !== null && buffer.totalStreams !== originalTotalStreams;
  const streamsConfirmed = !streamsChanged || isConfirmed(streamsConfirm, Number(buffer?.totalStreams ?? 0));
  const [pauseErrorId, setPauseErrorId] = useState<string | null>(null);
  // 46c-cancel-c — the campaign id currently showing its cancel
  // confirmation dialog (at most one at a time), the reason typed into
  // it, and any error from a failed cancel attempt.
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // 46c-cancel-b — now goes through PATCH /api/admin/campaigns/[id]
  // (requireAdmin()-gated, audit-logged) instead of a direct
  // browser-client write, closing the gap Task 46d's own comment had
  // flagged.
  async function togglePause(campaign: any) {
    setPauseErrorId(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaign.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: campaign.is_paused ? 'resume' : 'pause' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      reload();
    } catch (e: any) {
      setPauseErrorId(campaign.id);
      console.error('togglePause failed', e);
    }
  }

  function openCancelDialog(campaignId: string) {
    setCancelingId(campaignId);
    setCancelReason('');
    setCancelError(null);
  }

  function closeCancelDialog() {
    setCancelingId(null);
    setCancelReason('');
    setCancelError(null);
  }

  async function confirmCancel() {
    if (!cancelingId || cancelReason.trim() === '') return;
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      const res = await fetch(`/api/admin/campaigns/${cancelingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'cancel', reason: cancelReason.trim() }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || `Failed (${res.status})`);
      closeCancelDialog();
      reload();
    } catch (e: any) {
      setCancelError(e.message || 'Failed to cancel campaign');
    } finally {
      setCancelSubmitting(false);
    }
  }

  function startEdit(c: any) {
    setEditingId(c.id);
    const b = toBuffer(c);
    setBuffer(b);
    setOriginalTotalStreams(b.totalStreams);
    setStreamsConfirm('');
    setSaveError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setBuffer(null);
    setStreamsConfirm('');
    setSaveError(null);
  }

  async function saveOverride(campaignId: string) {
    if (!buffer) return;
    if (streamsChanged && !streamsConfirmed) return; // gate, mirrors FeeSettingsPanel's canSave
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
      setStreamsConfirm('');
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
                          disabled={!c.is_active}
                          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={!c.is_active ? 'Campaign has ended' : c.is_paused ? 'Resume' : 'Pause'}
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
                        <button
                          onClick={() => openCancelDialog(c.id)}
                          disabled={!c.is_active}
                          className="p-1.5 rounded-lg hover:bg-rose-500/10 text-rose-400 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                          title={!c.is_active ? 'Campaign has ended' : 'Cancel & refund'}
                        >
                          <Ban className="w-4 h-4" />
                        </button>
                      </div>
                      {pauseErrorId === c.id && (
                        <p className="text-[10px] text-rose-400 mt-1">Failed to update — try again.</p>
                      )}
                    </td>
                  </tr>

                  {/* 46c-cancel-c — confirmation dialog. Cancelling refunds real
                      money and is irreversible, so this asks for an explicit
                      reason and a distinct confirm action rather than firing
                      straight off the Ban button above. */}
                  {cancelingId === c.id && (
                    <tr className="border-b border-white/5 bg-rose-500/5">
                      <td colSpan={6} className="px-4 py-4">
                        <div className="space-y-3">
                          <div className="flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
                            <p className="text-xs">
                              Cancel this campaign and refund the unspent budget
                              ({formatCents((c.total_budget_cents || 0) - (c.spent_cents || 0))}) to the artist's
                              wallet? The platform's fee is not refundable. This cannot be undone.
                            </p>
                          </div>
                          <label className="text-xs block">
                            <span className="block text-[var(--muted-foreground)] mb-1">Reason (required, logged to the audit trail)</span>
                            <input
                              autoFocus
                              value={cancelReason}
                              onChange={(e) => setCancelReason(e.target.value)}
                              placeholder="e.g. artist requested, ToS violation, technical issue"
                              className="w-full px-2 py-1.5 rounded-lg bg-black/30 border border-white/10 text-xs focus:outline-none focus:border-rose-400/50"
                            />
                          </label>
                          {cancelError && <p className="text-xs text-rose-400">{cancelError}</p>}
                          <div className="flex items-center gap-2">
                            <button
                              disabled={cancelSubmitting || cancelReason.trim() === ''}
                              onClick={confirmCancel}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500 text-white text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {cancelSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />} Confirm Cancel
                            </button>
                            <button
                              disabled={cancelSubmitting}
                              onClick={closeCancelDialog}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-medium disabled:opacity-50"
                            >
                              <X className="w-3.5 h-3.5" /> Back
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}

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
                          {streamsChanged && (
                            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 space-y-2">
                              <p className="text-xs flex items-start gap-1.5">
                                <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
                                Changing Total Streams from <strong className="mx-1">{originalTotalStreams}</strong> to <strong className="mx-1">{buffer.totalStreams}</strong>.
                              </p>
                              <TypeToConfirm
                                expectedValue={Number(buffer.totalStreams)}
                                label={`Type ${buffer.totalStreams} to confirm this delivered-count override`}
                                value={streamsConfirm}
                                onChange={setStreamsConfirm}
                                disabled={saving}
                              />
                            </div>
                          )}
                          {saveError && <p className="text-xs text-rose-400">{saveError}</p>}
                          <div className="flex items-center gap-2">
                            <button
                              disabled={saving || (streamsChanged && !streamsConfirmed)}
                              onClick={() => saveOverride(c.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1db954] text-black text-xs font-medium hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
