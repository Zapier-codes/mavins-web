// src/app/api/listener/withdraw/route.ts
/**
 * POST /api/listener/withdraw
 *
 * Task 49 Part b-ii-ii-b, split into parts (a)-(e) per the mandatory
 * task-splitting rule (handover.md) — this is Part (a): the
 * withdrawal-REQUEST route. It does exactly one thing: verify the
 * caller is a real listener (same signed-token model as
 * `balance`/`bpay-tag`, not a bare id) and call the already-existing,
 * already-live `request_listener_withdrawal(p_listener_id)` RPC
 * (migration 032, corrected by migration 040) to flip an
 * 'accumulating' cycle to 'pending' and start the real NET-50 clock
 * (`requested_at`).
 *
 * **Migration 040 note, found while scoping Part (c):** migration
 * 032's original version incorrectly skipped straight to 'claimable'
 * with no wait at all — every listener who called this RPC before
 * that fix got the 5-business-day claim window open immediately, not
 * 50 days later as already confirmed elsewhere in this task's own
 * spec. The cycle now only becomes 'claimable' once
 * `promote_pending_withdrawals_to_claimable()` (a scheduled sweep,
 * migration 040, trigger not yet wired — Part (c)'s own job) finds it
 * 50 calendar days past `requested_at`. This route's own behavior is
 * unchanged by that fix — it already just forwards the RPC's
 * success/message/cycle_id/earnings_cents, which read correctly
 * either way.
 *
 * **What this route deliberately does NOT do — later parts' own
 * job, not scope creep skipped by accident:**
 * - It does not move any money. `request_listener_withdrawal` only
 *   changes `listener_earnings.status`; the actual B-Pay wallet
 *   credit (via `credit_bpay_wallet()`, migration 036) is Part (b).
 * - It does not check whether the listener has a `bpay_tag` saved
 *   yet — Part (b) needs one to know *which* `bpay_profiles` row to
 *   credit, but requesting the withdrawal (starting the 5-business-
 *   day claim clock) doesn't itself require one. Forcing that check
 *   here would block a listener from even starting the process while
 *   they go set a tag, for no real benefit — Part (b)/(d) can surface
 *   "you need a B-Pay tag before this can be paid out" once it's
 *   actually needed.
 * - It does not touch the 'claimable' → 'expired' timeout. That's
 *   Part (e), a scheduled job, not something a listener's own request
 *   triggers.
 *
 * Auth model: identical to `balance`/`bpay-tag` — a signed, expiring
 * HMAC token carrying `deviceId`, verified via the shared
 * `lib/listener/token.ts` helpers, never a client-supplied raw id.
 * `request_listener_withdrawal` itself is GRANTed to `anon` (migration
 * 032's own header comment explains why — no `auth.uid()` exists for
 * a device-based listener), but this route still requires a valid
 * token before calling it, same posture `bpay-tag` already
 * established: the RPC's own permissive grant is for Velune's direct,
 * trusted calls elsewhere in this system, not an invitation for an
 * anonymous web request to pass an arbitrary listener id here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getListenerTokenSecret, verifyListenerToken } from '@/lib/listener/token';

export async function POST(request: NextRequest) {
  try {
    const secret = getListenerTokenSecret();
    if (!secret) {
      console.error('POST /api/listener/withdraw: LISTENER_TOKEN_SECRET is not set');
      return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const token = body?.token;

    if (typeof token !== 'string' || token.trim() === '') {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
    }

    const verified = verifyListenerToken(token, secret);
    if ('error' in verified) {
      // 401, not 400 -- matching balance/bpay-tag's own distinction.
      return NextResponse.json({ success: false, error: verified.error }, { status: 401 });
    }
    const { deviceId } = verified;

    const admin = createAdminClient();
    const { data, error } = await admin.rpc('request_listener_withdrawal', {
      p_listener_id: deviceId,
    });

    if (error) {
      console.error('POST /api/listener/withdraw: request_listener_withdrawal failed', error);
      return NextResponse.json({ success: false, error: 'Failed to request withdrawal' }, { status: 500 });
    }

    // TABLE-returning RPC -- same unwrap pattern this codebase already
    // uses for debit_wallet_balance/credit_wallet_refund
    // (api/campaigns/create/route.ts), not assumed to differ here.
    const row = Array.isArray(data) ? data[0] : data;

    if (!row?.success) {
      // Not an HTTP error -- a real, expected outcome (no accumulating
      // balance, or below the $10 per-cycle minimum). The RPC's own
      // `message` is already a clear, displayable string; surfacing it
      // as-is rather than re-deriving one here.
      // 400, matching this codebase's own established convention for a
      // failed-but-well-formed money RPC result (see
      // `api/campaigns/create/route.ts`'s `!debitResult.debited`
      // handling) -- a real, expected business outcome, not a server
      // error, but still not a 2xx.
      return NextResponse.json(
        {
          success: false,
          error: row?.message || 'Withdrawal request could not be processed',
          cycleId: row?.cycle_id ?? null,
          earningsCents: row?.earnings_cents ?? null,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: row.message,
      cycleId: row.cycle_id,
      earningsCents: row.earnings_cents,
    });
  } catch (err: any) {
    console.error('POST /api/listener/withdraw error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to request withdrawal' },
      { status: 500 }
    );
  }
}
