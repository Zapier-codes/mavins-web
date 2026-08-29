import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';

/**
 * Admin override for an already-live public.track_campaigns row.
 * Task 46c (handover.md) — TWO of that task's three sub-items only:
 * delivered stream counts, and demographic targeting. The third
 * (pause/resume/cancel) is deliberately NOT here — the task's own
 * text bundles pause+cancel into one bullet requiring "its own
 * confirmation before building" (the open product question being
 * whether an admin cancel refunds like a user cancel does), and
 * doesn't cleanly separate plain pause from cancel within that
 * bullet — rather than unilaterally deciding pause alone is exempt
 * from that gate, this route leaves both untouched. The pre-existing
 * togglePause() in admin/campaigns/page.tsx (a direct client-side
 * write, no requireAdmin() gate, no audit log) is unrelated tech debt
 * flagged by Task 46d's own comment, also not addressed here.
 *
 * PATCH body: any non-empty subset of
 *   { totalStreams, realStreams, seededStreams, targetCountries, targetGenres }
 * — at least one field required, or this is a no-op PATCH and gets a
 * 400 rather than silently succeeding.
 *
 * Traced before building, not assumed: `seedEngine.service.ts`'s
 * `getActiveCampaigns()` does a fresh `.select('*')` from
 * track_campaigns on every cron tick (every 15 minutes, that file's
 * own header comment) — no caching, no snapshot-at-campaign-start. A
 * targeting edit here takes effect on the very next tick, nothing
 * else to propagate.
 *
 * Delivered-counts editing deliberately does NOT touch spent_cents,
 * is_active, or completed_at, even though record_campaign_stream
 * (supabase_schema.sql) keeps all of those in lockstep with
 * total_streams on every real play event. Per this task's own
 * framing ("likely for fraud correction or manual reconciliation, not
 * a pricing change") — this route corrects the DISPLAYED/tracked
 * progress number, not what the artist has already been charged for
 * seed plays already delivered. If a correction ever needs to also
 * adjust spend (e.g. reversing fraudulent seed-play charges, not just
 * the count), that's a different, bigger operation than this route
 * does and needs its own explicit design, not a silent side effect
 * bolted onto a count edit.
 *
 * current_stage IS recomputed here when any stream count changes —
 * unlike record_campaign_stream's own CASE logic (which only ever
 * upgrades the stage, never downgrades, appropriate for an
 * incrementing play counter), this recomputes purely as a function of
 * the new total_streams value, moving in either direction. This is a
 * genuine, deliberate difference from the RPC's logic: an admin
 * correction reducing an inflated count should be reflected in the
 * stage too, not leave a stale "full_bloom" label on a campaign just
 * corrected back down to a few hundred streams. Uses the exact same
 * thresholds as the RPC (1,000,000 / 250,000 / 50,000 / 10,000) so
 * the two stay consistent with each other going forward.
 *
 * Every successful write logs to admin_actions (migration 015,
 * 46b-e) — two distinct action names, not one combined string,
 * matching that migration's own anticipated naming
 * ('campaign.override_views' / 'campaign.pause' were its own example
 * names for 46c): 'campaign.override_views' when any stream-count
 * field changes, 'campaign.override_targeting' when target_countries/
 * target_genres changes. Both logged as separate rows if a single
 * PATCH touches both kinds of field, so an eventual audit-log viewer
 * can filter "fraud corrections" separately from "targeting changes"
 * — a combined action string would make that filtering impossible.
 * Same non-blocking-on-audit-failure posture as /api/admin/fees: the
 * real write already committed by the time the audit insert runs, so
 * an audit-insert failure is logged loudly but doesn't fail the
 * request or imply the real change didn't happen.
 */

const STAGE_THRESHOLDS: [number, string][] = [
  [1000000, 'full_bloom'],
  [250000, 'branching'],
  [50000, 'root_system'],
  [10000, 'germination'],
];

function computeStage(totalStreams: number): string {
  for (const [threshold, stage] of STAGE_THRESHOLDS) {
    if (totalStreams >= threshold) return stage;
  }
  return 'planting';
}

interface CampaignUpdate {
  total_streams?: number;
  real_streams?: number;
  seeded_streams?: number;
  target_countries?: string[];
  target_genres?: string[];
  current_stage?: string;
}

