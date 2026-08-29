import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';

/**
 * Admin read/write for public.platform_fee_settings (migration 014,
 * Task 46b-a).
 *
 * Task 46b-c (handover.md), stage 1 of 3 this session — GET only.
 * POST (append a new fee-settings row) is stage 2, deliberately
 * built and reviewed separately given this task's own explicit
 * framing: "the single highest-stakes part of this whole task" —
 * a wrong POST changes real money on every transaction from that
 * moment forward, for every user, silently, until someone notices.
 * GET carries none of that risk, hence going first on its own.
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
 */

export async function GET(_request: NextRequest) {
  const { context, response } = await requireAdmin();
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
