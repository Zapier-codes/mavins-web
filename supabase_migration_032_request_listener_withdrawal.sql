-- Task 49 Part b-ii-ii-a (handover.md) — the withdrawal-REQUEST state
-- machine: 'accumulating' -> 'claimable'. Split from Part b-ii-ii
-- (which bundled this together with the actual Korapay disbursement
-- call) per the mandatory task-splitting rule.
--
-- Note on the disbursement half's own blocker, updated after pulling
-- newer origin history mid-session: a separate session (commit
-- 6ee6695) already confirmed B-Pay-backend has a real, live,
-- requireInternalApiKey-protected POST /payout route with a genuine
-- processPayout() -> Korapay chain behind it — so b-ii-ii-b's own
-- cross-repo dependency is resolved, even though this migration still
-- only builds the state-machine half. Splitting them was the right
-- call regardless of that finding: this half needed nothing external
-- to be buildable and testable today, and still doesn't.
--
-- Numbering note: this migration was originally drafted as 030, but
-- pulling newer origin history mid-session found that number had
-- just been claimed by a rename fixing a real, separate 028 numbering
-- collision (compute_daily_payout_pool.sql/ensure_device_listener.sql
-- -> 030/keeps 028, credit_listener_earnings.sql -> 031, per that same
-- commit). Renumbered this file to 032, the actual next-free number,
-- rather than re-create the exact collision that commit had just
-- fixed.
--
-- Trust model, deliberate, not an oversight: this function takes a
-- plain p_listener_id UUID with no additional auth token, and is
-- GRANTed to `anon` — the exact same posture every other listener-
-- facing RPC in this system already uses (record_campaign_stream,
-- ensure_device_listener), because Velune listeners are device-based
-- with no real login (Task 60's own confirmed design) — there is no
-- auth.uid() to check against. Introducing a *stronger* auth
-- requirement just for this one step, when every other listener
-- interaction in this system already trusts a bare UUID, would be
-- inconsistent rather than more correct. The real safeguard against
-- someone else's UUID being used to mess with a listener's earnings
-- state is downstream, not here: actual money only ever moves once a
-- real payout tag/bank account is supplied (Part b-ii-ii-b), which
-- only the real listener would have.

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
  -- Exactly one 'accumulating' cycle can exist per listener at a time
  -- (migration 019's own UNIQUE (listener_id, cycle_number)
  -- constraint doesn't directly enforce "only one accumulating row",
  -- but credit_listener_earnings_for_date()'s own find-or-create
  -- logic never creates a second one while an unclaimed one already
  -- exists, so this SELECT is safe without an explicit LIMIT-related
  -- ambiguity concern — still using LIMIT 1 defensively rather than
  -- assuming that invariant holds forever).
  SELECT * INTO v_cycle
  FROM public.listener_earnings
  WHERE listener_id = p_listener_id AND status = 'accumulating'
  ORDER BY cycle_number DESC
  LIMIT 1;

  IF v_cycle IS NULL THEN
    RETURN QUERY SELECT false, 'No accumulating balance found for this listener.'::TEXT, NULL::UUID, NULL::BIGINT;
    RETURN;
  END IF;

  -- Q6, already resolved (this file's own earlier "Confirmed
  -- decisions" note): $10 minimum is PER-CYCLE, not total accumulated
  -- balance across cycles. 1000 = $10.00 in cents, matching this
  -- table's own BIGINT-cents convention throughout.
  IF v_cycle.earnings_cents < 1000 THEN
    RETURN QUERY SELECT false,
      ('Balance of ' || v_cycle.earnings_cents || ' cents is below the $10.00 minimum for this cycle.')::TEXT,
      v_cycle.id, v_cycle.earnings_cents;
    RETURN;
  END IF;

  UPDATE public.listener_earnings
  SET status = 'claimable',
      cycle_end_date = CURRENT_DATE,
      updated_at = now()
  WHERE id = v_cycle.id;

  RETURN QUERY SELECT true, 'Withdrawal request accepted — claimable now.'::TEXT, v_cycle.id, v_cycle.earnings_cents;
END;
$$;

-- Not this migration's job, flagged for whoever builds it: nothing
-- yet transitions a 'claimable' cycle to 'expired' if the 5-business-
-- day claim window (already-confirmed NET-50 rule, this task's own
-- earlier round) passes without an actual claim. That's a time-based
-- transition (needs a scheduled job checking cycle_end_date against
-- now(), not something a listener's own action triggers), a genuinely
-- different kind of function than this request-triggered one — not
-- built here, not silently assumed to not matter.

REVOKE ALL ON FUNCTION public.request_listener_withdrawal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_listener_withdrawal(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.request_listener_withdrawal(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.request_listener_withdrawal(UUID) TO service_role;
