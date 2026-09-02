-- ============================================================
-- Migration 025 — get_live_campaigns_for_banner(): the home-banner
-- data source, Task 59 Part 3.
-- ============================================================
--
-- Task 59's own spec (handover.md) for this surface, confirmed
-- precisely before writing this, not paraphrased loosely: "A
-- horizontal-sliding carousel/banner on the home page, showing ALL
-- currently-live campaigns (not genre-locked... this surface crosses
-- genres)... no ranking, no 'trending'/'#1' framing anywhere on this
-- surface -- same non-competitive philosophy as the queue mechanic,
-- applied to this surface's own presentation." This is a genuinely
-- different shape from get_trending_campaigns (migration 021) --
-- that function is fundamentally a SCORED, LIMITED, single-winner-
-- style function (trending_score ranking + a cold-start boost slot).
-- Reusing it for a "give me literally everything live, unranked"
-- surface would mean either trusting its score-ordering (wrong -- a
-- ranking with no visible effect is still a ranking) or its LIMIT
-- (wrong -- Part 3 needs ALL of them, not the top N). Rather than
-- retrofit that function with a "disable scoring" flag, this is a
-- clean new function -- get_trending_campaigns stays exactly as-is
-- for the queue-slot mechanic (Part 1/2's own concern), this one is
-- purely for the banner.
--
-- Also fixes a real, separately-confirmed bug found while building
-- this: get_trending_campaigns' RETURNS TABLE never included
-- source_url or resolved_song_id at all, even though both are real
-- columns directly on track_campaigns (confirmed via
-- supabase_schema.sql). Velune's own CampaignUrlResolver.resolve()
-- needs one of these two fields to produce a playable video id --
-- without either, every row silently resolves to null and gets
-- filtered out by Velune's own mapNotNull. This means the CURRENT
-- home banner likely renders nothing at all in production today,
-- regardless of how many campaigns are actually live -- not
-- something Part 3 introduces, something Part 3's own tracing
-- surfaced. Not fixed in get_trending_campaigns itself (out of scope
-- for this migration, and Part 1/2 already deliberately left that
-- function untouched) -- just not repeated in this new one.

CREATE OR REPLACE FUNCTION public.get_live_campaigns_for_banner()
RETURNS TABLE (
    campaign_id UUID,
    source_url TEXT,
    resolved_song_id TEXT,
    track_id UUID,
    artist_id UUID,
    artist_name TEXT,
    track_title TEXT,
    cover_url TEXT,
    current_stage TEXT
)
LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE AS $$
  SELECT
      tc.id,
      tc.source_url,
      tc.resolved_song_id,
      tc.track_id,
      tc.artist_id,
      u.artist_name,
      t.title,
      t.cover_url,
      tc.current_stage
  FROM public.track_campaigns tc
  LEFT JOIN public.tracks t ON t.id = tc.track_id
  JOIN public.users u ON u.id = tc.artist_id
  WHERE tc.is_active
    AND NOT tc.is_paused
    AND tc.current_stage != 'completed'
  -- Deliberately no ORDER BY score/streams/created_at, no LIMIT, no
  -- geo/genre filter -- every one of those would reintroduce some
  -- form of ranking or exclusion this surface's own spec explicitly
  -- rules out ("no competition... all is accommodated for"). Client-
  -- side (Velune) owns the shuffle/rotation order entirely; this
  -- function's only job is "here is the complete, true set of live
  -- campaigns," nothing more.
  ORDER BY tc.id; -- stable, arbitrary order -- NOT a ranking signal,
                  -- just deterministic pagination-free output; Velune
                  -- must not treat row order as meaningful.
$$;

REVOKE ALL ON FUNCTION public.get_live_campaigns_for_banner() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_live_campaigns_for_banner() TO anon, authenticated;
