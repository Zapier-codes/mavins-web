-- Migration: Task 55 — Give seed users their own visible campaigns for the leaderboard
-- 
-- Creates synthetic track_campaigns rows for every seed user. Each seed gets
-- 1-4 campaigns (randomized) so it looks like they're actively running multiple
-- campaigns. Stream counts are scaled proportionally from monthly_listeners.
-- Cover art is pulled from the seed's users.avatar_url column (Deezer API images).
--
-- Idempotent: safe to re-run; skips seeds that already have active campaigns.
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
    campaign_count INT;
    i INT;
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
            u.archetype,
            u.avatar_url
        FROM users u
        WHERE u.user_type = 'seed'
        AND u.is_active = true
    LOOP
        -- Idempotency guard: skip if this seed already has ANY active campaign
        SELECT tc.id INTO existing_campaign_id
        FROM track_campaigns tc
        WHERE tc.artist_id = seed_record.id
        AND tc.is_active = true
        LIMIT 1;
        
        IF existing_campaign_id IS NOT NULL THEN
            v_skipped_count := v_skipped_count + 1;
            CONTINUE;
        END IF;
        
        -- Randomized campaign count: 1-4 campaigns per seed (gamification feel)
        campaign_count := 1 + FLOOR(random() * 4)::INT;
        
        FOR i IN 1..campaign_count LOOP
            stream_count := GREATEST(
                1500,
                FLOOR(COALESCE(seed_record.monthly_listeners, 5000000) * (0.0015 + random() * 0.0045))::INT
            );
            
            stage_name := CASE
                WHEN stream_count < 1000 THEN 'planting'
                WHEN stream_count < 10000 THEN 'germination'
                WHEN stream_count < 50000 THEN 'root_system'
                WHEN stream_count < 250000 THEN 'branching'
                ELSE 'full_bloom'
            END;
            
            target_views := stream_count + FLOOR(random() * stream_count * 0.2 + stream_count * 0.1)::INT;
            budget_cents := GREATEST(10000, FLOOR(target_views * 0.08)::INT);
            spent_cents := FLOOR(budget_cents * (0.70 + random() * 0.20))::INT;
            duration_days := GREATEST(7, CEIL(target_views::FLOAT / 800)::INT);
            
            geo_tier := CASE
                WHEN seed_record.country IN ('United States', 'United Kingdom', 'Canada', 'Australia', 'Germany', 'France') THEN 'global'
                WHEN seed_record.country IN ('Nigeria', 'South Africa', 'Ghana', 'Kenya', 'Brazil', 'India', 'Mexico') THEN 'regional'
                ELSE 'local'
            END;
            
            INSERT INTO track_campaigns (
                source_url, artist_id, total_budget_cents, spent_cents,
                geographic_tier, target_countries, target_genres, current_stage,
                is_active, is_paused, total_streams, target_view_count,
                estimated_duration_days, coverart, created_at, updated_at
            ) VALUES (
                COALESCE(seed_record.spotify_url, seed_record.youtube_url, 'https://open.spotify.com/artist/' || seed_record.id::TEXT),
                seed_record.id, budget_cents, spent_cents, geo_tier,
                ARRAY[COALESCE(seed_record.country, 'Nigeria')],
                ARRAY[COALESCE(seed_record.primary_genre, 'Afrobeats')],
                stage_name, true, false, stream_count, target_views,
                duration_days, seed_record.avatar_url,
                NOW() - (random() * INTERVAL '90 days'), NOW()
            );
            
            v_created_count := v_created_count + 1;
        END LOOP;
    END LOOP;
    
    RETURN QUERY SELECT v_created_count, v_skipped_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT * FROM ensure_seed_campaigns();
