// src/app/api/listener/bpay-tag/route.ts
/**
 * POST /api/listener/bpay-tag
 *
 * Task 67 Part f — split into f-i (schema, migration 034, done) and
 * f-ii (this route + a UI surface). Further split into f-ii-i (this
 * route) and f-ii-ii (the UI that calls it, not built this session) —
 * the route is the smaller, self-contained, independently-testable
 * half; the UI depends on this existing, not the other way around.
 *
 * Lets a listener store the B-Pay wallet tag their eventual earnings
 * payout should be credited to (Task 67's own "Context" section — the
 * real payout destination is a B-Pay wallet, not a bank account).
 *
 * **Auth model — two real bugs found and fixed this session, not one.**
 *
 * 1. The original version used `createServerSupabaseClient()` +
 *    `auth.getUser()`, copied from `api/campaigns/cancel/route.ts`'s
 *    own pattern for a genuinely authenticated web user (an artist
 *    logged into the site). Velune listeners have no Supabase Auth
 *    session at all — Task 60's own confirmed device-based, no-login
 *    design — so no real caller could ever have successfully called
 *    this route; every request would 401.
 * 2. The obvious fix — accept a plain `listenerId` in the body instead
 *    — would itself have been wrong once Task 66's own "Core Decision
 *    Summary" is taken into account: listener-facing UI (including
 *    this tag-submission step, Part f-ii-ii) lives on `mavins-web`
 *    itself, reached from an anonymous browser — NOT called directly
 *    from the trusted Velune app the way `record_campaign_stream`/
 *    `ensure_device_listener`/`request_listener_withdrawal` are. An
 *    anonymous web request presenting a bare device UUID is not a
 *    credential; anyone who saw or guessed another listener's id could
 *    have hijacked their `bpay_tag`. `api/listener/balance/route.ts`
 *    (Task 66 Part a-i) already solved this correctly for the exact
 *    same problem — a signed, expiring HMAC token, never a raw id —
 *    so this route now verifies the same kind of token instead,
 *    reusing `lib/listener/token.ts` (extracted this session
 *    specifically so both routes share one verification
 *    implementation, not two).
 *
 * Body: { token: string, tag: string }
 *
 * **Uniqueness — migration 038, this session (Task 49 Part b-ii-ii-b
 * Part (b) prerequisite), per direct product-owner instruction: a
 * bpay_tag already linked to one account can never be linked to
 * another.** `idx_users_bpay_tag_unique` (a partial unique index on
 * `users.bpay_tag WHERE bpay_tag IS NOT NULL`) is the actual source of
 * truth for this rule — enforced at the database, not just here, so
 * two concurrent requests racing to claim the same tag can't both
 * succeed. This route catches that constraint's violation (Postgres
 * error code 23505) and turns it into a specific, friendly 409,
 * matching how Stripe/PayPal-style "this account is already linked
 * elsewhere" rejections read to an end user, rather than surfacing a
 * raw constraint-violation message or a generic 400.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getListenerTokenSecret, verifyListenerToken } from '@/lib/listener/token';

// Migration 034's own CHECK constraint, mirrored here exactly rather
// than left to the database to reject: `bpay_tag IS NULL OR
// (length(trim(bpay_tag)) > 0 AND bpay_tag NOT LIKE '@%')`. That
// migration's own comment is explicit that the CHECK validates but
// never normalizes — trimming and stripping a leading "@" (matching
// B-Pay's own `resolve_tag` Edge Function, which strips it the same
// way before querying) is this calling code's job, not the
// database's. Doing it here, once, is also what keeps a later exact-
// match lookup (Task 67 Part e, not built yet) from silently missing
// a tag stored with stray whitespace.
function normalizeTag(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

export async function POST(request: NextRequest) {
  try {
    const secret = getListenerTokenSecret();
    if (!secret) {
      console.error('POST /api/listener/bpay-tag: LISTENER_TOKEN_SECRET is not set');
      return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const token = body?.token;
    const rawTag = body?.tag;

    if (typeof token !== 'string' || token.trim() === '') {
      return NextResponse.json({ success: false, error: 'token is required' }, { status: 400 });
    }

    const verified = verifyListenerToken(token, secret);
    if ('error' in verified) {
      // 401, not 400 -- matching balance/route.ts's own distinction:
      // an expired/invalid/tampered token is an auth failure, not a
      // malformed request.
      return NextResponse.json({ success: false, error: verified.error }, { status: 401 });
    }
    const { deviceId } = verified;

    if (typeof rawTag !== 'string') {
      return NextResponse.json({ success: false, error: 'tag is required' }, { status: 400 });
    }

    const tag = normalizeTag(rawTag);

    // Same emptiness check migration 034's CHECK enforces server-side
    // (length(trim(bpay_tag)) > 0) — catching it here first gives a
    // clearer error message than a raw Postgres constraint-violation
    // would, without changing what's ultimately allowed to be stored.
    if (tag.length === 0) {
      return NextResponse.json({ success: false, error: 'tag cannot be empty' }, { status: 400 });
    }

    // Admin client, targeting the token-verified deviceId -- never a
    // client-supplied id (see header comment for why that distinction
    // is the entire point of this route's fix).
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from('users')
      .update({ bpay_tag: tag })
      .eq('id', deviceId);

    if (updateError) {
      // Migration 038's unique index is the one realistic way this
      // now fails for a *well-formed* tag: someone else already
      // linked it. Postgres reports this as error code 23505 (unique
      // violation) — checked explicitly so this specific, expected
      // case gets a clear 409 + actionable message, rather than
      // falling into the generic 400 branch below with a raw
      // constraint-name string a listener would never understand.
      if (updateError.code === '23505') {
        return NextResponse.json(
          {
            success: false,
            error: 'This B-Pay tag is already linked to another account. Each tag can only be linked to one account.',
          },
          { status: 409 }
        );
      }

      // Migration 034's own CHECK constraint is the other realistic
      // way this can still fail after the validation above — e.g. a
      // tag that was somehow still empty after normalization in a way
      // this route's own check didn't anticipate. Surface it rather
      // than a generic 500, since the constraint's own message is
      // specific.
      console.error('bpay-tag update error:', updateError);
      return NextResponse.json(
        { success: false, error: updateError.message || 'Failed to save tag' },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true, tag });
  } catch (err: any) {
    console.error('bpay-tag route error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to save B-Pay tag' },
      { status: 500 }
    );
  }
}
