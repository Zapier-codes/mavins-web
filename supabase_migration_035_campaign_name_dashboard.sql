-- ============================================================
-- Migration 035 — Task 65 Part B-ii: campaign_name in
-- get_artist_dashboard()
-- ============================================================
--
-- Part A (migration 033) added track_campaigns.campaign_name and
-- wired it into campaign creation. Part B-i (this same session,
-- promote/page.tsx) built the input UI. This is the first of Part
-- B-ii's two real display-surface fixes: get_artist_dashboard()'s
-- per-campaign JSONB object never included campaign_name, so
-- analytics/page.tsx (the only current reader of this RPC) had
-- nothing to display even after an artist names a campaign.
--
-- Checked the other two originally-assumed display surfaces before
-- touching them, rather than wiring campaign_name into all four
-- blind:
-- - get_leaderboard() (migration 003) is a per-ARTIST aggregate
--   (SUM/COUNT across all of an artist's campaigns) -- it has no
--   per-campaign row at all to attach a name to. Not touched; not
--   applicable, not an oversight.
-- - The admin dashboard route (src/app/api/admin/dashboard/route.ts)
--   already does a bare `select('*')` against track_campaigns, so it
--   already receives campaign_name today with zero query changes
--   needed -- but src/app/admin/page.tsx's own frontend doesn't
--   render an individual campaigns list anywhere at all currently
--   (checked directly: zero matches for any campaign-rendering code
--   in that file). Building that list is new scope beyond "wire
--   campaign_name into an existing surface," not attempted here.
--
-- The real second surface (campaign-live/page.tsx, the success page)
-- needed no migration at all -- getCampaignById() already does
-- select('*'), so it already receives campaign_name; only its own
-- frontend needed a display change, done in the same commit as this
-- migration.

CREATE OR REPLACE FUNCTION public.get_artist_dashboard(p_artist_id UUID)
RETURNS JSONB LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public STABLE AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT JSONB_BUILD_OBJECT(
        'total_streams', COALESCE(SUM(tc.total_streams), 0),
        'active_campaigns', COUNT(*) FILTER (WHERE tc.is_active AND NOT tc.is_paused),
        'total_spent_cents', COALESCE(SUM(tc.spent_cents), 0),
        'total_budget_cents', COALESCE(SUM(tc.total_budget_cents), 0),
        'campaigns', JSONB_AGG(JSONB_BUILD_OBJECT(
            'id', tc.id,
            'source_url', tc.source_url,
            'campaign_name', tc.campaign_name,
            'stage', tc.current_stage,
            'streams', tc.total_streams,
            'saves', tc.save_count,
            'playlist_adds', tc.playlist_add_count,
            'shares', tc.share_count,
            'geographic_tier', tc.geographic_tier,
            'target_countries', tc.target_countries,
            'created_at', tc.created_at,
            'total_budget_cents', tc.total_budget_cents,
            'spent_cents', tc.spent_cents,
            'daily_metrics', (
                SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                    'date', cdm.metric_date,
                    'streams', cdm.streams,
                    'saves', cdm.saves,
                    'geo_breakdown', cdm.geo_breakdown
                ) ORDER BY cdm.metric_date)
                FROM public.campaign_daily_metrics cdm
                WHERE cdm.campaign_id = tc.id
            )
        ) ORDER BY tc.created_at DESC),
        'milestones', (
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'type', agm.milestone_type,
                'unlocked_at', agm.unlocked_at
            ) ORDER BY agm.unlocked_at DESC)
            FROM public.artist_growth_milestones agm
            WHERE agm.artist_id = p_artist_id
        )
    ) INTO v_result
    FROM public.track_campaigns tc
    WHERE tc.artist_id = p_artist_id;
    RETURN COALESCE(v_result, '{}'::JSONB);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_artist_dashboard(UUID) TO authenticated;