function nonNegativeInt(value: unknown, fieldName: string): { value: number } | { error: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) {
    return { error: `${fieldName} must be a non-negative integer` };
  }
  return { value: n };
}

function stringArray(value: unknown, fieldName: string): { value: string[] } | { error: string } {
  if (!Array.isArray(value)) return { error: `${fieldName} must be an array of strings` };
  return { value: value.map(String) };
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const campaignId = params.id;
  if (!campaignId) {
    return NextResponse.json({ success: false, error: 'campaign id is required' }, { status: 400 });
  }

  const body = await request.json();

  const update: CampaignUpdate = {};
  const touchedStreamFields: string[] = [];
  const touchedTargetingFields: string[] = [];

  if (body.totalStreams !== undefined) {
    const r = nonNegativeInt(body.totalStreams, 'totalStreams');
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    update.total_streams = r.value;
    touchedStreamFields.push('totalStreams');
  }
  if (body.realStreams !== undefined) {
    const r = nonNegativeInt(body.realStreams, 'realStreams');
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    update.real_streams = r.value;
    touchedStreamFields.push('realStreams');
  }
  if (body.seededStreams !== undefined) {
    const r = nonNegativeInt(body.seededStreams, 'seededStreams');
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    update.seeded_streams = r.value;
    touchedStreamFields.push('seededStreams');
  }
  if (body.targetCountries !== undefined) {
    const r = stringArray(body.targetCountries, 'targetCountries');
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    update.target_countries = r.value;
    touchedTargetingFields.push('targetCountries');
  }
  if (body.targetGenres !== undefined) {
    const r = stringArray(body.targetGenres, 'targetGenres');
    if ('error' in r) return NextResponse.json({ success: false, error: r.error }, { status: 400 });
    update.target_genres = r.value;
    touchedTargetingFields.push('targetGenres');
  }

  if (touchedStreamFields.length === 0 && touchedTargetingFields.length === 0) {
    return NextResponse.json(
      { success: false, error: 'At least one of totalStreams, realStreams, seededStreams, targetCountries, targetGenres is required' },
      { status: 400 }
    );
  }

  // Read the current row first — needed both for admin_actions'
  // old_value and, if total_streams is being changed, to recompute
  // current_stage from the NEW value (not a value this request may
  // not have sent).
  const { data: previous, error: readError } = await context.admin
    .from('track_campaigns')
    .select('total_streams, real_streams, seeded_streams, target_countries, target_genres, current_stage')
    .eq('id', campaignId)
    .maybeSingle();

  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 });
  if (!previous) return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });

  if (update.total_streams !== undefined) {
    update.current_stage = computeStage(update.total_streams);
  }

  const { data, error } = await context.admin
    .from('track_campaigns')
    .update(update)
    .eq('id', campaignId)
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  const auditRows: { admin_id: string; action: string; table_name: string; record_id: string; old_value: any; new_value: any }[] = [];

  if (touchedStreamFields.length > 0) {
    auditRows.push({
      admin_id: context.authUser.id,
      action: 'campaign.override_views',
      table_name: 'track_campaigns',
      record_id: campaignId,
      old_value: {
        totalStreams: previous.total_streams,
        realStreams: previous.real_streams,
        seededStreams: previous.seeded_streams,
        currentStage: previous.current_stage,
      },
      new_value: {
        totalStreams: data.total_streams,
        realStreams: data.real_streams,
        seededStreams: data.seeded_streams,
        currentStage: data.current_stage,
      },
    });
  }

  if (touchedTargetingFields.length > 0) {
    auditRows.push({
      admin_id: context.authUser.id,
      action: 'campaign.override_targeting',
      table_name: 'track_campaigns',
      record_id: campaignId,
      old_value: { targetCountries: previous.target_countries, targetGenres: previous.target_genres },
      new_value: { targetCountries: data.target_countries, targetGenres: data.target_genres },
    });
  }

  if (auditRows.length > 0) {
    const { error: auditError } = await context.admin.from('admin_actions').insert(auditRows);
    if (auditError) {
      console.error('admin/campaigns PATCH: override succeeded but admin_actions audit insert failed', auditError, { campaignId });
    }
  }

  return NextResponse.json({ success: true, campaign: data });
}
