-- ============================================================
-- Migration 040 — Task 49 Part b-ii-ii-b Part (c) prerequisite: a
-- real bug found while scoping Part (c), fixed before building on
-- top of it.
-- ============================================================
--
-- Migration 031's own header comment already recorded a confirmed,
-- product-owner-endorsed decision from an earlier session ("use how
-- industry standards do it"): **"NET-50 counts from a withdrawal
-- REQUEST (a separate, later, user-triggered action)."** But
-- migration 032's actual `request_listener_withdrawal()` function
-- never implemented that -- checked directly, not assumed: the
-- function body has no date arithmetic anywhere. It flips
-- 'accumulating' straight to 'claimable' the instant a listener
-- requests, with the 5-business-day claim window open immediately --
-- every listener who has ever called this RPC has gotten paid same-
-- day-eligible, not 50-days-later-eligible. This is exactly the kind
-- of "parsed and pushed cleanly but silently wrong at the business-
-- logic level" gap this project has already found twice before
-- (migration 037's column-name bug; Task 52's declined SMM-panel
-- schema) -- caught here specifically because Part (c) (wiring
-- request+disbursement together) cannot be sanely designed without
-- first confirming what "claimable" actually, correctly means.
--
-- Fixed FORWARD, matching this project's own established precedent
-- (migration 037 replaced 030/031's column reference via CREATE OR
-- REPLACE rather than editing already-applied files; the same
-- mechanism is used here for migration 032's function) -- not by
-- rewriting migration 032's own file.
--
-- New status: 'pending' -- the real gap between "requested" and
-- "actually eligible," matching the already-confirmed request-
-- triggered model. Full lifecycle, after this migration:
--
--   accumulating -> pending   (request_listener_withdrawal, THIS
--                              migration -- the clock starts now)
--   pending      -> claimable (promote_pending_withdrawals_to_claimable,
--                              THIS migration -- 50 calendar days
--                              after requested_at; a scheduled job,
--                              trigger not wired here, same "function
--                              exists, cron wiring is a separate
--                              concern" posture this schema already
--                              uses for compute_daily_payout_pool)
--   claimable    -> claimed   (disburse_listener_withdrawal, migration
--                              039 -- entirely unaffected by this
--                              migration; it already only acts on
--                              'claimable' rows regardless of how they
--                              got there)
--   claimable    -> expired   (Part (e), still not built -- the
--                              5-business-day claim-window timeout)
--
-- `requested_at` is the new, real clock start. `cycle_end_date` keeps
-- its EXISTING meaning (the date the 5-day claim window opened) rather
-- than being repurposed for the request timestamp -- Part (e)'s own
-- already-written spec reads `cycle_end_date` as the claim-window
-- open date, and this migration preserves that contract exactly
-- rather than silently redefining a column a future, not-yet-built
-- part depends on.

ALTER TABLE public.listener_earnings
  ADD COLUMN IF NOT EXISTS requested_at TIMESTAMPTZ;

COMMENT ON COLUMN public.listener_earnings.requested_at IS
  'When the listener called request_listener_withdrawal() for this cycle. NULL until requested. The real NET-50 clock start (migration 040) -- cycle_end_date is set later, when the cycle actually becomes claimable, not at request time.';

-- Migration 019's own CHECK constraint (unnamed at creation, so
-- Postgres auto-named it `listener_earnings_status_check` --
-- confirmed via this exact naming convention for an inline column
-- CHECK with no explicit CONSTRAINT name) needs 'pending' added.
-- Dropped and recreated rather than altered in place -- Postgres has
-- no ALTER CONSTRAINT for changing a CHECK's own expression.
ALTER TABLE public.listener_earnings
  DROP CONSTRAINT IF EXISTS listener_earnings_status_check;

ALTER TABLE public.listener_earnings
  ADD CONSTRAINT listener_earnings_status_check
  CHECK (status IN ('accumulating', 'pending', 'claimable', 'claimed', 'expired'));

-- request_listener_withdrawal(): now actually starts the NET-50 clock
-- instead of skipping straight to claimable. Trust model and the
-- $10-minimum check are unchanged from migration 032 -- only the
-- terminal status/side-effect of a successful request changes.
CREATE OR REPLACE FUNCTION public.request_listener_withdrawal(p_listener_id UUID)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  cycle_id UUID,
  earnings_cents BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
BEGIN
  SELECT * INTO v_cycle
  FROM public.listener_earnings
  WHERE listener_id = p_listener_id AND status = 'accumulating'
  ORDER BY cycle_number DESC
  LIMIT 1;

  IF v_cycle IS NULL THEN
    RETURN QUERY SELECT false, 'No accumulating balance found for this listener.'::TEXT, NULL::UUID, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_cycle.earnings_cents < 1000 THEN
    RETURN QUERY SELECT false,
      ('Balance of ' || v_cycle.earnings_cents || ' cents is below the $10.00 minimum for this cycle.')::TEXT,
      v_cycle.id, v_cycle.earnings_cents;
    RETURN;
  END IF;

  UPDATE public.listener_earnings
  SET status = 'pending',
      requested_at = now(),
      updated_at = now()
  WHERE id = v_cycle.id;

  RETURN QUERY SELECT true,
    'Withdrawal requested. Your balance becomes claimable 50 days from today, with a 5-business-day window to claim it.'::TEXT,
    v_cycle.id, v_cycle.earnings_cents;
END;
$$;

-- promote_pending_withdrawals_to_claimable(): the missing other half
-- of the NET-50 gate -- a set-based sweep, not per-listener, since
-- nothing about "has 50 days passed" needs a per-row loop the way
-- credit_listener_earnings_for_date()'s own per-listener accrual loop
-- genuinely does. Idempotent (re-running finds nothing left to
-- promote), matching compute_daily_payout_pool()'s own upsert-based
-- idempotency posture -- safe regardless of how often or how
-- overlapping whatever eventually schedules this calls it.
CREATE OR REPLACE FUNCTION public.promote_pending_withdrawals_to_claimable()
RETURNS INTEGER  -- number of cycles promoted, for the caller to log/verify
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.listener_earnings
  SET status = 'claimable',
      cycle_end_date = CURRENT_DATE,
      updated_at = now()
  WHERE status = 'pending'
    AND requested_at <= now() - INTERVAL '50 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- service_role-only -- no listener-facing caller exists or should;
-- this is scheduler-invoked infrastructure, same posture as
-- compute_daily_payout_pool/credit_listener_earnings_for_date.
REVOKE ALL ON FUNCTION public.promote_pending_withdrawals_to_claimable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.promote_pending_withdrawals_to_claimable() FROM anon;
REVOKE ALL ON FUNCTION public.promote_pending_withdrawals_to_claimable() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.promote_pending_withdrawals_to_claimable() TO service_role;

-- request_listener_withdrawal's own grants are unchanged from
-- migration 032 (still anon + service_role) -- re-asserted here only
-- for a reader scanning this file in isolation, not because
-- CREATE OR REPLACE altered them.
REVOKE ALL ON FUNCTION public.request_listener_withdrawal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_listener_withdrawal(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_listener_withdrawal(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.request_listener_withdrawal(UUID) TO service_role;
