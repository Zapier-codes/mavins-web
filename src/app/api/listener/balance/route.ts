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
      .select('earnings_cents, status, total_qualifying_plays, cycle_number')
      .eq('listener_id', deviceId)
      .order('cycle_number', { ascending: false });

    if (cyclesError) {
      console.error('GET /api/listener/balance: listener_earnings query failed', cyclesError);
      return NextResponse.json({ success: false, error: 'Failed to load balance' }, { status: 500 });
    }

    const rows = cycles ?? [];
    const current = rows.find((r) => r.status === 'accumulating') ?? null;
    const lifetimeEarningsCents = rows.reduce((sum, r) => sum + (r.earnings_cents ?? 0), 0);

    return NextResponse.json({
      success: true,
      currentCycle: current
        ? {
            earningsCents: current.earnings_cents,
            status: current.status,
            qualifyingPlays: current.total_qualifying_plays,
          }
        : null,
      lifetimeEarningsCents,
    });
  } catch (err: any) {
    console.error('GET /api/listener/balance error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to load balance' }, { status: 500 });
  }
}
