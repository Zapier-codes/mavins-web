-- Migration 020 — get_trending_campaigns: stop excluding 'planting'-stage campaigns
--
-- Task 57 (handover.md) / Velune HANDOVER_CAMPAIGN.md §9 — closes the
-- cross-repo "admin-published campaign not showing on Velune" diagnosis.
-- Confirmed root cause, not just suspected: the reported campaign
-- (ff616798-ee70-4488-a37f-a61abd743b92) is sitting at
-- current_stage = 'planting', total_streams = 0, is_active = true —
-- exactly the state get_trending_campaigns's own WHERE clause
-- explicitly excludes. Every brand-new campaign starts at 'planting'
-- (that column's own default) and only leaves it once total_streams
-- crosses 10,000 (the 'germination' threshold, record_campaign_stream's
-- own logic) — meaning, before this fix, NO campaign could ever appear
-- on Velune's Home screen until it had already accumulated 10,000
-- streams from somewhere else first. That's circular: streams mostly
-- come from people discovering and playing a campaign via Velune's
-- Home screen in the first place.
--
-- Product owner confirmed directly (2026-08-30, both repos' handover
-- files): new campaigns should show immediately, multiple active
-- campaigns display in a shuffled home-page slideshow, campaigns are
-- also queued by genre (target_genres — already a parameter here,
-- unaffected by this migration). This was previously flagged as
-- "reads like intentional design, worth confirming" — now confirmed to
-- be the OPPOSITE of the intended design.
--
-- Scope, deliberately narrow: only removes 'planting' from the stage
-- exclusion — 'completed' stays excluded (a finished campaign
-- shouldn't keep showing as if it were still live, and nothing in this
-- session's diagnosis or the product owner's answer touched that).
-- Does NOT change the trending_score formula (line below still gives a
-- 'planting'-stage campaign the lowest stage-tier weight, ELSE 10, same
-- as before this migration) — a brand-new, zero-stream campaign will
-- now be INCLUDED but likely score low/sort near the bottom of a
-- strictly-ordered result. Whether Velune's Home screen renders results
-- in strict trending_score order or shuffles them (the product owner's
-- own word) is a Velune-side UI concern this migration doesn't need to
-- resolve — flagged here, not fixed, since it wasn't part of what was
-- actually diagnosed as broken (the WHERE clause was; the score formula
-- wasn't shown to be).
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
        tc.geographic_tier, tc.current_stage
    FROM public.track_campaigns tc
    LEFT JOIN public.tracks t ON t.id = tc.track_id
    JOIN public.users u ON u.id = tc.artist_id
    WHERE tc.is_active AND NOT tc.is_paused
      AND tc.current_stage != 'completed'
      AND (p_country_code IS NULL OR p_country_code = ANY(tc.target_countries))
      AND (p_genre IS NULL OR p_genre = ANY(tc.target_genres))
    ORDER BY trending_score DESC LIMIT p_limit;
$$;
GRANT EXECUTE ON FUNCTION public.get_trending_campaigns(INTEGER, TEXT, TEXT) TO anon;
