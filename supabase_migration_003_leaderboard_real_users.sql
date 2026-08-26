-- ============================================================
-- Migration 003 — Leaderboard shows real seeded users
-- Run this in Supabase SQL Editor AFTER supabase_migration_002.
-- (Already applied directly via SQL Editor on 2026-08-27 — this file
-- exists so the change is version-controlled and reproducible on any
-- other environment, e.g. a staging project or a fresh provision.)
-- ============================================================

-- Problem: get_leaderboard INNER JOINed track_campaigns with
-- tc.is_active = true required. Any seeded/real user without a
-- currently-active campaign was silently excluded from the result
-- set entirely — even though they exist in `users` with a real
-- artist_name. With zero rows returned, the app's fallback logic
-- (src/app/leaderboard/page.tsx) kicked in and showed the fictional
-- placeholder list instead, even on a project with real seeded users.
--
-- Fix:
--   1. Start from `users` and LEFT JOIN campaigns, so every real user
--      shows up (with 0 streams if they have no campaign yet) instead
--      of a campaign being required to appear at all.
--   2. Sum total_streams across ALL campaigns for that user (not just
--      is_active = true ones) — a completed campaign's streams should
--      still count toward all-time leaderboard standing, not vanish
--      once the campaign wraps up.
--   3. Fall back through artist_name -> display_name -> the part of
--      their email before the @ sign, so a seeded row with no
--      artist_name set still shows something readable instead of null
--      or "Unknown Artist".
CREATE OR REPLACE FUNCTION public.get_leaderboard(p_limit INTEGER DEFAULT 50)
RETURNS TABLE (
    artist_id UUID,
    artist_name TEXT,
    total_streams BIGINT,
    total_campaigns BIGINT,
    avatar_url TEXT
)
LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT
        u.id AS artist_id,
        COALESCE(u.artist_name, u.display_name, split_part(u.email, '@', 1)) AS artist_name,
        COALESCE(SUM(tc.total_streams), 0)::BIGINT AS total_streams,
        COALESCE(COUNT(tc.id), 0)::BIGINT AS total_campaigns,
        u.avatar_url
    FROM public.users u
    LEFT JOIN public.track_campaigns tc ON tc.artist_id = u.id
    WHERE u.is_active
    GROUP BY u.id, u.artist_name, u.display_name, u.email, u.avatar_url
    ORDER BY total_streams DESC, u.created_at ASC
    LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.get_leaderboard(INTEGER) TO anon;
