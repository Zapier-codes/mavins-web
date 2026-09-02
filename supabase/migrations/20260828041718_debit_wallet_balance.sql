-- ============================================================
-- Migration 007 — debit_wallet_balance(): atomic, idempotent
-- wallet debiting for wallet-funded campaign spend/top-ups.
-- ============================================================
--
-- This is Task 38 (handover.md) — the debit-side counterpart to
-- migration 004's credit_wallet_deposit(), closing a gap Task 13
-- itself flagged: "campaign.service.ts's updateWallet() (the
-- campaign-spend/debit side) has the same non-atomic
-- read-modify-write pattern as the three deposit call sites did...
-- worth its own task if the product owner wants the debit side made
-- atomic too."
--
-- Same live-schema assumptions as migration 004 (users.wallet jsonb
-- {balance, currency}; wallet_ledger.changeset/metadata jsonb, no flat
-- amount_cents/type/description columns).
--
-- Reuses migration 004's wallet_ledger_user_reference_unique partial
-- index for idempotency — it's keyed on (user_id, reference) with no
-- assumption about credit vs. debit, so a duplicate debit call for the
-- same reference is caught the same way a duplicate deposit webhook
-- is. Not recreated here; it already exists once migration 004 has
-- run.
--
-- Per Task 34 (single crediting/debiting authority): this function,
-- like credit_wallet_deposit, is meant to become the ONLY thing that
-- ever writes users.wallet for the debit direction. campaign.service.ts's
-- updateWallet() (used today by addFundsToCampaign's debit call, and
-- any future wallet-funded campaign-placement debit per Task 36)
-- should be migrated to call this RPC instead — that migration is
-- Task 34's own scope, not done by this migration file itself.
--
-- Unlike credit_wallet_deposit, insufficient balance is a real,
-- expected outcome here (a user's wallet legitimately might not cover
-- a campaign's cost) — not an exception. Callers get
-- debited = FALSE, error_code = 'insufficient_balance' back and
-- should surface that to the user (e.g. "top up your wallet first"),
-- not treat it as a crash.

CREATE OR REPLACE FUNCTION public.debit_wallet_balance(
  p_user_id UUID,
  p_amount_cents BIGINT,
  p_reference TEXT,
  p_reason TEXT DEFAULT 'campaign_spend'
)
RETURNS TABLE (debited BOOLEAN, new_balance_cents BIGINT, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_balance BIGINT;
  v_new_balance BIGINT;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'debit_wallet_balance: p_amount_cents must be positive, got %', p_amount_cents;
  END IF;
  IF p_reference IS NULL OR length(trim(p_reference)) = 0 THEN
    RAISE EXCEPTION 'debit_wallet_balance: p_reference is required for idempotency';
  END IF;

  -- Row-lock first, before deciding anything. A concurrent credit or
  -- debit on the same user (e.g. two campaign placements submitted
  -- back-to-back) blocks here rather than both reading the same stale
  -- balance and both deciding "sufficient" off the same starting
  -- number -- the same race migration 004's UPDATE-first approach
  -- closes for deposits, done here via SELECT ... FOR UPDATE since we
  -- need to branch on the balance (insufficient vs. sufficient) before
  -- deciding whether to write anything at all.
  SELECT COALESCE((wallet->>'balance')::bigint, 0) INTO v_current_balance
  FROM public.users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'debit_wallet_balance: no users row for id %', p_user_id;
  END IF;

  IF v_current_balance < p_amount_cents THEN
    -- Expected outcome, not an error: caller (Task 36's wallet-funded
    -- campaign-placement path) should prompt a top-up, not crash.
    -- Nothing written -- the row lock releases at transaction end with
    -- no changes made.
    RETURN QUERY SELECT FALSE, v_current_balance, 'insufficient_balance'::TEXT;
    RETURN;
  END IF;

  v_new_balance := v_current_balance - p_amount_cents;

  UPDATE public.users
  SET
    wallet = wallet || jsonb_build_object('balance', v_new_balance),
    update_time = now()
  WHERE id = p_user_id;

  -- Ledger row second, same pattern as migration 004: if this exact
  -- reference was already debited (duplicate call/retry), the unique
  -- index throws here, and we compensate by putting the balance back
  -- to what it was before this call's write, then report the
  -- already-applied result rather than double-debiting.
  BEGIN
    INSERT INTO public.wallet_ledger (id, user_id, changeset, metadata, create_time, update_time)
    VALUES (
      gen_random_uuid(),
      p_user_id,
      jsonb_build_object(
        'amount', -p_amount_cents,
        'currency', COALESCE((SELECT wallet->>'currency' FROM public.users WHERE id = p_user_id), 'USD'),
        'type', 'debit',
        'description', p_reason || ': ' || p_reference,
        'previous_balance', v_current_balance,
        'new_balance', v_new_balance
      ),
      jsonb_build_object('source', p_reason, 'reference', p_reference),
      now(),
      now()
    );
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.users
    SET
      wallet = wallet || jsonb_build_object('balance', v_current_balance),
      update_time = now()
    WHERE id = p_user_id;

    RETURN QUERY SELECT TRUE, v_current_balance, 'already_debited'::TEXT;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, v_new_balance, NULL::TEXT;
END;
$$;

-- ------------------------------------------------------------
-- Lock it down, same posture as credit_wallet_deposit: this moves
-- real money -- only service-role (server-side routes, never the
-- browser) should be able to call it.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.debit_wallet_balance(UUID, BIGINT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_wallet_balance(UUID, BIGINT, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.debit_wallet_balance(UUID, BIGINT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.debit_wallet_balance(UUID, BIGINT, TEXT, TEXT) TO service_role;
