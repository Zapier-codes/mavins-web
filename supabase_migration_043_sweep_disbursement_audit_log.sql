-- ============================================================
-- Migration 043 — Task 49 Part (c-d): persist each disbursement-sweep
-- run's own summary to an audit table, rather than the counts only
-- ever existing transiently in whatever process called the RPC.
-- ============================================================
--
-- Closes the last documented gap in (c-a)/(c-b)/(c-c)'s own
-- observability posture: right now a sweep's outcome (cycles_examined,
-- cycles_disbursed, etc.) is only ever visible in whatever caller
-- logged it at the time -- a cron log line, an admin route's own HTTP
-- response, an Edge Function's console.log. None of that is queryable
-- after the fact for reconciliation ("did last night's sweep actually
-- run, and did it disburse what we expected"), which is exactly the
-- kind of question a real payout system needs answerable without
-- digging through platform logs.
--
-- **A real signature change, not a drop-in CREATE OR REPLACE — called
-- out explicitly because it's easy to get wrong.** Postgres treats
-- `CREATE OR REPLACE FUNCTION` as replacing an existing function only
-- when the new declaration's argument list matches the existing one
-- exactly (same number and types of parameters, defaults aside) --
-- migration 041's own function takes zero arguments. Simply adding a
-- new `p_triggered_by` parameter (even with a DEFAULT) via `CREATE OR
-- REPLACE` would NOT replace that zero-arg function; it would silently
-- create a second, overloaded function alongside it, and every
-- existing zero-arg caller (the pg_cron job from migration 042, in
-- particular) would keep resolving to the OLD function with no audit
-- logging at all -- the exact opposite of this migration's own intent,
-- and the kind of bug that would look like a clean migration while
-- doing nothing. **Fixed by an explicit `DROP FUNCTION` for the old
-- zero-arg signature before creating the new one-arg version**, so
-- there is exactly one `sweep_claimable_withdrawals_for_disbursement`
-- overload after this migration, not two.
--
-- `p_triggered_by` lets each real caller identify itself in the audit
-- row (`'cron'`, `'admin'`, `'edge_function'`) rather than every row
-- reading `'unknown'` -- defaults to `'unknown'` only so a bare manual
-- call (e.g. testing from the SQL editor) still works without an
-- argument, not because unattributed rows are the expected case going
-- forward. This migration also re-registers the pg_cron job (migration
-- 042) with an explicit `'cron'` argument and updates the two existing
-- TypeScript callers (the (c-c) admin route, the (c-b) Edge Function)
-- to pass their own labels -- without those follow-on edits, every
-- real call site would still fall back to the `'unknown'` default and
-- this column would carry no real information.
--
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 1. The audit table itself.
-- ------------------------------------------------------------
-- One row per sweep run, not one row per disbursed cycle --
-- `disburse_listener_withdrawal()`'s own effect on `listener_earnings`
-- (status -> 'claimed') and `bpay_wallet_ledger` (migration 036) is
-- already the per-cycle, per-transaction record; this table exists to
-- answer "did the sweep itself run, and what did it find," a batch
-- level question those two don't answer on their own.
CREATE TABLE public.listener_disbursement_sweep_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  triggered_by TEXT NOT NULL DEFAULT 'unknown',
  cycles_examined INTEGER NOT NULL,
  cycles_disbursed INTEGER NOT NULL,
  cycles_skipped_no_tag INTEGER NOT NULL,
  cycles_skipped_tag_not_found INTEGER NOT NULL,
  cycles_skipped_other INTEGER NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT listener_disbursement_sweep_runs_counts_non_negative CHECK (
    cycles_examined >= 0 AND cycles_disbursed >= 0 AND
    cycles_skipped_no_tag >= 0 AND cycles_skipped_tag_not_found >= 0 AND
    cycles_skipped_other >= 0
  ),
  -- Loose sanity check, not a strict re-derivation of the RPC's own
  -- branching logic in SQL -- catches an obviously-corrupt row
  -- (counts that don't sum to the examined total) without trying to
  -- re-encode business rules a CHECK constraint shouldn't own.
  CONSTRAINT listener_disbursement_sweep_runs_counts_sum_to_examined CHECK (
    cycles_disbursed + cycles_skipped_no_tag + cycles_skipped_tag_not_found
      + cycles_skipped_other = cycles_examined
  )
);

COMMENT ON TABLE public.listener_disbursement_sweep_runs IS
  'Task 49 Part (c-d) -- one row per sweep_claimable_withdrawals_for_disbursement() run, for reconciliation. Written by the RPC itself, not by callers.';
COMMENT ON COLUMN public.listener_disbursement_sweep_runs.triggered_by IS
  'Free-text source label the caller supplies -- cron, admin, edge_function, or unknown if omitted. Not a foreign key/enum: new call sites are expected over time and shouldn''t need a migration to add a new label.';

-- Reconciliation queries read most-recent-first ("did last night's
-- sweep run"), same access pattern this index supports.
CREATE INDEX idx_listener_disbursement_sweep_runs_run_at
  ON public.listener_disbursement_sweep_runs (run_at DESC);

-- Same lockdown posture as every other money-adjacent object in this
-- codebase (bpay_wallet_ledger, listener_earnings, etc.) -- this is
-- platform-internal audit data, not something any client should read
-- or write directly. A future admin-dashboard "sweep history" view
-- would go through a new API route using the service-role admin
-- client, the same pattern the (c-c) admin route already uses for
-- triggering a sweep in the first place -- not a direct client-side
-- select against this table.
REVOKE ALL ON public.listener_disbursement_sweep_runs FROM PUBLIC;
REVOKE ALL ON public.listener_disbursement_sweep_runs FROM anon;
REVOKE ALL ON public.listener_disbursement_sweep_runs FROM authenticated;
GRANT ALL ON public.listener_disbursement_sweep_runs TO service_role;

-- ------------------------------------------------------------
-- 2. Replace the RPC: same disbursement logic as migration 041,
--    unchanged, plus a new p_triggered_by parameter and an audit-row
--    insert immediately before returning.
-- ------------------------------------------------------------

-- Explicit drop first -- see this migration's own header note above
-- for why a plain CREATE OR REPLACE across a changed argument list
-- would silently leave the old zero-arg function in place instead of
-- replacing it.
DROP FUNCTION IF EXISTS public.sweep_claimable_withdrawals_for_disbursement();

CREATE OR REPLACE FUNCTION public.sweep_claimable_withdrawals_for_disbursement(
  p_triggered_by TEXT DEFAULT 'unknown'
)
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
  -- Identical candidate-selection and per-row disbursement logic to
  -- migration 041 -- not re-explained line by line here, see that
  -- migration's own comments for the full reasoning (SKIP LOCKED,
  -- per-row BEGIN/EXCEPTION isolation, etc.). The only change in this
  -- function body is the INSERT immediately before the final RETURN.
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
        v_other := v_other + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_other := v_other + 1;
      RAISE WARNING
        'sweep_claimable_withdrawals_for_disbursement: cycle % raised an unexpected error: %',
        v_cycle_id, SQLERRM;
    END;
  END LOOP;

  -- New in this migration: persist the run's own summary before
  -- returning it, so a caller that never inspects its own return value
  -- (the pg_cron job, in particular -- `SELECT
  -- sweep_claimable_withdrawals_for_disbursement('cron')` on its own
  -- discards the result set once the job completes) still leaves a
  -- durable record behind. Written inside the same function/
  -- transaction as the sweep itself, not by a caller afterward, so a
  -- caller that crashes or is killed after the sweep completes but
  -- before it would have logged the result still gets an audit row.
  INSERT INTO public.listener_disbursement_sweep_runs (
    triggered_by, cycles_examined, cycles_disbursed,
    cycles_skipped_no_tag, cycles_skipped_tag_not_found, cycles_skipped_other
  ) VALUES (
    COALESCE(NULLIF(TRIM(p_triggered_by), ''), 'unknown'),
    v_examined, v_disbursed, v_no_tag, v_tag_not_found, v_other
  );

  RETURN QUERY SELECT v_examined, v_disbursed, v_no_tag, v_tag_not_found, v_other;
END;
$$;

-- Same service_role-only posture as migration 041 -- re-declared here
-- since the DROP above removed the prior grants along with the old
-- function.
REVOKE ALL ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_claimable_withdrawals_for_disbursement(TEXT) TO service_role;

-- ------------------------------------------------------------
-- 3. Re-register the pg_cron job (migration 042) with an explicit
--    'cron' label -- cron.schedule() has upsert semantics keyed on
--    job name, so this updates the existing job's command in place
--    rather than creating a duplicate. Schedule (03:15 UTC daily)
--    unchanged from migration 042.
-- ------------------------------------------------------------
SELECT cron.schedule(
  'sweep-listener-disbursements',
  '15 3 * * *',
  $$SELECT public.sweep_claimable_withdrawals_for_disbursement('cron')$$
);

-- ------------------------------------------------------------
-- Verified (this session, no live DB available): raw paren balance
-- 55/55; comment-stripped paren balance 22/22; dollar-quote count 4
-- (2 pairs -- the plpgsql function body, the re-scheduled cron
-- command); a 4-case Python simulation of the CHECK-constraint logic
-- (counts summing correctly, counts NOT summing correctly and
-- correctly rejected, a negative count correctly rejected, an
-- all-zero row -- an empty sweep finding nothing 'claimable' --
-- correctly accepted) all passed. **Not verified against a live DB
-- or against the actual DROP/CREATE sequence's real runtime behavior**
-- -- same standing sandbox limitation as every migration in this file;
-- in particular, DROP FUNCTION will fail loudly if any other database
-- object (a view, another function) already depends on the old
-- zero-arg signature -- checked via grep across every .sql file in
-- this repo and found no such dependency, but that is a static-text
-- check, not a live catalog query.
-- ------------------------------------------------------------
