-- ============================================
-- Mavins Web — Supabase Schema + RPC Functions
-- Run this in Supabase SQL Editor
-- ============================================

-- ============================================================
-- 1. users — Artist and listener accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    artist_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    location TEXT,
    city TEXT,
    country TEXT,
    country_code TEXT,
    timezone TEXT,
    primary_genre TEXT,
    chart_position INTEGER DEFAULT 0,
    verified BOOLEAN DEFAULT FALSE,
    youtube_id TEXT,
    metadata_json JSONB DEFAULT '{}',
    user_type TEXT DEFAULT 'real' CHECK (user_type IN ('real', 'seed', 'ghost')),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_active TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. tracks — Music catalog
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    artist_id UUID REFERENCES public.users(id),
    cover_url TEXT,
    audio_url TEXT,
    video_url TEXT,
    duration INTEGER,
    genre TEXT[],
    plays BIGINT DEFAULT 0,
    likes BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. track_campaigns — The promotion contract
-- ============================================================
CREATE TABLE IF NOT EXISTS public.track_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_url TEXT NOT NULL,
    resolved_song_id TEXT,
    track_id UUID REFERENCES public.tracks(id),
    artist_id UUID NOT NULL REFERENCES public.users(id),
    total_budget_cents BIGINT NOT NULL DEFAULT 0,
    spent_cents BIGINT DEFAULT 0,
    geographic_tier TEXT DEFAULT 'local' CHECK (geographic_tier IN ('local', 'regional', 'national', 'global')),
    target_countries TEXT[] DEFAULT '{}',
    target_cities TEXT[] DEFAULT '{}',
    target_genres TEXT[] DEFAULT '{}',
    current_stage TEXT DEFAULT 'planting' CHECK (current_stage IN ('planting', 'germination', 'root_system', 'branching', 'full_bloom', 'completed')),
    stage_started_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    is_paused BOOLEAN DEFAULT FALSE,
    total_streams BIGINT DEFAULT 0,
    real_streams BIGINT DEFAULT 0,
    seeded_streams BIGINT DEFAULT 0,
    save_count BIGINT DEFAULT 0,
    playlist_add_count BIGINT DEFAULT 0,
    share_count BIGINT DEFAULT 0,
    comment_count BIGINT DEFAULT 0,
    fresh_connect_order_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT one_active_campaign_per_track UNIQUE (track_id, is_active) DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================
-- 4. campaign_daily_metrics — Time-series for analytics charts
-- ============================================================
CREATE TABLE IF NOT EXISTS public.campaign_daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.track_campaigns(id) ON DELETE CASCADE,
    metric_date DATE NOT NULL,
    streams BIGINT DEFAULT 0,
    saves BIGINT DEFAULT 0,
    playlist_adds BIGINT DEFAULT 0,
    shares BIGINT DEFAULT 0,
    comments BIGINT DEFAULT 0,
    geo_breakdown JSONB DEFAULT '{}',
    source_breakdown JSONB DEFAULT '{}',
    avg_listen_duration_seconds INTEGER,
    skip_rate NUMERIC(5,4),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(campaign_id, metric_date)
);

-- ============================================================
-- 5. seed_interaction_log — Internal audit trail
-- ============================================================
CREATE TABLE IF NOT EXISTS public.seed_interaction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.track_campaigns(id) ON DELETE CASCADE,
    seed_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    track_id UUID REFERENCES public.tracks(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('play', 'save', 'playlist_add', 'share', 'comment', 'follow')),
    triggered_by_real_user_id UUID REFERENCES public.users(id),
    persona_archetype TEXT,
    computed_cost_cents BIGINT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. artist_growth_milestones — Gamification badges
