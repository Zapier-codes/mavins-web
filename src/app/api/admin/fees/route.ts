import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { ADMIN_CAPABILITIES } from '@/lib/auth/isAdmin';

/**
 * Admin read/write for public.platform_fee_settings (migration 014,
 * Task 46b-a).
 *
 * Task 46b-c (handover.md). GET (stage 1) and POST (stage 2) were
 * built and reviewed as separate stages this session given this
 * part's own explicit framing: "the single highest-stakes part of
 * this whole task" — a wrong POST changes real money on every
 * transaction from that moment forward, for every user, silently,
 * until someone notices. GET carries none of that risk, hence going
 * first on its own.
 *
 * Unlike pricing-tiers/duration-slots/countries/genres (Task 46a),
 * this table is append-only (46b-a's own design — see migration
 * 014's header comment for the full "why", not repeated here): "the
 * current rate" is always the single most recent row, never an
 * update-in-place. So this route's GET exists for a reason those
 * four don't need one for: those tables' current state IS every row
 * in the table (useReferenceData() reads them all directly, RLS
 * permits it). This table's *current* state is only its latest row —
 * an admin UI listing "the fee settings" needs a route that already
 * knows to pick that one row out, not a raw SELECT *.
 *
 * GET response: { success: true, feeSettings: <latest row, snake_case,
 * same raw-Supabase-row convention as pricing-tiers'/countries' GET-
 * adjacent responses> } — or { success: true, feeSettings: null } in
 * the (should-be-impossible-post-migration-014) case of zero rows,
 * rather than a 500, since an empty table here is a real distinct
 * state an admin UI should be able to show something sensible for
 * (e.g. "no fee settings configured yet") rather than crash on.
 *
 * Task 46b-c, stage 2 of 3 — POST. Always an INSERT, never an UPDATE —
 * 46b-a's own append-only design (see migration 014's header comment):
 * "the current rate" is defined as "the latest row," so a rate change
 * is a new row, full stop, never a mutation of history. Bounds
 * validation is exactly the DB's own CHECK (0-100 on both
 * percentages) and nothing tighter — confirmed explicitly with the
 * product owner this session rather than picking an arbitrary
 * lower ceiling silently, per this part's own instruction to confirm
 * rather than guess. `changed_by` is taken ONLY from the authenticated
 * admin's own session (`requireAdmin()`'s `authUser.id`) — a
 * client-supplied `changedBy` in the request body is ignored entirely,
 * never trusted, so this column can't be spoofed to attribute a change
 * to a different admin than the one who actually made it.
 *
 * Task 46b-e (this session): every successful POST now also writes an
 * `admin_actions` row (migration 015 — new, minimal, built here since
 * 46e's own fuller version didn't exist yet, per 46b-e's own
 * "build the minimal version first" instruction) recording who, when,
 * and the old/new fee values. Explicitly flagged mandatory for 46b to
 * be considered shippable, not optional — see this route's own POST
 * handler for why an audit-insert failure doesn't roll back the real
 * fee change.
 *
 * POST body: { campaignFeePercent, depositFeePercent } — both
 * required, both numbers, both required to satisfy 0 <= x <= 100 at
 * this layer too (not just the DB's CHECK) so a bad request gets a
 * clear 400 with a useful message instead of surfacing Postgres'
 * own constraint-violation error text to the caller.
 */

export async function GET(_request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.FEES_VIEW);
  if (response) return response;

  const { data, error } = await context.admin
    .from('platform_fee_settings')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, feeSettings: data });
}

function validPercent(value: unknown, fieldName: string): { value: number } | { error: string } {
  if (value === undefined || value === null) return { error: `${fieldName} is required` };
  const n = Number(value);
  if (!Number.isFinite(n)) return { error: `${fieldName} must be a finite number` };
  if (n < 0 || n > 100) return { error: `${fieldName} must be between 0 and 100` };
  return { value: n };
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.FEES_EDIT);
  if (response) return response;

  const body = await request.json();

  const campaignFeePercent = validPercent(body.campaignFeePercent, 'campaignFeePercent');
  if ('error' in campaignFeePercent) return NextResponse.json({ success: false, error: campaignFeePercent.error }, { status: 400 });

  const depositFeePercent = validPercent(body.depositFeePercent, 'depositFeePercent');
  if ('error' in depositFeePercent) return NextResponse.json({ success: false, error: depositFeePercent.error }, { status: 400 });

  // Task 46b-e: read the row this insert is about to supersede BEFORE
  // inserting the new one, purely so admin_actions.old_value has
  // something real to record. Not used for any decision here -- this
  // route's own append-only design (46b-a) means the write below
  // happens unconditionally regardless of what this read returns,
  // same as it did before 46b-e added this line.
  const { data: previous } = await context.admin
    .from('platform_fee_settings')
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Always an insert -- 46b-a's append-only design, see this file's
  // header comment. changed_by comes only from the verified session,
  // never the request body.
  const { data, error } = await context.admin
    .from('platform_fee_settings')
    .insert({
      campaign_fee_percent: campaignFeePercent.value,
      deposit_fee_percent: depositFeePercent.value,
      changed_by: context.authUser.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // Task 46b-e: audit trail, explicitly mandatory for this part (see
  // migration 015's own header comment) -- logged AFTER the real
  // write succeeds, not before, so a failed fee-settings insert never
  // produces a misleading audit row claiming a change happened when it
  // didn't. Deliberately does NOT roll back or fail the request if
  // this insert itself fails (network blip, admin_actions table
  // briefly unavailable, etc.) -- the fee change is real money and
  // already committed at this point; losing the audit *record* of a
  // real change is a lesser failure than losing the change itself by
  // pretending it didn't happen. Logged loudly (not silently) so it's
  // visible in server logs either way.
  const { error: auditError } = await context.admin.from('admin_actions').insert({
    admin_id: context.authUser.id,
    action: 'fee_settings.update',
    table_name: 'platform_fee_settings',
    record_id: data.id,
    old_value: previous
      ? { campaignFeePercent: previous.campaign_fee_percent, depositFeePercent: previous.deposit_fee_percent }
      : null,
    new_value: { campaignFeePercent: campaignFeePercent.value, depositFeePercent: depositFeePercent.value },
  });
  if (auditError) {
    console.error('admin/fees POST: fee change succeeded but admin_actions audit insert failed', auditError, { newRowId: data.id });
  }

  return NextResponse.json({ success: true, feeSettings: data });
}
