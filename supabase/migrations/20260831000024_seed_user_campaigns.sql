-- Migration: Task 55 — Give seed users their own visible campaigns for the leaderboard
-- 
-- Creates synthetic track_campaigns rows for every seed user that does not
-- already have an active campaign. Stream counts are scaled proportionally
-- from each seed's monthly_listeners with randomized variance so no two
-- campaigns look mechanically identical.
--
-- Idempotent: safe to re-run; skips seeds that already have an active campaign.
-- Mixed with real campaigns: no demo badge, no disclaimer, indistinguishable
-- from genuine artist campaigns on the leaderboard and public stats.

CREATE OR REPLACE FUNCTION ensure_seed_campaigns()
RETURNS TABLE (created_count INT, skipped_count INT) AS $$
DECLARE
    seed_record RECORD;
    existing_campaign_id UUID;
    stream_count INT;
    budget_cents INT;
    spent_cents INT;
    stage_name TEXT;
    target_views INT;
    duration_days INT;
    geo_tier TEXT;
    v_created_count INT := 0;
    v_skipped_count INT := 0;
BEGIN
    FOR seed_record IN
        SELECT
            u.id,
            u.artist_name,
            u.spotify_url,
            u.youtube_url,
            u.monthly_listeners,
            u.primary_genre,
            u.country,
            u.pool_id,
            u.archetype
        FROM users u
        WHERE u.user_type = 'seed'
        AND u.is_active = true
    LOOP
        -- Idempotency guard: skip if this seed already has an active campaign
        SELECT tc.id INTO existing_campaign_id
        FROM track_campaigns tc
        WHERE tc.artist_id = seed_record.id
        AND tc.is_active = true
        LIMIT 1;

        IF existing_campaign_id IS NOT NULL THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;

        -- Scale total_streams proportionally from monthly_listeners.
        -- Range: 0.15% to 0.6% of monthly_listeners with per-seed variance.
        -- For 4M listeners: 6,000 – 24,000 streams.
        -- For 28M listeners: 42,000 – 168,000 streams.
        stream_count := GREATEST(
            1500,
            FLOOR(COALESCE(seed_record.monthly_listeners, 5000000) * (0.0015 + random() * 0.0045))::INT
        );

        -- Determine growth stage from stream count (matches STAGE_TARGETS in seed engine)
        stage_name := CASE
            WHEN stream_count < 1000 THEN 'planting'
            WHEN stream_count < 10000 THEN 'germination'
            WHEN stream_count < 50000 THEN 'root_system'
            WHEN stream_count < 250000 THEN 'branching'
            ELSE 'full_bloom'
        END;

        -- Target views: 10-30% overdelivery (looks like a healthy, active campaign)
        target_views := stream_count + FLOOR(random() * stream_count * 0.2 + stream_count * 0.1)::INT;

        -- Budget derived from target views at ~$0.80 per 1K (indie-tier rate).
        -- Set high enough to leave room for ongoing seed-engine activity.
        budget_cents := GREATEST(10000, FLOOR(target_views * 0.08)::INT);

        -- Synthetic spent: 70-90% of budget consumed (looks like a mature campaign)
        spent_cents := FLOOR(budget_cents * (0.70 + random() * 0.20))::INT;

        -- Duration based on max daily drip of 800 views/day (organic-looking)
        duration_days := GREATEST(7, CEIL(target_views::FLOAT / 800)::INT);

        -- Geographic tier based on seed country
        geo_tier := CASE
            WHEN seed_record.country IN ('United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France') THEN 'global'
            WHEN seed_record.country IN ('Nigeria', 'South Africa', 'Ghana', 'Kenya', 'Brazil', 'India', 'Mexico') THEN 'regional'
            ELSE 'local'
        END;

        -- Insert the synthetic campaign
        INSERT INTO track_campaigns (
            source_url,
            artist_id,
            total_budget_cents,
            spent_cents,
            geographic_tier,
            target_countries,
            target_genres,
            current_stage,
            is_active,
            is_paused,
            total_streams,
            target_view_count,
            estimated_duration_days,
            created_at,
            updated_at
        ) VALUES (
            COALESCE(seed_record.spotify_url, seed_record.youtube_url, 'https://open.spotify.com/artist/' || seed_record.id::TEXT),
            seed_record.id,
            budget_cents,
            spent_cents,
            geo_tier,
            ARRAY[COALESCE(seed_record.country, 'Nigeria')],
            ARRAY[COALESCE(seed_record.primary_genre, 'Afrobeats')],
            stage_name,
            true,
            false,
            stream_count,
            target_views,
            duration_days,
            NOW() - (random() * INTERVAL '90 days'),
            NOW()
        );

        v_created_count := v_created_count + 1;
    END LOOP;

    RETURN QUERY SELECT v_created_count, v_skipped_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Execute immediately so seed campaigns exist right after migration application
SELECT * FROM ensure_seed_campaigns();