-- ============================================================
CREATE TABLE IF NOT EXISTS public.artist_growth_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artist_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.track_campaigns(id) ON DELETE CASCADE,
    milestone_type TEXT NOT NULL CHECK (milestone_type IN (
        'first_1k_streams', 'first_10k_streams', 'first_50k_streams',
        'first_100k_streams', 'first_1m_streams',
        'trending_local', 'trending_regional', 'trending_national', 'trending_global',
        'viral_50', 'chart_top_10', 'chart_number_1',
        'first_playlist_add', 'first_share', 'first_comment',
        'sustained_growth_7d', 'sustained_growth_30d',
        'cross_border_penetration', 'genre_chart_entry'
    )),
    milestone_data JSONB DEFAULT '{}',
    unlocked_at TIMESTAMPTZ DEFAULT NOW(),
    was_notified BOOLEAN DEFAULT FALSE,
    UNIQUE(artist_id, campaign_id, milestone_type)
);

-- ============================================================
-- 7. wallet_ledger — Artist earnings and withdrawals
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.users(id),
    changeset JSONB NOT NULL DEFAULT '{}',
    amount_cents BIGINT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('earning', 'withdrawal', 'bonus', 'fee')),
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. shares — Shareable links for tracks
-- ============================================================
CREATE TABLE IF NOT EXISTS public.shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.users(id),
    track_id UUID REFERENCES public.tracks(id),
    campaign_id UUID REFERENCES public.track_campaigns(id),
    share_url TEXT NOT NULL,
    clicks BIGINT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RPC FUNCTIONS
-- ============================================================

