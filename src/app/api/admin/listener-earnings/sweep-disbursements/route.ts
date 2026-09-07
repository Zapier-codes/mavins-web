// src/app/api/admin/listener-earnings/sweep-disbursements/route.ts
/**
 * POST /api/admin/listener-earnings/sweep-disbursements
 *
 * Task 49 Part (c), sub-part (c-c) — a manual/admin-triggerable
 * disbursement sweep, ahead of (c-b)'s real `pg_cron` wiring (not yet
 * configurable from this sandbox — needs a live project). Wraps the
 * already-built `sweep_claimable_withdrawals_for_disbursement()`
 * (migration 041, Part (c-a)) via the service-role admin client, so an
 * operator can run a sweep on demand rather than waiting on a
 * schedule that doesn't exist yet.
 *
 * **This moves real money** (each `claimable` cycle it finds gets
 * disbursed via `disburse_listener_withdrawal()` -> `credit_bpay_wallet()`)
 * — gated by its own dedicated `ADMIN_CAPABILITIES` key
 * (`LISTENER_EARNINGS_SWEEP_DISBURSEMENTS`), not folded under an
 * existing `:edit`/`:view` key, same "one key per distinct mutation
 * surface" convention this app's admin taxonomy already uses for the
 * reference-data routes. Deliberately excluded from the 'monitor' tier
 * (that tier's own `hasCapability()` rule is "any `:view`-suffixed key"
 * — this key doesn't end in `:view` on purpose) even though the route
 * itself mostly just reports counts back; a read-only-tier admin
 * should not be able to trigger real disbursements just because the
 * naming convention would otherwise happen to let them through.
 *
 * No request body — this route takes no parameters, same shape as
 * `POST /api/seed-engine/seed-campaigns` (the other existing
 * no-argument admin-triggered RPC in this codebase). Uses the
 * `requireAdmin()` helper (Task 46a) rather than an inline check —
 * that route predates 46a and was deliberately left as-is (see its own
 * comment), but every admin route since 46a, this one included, goes
 * through the shared helper.
 *
 * Response shape mirrors `sweep_claimable_withdrawals_for_disbursement()`'s
 * own RETURNS TABLE columns directly (`cyclesExamined`, `cyclesDisbursed`,
 * etc.) rather than re-deriving a different summary shape — an operator
 * reading this response and the migration's own SQL side by side should
 * see the same fields, not a second naming convention for the same data.
 */
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { ADMIN_CAPABILITIES } from '@/lib/auth/isAdmin';

export async function POST() {
  try {
    const { context, response } = await requireAdmin(
      ADMIN_CAPABILITIES.LISTENER_EARNINGS_SWEEP_DISBURSEMENTS
    );
    if (response) return response;

    const { admin } = context;

    // Task 49 Part (c-d), migration 043 — p_triggered_by lets this
    // route's own audit rows (listener_disbursement_sweep_runs) be
    // distinguished from the pg_cron job's own automatic runs, without
    // this route needing to know anything about that table itself.
    const { data, error } = await admin.rpc(
      'sweep_claimable_withdrawals_for_disbursement',
      { p_triggered_by: 'admin' }
    );

    if (error) {
      console.error(
        'POST /api/admin/listener-earnings/sweep-disbursements: RPC failed',
        error
      );
      return NextResponse.json(
        { success: false, error: error.message || 'Sweep failed' },
        { status: 500 }
      );
    }

    // TABLE-returning RPC -- same unwrap pattern this codebase already
    // uses for debit_wallet_balance/request_listener_withdrawal/
    // ensure_seed_campaigns, not a second convention invented here.
    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      success: true,
      cyclesExamined: row?.cycles_examined ?? 0,
      cyclesDisbursed: row?.cycles_disbursed ?? 0,
      cyclesSkippedNoTag: row?.cycles_skipped_no_tag ?? 0,
      cyclesSkippedTagNotFound: row?.cycles_skipped_tag_not_found ?? 0,
      cyclesSkippedOther: row?.cycles_skipped_other ?? 0,
    });
  } catch (err: any) {
    console.error('POST /api/admin/listener-earnings/sweep-disbursements error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to run disbursement sweep' },
      { status: 500 }
    );
  }
}
