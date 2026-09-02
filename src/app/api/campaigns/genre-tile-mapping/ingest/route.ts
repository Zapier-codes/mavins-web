import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeTileTitle, suggestGenreForTile } from '@/lib/campaign/genreTileMatching';

/**
 * POST /api/campaigns/genre-tile-mapping/ingest
 *
 * Task 59 Part 2b-a (handover.md, Round 6's own "ingestion" step).
 * Called from Velune (Part 2b-b, not built yet) whenever its own
 * client-side cached read of `campaign_genre_tile_mapping` doesn't
 * have a row for a tile title it just encountered. This route is the
 * ONLY write path onto that table besides the admin-confirm route
 * right next to it (`api/admin/genre-tile-mapping/route.ts`) — RLS
 * blocks every other writer, by design (that table's own migration
 * comment).
 *
 * Deliberately public, no auth at all — Velune has no login (Task 60's
 * own confirmed design), so this can't be gated behind a user session
 * the way the admin route next to it is. The only real risk of a
 * fully public write endpoint is abuse (someone spamming junk tile
 * titles) — mitigated by a hard length cap and the fact that a junk
 * row here can only ever become live targeting data if a human admin
 * explicitly confirms it (Round 6's own core invariant), never
 * automatically. Worth revisiting with real rate-limiting if abuse is
 * ever actually observed — not preemptively built here, since this
 * sandbox has no way to verify a rate-limiter's own correctness
 * without live traffic to test it against.
 *
 * Body: { tileTitle: string } — the raw, un-normalized title exactly
 * as Velune read it from YouTube's own browse response. Normalized
 * here (not by the caller) so the canonical normalization logic lives
 * in exactly one place (this file's own imported helper), not
 * duplicated into Kotlin too.
 *
 * Upsert semantics, matching Round 6's own step-1 design exactly:
 * - New normalized tile title: insert with `is_reviewed = false`,
 *   `suggested_genre_id` computed via the normalize+alias matcher
 *   (possibly null if nothing matches).
 * - Already-seen tile title: bump `last_seen_at` and increment
 *   `seen_count` — never touches `mapped_genre_id`/`is_reviewed` on an
 *   existing row, even if a human already reviewed it. Re-ingesting a
 *   confirmed row must never un-confirm it.
 *
 * Response is intentionally minimal (`{ success: true }`) — Velune
 * doesn't need this call's own result for anything (it already
 * decided to fail-closed on this tap, per Round 3/6's own rule, before
 * ever making this call); this is fire-and-forget telemetry that
 * happens to also seed a table, not a request Velune's own UI blocks
 * on.
 */
export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const rawTileTitle = body?.tileTitle;
  if (typeof rawTileTitle !== 'string' || rawTileTitle.trim() === '') {
    return NextResponse.json({ success: false, error: 'tileTitle is required' }, { status: 400 });
  }
  if (rawTileTitle.length > 200) {
    return NextResponse.json({ success: false, error: 'tileTitle is too long' }, { status: 400 });
  }

  const normalized = normalizeTileTitle(rawTileTitle);
  if (!normalized) {
    return NextResponse.json({ success: false, error: 'tileTitle normalized to empty' }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin
    .from('campaign_genre_tile_mapping')
    .select('tile_title, seen_count')
    .eq('tile_title', normalized)
    .maybeSingle();

  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 });

  if (existing) {
    const { error: updateError } = await admin
      .from('campaign_genre_tile_mapping')
      .update({ last_seen_at: new Date().toISOString(), seen_count: existing.seen_count + 1 })
      .eq('tile_title', normalized);
    if (updateError) return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { data: genres, error: genresError } = await admin.from('genres').select('id, label');
  if (genresError) return NextResponse.json({ success: false, error: genresError.message }, { status: 500 });

  const suggestedGenreId = suggestGenreForTile(rawTileTitle, genres ?? []);

  const { error: insertError } = await admin
    .from('campaign_genre_tile_mapping')
    .insert({ tile_title: normalized, suggested_genre_id: suggestedGenreId });
  if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
