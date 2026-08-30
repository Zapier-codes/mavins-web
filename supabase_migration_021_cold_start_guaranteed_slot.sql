-- Migration 021 — get_trending_campaigns: per-genre cold-start
-- guaranteed placement (industry-standard "reserved slot" pattern)
--
-- Layers on top of migration 020, does not replace or revert it.
-- Migration 020 was necessary but not sufficient: it stopped a
-- brand-new campaign from being excluded outright, but a campaign
-- with total_streams = 0 still scores at the very bottom of
-- trending_score's own formula (see that column's CASE expression
-- below) -- in a genre with several established campaigns, a new one
-- could still be functionally invisible even though it's no longer
-- technically excluded. This migration adds a second, separate
-- mechanism on top: a guaranteed floor placement for genuinely new
-- campaigns, industry-standard and well-precedented (ad-serving
-- "reserved inventory" for new advertisers; Etsy/Amazon "new listing"
-- boosts; Spotify Release Radar's own bootstrap-then-merit pattern) --
-- not something unusual being invented here.
--
-- ============================================================
-- IMPORTANT — real data only, nothing fabricated. Per Velune's own
-- HANDOVER_CAMPAIGN.md §0 ("The one thing you must not undo"): no
-- field, table, or code path in this feature may generate, project,
-- simulate, or "seed" a listener/play/engagement number. This
-- migration adds ZERO new fabricated data -- eligibility and
-- placement are both computed live from columns that already exist
-- and already hold only real values (created_at, total_streams,
-- target_genres, current_stage). This is exactly the kind of
-- "legitimate cold-start ranking formula that doesn't fabricate a
-- number shown to users as real" that file's own §0 explicitly
-- distinguishes from what it prohibits -- it changes WHERE a real
-- campaign sorts, never WHAT number is shown for it.
-- ============================================================
--
-- Design, resolving the open questions from this session's own prior
-- analysis (handover.md, this task's write-up) -- picked as
-- reasonable, well-precedented defaults, EXPLICITLY FLAGGED AS NOT
-- YET PRODUCT-OWNER-CONFIRMED, not silently assumed settled:
--
-- 1. Fallback when a genre has fewer than 5 active campaigns: the
--    boosted campaign is appended right after however many real
--    results exist (position = count+1), never past the true end of
--    the list and never leaving a gap.
-- 2. Temporary, not permanent -- graduates on whichever comes first:
--    72 hours since created_at, OR 1,000 total_streams. Both numbers
--    are this session's own proposed defaults (72h matches the
--    "48-72 hours" range this task's own prior analysis suggested;
--    1,000 streams is deliberately far below the existing 10,000-
--    stream 'germination' threshold migration 020 already deals
--    with, so this is a distinct, much-earlier "has this gotten any
--    real traction at all yet" check, not a restatement of that
--    milestone) -- NOT yet confirmed by the product owner, flagged in
--    the handover for exactly that reason.
-- 3. Recomputed on every call, not a one-time write: this function
--    stays STABLE (read-only, no side effects) -- eligibility and
--    position are both computed fresh from live column values on
--    every invocation, never stored. "Position 5" cannot drift
--    because nothing about it is persisted.
-- 4. What was previously at position 5 shifts to 6 (and everything
--    after shifts down by one) -- the natural behavior of an insert,
--    made explicit here rather than left implicit.
-- 5. Per-genre only, exactly as scoped: the boost only ever applies
--    when p_genre is a specific value, not the unfiltered/all-genres
--    call shape. A multi-genre campaign (target_genres holding more
--    than one value) already appears in every genre's own result set
--    it targets under the EXISTING p_genre = ANY(target_genres)
--    filter -- this migration doesn't change that, so a multi-genre
--    campaign is eligible for the guaranteed slot independently in
--    each genre it targets, the natural continuation of behavior that
--    already existed before this migration, not a new special case.
--
-- Only ONE campaign can occupy the guaranteed slot per call: if
-- several new campaigns in the same genre are all still within their
-- boost window, the single best-scoring one among them (by the same
-- trending_score formula everything else uses) wins the slot -- not
-- an arbitrary one, and not all of them at once.
CREATE OR REPLACE FUNCTION public.get_trending_campaigns(
    p_limit INTEGER DEFAULT 10,
    p_country_code TEXT DEFAULT NULL,
    p_genre TEXT DEFAULT NULL
)
RETURNS TABLE (
    campaign_id UUID, track_id UUID, artist_id UUID,
    artist_name TEXT, track_title TEXT, cover_url TEXT,
    total_streams BIGINT, trending_score NUMERIC,
    geographic_tier TEXT, current_stage TEXT
)
LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE AS $$
  WITH eligible AS (
    SELECT
        tc.id, tc.track_id, tc.artist_id,
        u.artist_name, t.title, t.cover_url,
        tc.total_streams,
        ((tc.total_streams::NUMERIC / NULLIF(EXTRACT(EPOCH FROM (NOW() - tc.created_at)) / 86400, 0)) * 0.4
         + (tc.total_streams::NUMERIC / 1000.0) * 0.3
         + (CASE tc.current_stage
                WHEN 'full_bloom' THEN 100 WHEN 'branching' THEN 75
                WHEN 'root_system' THEN 50 WHEN 'germination' THEN 25 ELSE 10
            END)::NUMERIC * 0.3) AS trending_score,
        tc.geographic_tier, tc.current_stage,
        -- Real timestamp, real stream count -- both already existed,
        -- neither fabricated by this migration. See header note.
        (tc.created_at > NOW() - INTERVAL '72 hours' AND tc.total_streams < 1000) AS is_cold_start_eligible
    FROM public.track_campaigns tc
    LEFT JOIN public.tracks t ON t.id = tc.track_id
    JOIN public.users u ON u.id = tc.artist_id
    WHERE tc.is_active AND NOT tc.is_paused
      AND tc.current_stage != 'completed'  -- migration 020's fix, kept, not reverted
      AND (p_country_code IS NULL OR p_country_code = ANY(tc.target_countries))
      AND (p_genre IS NULL OR p_genre = ANY(tc.target_genres))
  ),
  boosted AS (
    -- Exactly one row, only when a specific genre was requested (open
    -- question 5, resolved per-genre-only above) and at least one
    -- eligible new campaign exists in it. The single best-scoring
    -- eligible campaign wins the slot when more than one qualifies.
    SELECT * FROM eligible
    WHERE is_cold_start_eligible AND p_genre IS NOT NULL
    ORDER BY trending_score DESC
    LIMIT 1
  ),
  ranked_rest AS (
    -- Everything else, normal trending order, boosted campaign (if
    -- any) excluded here so it isn't counted twice.
    SELECT *, ROW_NUMBER() OVER (ORDER BY trending_score DESC) AS rn
    FROM eligible
    WHERE id NOT IN (SELECT id FROM boosted)
  ),
  combined AS (
    -- Position 1-4 unchanged. Position 5 onward shifts down by one to
    -- make room for the boosted campaign at exactly position 5 (open
    -- question 4, resolved above). Both branches cast to NUMERIC so
    -- the UNION ALL's column types match exactly.
    SELECT id, track_id, artist_id, artist_name, title, cover_url,
           total_streams, trending_score, geographic_tier, current_stage,
           (rn + CASE WHEN rn >= 5 THEN 1 ELSE 0 END)::NUMERIC AS sort_position
    FROM ranked_rest
    UNION ALL
    -- Fallback when fewer than 5 total results exist (open question
    -- 1, resolved above): LEAST(5, count+1) places the boosted
    -- campaign right after whatever real results exist, never past
    -- the true end and never leaving a gap. With zero other results,
    -- this correctly evaluates to position 1 (the only result).
    SELECT id, track_id, artist_id, artist_name, title, cover_url,
           total_streams, trending_score, geographic_tier, current_stage,
           LEAST(5, (SELECT COUNT(*) FROM ranked_rest) + 1)::NUMERIC AS sort_position
    FROM boosted
  )
  SELECT id AS campaign_id, track_id, artist_id, artist_name, title AS track_title, cover_url,
         total_streams, trending_score, geographic_tier, current_stage
  FROM combined
  ORDER BY sort_position
  LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_trending_campaigns(INTEGER, TEXT, TEXT) TO anon;
