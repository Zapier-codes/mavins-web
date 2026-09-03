-- ============================================================
-- Migration 031 — Task 49 Part b-ii-i: credit_listener_earnings_for_date()
-- ============================================================
--
-- Part b-ii itself sub-split into i/ii this session, same "no real
-- money movement first" pattern already used for b-i vs b-ii: b-ii-i
-- is the per-listener crediting logic (accrual bookkeeping only,
-- nothing leaves the platform); b-ii-ii, still not built, is the
-- actual Korapay disbursement call plus the withdrawal-request-
-- triggered cycle-closing state machine.
--
-- Confirmed directly this session (product owner: "use how industry
-- standards do it"), resolving the two open questions Part b-i's own
-- write-up left for whoever picked up b-ii:
-- - A listener's very first earnings cycle starts the moment they
--   earn their first cent (their first qualifying play) -- not a
--   fixed calendar schedule unrelated to when they actually started
--   earning.
-- - After a cycle is claimed, the next one is lazily created only
--   when they next earn something -- not proactively re-opened with a
--   $0 balance immediately.
-- Both match how real accrual-ledger/NET-payout systems generally
-- work (ad networks, affiliate programs, creator-payout platforms): a
-- "cycle" row is a ledger boundary marking what got grouped into a
-- payout, not a pre-provisioned container that exists before there's
-- anything to put in it.

-- ------------------------------------------------------------
-- 1. cycle_end_date must become nullable -- a real schema
--    correction, not a workaround. Migration 019 declared it NOT
--    NULL, but that was written before this session's own
--    confirmation that NET-50 counts from a withdrawal REQUEST (a
--    separate, later, user-triggered action -- not knowable at the
--    moment a cycle is lazily created). Forcing a value at creation
--    time would mean inventing a placeholder date with no real
--    meaning, which is worse than admitting the column is genuinely
--    unknown until a withdrawal is actually requested (b-ii-ii's own
--    job to set it, when that's built).
-- ------------------------------------------------------------
ALTER TABLE public.listener_earnings
  ALTER COLUMN cycle_end_date DROP NOT NULL;

-- ------------------------------------------------------------
-- 2. credit_listener_earnings_for_date(p_date) — the actual
--    accrual step. Calls compute_daily_payout_pool(p_date) itself
--    first (that function is upsert-based, so calling it again here
--    is always safe and idempotent) rather than trusting external
--    cron-ordering to have already run it -- makes this function
--    self-sufficient regardless of what calls it or in what order.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_listener_earnings_for_date(p_date DATE)
RETURNS INTEGER  -- number of listeners credited, for the caller to log/verify
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pool public.daily_payout_pool;
    v_listener RECORD;
    v_existing_cycle public.listener_earnings;
    v_earnings_today_cents BIGINT;
    v_credited_count INTEGER := 0;
BEGIN
    -- Idempotent -- see this migration's own header comment above for
    -- why this call belongs here rather than being assumed already
    -- done.
    v_pool := public.compute_daily_payout_pool(p_date);

    -- Nothing to distribute -- either zero qualifying plays that day,
    -- or every campaign that delivered that day had no known
    -- duration to prorate against (both real, correct "nothing to pay
    -- out" states per Part b-i's own write-up, not errors).
    IF v_pool.total_qualifying_plays = 0 OR v_pool.rate_per_stream_cents = 0 THEN
        RETURN 0;
    END IF;

    -- One row per listener who had at least one qualifying play this
    -- specific date -- a loop, not a single set-based upsert, because
    -- "find this listener's current accumulating cycle, or create one
    -- if none exists" has no natural ON CONFLICT target (the table's
    -- only UNIQUE constraint is (listener_id, cycle_number), not
    -- (listener_id, status) -- there's no unique key to conflict
    -- against for "the current accumulating row"). Correctness for
    -- real money mattered more here than a denser query.
    FOR v_listener IN
        SELECT lpe.listener_id, COUNT(*) AS qualifying_plays_today
        FROM public.listener_play_events lpe
        WHERE lpe.played_at::DATE = p_date
          AND lpe.is_qualifying_play = true
        GROUP BY lpe.listener_id
    LOOP
        v_earnings_today_cents := ROUND(v_listener.qualifying_plays_today * v_pool.rate_per_stream_cents);

        SELECT * INTO v_existing_cycle
        FROM public.listener_earnings
        WHERE listener_id = v_listener.listener_id
          AND status = 'accumulating'
        ORDER BY cycle_number DESC
        LIMIT 1;

        IF FOUND THEN
            UPDATE public.listener_earnings
            SET earnings_cents = earnings_cents + v_earnings_today_cents,
                total_qualifying_plays = total_qualifying_plays + v_listener.qualifying_plays_today,
                updated_at = now()
            WHERE id = v_existing_cycle.id;
        ELSE
            -- Lazy-create: either this listener's very first-ever
            -- cycle, or their previous cycle already left
            -- 'accumulating' (claimed/expired) and this is the first
            -- qualifying play since -- both cases handled identically,
            -- per this session's own confirmed direction above.
            INSERT INTO public.listener_earnings (
                listener_id, cycle_number, cycle_start_date, cycle_end_date,
                total_qualifying_plays, earnings_cents, withdrawn_cents, status
            )
            VALUES (
                v_listener.listener_id,
                COALESCE((
                    SELECT MAX(cycle_number) FROM public.listener_earnings
                    WHERE listener_id = v_listener.listener_id
                ), 0) + 1,
                p_date,
                NULL,  -- genuinely unknown until a withdrawal is requested -- see this migration's own header comment
                v_listener.qualifying_plays_today,
                v_earnings_today_cents,
                0,
                'accumulating'
            );
        END IF;

        v_credited_count := v_credited_count + 1;
    END LOOP;

    RETURN v_credited_count;
END;
$$;

-- Same lockdown posture as compute_daily_payout_pool() and every
-- other money-adjacent function in this codebase -- a daily cron
-- (calling both this and compute_daily_payout_pool, or just this one
-- alone since it now self-invokes that one) is the only intended
-- caller.
REVOKE ALL ON FUNCTION public.credit_listener_earnings_for_date(DATE) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_listener_earnings_for_date(DATE) FROM anon;
REVOKE ALL ON FUNCTION public.credit_listener_earnings_for_date(DATE) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.credit_listener_earnings_for_date(DATE) TO service_role;