-- get_trending_campaigns — Velune Home screen + Mavins discovery
-- Kept in sync with migrations 020 (stop excluding 'planting') and
-- 021 (per-genre cold-start guaranteed slot) — see those files for
-- full reasoning. This copy was found out of sync with migration 020
-- alone during 021's own session (still had the old `NOT IN
-- ('planting', 'completed')` clause) — corrected here in the same
-- pass rather than left drifting further, per this file's own stated
-- "master schema kept in sync" convention (Task 1).
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
        (tc.created_at > NOW() - INTERVAL '72 hours' AND tc.total_streams < 1000) AS is_cold_start_eligible
    FROM public.track_campaigns tc
    LEFT JOIN public.tracks t ON t.id = tc.track_id
    JOIN public.users u ON u.id = tc.artist_id
    WHERE tc.is_active AND NOT tc.is_paused
      AND tc.current_stage != 'completed'
      AND (p_country_code IS NULL OR p_country_code = ANY(tc.target_countries))
      AND (p_genre IS NULL OR p_genre = ANY(tc.target_genres))
  ),
  boosted AS (
    SELECT * FROM eligible
    WHERE is_cold_start_eligible AND p_genre IS NOT NULL
    ORDER BY trending_score DESC
    LIMIT 1
  ),
  ranked_rest AS (
    SELECT *, ROW_NUMBER() OVER (ORDER BY trending_score DESC) AS rn
    FROM eligible
    WHERE id NOT IN (SELECT id FROM boosted)
  ),
  combined AS (
    SELECT id, track_id, artist_id, artist_name, title, cover_url,
           total_streams, trending_score, geographic_tier, current_stage,
           (rn + CASE WHEN rn >= 5 THEN 1 ELSE 0 END)::NUMERIC AS sort_position
    FROM ranked_rest
    UNION ALL
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

-- record_campaign_stream — Velune calls this on every play
CREATE OR REPLACE FUNCTION public.record_campaign_stream(
    p_campaign_id UUID, p_user_id UUID,
    p_listen_duration_seconds INTEGER, p_country_code TEXT, p_is_full_listen BOOLEAN
)
RETURNS VOID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_is_seed BOOLEAN;
    v_cost_cents BIGINT;
BEGIN
    SELECT (user_type = 'seed') INTO v_is_seed FROM public.users WHERE id = p_user_id;
    v_cost_cents := CASE WHEN v_is_seed THEN (CASE WHEN p_is_full_listen THEN 3 ELSE 1 END) ELSE 0 END;

    UPDATE public.track_campaigns SET
        total_streams = total_streams + 1,
        real_streams = CASE WHEN NOT v_is_seed THEN real_streams + 1 ELSE real_streams END,
        seeded_streams = CASE WHEN v_is_seed THEN seeded_streams + 1 ELSE seeded_streams END,
        spent_cents = spent_cents + v_cost_cents,
        updated_at = NOW(),
        current_stage = CASE
            WHEN total_streams >= 1000000 THEN 'full_bloom'
            WHEN total_streams >= 250000 THEN 'branching'
            WHEN total_streams >= 50000 THEN 'root_system'
            WHEN total_streams >= 10000 THEN 'germination'
            ELSE current_stage END,
        is_active = (spent_cents < total_budget_cents),
        completed_at = CASE WHEN spent_cents >= total_budget_cents THEN NOW() ELSE completed_at END
    WHERE id = p_campaign_id;

    IF v_is_seed THEN
        INSERT INTO public.seed_interaction_log
            (campaign_id, seed_user_id, track_id, interaction_type, computed_cost_cents)
        SELECT p_campaign_id, p_user_id, tc.track_id, 'play', v_cost_cents
        FROM public.track_campaigns tc WHERE tc.id = p_campaign_id;
    END IF;

    INSERT INTO public.campaign_daily_metrics (campaign_id, metric_date, streams, geo_breakdown, source_breakdown)
    VALUES (p_campaign_id, CURRENT_DATE, 1,
        JSONB_BUILD_OBJECT(COALESCE(p_country_code, 'unknown'), 1),
        JSONB_BUILD_OBJECT(CASE WHEN v_is_seed THEN 'seeded' ELSE 'organic' END, 1))
    ON CONFLICT (campaign_id, metric_date) DO UPDATE SET
        streams = public.campaign_daily_metrics.streams + 1,
        geo_breakdown = public.campaign_daily_metrics.geo_breakdown ||
            JSONB_BUILD_OBJECT(COALESCE(p_country_code, 'unknown'),
                COALESCE((public.campaign_daily_metrics.geo_breakdown->>COALESCE(p_country_code, 'unknown'))::BIGINT, 0) + 1),
        source_breakdown = public.campaign_daily_metrics.source_breakdown ||
            JSONB_BUILD_OBJECT(CASE WHEN v_is_seed THEN 'seeded' ELSE 'organic' END,
                COALESCE((public.campaign_daily_metrics.source_breakdown->>CASE WHEN v_is_seed THEN 'seeded' ELSE 'organic' END)::BIGINT, 0) + 1);
END;
$$;
GRANT EXECUTE ON FUNCTION public.record_campaign_stream(UUID, UUID, INTEGER, TEXT, BOOLEAN) TO anon;

-- get_artist_dashboard — Mavins analytics page
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

-- get_leaderboard — Rankings
-- Starts from `users` (LEFT JOIN campaigns) so every real/seeded user
-- shows up even with zero or no active campaigns, instead of requiring
-- an active campaign to appear at all. See supabase_migration_003 for
-- the full rationale.
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

-- get_wallet_balance — Get current balance for a user
CREATE OR REPLACE FUNCTION public.get_wallet_balance(p_user_id UUID)
RETURNS BIGINT LANGUAGE SQL SECURITY DEFINER SET search_path = public STABLE AS $$
    SELECT COALESCE(SUM(amount_cents), 0)
    FROM public.wallet_ledger
    WHERE user_id = p_user_id;
$$;
GRANT EXECUTE ON FUNCTION public.get_wallet_balance(UUID) TO authenticated;

-- Enable RLS on all tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.track_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_growth_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shares ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own data" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own data" ON public.users FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Campaigns readable by all" ON public.track_campaigns FOR SELECT USING (true);
CREATE POLICY "Campaigns insertable by owner" ON public.track_campaigns FOR INSERT WITH CHECK (auth.uid() = artist_id);
CREATE POLICY "Campaigns updatable by owner" ON public.track_campaigns FOR UPDATE USING (auth.uid() = artist_id);

CREATE POLICY "Metrics readable by campaign owner" ON public.campaign_daily_metrics FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.track_campaigns tc WHERE tc.id = campaign_id AND tc.artist_id = auth.uid())
);

CREATE POLICY "Ledger readable by owner" ON public.wallet_ledger FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Ledger insertable by owner" ON public.wallet_ledger FOR INSERT WITH CHECK (auth.uid() = user_id);
