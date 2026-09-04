// src/app/api/listener/bpay-tag/route.ts
/**
 * POST /api/listener/bpay-tag
 *
 * Task 67 Part f — split into f-i (schema, migration 034, done) and
 * f-ii (this route + a UI surface, not yet built). Further split per
 * explicit instruction into f-ii-i (this route) and f-ii-ii (the UI
 * that calls it, not built this session) — the route is the smaller,
 * self-contained, independently-testable half; the UI depends on this
 * existing, not the other way around.
 *
 * Lets an authenticated listener store the B-Pay wallet tag their
 * eventual earnings payout should be credited to (Task 67's own
 * "Context" section — the real payout destination is a B-Pay wallet,
 * not a bank account). This is the first Next.js API route this whole
 * listener-earnings feature has — everything up to this point
 * (migrations 019/030/031/032) is SQL/RPC only, confirmed via grep
 * before writing this (no existing sibling `/api/listener*` or
 * `/api/earn*` route to mirror), so the auth pattern below is carried
 * over from this codebase's general convention for a user mutating
 * their own row server-side (`api/campaigns/cancel/route.ts`'s own
 * `createServerSupabaseClient()` + `auth.getUser()` shape), not a
 * listener-specific one that didn't exist yet to copy.
 *
 * Body: { tag: string }
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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
    const supabase = await createServerSupabaseClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const rawTag = body?.tag;

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

    // Admin client — same reasoning as every other route in this repo
    // that writes a caller's own row after verifying their identity
    // server-side (api/campaigns/cancel/route.ts, etc.): the write
    // itself uses service_role, but only ever targets `authUser.id`,
    // never a client-supplied id, so there's no privilege-escalation
    // surface even though the client itself never touches this table
    // directly.
    const admin = createAdminClient();
    const { error: updateError } = await admin
      .from('users')
      .update({ bpay_tag: tag })
      .eq('id', authUser.id);

    if (updateError) {
      // Migration 034's own CHECK constraint is the one realistic way
      // this can still fail after the validation above — e.g. a tag
      // that was somehow still empty after normalization in a way this
      // route's own check didn't anticipate. Surface it rather than a
      // generic 500, since the constraint's own message is specific.
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
