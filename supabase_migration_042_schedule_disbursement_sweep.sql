-- ============================================================
-- Migration 042 — Task 49 Part (c-b): scheduler wiring for the
-- claimable-withdrawal disbursement sweep, Option A (pg_cron calling
-- the RPC directly, no Edge Function hop).
-- ============================================================
--
-- Closes the "function exists, cron wiring is a separate concern" gap
-- migration 041's own header left open for
-- sweep_claimable_withdrawals_for_disbursement() (c-a), and matches
-- the exact same standing gap already documented for
-- compute_daily_payout_pool (migration 030's own header) and
-- promote_pending_withdrawals_to_claimable (migration 040's own
-- header) -- none of this schema's scheduled jobs have had real cron
-- wiring until now.
--
-- **Cadence: daily, not hourly.** New 'claimable' rows only ever
-- appear once a day, as a side effect of
-- promote_pending_withdrawals_to_claimable() finding cycles that
-- crossed the 50-day mark -- there is nothing for an hourly sweep to
-- find between runs that a daily one would miss. Scheduled for 03:15
-- UTC, deliberately after promote_pending_withdrawals_to_claimable's
-- own conventional 03:00 UTC daily slot (matching
-- compute_daily_payout_pool's own documented "daily cron" framing) so
-- a run of this sweep always sees that day's freshly-promoted rows
-- rather than racing them by a day. **Not a hard dependency** --
-- SKIP LOCKED (migration 041's own concurrency posture) and the
-- 'claimable'-only WHERE clause mean a run that starts before same-day
-- promotion finishes simply disburses fewer rows that day and picks
-- the rest up on the next run, not an error.
--
-- **Flagged, not fixed here — out of scope for this migration:**
-- promote_pending_withdrawals_to_claimable() itself still has no cron
-- wired either (migration 040's own still-open note). This migration
-- only closes Part (c-b) for the sweep specifically, per this task's
-- own lettered-part scoping; wiring the promotion job's own schedule
-- is the same class of work but a different, still-unclaimed part of
-- this task's own checklist, not silently absorbed into this one.
--
-- **Not run against the live DB — same standing sandbox limitation as
-- every migration in this file.** pg_cron schedules against the
-- actual Postgres instance's own cron.job table; a clean apply here
-- confirms the extension enables and the job registers, not that a
-- scheduled run has actually fired yet. Verify post-deploy via
-- `select * from cron.job where jobname = 'sweep-listener-disbursements';`
-- and, after the first scheduled run, `select * from cron.job_run_details
-- where jobid = (select jobid from cron.job where jobname =
-- 'sweep-listener-disbursements') order by start_time desc limit 5;`.
--
-- (c-c) (manual admin-triggered sweep route) and (c-d) (persisting
-- each run's summary to an audit table) are unaffected by this
-- migration -- (c-c) already exists as its own already-applied piece
-- of work; (c-d) remains open. (c-e) (reconciling this cadence with
-- Part (e)'s still-unbuilt claim-window-expiry job) also remains open
-- -- this migration picks 03:15 UTC for the sweep alone, it does not
-- decide whether a future expiry job shares this same schedule or
-- runs on its own.
-- ------------------------------------------------------------

-- Supabase's own standard pattern: pg_cron installs into the `cron`
-- schema regardless of which schema this CREATE EXTENSION names.
-- IF NOT EXISTS makes this safe to re-run (this migration itself, or
-- a future one) without erroring if pg_cron is already enabled on
-- this project from unrelated prior work.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- cron.schedule() has upsert semantics keyed on job name -- re-running
-- this migration (or applying it a second time by mistake) updates the
-- existing job's schedule/command rather than erroring on a duplicate,
-- so no separate cron.unschedule() guard is needed first.
SELECT cron.schedule(
  'sweep-listener-disbursements',
  '15 3 * * *',
  $$SELECT public.sweep_claimable_withdrawals_for_disbursement()$$
);

-- service_role already owns the only grant on the RPC itself
-- (migration 041's own REVOKE/GRANT); pg_cron's scheduler runs jobs as
-- the role that owns the cron.job row, which for a job created via the
-- Supabase SQL editor / a migration applied with the project's own
-- service-role/postgres connection is already a superuser-equivalent
-- role permitted to call a service_role-only function -- no additional
-- grant needed here, consistent with this schema's existing posture
-- for every other scheduler-invoked function in this file.
