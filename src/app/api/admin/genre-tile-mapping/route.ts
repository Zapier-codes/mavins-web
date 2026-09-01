import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { ADMIN_CAPABILITIES } from '@/lib/auth/isAdmin';
import { logAdminAction } from '@/lib/admin/auditLog';

/**
 * Admin review/confirm for public.campaign_genre_tile_mapping
 * (migration 024, Task 59 Round 6/Part 2b-a).
 *
 * Unlike every Task 46a reference-data route (no GET — the client
 * reads those tables directly, RLS permits it, per that pattern's own
 * shared reasoning), this route DOES have a GET: an admin reviewing
 * unmapped tiles needs the `is_reviewed = false, ORDER BY seen_count
 * DESC` triage view specifically (Round 6's own step-2 design), which
 * is exactly the query shape migration 024's own partial index was
 * built for — a raw `SELECT *` wouldn't give an admin UI the sorted,
 * filtered view it actually needs without duplicating that logic
 * client-side.
 *
 * GET  — list unreviewed rows, highest-traffic first.
 * PATCH — confirm a mapping. Body: { tileTitle, mappedGenreId }.
 *   `mappedGenreId: null` is a valid, deliberate value — Round 6's own
 *   "confirmed non-genre/mood" state, not a missing field. Sets
 *   `is_reviewed = true`, `reviewed_by`/`reviewed_at` from the
 *   authenticated admin's own session, exactly the pattern
 *   `api/admin/fees/route.ts`'s own `changed_by` uses (never trust a
 *   client-supplied reviewer id).
 */

export async function GET(_request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.GENRE_TILE_MAPPING_VIEW);
  if (response) return response;

  const { data, error } = await context.admin
    .from('campaign_genre_tile_mapping')
    .select('*')
    .eq('is_reviewed', false)
    .order('seen_count', { ascending: false });

  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, tiles: data });
}

export async function PATCH(request: NextRequest) {
  const { context, response } = await requireAdmin(ADMIN_CAPABILITIES.GENRE_TILE_MAPPING_EDIT);
  if (response) return response;

  const body = await request.json();
  const tileTitle = body?.tileTitle;
  if (typeof tileTitle !== 'string' || tileTitle.trim() === '') {
    return NextResponse.json({ success: false, error: 'tileTitle is required' }, { status: 400 });
  }
  // mappedGenreId is deliberately allowed to be null (confirmed
  // mood/non-genre) — only `undefined` (the key omitted entirely) is
  // rejected, since that's the actual "caller forgot the field" case.
  if (body?.mappedGenreId === undefined) {
    return NextResponse.json({ success: false, error: 'mappedGenreId is required (use null to confirm non-genre)' }, { status: 400 });
  }
  const mappedGenreId: string | null = body.mappedGenreId === null ? null : String(body.mappedGenreId);

  const { data: previous, error: readError } = await context.admin
    .from('campaign_genre_tile_mapping')
    .select('*')
    .eq('tile_title', tileTitle)
    .maybeSingle();
  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 });
  if (!previous) return NextResponse.json({ success: false, error: 'Tile not found' }, { status: 404 });

  const { data, error } = await context.admin
    .from('campaign_genre_tile_mapping')
    .update({
      mapped_genre_id: mappedGenreId,
      is_reviewed: true,
      reviewed_by: context.authUser.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('tile_title', tileTitle)
    .select()
    .single();
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'genre_tile_mapping.confirm',
    tableName: 'campaign_genre_tile_mapping',
    recordId: tileTitle,
    oldValue: previous,
    newValue: data,
  });

  return NextResponse.json({ success: true, tile: data });
}
