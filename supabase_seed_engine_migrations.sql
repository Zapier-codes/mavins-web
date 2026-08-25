-- ============================================================
-- Mavins Seed Engine + Nakama Integration SQL Migrations
-- Run these in Supabase SQL Editor
-- ============================================================

-- 1. Ensure record_campaign_stream RPC handles seed users properly
-- (This should already exist from the architecture doc)

-- 2. Add update_pool_velocity RPC for the seed engine
CREATE OR REPLACE FUNCTION public.update_pool_velocity(
  p_pool_id text,
  p_hour_bucket timestamptz,
  p_seed_count integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pool_velocity_log (
    pool_id,
    hour_bucket,
    seed_count,
    message_count,
    real_user_count
  )
  VALUES (
    p_pool_id,
    p_hour_bucket,
    p_seed_count,
    0,
    0
  )
  ON CONFLICT (pool_id, hour_bucket) DO UPDATE SET
    seed_count = public.pool_velocity_log.seed_count + p_seed_count,
    updated_at = now();
END;
$$;

-- 3. Add get_seed_pool RPC for efficient seed selection
CREATE OR REPLACE FUNCTION public.get_seed_pool(
  p_target_countries text[] DEFAULT '{}',
  p_target_genres text[] DEFAULT '{}',
  p_persona_bias text[] DEFAULT '{}',
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  id uuid,
  artist_name text,
  country text,
  city text,
  primary_genre text,
  archetype text,
  pool_id text,
  tier text,
  role text,
  timezone text,
  high_yield_multiplier double precision
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    u.id,
    u.artist_name,
    u.country,
    u.city,
    u.primary_genre,
    u.archetype,
    u.pool_id,
    u.tier,
    u.role,
    u.timezone,
    u.high_yield_multiplier
  FROM public.users u
  WHERE u.user_type = 'seed'
    AND u.is_active = true
    AND (u.cooldown_until IS NULL OR u.cooldown_until < now())
    AND (p_target_countries = '{}' OR u.country = ANY(p_target_countries))
    AND (p_target_genres = '{}' OR u.primary_genre = ANY(p_target_genres))
    AND (p_persona_bias = '{}' OR u.archetype = ANY(p_persona_bias))
  ORDER BY random()
  LIMIT p_limit;
$$;

-- 4. Add increment_seed_posts function for atomic counter updates
CREATE OR REPLACE FUNCTION public.increment_seed_posts(p_seed_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.seed_posting_schedule
  SET
    posts_today = posts_today + 1,
    last_post_at = now(),
    next_due_at = now() + interval '30 minutes' + (random() * interval '90 minutes'),
    updated_at = now()
  WHERE seed_id = p_seed_id;
END;
$$;

-- 5. Add get_campaign_daily_progress RPC
CREATE OR REPLACE FUNCTION public.get_campaign_daily_progress(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'campaign_id', p_campaign_id,
    'today_streams', COALESCE(SUM(cdm.streams), 0),
    'today_saves', COALESCE(SUM(cdm.saves), 0),
    'today_shares', COALESCE(SUM(cdm.shares), 0),
    'today_comments', COALESCE(SUM(cdm.comments), 0),
    'metric_date', CURRENT_DATE
  )
  INTO v_result
  FROM public.campaign_daily_metrics cdm
  WHERE cdm.campaign_id = p_campaign_id
    AND cdm.metric_date = CURRENT_DATE;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- 6. Ensure seed_interaction_log has proper indexes
CREATE INDEX IF NOT EXISTS idx_seed_interaction_log_campaign 
  ON public.seed_interaction_log(campaign_id);
CREATE INDEX IF NOT EXISTS idx_seed_interaction_log_seed 
  ON public.seed_interaction_log(seed_user_id);
CREATE INDEX IF NOT EXISTS idx_seed_interaction_log_created 
  ON public.seed_interaction_log(created_at DESC);

-- 7. Ensure seed_posting_schedule has proper indexes
CREATE INDEX IF NOT EXISTS idx_seed_schedule_next_due 
  ON public.seed_posting_schedule(next_due_at);
CREATE INDEX IF NOT EXISTS idx_seed_schedule_pool 
  ON public.seed_posting_schedule(pool_id);

-- 8. Add trigger to auto-create seed_posting_schedule for new seeds
CREATE OR REPLACE FUNCTION public.auto_create_seed_schedule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_type = 'seed' THEN
    INSERT INTO public.seed_posting_schedule (
      seed_id,
      pool_id,
      posts_target,
      posts_today,
      reset_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.pool_id, 'global'),
      15,
      0,
      CURRENT_DATE
    )
    ON CONFLICT (seed_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_seed_schedule ON public.users;
CREATE TRIGGER trg_auto_seed_schedule
  AFTER INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_seed_schedule();

-- 9. Backfill seed_posting_schedule for existing seeds
INSERT INTO public.seed_posting_schedule (seed_id, pool_id, posts_target, posts_today, reset_at)
SELECT 
  id as seed_id,
  COALESCE(pool_id, 'global') as pool_id,
  15 as posts_target,
  0 as posts_today,
  CURRENT_DATE as reset_at
FROM public.users
WHERE user_type = 'seed'
  AND NOT EXISTS (
    SELECT 1 FROM public.seed_posting_schedule sps WHERE sps.seed_id = users.id
  )
ON CONFLICT (seed_id) DO NOTHING;

-- 10. Grant execute permissions
GRANT EXECUTE ON FUNCTION public.update_pool_velocity(text, timestamptz, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_seed_pool(text[], text[], text[], integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_seed_posts(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_campaign_daily_progress(uuid) TO anon, authenticated, service_role;
