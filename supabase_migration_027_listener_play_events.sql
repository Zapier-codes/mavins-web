-- Migration 027: listener_play_events (Task 49 Part a)
--
-- Real, current blocker this closes (confirmed by reading
-- record_campaign_stream() directly, not assumed from older notes):
-- that function already receives p_user_id and
-- p_listen_duration_seconds as parameters, but never persists either
-- one for a real listener -- p_user_id is used transiently only to
-- check user_type = 'seed' (for the seed-engine's own cost bookkeeping
-- in seed_interaction_log), and p_listen_duration_seconds is accepted
-- and silently dropped, referenced nowhere in the function body.
-- There is currently no per-listener, per-play record anywhere in the
-- schema for a payout calculation (Part b, not this migration) to
-- read from.
--
-- Identity key: public.users.id, confirmed as the one real identity
-- key this whole app uses today (Task 48-b Part c's own finding,
-- verified against every real route's code, not schema alone;
-- auth_user_id is genuinely unused everywhere in src/). Velune's own
-- MusicService.kt call site passes a per-device UUID
-- (getOrCreateCampaignDeviceId()) when no real logged-in user exists,
-- with `userId ?: UUID.randomUUID().toString()` as a last-resort
-- fallback in CampaignRepository.kt -- neither of those will match a
-- real public.users.id row, and that's handled deliberately below
-- (no listener_play_events row is written for a play that can't be
-- tied to a real registered listener; you can't pay out to a random
-- device UUID that isn't a real, payable account).

CREATE TABLE IF NOT EXISTS public.listener_play_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.track_campaigns(id) ON DELETE CASCADE,
  listener_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  listen_duration_seconds INTEGER NOT NULL DEFAULT 0,
  is_full_listen BOOLEAN NOT NULL DEFAULT false,
  -- Stored, not computed at query time -- Task 49's own repeatedly-
  -- referenced spec figure (60 seconds) is cheap to index/aggregate on
  -- as a real column, and a GENERATED column keeps the threshold
  -- defined in exactly one place (this line) rather than duplicated
  -- into every future payout-calculation query that needs to filter
  -- on it.
  is_qualifying_play BOOLEAN GENERATED ALWAYS AS (listen_duration_seconds >= 60) STORED,
  country_code TEXT,
  played_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The payout calculation (Part b) will need to sum qualifying plays
-- per listener within a NET-50 cycle window and per campaign for
-- pro-rata weighting -- both of these are the actual access patterns,
-- indexed for directly, not left to a future sequential scan.
CREATE INDEX IF NOT EXISTS idx_listener_play_events_listener_played_at
  ON public.listener_play_events (listener_id, played_at)
  WHERE is_qualifying_play;

CREATE INDEX IF NOT EXISTS idx_listener_play_events_campaign_played_at
  ON public.listener_play_events (campaign_id, played_at)
  WHERE is_qualifying_play;

-- RLS: no anon/authenticated read or write policy at all, matching
-- payment_sessions/wallet_ledger's own posture (migration 006's
-- header) for money-adjacent tables -- a listener's own earnings
-- record is exactly this kind of table. The only writer is
-- record_campaign_stream() below, which runs SECURITY DEFINER (same
-- as it already does today) so the anon-key caller (Velune) never
-- needs direct table access. Reads for a listener's own dashboard (a
-- future task, not this one) will need their own SECURITY DEFINER
-- RPC too, not a relaxed RLS policy on this table directly.
ALTER TABLE public.listener_play_events ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------
-- record_campaign_stream() — extended, not replaced. Every existing
-- behavior (aggregate counters, seed_interaction_log, campaign_daily_
-- metrics) is preserved verbatim; the only addition is the INSERT
-- into listener_play_events for a genuine, real (non-seed), existing
-- listener. Re-CREATE OR REPLACE rather than ALTER, matching how
-- every prior migration in this repo has revised this same function.
-- ------------------------------------------------------------------
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

    -- Task 49 Part a — the actual addition this migration makes.
    -- `v_is_seed IS FALSE` (not just `NOT v_is_seed`) is deliberate:
    -- v_is_seed is NULL, not FALSE, when p_user_id doesn't match any
    -- public.users row at all (a device-id fallback or a throwaway
    -- random UUID, per this migration's own header comment on
    -- Velune's caller-side behavior) -- `NOT NULL` evaluates to NULL,
    -- which IS falsy in a plain boolean context, but writing `IS
    -- FALSE` here makes the three-way split (real listener / seed
    -- persona / no matching row at all) explicit and unambiguous
    -- rather than relying on NULL's implicit-falsy behavior to happen
    -- to do the right thing. No row is written for a NULL case --
    -- correct, since there's no real, payable listener to credit.
    IF v_is_seed IS FALSE THEN
        INSERT INTO public.listener_play_events
            (campaign_id, listener_id, listen_duration_seconds, is_full_listen, country_code, played_at)
        VALUES
            (p_campaign_id, p_user_id, COALESCE(p_listen_duration_seconds, 0), COALESCE(p_is_full_listen, false), p_country_code, NOW());
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
