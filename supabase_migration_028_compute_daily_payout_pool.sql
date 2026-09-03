-- ============================================================
-- Migration 028 — Task 49 Part b-i: compute_daily_payout_pool()
-- ============================================================
--
-- Builds ONLY the daily_payout_pool computation — the platform-wide
-- aggregate (gross ad-spend, net revenue pool, listener pool, total
-- qualifying plays, rate per stream) for a given day. Does NOT credit
-- individual listener_earnings rows.
--
-- SCOPE NARROWED FROM THIS TASK'S OWN EARLIER "Part b-i" DESCRIPTION,
-- not silently — flagging the correction plainly. Part b was
-- originally sub-split as "b-i: pool computation + earnings
-- accumulation" vs "b-ii: Korapay disbursement." Tracing migration
-- 019's actual live schema before writing this function found a real
-- problem with that boundary: crediting a listener into
-- listener_earnings means writing cycle_start_date/cycle_end_date
-- (both NOT NULL), and this codebase has never actually resolved when
-- a cycle starts or ends — only that NET-50 counts from a withdrawal
-- REQUEST, which is explicitly the withdrawal state-machine's own job
-- (b-ii). Bundling "find or create this listener's current cycle"
-- into b-i would mean guessing at cycle semantics nobody has actually
-- decided, the same category of mistake this task has already caught
-- and corrected twice this session (the self-asserted Q1 resolution;
-- the spent_cents-is-not-revenue mixup). Keeping b-i strictly to the
-- platform-wide aggregate, which has no such open question, is the
-- more honest scope. Per-listener crediting (and the cycle semantics
-- it needs answered first) is left for whoever picks up b-ii, or a
-- b-i-b, if that turns out to need its own split.
--
-- Q1 (this session, direct product-owner confirmation, not the
-- earlier self-asserted "resolved"): listener pool = 20% of net
-- revenue = 20% of 50% of gross = 10% of gross ad-spend.
--
-- Daily ad-spend attribution (this session, direct confirmation):
-- record_campaign_stream() only increments spent_cents for SEED
-- plays -- that column is the platform's own seed-network cost meter,
-- not ad-spend revenue, and would have been a serious, easy-to-miss
-- bug if summed here instead of total_budget_cents. total_budget_cents
-- (the real revenue figure) has no daily granularity, so it's
-- prorated evenly across estimated_duration_days (Task 51/migration
-- 022), attributed only to days a campaign has a real
-- campaign_daily_metrics row -- backfill-safe, unlike the live-only
-- is_active flag which only reflects the current moment, not history.

CREATE OR REPLACE FUNCTION public.compute_daily_payout_pool(p_date DATE)
RETURNS public.daily_payout_pool
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_gross_ad_spend_cents BIGINT;
    v_net_revenue_pool_cents BIGINT;
    v_listener_pool_cents BIGINT;
    v_total_qualifying_plays INTEGER;
    v_rate_per_stream_cents NUMERIC(12, 6);
    v_result public.daily_payout_pool;
BEGIN
    -- Gross ad-spend: each campaign that delivered at least one stream
    -- on p_date (a real campaign_daily_metrics row for that exact
    -- date, not "is currently active") contributes an even daily
    -- slice of its total budget, prorated across its own estimated
    -- delivery duration. Campaigns with no known duration
    -- (estimated_duration_days IS NULL or 0 -- pre-migration-022
    -- campaigns, or admin-created campaigns which are free anyway)
    -- contribute nothing rather than guessing a duration that isn't
    -- there.
    SELECT COALESCE(SUM(
        CASE
            WHEN tc.estimated_duration_days IS NULL OR tc.estimated_duration_days = 0 THEN 0
            ELSE tc.total_budget_cents / tc.estimated_duration_days
        END
    ), 0)
    INTO v_gross_ad_spend_cents
    FROM public.track_campaigns tc
    WHERE EXISTS (
        SELECT 1 FROM public.campaign_daily_metrics cdm
        WHERE cdm.campaign_id = tc.id AND cdm.metric_date = p_date
    );

    -- Net revenue pool: 50% of gross (the platform's own operating
    -- split, per this task's own already-established Q1 chain).
    v_net_revenue_pool_cents := ROUND(v_gross_ad_spend_cents * 0.50);

    -- Listener pool: 20% of net = 10% of gross, per this session's
    -- direct confirmation above.
    v_listener_pool_cents := ROUND(v_net_revenue_pool_cents * 0.20);

    -- Qualifying plays: listener_play_events rows for p_date where
    -- is_qualifying_play is true (the >=60s generated column,
    -- migration 019/027). played_at is a TIMESTAMPTZ -- cast to DATE
    -- for the day-boundary comparison, matching p_date's own type.
    SELECT COUNT(*)
    INTO v_total_qualifying_plays
    FROM public.listener_play_events lpe
    WHERE lpe.played_at::DATE = p_date
      AND lpe.is_qualifying_play = true;

    -- Rate per stream: NUMERIC, not rounded to whole cents here --
    -- this is an internal division result (migration 019's own
    -- column comment already explains why), not a discrete money
    -- amount by itself. Zero qualifying plays -> rate is 0, not a
    -- division-by-zero error; there's simply nothing to pay out that
    -- day (the full listener_pool_cents would otherwise sit
    -- unattributed -- correct behavior, not a bug, since Task 49's
    -- own spec never described a rollover-to-next-day rule, and
    -- inventing one here would be the same kind of unauthorized
    -- guess this migration is deliberately avoiding elsewhere).
    IF v_total_qualifying_plays > 0 THEN
        v_rate_per_stream_cents := v_listener_pool_cents::NUMERIC / v_total_qualifying_plays;
    ELSE
        v_rate_per_stream_cents := 0;
    END IF;

    INSERT INTO public.daily_payout_pool (
        pool_date, gross_ad_spend_cents, net_revenue_pool_cents,
        listener_pool_cents, total_qualifying_plays, rate_per_stream_cents
    )
    VALUES (
        p_date, v_gross_ad_spend_cents, v_net_revenue_pool_cents,
        v_listener_pool_cents, v_total_qualifying_plays, v_rate_per_stream_cents
    )
    ON CONFLICT (pool_date) DO UPDATE SET
        gross_ad_spend_cents = EXCLUDED.gross_ad_spend_cents,
        net_revenue_pool_cents = EXCLUDED.net_revenue_pool_cents,
        listener_pool_cents = EXCLUDED.listener_pool_cents,
        total_qualifying_plays = EXCLUDED.total_qualifying_plays,
        rate_per_stream_cents = EXCLUDED.rate_per_stream_cents,
        computed_at = now()
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$;

-- Same lockdown posture as every other money-adjacent function in
-- this codebase (credit_wallet_deposit, debit_wallet_balance, etc.)
-- -- this is a platform-internal aggregate computation, not something
-- any client (authenticated or anon) should be able to trigger or
-- influence. A daily cron (Supabase scheduled function, or an
-- external scheduler calling in with the service-role key) is the
-- only intended caller -- not built in this migration, same
-- documented gap as migration 019's own "computation job itself is
-- Part b work" note.
REVOKE ALL ON FUNCTION public.compute_daily_payout_pool(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.compute_daily_payout_pool(DATE) FROM anon;
REVOKE ALL ON FUNCTION public.compute_daily_payout_pool(DATE) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.compute_daily_payout_pool(DATE) TO service_role;
