// src/app/api/listener/balance/route.ts
/**
 * GET /api/listener/balance?token=...
 *
 * Task 66 Part a, sub-part i — the second of the two backend routes
 * (step 2 of that task's own "Implementation Tasks" list). See
 * `api/listener/token/route.ts`'s own header comment for the full
 * token format, the identity-model reasoning, and the
 * LISTENER_TOKEN_SECRET requirement — not repeated here.
 *
 * Verifies the token's HMAC signature and expiry, trusts the
 * `deviceId` it carries (never re-derived from a request param, query
 * string, or anything else a caller could independently supply), and
 * returns that listener's own balance from `listener_earnings`.
 *
 * Response shape — a genuine judgment call, not something Task 66's
 * own text specifies precisely. "Balance" could mean the current
 * accumulating cycle's own running total, or a lifetime-earned figure
 * summed across every past cycle, or both. Returns both rather than
 * guessing a single framing, so the `/earn` page (sub-part ii, not
 * built yet) can choose which to lead with once it actually exists:
 *   {
 *     success: true,
 *     currentCycle: { earningsCents, status, qualifyingPlays } | null,
 *     lifetimeEarningsCents: number,
 *   }
 * `currentCycle` is `null` for a device that's never had a single
 * qualifying play recorded yet (no `listener_earnings` row exists at
 * all until Part b's own crediting function first runs for them) --
 * a real, expected state for a brand-new listener, not an error.
 *
 * Token verification extracted to `lib/listener/token.ts` this
 * session (Task 67's own bpay-tag route needed the identical logic —
 * see that shared file's own header comment for why duplicating it a
 * second time would have been the wrong fix).
 *
 * **Added for Task 49 Part (d):** a `withdrawal` field, found missing
 * while building the `/earn` page's own Withdraw UI, not asked for by
 * any prior part's own spec text. `currentCycle` above is filtered to
 * `status = 'accumulating'` ONLY (migration 040 introduced 'pending'
 * as a distinct status; this route was never updated after that) --
 * so the instant Part (a)'s `/api/listener/withdraw` flips a cycle to
 * 'pending', `currentCycle` goes back to `null` and the page has no
 * way to show the resulting pending/claimable/claimed/expired state
 * on a later page load, only from that one request's own one-time
 * response. `currentCycle`'s own existing filter is left exactly as
 * it was -- changing what it means would be a silent breaking change
 * for any other caller relying on "accumulating, or null" -- and
 * `withdrawal` is added alongside it as the most recent cycle NOT in
 * that state, so the two fields together cover every possible status.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getListenerTokenSecret, verifyListenerToken } from '@/lib/listener/token';

export async function GET(request: NextRequest) {
  try {
    const secret = getListenerTokenSecret();
    if (!secret) {
      console.error('GET /api/listener/balance: LISTENER_TOKEN_SECRET is not set');
      return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 500 });
    }

    const token = request.nextUrl.searchParams.get('token');
    if (!token) {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
    }

    const verified = verifyListenerToken(token, secret);
    if ('error' in verified) {
      // 401, not 400 -- an expired/invalid/tampered token is an auth
      // failure, not a malformed request; matters for how a future
      // frontend distinguishes "ask for a new token" from "fix your
      // request".
      return NextResponse.json({ success: false, error: verified.error }, { status: 401 });
    }

    const { deviceId } = verified;
    const admin = createAdminClient();

    // Admin client, same reasoning as the token route -- no Supabase
    // Auth session exists for this identity model at all (see that
    // route's own header comment), so RLS's own
    // "auth.uid() = listener_id" policy on listener_earnings
    // (migration 019) can never apply here regardless; this route IS
    // the access-control boundary for this data, not RLS.
    const { data: cycles, error: cyclesError } = await admin
      .from('listener_earnings')
      .select('id, earnings_cents, status, total_qualifying_plays, cycle_number, requested_at, cycle_end_date')
      .eq('listener_id', deviceId)
      .order('cycle_number', { ascending: false });

    if (cyclesError) {
      console.error('GET /api/listener/balance: listener_earnings query failed', cyclesError);
      return NextResponse.json({ success: false, error: 'Failed to load balance' }, { status: 500 });
    }

    const rows = cycles ?? [];
    const current = rows.find((r) => r.status === 'accumulating') ?? null;
    // Task 49 Part (d) addition -- see this file's own header comment
    // for why this can't just reuse `current` above. `rows` is already
    // ordered newest-cycle-first, so the first non-'accumulating' row
    // is the most recently requested withdrawal, regardless of which
    // of the four other statuses it's currently sitting in.
    const withdrawal = rows.find((r) => r.status !== 'accumulating') ?? null;
    const lifetimeEarningsCents = rows.reduce((sum, r) => sum + (r.earnings_cents ?? 0), 0);

    const { data: user } = await admin
      .from('users')
      .select('bpay_tag')
      .eq('id', deviceId)
      .single();


    return NextResponse.json({
      success: true,
      currentCycle: current
        ? {
            earningsCents: current.earnings_cents,
            status: current.status,
            qualifyingPlays: current.total_qualifying_plays,
          }
        : null,
      // Task 49 Part (d) addition -- see header comment. `status` here
      // is always one of 'pending' | 'claimable' | 'claimed' | 'expired'
      // (never 'accumulating', by construction above).
      withdrawal: withdrawal
        ? {
            cycleId: withdrawal.id,
            earningsCents: withdrawal.earnings_cents,
            status: withdrawal.status,
            requestedAt: withdrawal.requested_at,
            cycleEndDate: withdrawal.cycle_end_date,
          }
        : null,
      lifetimeEarningsCents,
      bpayTag: user?.bpay_tag ?? null,
    });
  } catch (err: any) {
    console.error('GET /api/listener/balance error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to load balance' }, { status: 500 });
  }
}
