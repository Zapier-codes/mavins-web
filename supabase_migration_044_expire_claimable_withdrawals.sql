-- ============================================================
-- Migration 044 — Task 49 Part (c-e): reconcile the disbursement
-- sweep with Part (e)'s own still-unbuilt claim-window-expiry job.
-- Part (e) itself did not exist before this migration -- built here,
-- since (c-e) cannot be "reconciled with" a job that isn't there yet.
-- ============================================================
--
-- ------------------------------------------------------------
-- The open question this part's own write-up left unresolved:
--
-- (c-e)'s own scope, per Part (c)'s lettered split (migration 041's
-- header): decide whether "disburse what's ready" (the sweep,
-- migrations 041/042) and "expire what's overdue" (Part (e), never
-- built) run as one combined scheduled job or two separate ones.
--
-- **Resolved: two separate functions, two separate cron jobs,
-- sequenced within the same daily window -- not combined.** Two
-- reasons, not just a coin flip:
--
--   1. Every other adjacent stage in this same pipeline is already a
--      dedicated, single-purpose function --
--      promote_pending_withdrawals_to_claimable() (migration 040) and
--      sweep_claimable_withdrawals_for_disbursement() (migration 041)
--      are two separate functions for two adjacent lifecycle
--      transitions, not one combined "advance everything" function,
--      even though they run back-to-back in the same daily window
--      (03:00, then 03:15 UTC). Disbursement and expiry are the same
--      shape of adjacency -- combining them here would be the only
--      inconsistent pipeline stage in this schema.
--   2. **Sequencing, not combining, is what actually matters**: a
--      'claimable' cycle must get a real chance at disbursement before
--      it can be considered for expiry, or a cycle that's both
--      "still within its window" and "already swept this run" could
--      race against "already past its window" depending on
--      UPDATE-ordering inside a single combined function -- two
--      separate, ordered jobs make that ordering explicit and
--      independently verifiable (query cron.job_run_details for each
--      jobname separately) rather than implicit inside one function
--      body. **This migration schedules expiry at 03:30 UTC,** 15
--      minutes after the disbursement sweep's own 03:15 UTC slot
--      (migration 042) -- by the time expiry runs, every cycle that
--      could be disbursed today already has been; anything still
--      'claimable' at 03:30 genuinely failed disbursement (no tag,
--      tag not found) or is still within its own window, not a cycle
--      the sweep simply hasn't reached yet.
--
-- ------------------------------------------------------------
-- Part (e) itself, now built for the first time:
--
-- Migration 032's own trailing comment, and migration 040's own
-- lifecycle-diagram comment, both already named this exact transition
-- as unbuilt: `claimable -> expired`, after the 5-business-day claim
-- window (Task 49's own already-confirmed spec, `handover.md` lines
-- ~9783/10003/10147/10467/10573) closes. `cycle_end_date` is the
-- window's own open date -- migration 040 deliberately preserved this
-- column's pre-existing meaning (not repurposed for the request
-- timestamp) specifically so this part could read it unchanged.
--
-- **Business days, not calendar days** -- the spec says
-- "5-business-day window," and nothing in this schema already
-- computes business-day math, so a small reusable helper is added
-- first rather than inlining ad-hoc date arithmetic into the expiry
-- function itself.
--
-- `add_business_days(start_date, n)`: walks forward one calendar day
-- at a time, counting a day toward `n` only when its ISO day-of-week
-- is Monday-Friday (`EXTRACT(ISODOW ...) < 6`; ISODOW is 1=Monday..
-- 7=Sunday, so Saturday/Sunday are 6/7 and excluded). No holiday
-- calendar -- nothing else in this schema tracks holidays, and
-- inventing one here would be a bigger, separate product decision,
-- not something to guess at inside a lettered sub-part of Task 49.
-- Marked IMMUTABLE (pure function of its inputs, no table reads) so
-- it can be used directly inside a set-based UPDATE's WHERE clause,
-- matching promote_pending_withdrawals_to_claimable()'s own set-based
-- posture -- no per-row PL/pgSQL loop needed here, unlike the
-- disbursement sweep, which genuinely needs one because it calls a
-- separate per-cycle RPC. Left executable by PUBLIC (no REVOKE) --
-- unlike every other function in this file, it touches no table and
-- carries no business data, just date arithmetic; restricting it
-- would only be theatre.
--
-- Window semantics: `cycle_end_date` itself is business day 1 of the
-- window if it's already a weekday, or rolls forward to the next
-- weekday if the promotion sweep happened to run on a weekend (this
-- schema's own crons run "* * *" daily, weekends included). The
-- window's last valid day is 4 business days after that (5 total,
-- inclusive of day 1). A cycle expires once `CURRENT_DATE` is past
-- that last valid day -- checked, not assumed, that this matches "5
-- business days after the window opens," not "5 business days after
-- today," which is the opposite direction and would be wrong.
--
-- Set-based, like promote_pending_withdrawals_to_claimable() and
-- unlike the disbursement sweep: expiring a cycle is a pure status
-- flip with no per-row external RPC call, so there's no reason to pay
-- for a per-row loop the way disbursement genuinely needs one.
-- Idempotent -- re-running finds nothing left to expire once a cycle
-- is already 'expired', same idempotency posture as every other
-- scheduled function in this file.
--
-- No CHECK-constraint change needed here -- 'expired' has been a
-- valid `status` value since migration 019's original constraint, and
-- migration 040's replacement constraint (which added 'pending')
-- preserved it. Confirmed by reading both constraints directly, not
-- assumed.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.add_business_days(p_start_date DATE, p_days INTEGER)
RETURNS DATE
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_date DATE := p_start_date;
  v_added INTEGER := 0;
