-- ============================================================
-- Migration 039 — Task 49 Part b-ii-ii-b, Part (b): the actual
-- disbursement RPC.
-- ============================================================
--
-- Split from Part (a) (already done -- the withdrawal-REQUEST route,
-- `POST /api/listener/withdraw`, migration 032's
-- `request_listener_withdrawal`) per the mandatory task-splitting
-- rule. Part (a) only flips a cycle from 'accumulating' to
-- 'claimable' -- no money moves. This migration is the part that
-- actually moves it: given a 'claimable' `listener_earnings` cycle,
-- resolve the listener's saved `bpay_tag` (migration 034, now unique
-- per migration 038) to a real `bpay_profiles.id` (migration 036) and
-- call `credit_bpay_wallet()` to move the real balance, then mark the
-- cycle 'claimed'.
--
-- Deliberately a LOCAL RPC-to-RPC call, not an HTTP call to
-- B-Pay-backend's own `/payout` route -- `bpay_profiles`/
-- `credit_bpay_wallet` live in this same Supabase project per Task
-- 70's own resolution (the old B-PAY Supabase project was discarded
-- entirely; this project's bpay_profiles table IS the real one now).
-- Nothing here calls Korapay directly -- crediting a bpay_profiles
-- row's own `balance_cents` is a purely internal ledger transfer
-- between two tables in the same database, not an outbound payment
-- rail call. If B-Pay's own users ever need to move that balance
-- further (e.g. out to a bank account via Korapay), that is B-PAY's
-- own send/withdraw flow's job, entirely downstream of this.
--
-- ------------------------------------------------------------
-- The open question Part (b)'s own write-up in handover.md flagged
-- explicitly, resolved here per direct instruction to answer this
-- class of question with the industry-standard default rather than
-- block on it (same standing authorization Task 49's own Q1-Q6
-- resolution already used):
--
-- "What happens if the listener has no bpay_tag saved yet when this
-- runs -- reject with a clear error for (d)'s UI to surface, or leave
-- the cycle sitting claimable indefinitely until one is added?"
--
-- RESOLVED: reject with a clear, specific error code, and leave the
-- cycle sitting exactly as it was ('claimable', untouched) -- not
-- reverted to 'accumulating', not force-expired. This is the same
-- pattern every payout-holding platform with an optional-at-request-
-- time payout destination already uses:
--   - PayPal Payouts API: a payout sent to a recipient with no PayPal
--     account lands in status UNCLAIMED, holding the funds rather
--     than failing/losing them, until the recipient links a real
--     destination -- it does not silently retry forever nor does it
--     force the sender to restart their own request.
--   - Stripe Connect: a connected account with no payout method
--     attached simply accumulates an available balance; payouts stay
--     queued/blocked until an external account exists, with a clear,
--     specific error surfaced to whoever is driving the payout,
--     rather than the balance being reverted or discarded.
-- Consistent with that pattern: the listener already earned this
-- money (Part a's own state machine already confirmed the balance and
-- started the claim clock) -- a missing payout destination is a
-- data-completeness problem to fix, not a reason to undo an already-
-- valid earnings claim. The claim window itself (Part (e), not built)
-- is what eventually times a 'claimable' cycle out if truly nothing
-- is ever supplied -- this RPC does not invent a second, competing
-- timeout of its own for the "no tag yet" case specifically.
--
-- Same treatment, same reasoning, for the tag-exists-but-doesn't-
-- resolve case (a `bpay_tag` saved on `users` with no matching
-- `bpay_profiles` row -- e.g. a typo, or a tag for an account the
-- listener hasn't actually finished registering on B-Pay yet):
-- rejected with its own distinct error code, cycle left untouched, so
-- a corrected tag (re-submitted via the existing `bpay-tag` route) can
-- be retried against the exact same still-claimable cycle rather than
-- losing the claim and needing a fresh net-50 wait over a typo.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.disburse_listener_withdrawal(p_cycle_id UUID)
RETURNS TABLE(
  success BOOLEAN,
  error_code TEXT,
  message TEXT,
  cycle_id UUID,
  bpay_profile_id UUID,
  amount_credited_cents BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_tag TEXT;
  v_profile RECORD;
  v_ledger public.bpay_wallet_ledger;
BEGIN
  -- Row-level lock up front: Part (c) (not built yet) hasn't decided
  -- whether this is triggered synchronously from the withdrawal route
  -- or picked up by a cron sweeping 'claimable' rows -- either way,
  -- two overlapping calls against the SAME cycle (a retry racing a
  -- scheduled sweep, for instance) must never double-credit. FOR
  -- UPDATE serializes concurrent calls on this exact row; the
  -- status = 'claimable' check just below is what actually rejects
  -- the second caller once the first one commits.
  SELECT * INTO v_cycle
  FROM public.listener_earnings
  WHERE id = p_cycle_id
  FOR UPDATE;

  IF v_cycle IS NULL THEN
    RETURN QUERY SELECT false, 'cycle_not_found'::TEXT,
      'No such earnings cycle.'::TEXT, p_cycle_id, NULL::UUID, NULL::BIGINT;
    RETURN;
  END IF;

  IF v_cycle.status <> 'claimable' THEN
    -- Covers both "already claimed" (a second, racing/duplicate call
    -- after the first already succeeded -- not an error worth
    -- alarming over, just a no-op reported honestly) and "still
    -- accumulating" / "expired" (calling this before Part (a) ever
    -- ran, or after Part (e)'s own timeout already fired -- a real
    -- caller mistake, reported the same honest way).
    RETURN QUERY SELECT false, 'cycle_not_claimable'::TEXT,
      ('Cycle status is ''' || v_cycle.status || ''', not ''claimable''.')::TEXT,
      v_cycle.id, NULL::UUID, NULL::BIGINT;
    RETURN;
  END IF;

  SELECT bpay_tag INTO v_tag
  FROM public.users
  WHERE id = v_cycle.listener_id;

  IF v_tag IS NULL THEN
    -- See this migration's own header note above -- cycle stays
    -- exactly 'claimable', not reverted or expired here.
    RETURN QUERY SELECT false, 'no_bpay_tag'::TEXT,
      'This listener has not linked a B-Pay tag yet. Ask them to add one, then retry this cycle.'::TEXT,
      v_cycle.id, NULL::UUID, v_cycle.earnings_cents;
    RETURN;
  END IF;

  SELECT * INTO v_profile
  FROM public.bpay_profiles
  WHERE bpay_tag = v_tag;

  IF v_profile IS NULL THEN
    RETURN QUERY SELECT false, 'bpay_tag_not_found'::TEXT,
      ('No B-Pay account found for tag ''' || v_tag || '''. Ask the listener to confirm their tag, then retry this cycle.')::TEXT,
      v_cycle.id, NULL::UUID, v_cycle.earnings_cents;
    RETURN;
  END IF;

  -- The actual transfer: credit_bpay_wallet() (migration 036) does
  -- its own atomic balance-increment + ledger row in one transaction
  -- -- not re-implemented here. `receive` is the closest existing
  -- ledger `type` to what this is (migration 036's own CHECK
  -- constraint does not yet have a dedicated `listener_payout` value
  -- -- extending that enum is a one-line follow-up for whoever next
  -- touches migration 036's own domain, not blocking this RPC, which
  -- reads correctly either way via `description`/`metadata` below).
  v_ledger := public.credit_bpay_wallet(
    p_profile_id  := v_profile.id,
    p_amount_cents := v_cycle.earnings_cents,
    p_type        := 'receive',
    p_description := 'Mavins-web listener earnings payout',
    p_metadata    := jsonb_build_object(
      'source', 'mavins-web_listener_earnings',
      'listener_id', v_cycle.listener_id,
      'cycle_id', v_cycle.id,
      'cycle_number', v_cycle.cycle_number
    )
  );

  UPDATE public.listener_earnings
  SET status = 'claimed',
      withdrawn_cents = earnings_cents,
      updated_at = now()
  WHERE id = v_cycle.id;

  RETURN QUERY SELECT true, NULL::TEXT,
    'Withdrawal disbursed to B-Pay wallet.'::TEXT,
    v_cycle.id, v_profile.id, v_cycle.earnings_cents;
END;
$$;

-- Trust model: NOT granted to anon/authenticated. Unlike
-- request_listener_withdrawal (migration 032, intentionally anon-
-- callable because it only flips a status flag), this RPC moves real
-- money and has no listener-facing caller of its own -- Part (c) (not
-- built yet) will wire either the withdrawal route or a scheduled job
-- to invoke it via the service-role admin client, same posture every
-- other money-moving RPC in this schema already uses
-- (credit_bpay_wallet/debit_bpay_wallet themselves, credit_wallet_deposit,
-- debit_wallet_balance).
REVOKE ALL ON FUNCTION public.disburse_listener_withdrawal(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.disburse_listener_withdrawal(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.disburse_listener_withdrawal(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.disburse_listener_withdrawal(UUID) TO service_role;
