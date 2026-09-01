-- Task 59 Part 2b-a (handover.md) — the curated genre-tile-mapping
-- table Round 6 designed. Editorial classification, not runtime
-- string-matching: Velune's own genre-forwarding chain (Part 2b-b,
-- Velune-side, not this migration) resolves a browse tile's genre by
-- reading this table, never by re-deriving it from the tile's display
-- string at tap time. See Task 59's own "Round 6" section for the
-- full reasoning this schema implements.

CREATE TABLE IF NOT EXISTS public.campaign_genre_tile_mapping (
  tile_title TEXT PRIMARY KEY,             -- raw, normalized (lowercase/
                                            -- trim/strip-suffix) tile
                                            -- title, e.g. "hip-hop", "chill"
  mapped_genre_id TEXT REFERENCES public.genres(id),
                                            -- NULL means "confirmed
                                            -- non-genre (mood/other)" once
                                            -- is_reviewed is true -- NOT
                                            -- "not yet reviewed" -- see
                                            -- is_reviewed below
  suggested_genre_id TEXT REFERENCES public.genres(id),
                                            -- the normalize+alias
                                            -- matching logic's own best
                                            -- guess (Task 59 Round 3),
                                            -- kept separate from
                                            -- mapped_genre_id so a wrong
                                            -- automated suggestion can
                                            -- never silently become live
                                            -- targeting data
  is_reviewed BOOLEAN NOT NULL DEFAULT false,
                                            -- false = seen via the
                                            -- fail-closed ingestion path,
                                            -- not yet looked at by an
                                            -- admin. true + mapped_genre_id
                                            -- NULL = an admin looked at it
                                            -- and confirmed it's genuinely
                                            -- mood/non-genre -- a
                                            -- deliberate decision, not the
                                            -- same state as unreviewed.
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INTEGER NOT NULL DEFAULT 1,   -- how often production traffic
                                            -- hit this tile -- lets an
                                            -- admin triage high-volume
                                            -- unreviewed tiles first
  reviewed_by UUID REFERENCES public.users(id),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS campaign_genre_tile_mapping_unreviewed_idx
  ON public.campaign_genre_tile_mapping (is_reviewed, seen_count DESC)
  WHERE is_reviewed = false;
-- Partial index matching exactly the admin triage query (step 2 of
-- Round 6's own wiring: unreviewed rows, highest-traffic first) --
-- the common case this table exists to make fast, not a general index
-- on every row.

ALTER TABLE public.campaign_genre_tile_mapping ENABLE ROW LEVEL SECURITY;

-- Public read: Velune's own client-side cache (Part 2b-b, same
-- refresh-periodically pattern useReferenceData() already uses in
-- this repo) reads this table directly, same posture as every other
-- Task 46a reference-data table (countries, genres, pricing_tiers,
-- duration_slots).
CREATE POLICY "Public read campaign_genre_tile_mapping"
  ON public.campaign_genre_tile_mapping FOR SELECT
  USING (true);

-- No INSERT/UPDATE/DELETE policy for anon/authenticated at all --
-- writes only ever happen via this repo's own service-role-backed
-- routes (the ingestion route and the admin CRUD route, both new this
-- part), never a direct client write. An app-side write here would
-- mean any tap could silently redefine what counts as a genre, which
-- is exactly the failure mode Round 6 designed this table to prevent.
REVOKE ALL ON public.campaign_genre_tile_mapping FROM anon;
REVOKE ALL ON public.campaign_genre_tile_mapping FROM authenticated;
GRANT SELECT ON public.campaign_genre_tile_mapping TO anon, authenticated;
GRANT ALL ON public.campaign_genre_tile_mapping TO service_role;
