import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { ADMIN_CAPABILITIES } from '@/lib/auth/isAdmin';
import { logAdminAction } from '@/lib/admin/auditLog';

/**
 * Admin write path for public.genre_country_affinity (migration 010).
 * See api/admin/pricing-tiers/route.ts for the full shared reasoning
 * (no GET, Realtime-driven cache refresh) — not repeated here.
 *
 * Different shape from the other four routes on purpose: this table
 * has a composite primary key (genre_id, country_code), not a single
 * `id` column, and 350 rows (14 genres x 25 countries) rather than a
 * handful — editing "the Afrobeats/Nigeria score" is functionally the
 * same action whether that pair already has a row or not, so this
 * route uses POST as an UPSERT (Supabase's own `.upsert()`, keyed on
 * the composite PK) instead of separate strict-create-only /
 * strict-update-only verbs like the other four routes have. No
 * separate PATCH — POST covers both create and update for this table.
 *
 * POST body:   { genreId, countryCode, score }  (creates or updates)
 * DELETE body: { genreId, countryCode }
 *
 * score is CHECK-constrained 0-100 at the DB level (migration 010) —
 * this route also validates it client-side-of-the-DB so a bad value
 * gets a clear 400 with a useful message instead of a raw Postgres
 * constraint-violation error string.
 */

function validateScore(score: any): { error: string } | null {
  const n = Number(score);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return { error: 'score must be a number between 0 and 100' };
  }
  return null;
}

export async function POST(request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.GENRE_COUNTRY_AFFINITY_EDIT);
  if (response) return response;

  const body = await request.json();
  const { genreId, countryCode, score } = body || {};
  if (!genreId || !countryCode) {
    return NextResponse.json({ success: false, error: 'genreId and countryCode are required' }, { status: 400 });
  }
  const scoreError = validateScore(score);
  if (scoreError) return NextResponse.json({ success: false, ...scoreError }, { status: 400 });

  // Task 46e — no single `id` column here (composite PK), so record_id
  // is a synthetic 'genreId:countryCode' string — still a stable,
  // greppable identifier for this specific pair, same spirit as the
  // other four routes' single-column record_id.
  const recordId = `${genreId}:${countryCode}`;

  const { data: previous } = await context.admin
    .from('genre_country_affinity')
    .select('*')
    .eq('genre_id', genreId)
    .eq('country_code', countryCode)
    .maybeSingle();

  const { data, error } = await context.admin
    .from('genre_country_affinity')
    .upsert({ genre_id: genreId, country_code: countryCode, score: Number(score) }, { onConflict: 'genre_id,country_code' })
    .select()
    .single();

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  // Action name reflects the route's own upsert semantics (this file's
  // header comment) rather than a fixed 'create'/'update' — 'upsert'
  // is accurate whether or not `previous` existed, and old_value
  // (null vs a real row) already distinguishes the two cases for
  // anyone reading this audit entry later.
  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'genre_country_affinity.upsert',
    tableName: 'genre_country_affinity',
    recordId,
    oldValue: previous,
    newValue: data,
  });

  return NextResponse.json({ success: true, affinity: data });
}

export async function DELETE(request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.GENRE_COUNTRY_AFFINITY_EDIT);
  if (response) return response;

  const body = await request.json();
  const { genreId, countryCode } = body || {};
  if (!genreId || !countryCode) {
    return NextResponse.json({ success: false, error: 'genreId and countryCode are required' }, { status: 400 });
  }

  const recordId = `${genreId}:${countryCode}`;

  const { data: previous } = await context.admin
    .from('genre_country_affinity')
    .select('*')
    .eq('genre_id', genreId)
    .eq('country_code', countryCode)
    .maybeSingle();

  const { error } = await context.admin
    .from('genre_country_affinity')
    .delete()
    .eq('genre_id', genreId)
    .eq('country_code', countryCode);

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'genre_country_affinity.delete',
    tableName: 'genre_country_affinity',
    recordId,
    oldValue: previous,
    newValue: null,
  });

  return NextResponse.json({ success: true });
}
