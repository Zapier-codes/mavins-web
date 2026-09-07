-- ============================================================
-- Migration 041 — Task 49 Part b-ii-ii-b, Part (c), sub-part (c-a):
-- the disbursement sweep RPC.
-- ============================================================
--
-- ------------------------------------------------------------
-- Design question this part's own write-up left open, now resolved
-- rather than picked arbitrarily:
--
-- Part (c)'s original framing asked whether `POST
-- /api/listener/withdraw` (Part a) should call
-- `disburse_listener_withdrawal()` (Part b) SYNCHRONOUSLY right after
-- a successful request, or whether a separate scheduled sweep should
-- pick up 'claimable' rows instead. Migration 040 -- found and fixed
-- while scoping this exact part -- makes that decision for us rather
-- than leaving it a coin flip: a withdrawal REQUEST now only moves a
-- cycle to 'pending', not 'claimable'. Nothing becomes 'claimable'
-- until `promote_pending_withdrawals_to_claimable()` finds it 50
-- calendar days later. There is no HTTP request in this system that
-- is ever present at the moment a cycle actually becomes claimable --
-- the listener isn't calling anything 50 days after their original
-- request. Synchronous, request-triggered disbursement is therefore
-- not just the wrong design, it's now structurally impossible: by the
-- time a cycle is claimable, no request exists to synchronously hang
-- a disbursement call off of.
--
-- **Resolved: scheduled sweep, not synchronous.** This is also
-- exactly how the real payout systems already cited in this task's
-- own migrations handle a delayed, batch-eligible payout queue rather
-- than a request-time transfer:
--   - Stripe's own payout model pays connected-account balances out on
--     a schedule (daily/weekly/monthly), sweeping whatever is
--     currently payout-eligible -- never synchronously inside the API
--     call that made a charge/balance available in the first place.
--   - PayPal Mass Pay / Payouts batches process a queue of pending
--     payout items together on a recurring cadence, each item's
--     outcome (success, unclaimed, failed) reported independently,
--     rather than a single caller's request driving a single
--     synchronous transfer.
--   - Wise and Payoneer's own payout/mass-payment products are the
--     same shape: payment intents queue, a scheduled process
--     disburses whatever has cleared its own hold/review period.
-- This function is that sweep for this app: given the already-built,
-- already-live `disburse_listener_withdrawal()` (migration 039), find
-- every 'claimable' cycle and attempt disbursement on each one,
-- independently, on whatever cadence Part (c-b) eventually wires a
-- scheduler to call this on -- matching this schema's own established
-- "function exists, cron wiring is a separate concern" posture
-- (`compute_daily_payout_pool`, `promote_pending_withdrawals_to_claimable`).
--
-- ------------------------------------------------------------
-- New split, this session, per the mandatory task-splitting rule --
-- Part (c) broken into (c-a)-(c-e). Only (c-a) built this session:
--
-- (c-a) — THIS MIGRATION. The sweep RPC itself,
--         `sweep_claimable_withdrawals_for_disbursement()`. Pure SQL,
--         no cross-repo dependency, no external product decision
--         left open after the reasoning above -- self-contained and
--         independently reviewable/revertible, same bar every other
--         lettered part in this task has already used.
-- (c-b) — Actual scheduler wiring (pg_cron, or an external scheduled
--         invocation of a Supabase Edge Function that calls this RPC)
--         so this runs on a real cadence instead of only existing as
--         a callable function. Not built -- needs a live project to
--         configure (pg_cron scheduling happens against the actual
--         Postgres instance, not something this sandbox can apply or
--         verify), same standing limitation as every migration in
--         this file.
-- (c-c) — A manual/admin-triggerable HTTP route (e.g. `POST
--         /api/admin/listener-earnings/sweep-disbursements`) wrapping
--         this RPC via the service-role admin client, gated by this
--         app's existing admin-role check (migration 016), so an
--         operator can run a sweep on demand before (c-b)'s real cron
--         exists. Not built.
-- (c-d) — Observability: persist each run's own summary (counts by
--         outcome, timestamp) to a small audit table for
--         reconciliation, rather than the counts only ever existing
--         transiently in whatever process called this RPC. Not built.
-- (c-e) — Reconcile with Part (e)'s own still-unbuilt claim-window-
--         expiry job -- decide whether "disburse what's ready" and
--         "expire what's overdue" run as one combined scheduled job or
--         two separate ones. Not decided here -- this file's own
--         Task 49 write-up already flagged this exact question as
--         worth deciding alongside Part (e), not guessed at in this
--         migration.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sweep_claimable_withdrawals_for_disbursement()
RETURNS TABLE(
  cycles_examined INTEGER,
  cycles_disbursed INTEGER,
  cycles_skipped_no_tag INTEGER,
  cycles_skipped_tag_not_found INTEGER,
  cycles_skipped_other INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle_id UUID;
  v_result RECORD;
  v_examined INTEGER := 0;
  v_disbursed INTEGER := 0;
  v_no_tag INTEGER := 0;
  v_tag_not_found INTEGER := 0;
  v_other INTEGER := 0;
BEGIN
  -- Set-based candidate selection (matches
  -- promote_pending_withdrawals_to_claimable's own posture), but the
  -- actual disbursement itself must stay per-row -- resolving a
  -- listener's own bpay_tag and crediting their own specific
  -- bpay_profiles row isn't something a single UPDATE can do across
  -- many rows at once, the same reason credit_listener_earnings_for_date
  -- already uses a per-listener loop rather than a set-based accrual.
  --
  -- SKIP LOCKED: this function may end up invoked more than once
  -- concurrently once (c-b)/(c-c) both exist (a real cron tick
  -- overlapping a manual admin-triggered run, for instance) -- a
  -- second overlapping sweep should simply skip whatever the first
  -- one is already holding, not block waiting on it or double-process
  -- once the first commits. disburse_listener_withdrawal()'s own
  -- internal `FOR UPDATE` (migration 039) still re-locks the same row
  -- inside the same session without conflict; SKIP LOCKED here is
  -- what stops a *different* concurrent session from queuing behind
  -- this one.
  FOR v_cycle_id IN
    SELECT id
    FROM public.listener_earnings
    WHERE status = 'claimable'
    ORDER BY cycle_end_date ASC NULLS LAST, id
    FOR UPDATE SKIP LOCKED
  LOOP
    v_examined := v_examined + 1;

    BEGIN
      SELECT * INTO v_result
      FROM public.disburse_listener_withdrawal(v_cycle_id);

      IF v_result.success THEN
        v_disbursed := v_disbursed + 1;
      ELSIF v_result.error_code = 'no_bpay_tag' THEN
        v_no_tag := v_no_tag + 1;
      ELSIF v_result.error_code = 'bpay_tag_not_found' THEN
        v_tag_not_found := v_tag_not_found + 1;
      ELSE
        -- cycle_not_found / cycle_not_claimable -- most likely a
        -- different concurrent caller already claimed this exact row
        -- between this loop's own candidate SELECT and the moment
        -- disburse_listener_withdrawal() ran (SKIP LOCKED avoids
        -- blocking on a locked row, it doesn't prevent a row from
        -- having already been fully processed and committed by
        -- another session in the gap). Not re-raised as a hard error
        -- -- an honest, already-handled outcome, same "no_bpay_tag
        -- isn't a bug" posture migration 039's own header already
        -- established for its other non-happy-path branches.
        v_other := v_other + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- One row's own failure must never abort or roll back the rest
      -- of the sweep -- the same per-item isolation every batch-payout
      -- system cited above already relies on (a single failed transfer
      -- in a Stripe/PayPal batch doesn't take the rest of the batch
      -- down with it). PL/pgSQL's own BEGIN/EXCEPTION block creates an
      -- implicit savepoint per iteration, so this rolls back only this
      -- row's own partial work, not the whole function's transaction.
      v_other := v_other + 1;
      RAISE WARNING
        'sweep_claimable_withdrawals_for_disbursement: cycle % raised an unexpected error: %',
        v_cycle_id, SQLERRM;
    END;
  END LOOP;

  RETURN QUERY SELECT v_examined, v_disbursed, v_no_tag, v_tag_not_found, v_other;
END;
$$;

-- service_role-only -- no listener-facing caller exists or should.
-- This is scheduler/ops-invoked infrastructure, same posture as
-- disburse_listener_withdrawal (migration 039) and
-- promote_pending_withdrawals_to_claimable (migration 040), neither
-- of which is reachable from a listener-facing route either.
REVOKE ALL ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement() FROM anon;
REVOKE ALL ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement() TO service_role;