BEGIN
  IF p_days < 0 THEN
    RAISE EXCEPTION 'add_business_days: p_days must be >= 0, got %', p_days;
  END IF;

  WHILE v_added < p_days LOOP
    v_date := v_date + 1;
    -- ISODOW: 1=Monday .. 7=Sunday. < 6 excludes Saturday(6)/Sunday(7).
    IF EXTRACT(ISODOW FROM v_date) < 6 THEN
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN v_date;
END;
$$;

COMMENT ON FUNCTION public.add_business_days(DATE, INTEGER) IS
  'Adds N business days (Mon-Fri, no holiday calendar) to a start date. Pure/IMMUTABLE, no table reads -- safe to use inside a set-based UPDATE WHERE clause. Added for Task 49 Part (e)''s 5-business-day claim window.';

-- expire_claimable_withdrawals(): the missing Part (e) transition,
-- claimable -> expired, once the 5-business-day claim window has
-- closed. Mirrors promote_pending_withdrawals_to_claimable()'s own
-- shape exactly (set-based UPDATE, INTEGER return of rows affected,
-- service_role-only) since both are the same kind of operation: a
-- scheduled, no-argument, set-based lifecycle sweep with nothing
-- listener-facing calling it.
CREATE OR REPLACE FUNCTION public.expire_claimable_withdrawals()
RETURNS INTEGER  -- number of cycles expired, for the caller to log/verify
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE public.listener_earnings
  SET status = 'expired',
      updated_at = now()
  WHERE status = 'claimable'
    AND CURRENT_DATE > public.add_business_days(
      -- Window day 1: cycle_end_date itself if it's already a
      -- weekday, or the next weekday if the promotion sweep happened
      -- to run on a weekend.
      CASE
        WHEN EXTRACT(ISODOW FROM cycle_end_date) < 6 THEN cycle_end_date
        ELSE public.add_business_days(cycle_end_date, 1)
      END,
      -- 4 more business days after day 1 = 5 business days total,
      -- inclusive of day 1 -- the window's own last valid day.
      4
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.expire_claimable_withdrawals() IS
  'Task 49 Part (e): transitions claimable listener_earnings cycles to expired once their 5-business-day claim window (from cycle_end_date) has closed. Set-based, idempotent, scheduler-invoked (migration 044''s own cron.schedule call, 03:30 UTC, 15 minutes after the disbursement sweep). service_role-only.';

-- service_role-only -- no listener-facing caller exists or should;
-- this is scheduler-invoked infrastructure, same posture as every
-- other function in this task (promote_pending_withdrawals_to_claimable,
-- sweep_claimable_withdrawals_for_disbursement, disburse_listener_withdrawal).
REVOKE ALL ON FUNCTION public.expire_claimable_withdrawals() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_claimable_withdrawals() FROM anon;
REVOKE ALL ON FUNCTION public.expire_claimable_withdrawals() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_claimable_withdrawals() TO service_role;

-- ------------------------------------------------------------
-- Scheduling -- pg_cron, same Option A shape as migration 042. Already
-- enabled by migration 042 (CREATE EXTENSION IF NOT EXISTS), but
-- re-asserted here too so this migration applies cleanly and
-- correctly even if a future session ever reorders/reapplies these
-- independently.
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- 03:30 UTC -- 15 minutes after 'sweep-listener-disbursements' (03:15,
-- migration 042), which itself trails
-- promote_pending_withdrawals_to_claimable's own conventional 03:00
-- UTC slot. Same "not a hard dependency" note as migration 042's own:
-- SKIP LOCKED isn't relevant here (this is a plain set-based UPDATE,
-- no per-row locking to coordinate with a concurrent sweep run that
-- might still be in flight at exactly 03:30 on an unusually large
-- batch), but a cycle the disbursement sweep hasn't reached yet by
-- 03:30 simply isn't expired a day early by mistake -- it's still
-- sitting 'claimable' and gets picked up by tomorrow's disbursement
-- sweep at 03:15 same as normal, and only expires once it's
-- genuinely past its own 5-business-day window regardless of which
-- day's sweep run reaches it.
SELECT cron.schedule(
  'expire-claimable-withdrawals',
  '30 3 * * *',
  $$SELECT public.expire_claimable_withdrawals()$$
);

-- (c-a)-(c-d) are all unaffected by this migration -- this closes
-- (c-e), the last open piece of Task 49 Part (c)'s a-e split, and
-- builds Part (e) itself as a necessary consequence. Not addressed
-- here, left for a future part/task if ever needed: notifying a
-- listener when their own cycle expires, and any "was this expiry
-- correct" admin-facing observability (migration 043's own audit
-- table, listener_disbursement_sweep_runs, is scoped to disbursement
-- sweep runs specifically, not expiry runs -- a parallel table for
-- expiry runs would be new scope, not assumed needed here without a
-- direct ask).
