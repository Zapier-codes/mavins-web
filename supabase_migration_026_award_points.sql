-- ============================================================
-- Migration 026 — award_points RPC (Task 48-d Part 1's flagged gap).
-- ============================================================
--
-- src/app/api/gamification/streak/update/route.ts already calls
-- `supabase.rpc('award_points', { p_user_id, p_points, p_reason })`
-- for streak-milestone bonus points (7/14/30/60/100-day streaks) — the
-- route degrades gracefully today (logs the RPC error, doesn't fail
-- the whole request) precisely because this function has never
-- existed anywhere in this repo's tracked SQL, confirmed by grep
-- across every `.sql` file before writing this. Milestone bonus
-- points have therefore silently never been awarded until now.
--
-- Call signature matches the already-written, unmodified call site
-- exactly (p_user_id, p_points, p_reason) — this migration's job is
-- making the already-called RPC real, not changing how it's called.
--
-- Atomic, unlike the read-then-write pattern
-- `tasks/claim/route.ts` (a different, existing route, out of this
-- migration's scope to fix) uses for the same `users.points` column —
-- a single `UPDATE ... SET points = points + p_points ... RETURNING`
-- avoids the read-then-write race that pattern has, same reasoning
-- this project has already applied to every money-moving RPC
-- (`credit_wallet_deposit`, `debit_wallet_balance`, etc.) — points
-- aren't money, but the same "increment atomically, don't trust a
-- separately-fetched value" principle applies to any counter multiple
-- requests could touch concurrently.
--
-- `points_history` and `users` are NOT redefined here — both are
-- confirmed-live, pre-existing tables (Task 48-d Part 4a's own
-- "schema honesty" note already established `points_history` is
-- untracked in this repo's migrations; `users.points` is used
-- throughout this file already). This migration only adds the missing
-- function, referencing both by name, same pattern already used
-- throughout this project's migrations for functions that read/write
-- pre-existing tables without re-declaring them.
--
-- KNOWN, FLAGGED VERIFICATION GAP: `points_history.type`'s exact
-- constraints (if any — e.g. a CHECK enumerating allowed values) are
-- unknown from this sandbox, since the table itself is untracked in
-- any migration file. This function inserts `p_type` (defaulting to
-- 'streak_milestone', matching its only real caller today) as a plain
-- TEXT value — if a live CHECK constraint restricts this column to a
-- fixed set not including 'streak_milestone', this insert will fail
-- at the database level despite this migration applying cleanly.
-- `tasks/claim/route.ts`'s own existing, working insert uses
-- `type: 'task'` — if this function's insert fails live, comparing
-- against that known-working value is the fastest way to find why.
-- Not verifiable further without live DB access.

CREATE OR REPLACE FUNCTION public.award_points(
  p_user_id UUID,
  p_points INTEGER,
  p_reason TEXT,
  p_type TEXT DEFAULT 'streak_milestone'
)
RETURNS TABLE (new_points INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_points INTEGER;
BEGIN
  IF p_points <= 0 THEN
    RAISE EXCEPTION 'award_points: p_points must be positive, got %', p_points;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'award_points: p_reason is required';
  END IF;

  UPDATE public.users
  SET points = COALESCE(points, 0) + p_points
  WHERE id = p_user_id
  RETURNING points INTO v_new_points;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'award_points: no users row for id %', p_user_id;
  END IF;

  -- Second, matching points_history's own already-confirmed-live
  -- column shape (Task 48-d Part 4a's note: user_id, amount, type,
  -- description, created_at — exactly what tasks/claim/route.ts's own
  -- existing, working insert already uses). Not wrapped in the same
  -- compensate-on-failure pattern migrations 004/007/008 use for
  -- money RPCs (their own duplicate-reference idempotency concern
  -- doesn't apply here — a streak milestone fires at most once per
  -- specific streak length per user by the calling route's own logic,
  -- not a retryable payment reference needing idempotency at the RPC
  -- layer itself).
  INSERT INTO public.points_history (user_id, amount, type, description, created_at)
  VALUES (p_user_id, p_points, p_type, p_reason, now());

  RETURN QUERY SELECT v_new_points;
END;
$$;

-- ------------------------------------------------------------
-- Lock down consistent with every other points/wallet-mutating RPC in
-- this project (credit_wallet_deposit, debit_wallet_balance,
-- credit_wallet_refund) — service_role only, callable from a server
-- route with the admin client, never directly from a browser session.
-- Checked, not assumed: streak/update/route.ts's own client for
-- everything else in that route is anon-key (createServerClient with
-- NEXT_PUBLIC_SUPABASE_ANON_KEY), which this lockdown would reject.
-- Fixed in the same commit as this migration — that route's RPC call
-- specifically (only that one call, not the route's other already-
-- working anon-key reads/writes) now uses createAdminClient() instead.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.award_points(UUID, INTEGER, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.award_points(UUID, INTEGER, TEXT, TEXT) TO service_role;
