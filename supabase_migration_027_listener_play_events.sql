-- Migration 027: listener_play_events (Task 49 Part a)
--
-- RECONCILIATION, not fresh creation -- caught before this migration
-- was ever pushed live, not after. Migration 019
-- (supabase_migration_019_listener_earnings_schema.sql /
-- 20260830000019_listener_earnings_schema.sql) already created a
-- table by this exact name and applied it to the live DB on
-- 2026-08-30, confirmed via the product owner's own terminal log
-- (this repo's own handover.md, Task 49's "Part a" entry). This
-- migration's original CREATE TABLE IF NOT EXISTS would therefore
-- have silently no-op'd against the live table the moment it was
-- pushed, leaving it on migration 019's older, incompatible column
-- set (qualifies_for_payment instead of is_qualifying_play; no
-- is_full_listen or country_code columns at all) forever -- every
-- line below this comment (up to record_campaign_stream()) was
-- rewritten from a fresh CREATE TABLE into an ALTER-based
-- reconciliation of the table migration 019 actually created.
--
-- Confirmed the live table is genuinely empty and safe to alter
-- freely, not just assumed: migration 019 itself never touches
-- record_campaign_stream() (checked directly -- no CREATE OR REPLACE
-- FUNCTION anywhere in that file), and nothing else in this codebase
-- wrote to this table before this migration's own RPC extension
-- below -- so no real row has ever been written under either schema.
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

-- ALTER, not DROP+CREATE, even though the live table is empty --
-- keeps this migration's intent auditable (evolving 019's table, not
-- silently replacing it outright) and matches this project's own
-- general preference for reversible, incremental schema changes over
-- destructive ones.
ALTER TABLE public.listener_play_events
  RENAME COLUMN qualifies_for_payment TO is_qualifying_play;

ALTER TABLE public.listener_play_events
  ADD COLUMN IF NOT EXISTS is_full_listen BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.listener_play_events
  ADD COLUMN IF NOT EXISTS country_code TEXT;

-- migration 019's own track_url TEXT column is deliberately left in
-- place, not dropped here -- this migration's own schema design never
-- referenced it, but dropping a column is a separate, more
-- consequential decision than this reconciliation is trying to make;
-- still nullable, still harmless to leave unused for now.

-- migration 019's own three indexes (listener_play_events_listener_idx,
-- _campaign_idx, _lookup_idx) covered similar but not identical access
-- patterns to the two partial indexes below -- superseded by these,
-- not left redundant alongside them.
DROP INDEX IF EXISTS public.listener_play_events_listener_idx;
DROP INDEX IF EXISTS public.listener_play_events_campaign_idx;
DROP INDEX IF EXISTS public.listener_play_events_lookup_idx;

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

-- RLS: migration 019 already enabled RLS and set this exact same
-- REVOKE/GRANT posture (service_role only, no anon/authenticated
-- access) -- re-stating idempotently rather than assuming 019's own
-- prior state, since a plain re-run of these statements is always
-- safe regardless. Same posture as payment_sessions/wallet_ledger
-- (migration 006's own header) for money-adjacent tables -- a
-- listener's own earnings record is exactly this kind of table. The
-- only writer is record_campaign_stream() below, which runs SECURITY
-- DEFINER (same as it already does today) so the anon-key caller
-- (Velune) never needs direct table access. Reads for a listener's
-- own dashboard (a future task, not this one) will need their own
-- SECURITY DEFINER RPC too, not a relaxed RLS policy on this table
-- directly.
ALTER TABLE public.listener_play_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.listener_play_events FROM PUBLIC;
REVOKE ALL ON public.listener_play_events FROM anon;
REVOKE ALL ON public.listener_play_events FROM authenticated;
GRANT ALL ON public.listener_play_events TO service_role;

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
