import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { cancelCampaignAndRefund } from '@/services/campaign/campaignCancellation.service';
import { logAdminAction } from '@/lib/admin/auditLog';

/**
 * Admin override for an already-live public.track_campaigns row.
 * Task 46c (handover.md) — covers all three of that task's original
 * sub-items now: delivered stream counts, demographic targeting
 * (both built earlier), and pause/resume/cancel (46c-cancel-b, this
 * session) — the third was deliberately withheld earlier pending a
 * real product decision (does an admin cancel refund like a user
 * cancel does?), now confirmed: **yes, identically, no
 * fraud-exemption distinction** (handover.md's "close out" decision,
 * 2026-08-29 — see `campaignCancellation.service.ts`'s own header for
 * the full reasoning this route reuses rather than re-implements,
 * per Task 40's "one place computes it" rule, same as 46c-cancel-a's
 * own stated purpose).
 *
 * **Reason field, why required for cancel specifically despite the
 * refund no longer branching on it:** this file's own handover.md
 * has two decisions on record that read as in tension — an earlier
 * note said cancellation reason should determine the refund amount
 * (`fraud`/`policy_violation` → no refund, `customer_service`/
 * `technical_issue` → normal refund); the later, explicitly-dated
 * "close out" decision drops that branching entirely ("no
 * fraud-exemption distinction," one policy for everyone). Treating
 * the later, more specific note as authoritative for the refund
 * MATH (which is what `cancelCampaignAndRefund()` already
 * implements, unconditionally) — but the earlier note's own
 * rationale for capturing a reason at all ("more correct and more
 * defensible after the fact") doesn't depend on branching logic, it
 * depends on the reason being on record. So: `reason` is still
 * required in the request body and logged verbatim into
 * `admin_actions.new_value`, purely for accountability — it plays no
 * role in how much gets refunded. Flagging this explicitly rather
 * than silently picking one reading, since a future session may know
 * which was actually meant.
 *
 * PATCH body is one of two mutually-exclusive shapes:
 *   1. `{ action: 'pause' | 'resume' | 'cancel', reason?: string }`
 *      — `reason` required (non-empty) only when `action === 'cancel'`.
 *      Pause/resume are blocked (400) on an already-ended campaign
 *      (`is_active === false`); cancel is blocked (400) on an
 *      already-cancelled one, for the same "don't let the UI fire a
 *      confusing no-op" reason, even though the underlying refund RPC
 *      is independently idempotent either way (see
 *      `cancelCampaignAndRefund()`'s own reference-based dedup).
 *   2. any non-empty subset of
 *      `{ totalStreams, realStreams, seededStreams, targetCountries, targetGenres }`
 *      — the pre-existing override shape, unchanged, still requires
 *      at least one field.
 * A body combining `action` with any override field is rejected
 * (400) rather than silently picked between — two very different
 * kinds of admin action in one request is more likely a client bug
 * than an intentional combined edit.
 *
 * The pre-existing `togglePause()` in `admin/campaigns/page.tsx` (a
 * direct client-side write, no `requireAdmin()` gate, no audit log —
 * flagged as known tech debt by Task 46d's own comment) is replaced
 * by this session's own work to call this route's new `action:
 * 'pause'|'resume'` instead, closing that gap rather than leaving two
 * parallel pause mechanisms.
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
 * 46b-e) — distinct action names per kind of change, not one combined
 * string, matching migration 015's own anticipated naming
 * ('campaign.override_views' / 'campaign.pause' were its own example
 * names for this task): 'campaign.override_views' when any
 * stream-count field changes, 'campaign.override_targeting' when
 * target_countries/target_genres changes, 'campaign.pause' /
 * 'campaign.resume' / 'campaign.cancel' for the action shape above.
 * Both override kinds are logged as separate rows if a single PATCH
 * touches both, so an eventual audit-log viewer can filter "fraud
 * corrections" separately from "targeting changes" — a combined
 * action string would make that filtering impossible. Same
 * non-blocking-on-audit-failure posture throughout: the real write
 * already committed by the time the audit insert runs, so an
 * audit-insert failure is logged loudly but doesn't fail the request
 * or imply the real change didn't happen. The action-shape branch
 * uses `logAdminAction()` (the shared helper Task 46e extracted) for
 * its own inserts, rather than the older inline
 * `context.admin.from('admin_actions').insert(...)` the pre-existing
 * override branch below still uses — that branch is left as-is
 * (already correct, not worth touching for a DRY-ness argument that
 * only applies going forward, same reasoning `auditLog.ts`'s own
 * header comment already gives for not refactoring this file's
 * pre-existing code).
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

  // --- Action shape: pause / resume / cancel (46c-cancel-b) ---
  if (body.action !== undefined) {
    if (body.totalStreams !== undefined || body.realStreams !== undefined || body.seededStreams !== undefined ||
        body.targetCountries !== undefined || body.targetGenres !== undefined) {
      return NextResponse.json({ success: false, error: 'action cannot be combined with override fields in the same request' }, { status: 400 });
    }
    if (body.action !== 'pause' && body.action !== 'resume' && body.action !== 'cancel') {
      return NextResponse.json({ success: false, error: "action must be 'pause', 'resume', or 'cancel'" }, { status: 400 });
    }
    if (body.action === 'cancel' && (typeof body.reason !== 'string' || body.reason.trim() === '')) {
      return NextResponse.json({ success: false, error: 'reason is required to cancel a campaign' }, { status: 400 });
    }

    const { data: campaign, error: readError } = await context.admin
      .from('track_campaigns')
      .select('id, is_active, is_paused')
      .eq('id', campaignId)
      .maybeSingle();

    if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 });
    if (!campaign) return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });

    if (body.action === 'cancel') {
      if (!campaign.is_active) {
        return NextResponse.json({ success: false, error: 'Campaign is already ended' }, { status: 400 });
      }
      const result = await cancelCampaignAndRefund(context.admin, campaignId);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || 'Failed to cancel campaign' }, { status: 500 });
      }
      await logAdminAction(context.admin, {
        adminId: context.authUser.id,
        action: 'campaign.cancel',
        tableName: 'track_campaigns',
        recordId: campaignId,
        oldValue: { isActive: campaign.is_active, isPaused: campaign.is_paused },
        newValue: { isActive: false, isPaused: false, refundedCents: result.refundedCents, reason: body.reason.trim() },
      });
      return NextResponse.json({ success: true, refundedCents: result.refundedCents });
    }

    // pause / resume
    if (!campaign.is_active) {
      return NextResponse.json({ success: false, error: `Cannot ${body.action} an ended campaign` }, { status: 400 });
    }
    const newIsPaused = body.action === 'pause';
    if (campaign.is_paused === newIsPaused) {
      return NextResponse.json({ success: false, error: `Campaign is already ${newIsPaused ? 'paused' : 'active'}` }, { status: 400 });
    }
    const { error: updateError } = await context.admin
      .from('track_campaigns')
      .update({ is_paused: newIsPaused, updated_at: new Date().toISOString() })
      .eq('id', campaignId);
    if (updateError) return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });

    await logAdminAction(context.admin, {
      adminId: context.authUser.id,
      action: body.action === 'pause' ? 'campaign.pause' : 'campaign.resume',
      tableName: 'track_campaigns',
      recordId: campaignId,
      oldValue: { isPaused: campaign.is_paused },
      newValue: { isPaused: newIsPaused },
    });
    return NextResponse.json({ success: true });
  }

  // --- Override shape: totalStreams / realStreams / seededStreams / targetCountries / targetGenres (pre-existing, unchanged) ---
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
