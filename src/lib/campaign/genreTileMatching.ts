/**
 * Task 59 Round 3/6 (handover.md) — normalize-then-match a raw YouTube
 * browse-tile title against mavins-web's own canonical genre
 * vocabulary. This is the "suggestion engine" Round 6's design refers
 * to — its output (`suggestGenreForTile`) only ever populates
 * `campaign_genre_tile_mapping.suggested_genre_id`, a starting point
 * for an admin's own review (Task 59 Part 2b-a's admin route). It is
 * NEVER read by Velune's live targeting path (Round 6's own explicit
 * rule) — only `mapped_genre_id`, set exclusively by a human
 * confirming it, is.
 *
 * Same normalize-then-match approach real ad platforms use to
 * reconcile an external taxonomy (YouTube's own catalog labels)
 * against an internal one — normalize both sides first, then fall
 * back to a small maintained alias table for pairs normalization
 * alone won't catch. Anything that still doesn't match returns null,
 * which the ingestion route treats as "no suggestion" (an admin
 * starts from a blank field, not a wrong one) — never a forced guess.
 */

/**
 * Lowercase, trim, strip "&"/"and", strip common YouTube-taxonomy
 * suffixes. Applied to both the incoming tile title and the canonical
 * genre labels before comparing, so e.g. "Hip-Hop" (canonical) and
 * "Hip Hop Music" (a real YouTube tile title) can still match without
 * needing an alias table entry for every trivial variant.
 */
export function normalizeTileTitle(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/\s*&\s*/g, ' and ')
    .replace(/\b(music|songs|hits)\b/g, '')
    .replace(/[^\w\s]/g, ' ') // strip remaining punctuation (/, -, etc.) to spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Seeded with the pairings a professional would expect from YouTube's
 * own taxonomy conventions — not exhaustive, meant to grow from real
 * production tile titles over time (the ingestion route logs every
 * miss as a new unreviewed row regardless of whether this table finds
 * anything, so a growing alias table is a maintenance convenience,
 * never a correctness requirement). Keys are normalized via
 * `normalizeTileTitle` before lookup, same as the tile title itself.
 */
const GENRE_ALIASES: Record<string, string> = {
  'hip hop and rap': 'Hip-Hop',
  'hip hop rap': 'Hip-Hop',
  'rap': 'Hip-Hop',
  'r and b and soul': 'R&B',
  'r and b soul': 'R&B',
  'rnb': 'R&B',
  'afrobeat': 'Afrobeats',
  'dance and electronic': 'Electronic',
  'dance electronic': 'Electronic',
  'edm': 'Electronic',
  'reggae and ska': 'Reggae',
};

export interface CanonicalGenre {
  id: string;
  label: string;
}

/**
 * Returns the matching canonical genre's `id`, or `null` if neither
 * normalized-exact-match nor the alias table finds anything. `genres`
 * is the caller's own current `genres` table read (Task 46a) — this
 * function has no DB access of its own, kept a pure function so it's
 * trivially unit-testable without a live Supabase connection.
 */
export function suggestGenreForTile(rawTileTitle: string, genres: CanonicalGenre[]): string | null {
  const normalized = normalizeTileTitle(rawTileTitle);
  if (!normalized) return null;

  const exact = genres.find((g) => normalizeTileTitle(g.label) === normalized);
  if (exact) return exact.id;

  const aliasLabel = GENRE_ALIASES[normalized];
  if (aliasLabel) {
    const aliased = genres.find((g) => g.label === aliasLabel);
    if (aliased) return aliased.id;
  }

  return null;
}
