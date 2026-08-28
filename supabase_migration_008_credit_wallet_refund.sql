-- ============================================================
-- Migration 008 — credit_wallet_refund(): atomic, idempotent
-- wallet crediting for refunds/compensating credits (NOT deposits).
-- ============================================================
--
-- This is Task 34's own remaining gap, closed here: migration 004's
-- credit_wallet_deposit() exists for real payment-provider deposits
-- specifically (ledger type hardcoded 'deposit', p_source defaults
-- 'korapay', description reads "Wallet top-up via ..."). Two call
-- sites need a credit RPC but are NOT deposits:
--   1. campaign.service.ts's cancelCampaign() — refunding unspent
--      budget when an artist cancels a campaign.
--   2. src/app/api/campaigns/create/route.ts's compensating credit —
--      refunding a debit that already succeeded when the immediately-
--      following track_campaigns insert then fails.
-- Both were left as narrow local non-atomic users.wallet writes
-- (Task 38's migration flagged both explicitly rather than silently
-- reusing credit_wallet_deposit for them, since mislabeling a refund
-- as a 'deposit' in wallet_ledger would corrupt reporting).
--
-- Same live-schema assumptions and idempotency approach as migrations
-- 004/007: users.wallet jsonb {balance, currency}; wallet_ledger
-- .changeset/.metadata jsonb; reuses migration 004's existing
-- wallet_ledger_user_reference_unique partial index on
-- (user_id, metadata->>'reference') rather than adding a new one — it
-- already has no assumption baked in about which direction/type a
-- ledger row is.

CREATE OR REPLACE FUNCTION public.credit_wallet_refund(
  p_user_id UUID,
  p_amount_cents BIGINT,
  p_reference TEXT,
  p_reason TEXT DEFAULT 'campaign_refund',
  p_currency TEXT DEFAULT 'USD'
)
RETURNS TABLE (credited BOOLEAN, new_balance_cents BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_balance BIGINT;
  v_new_balance BIGINT;
BEGIN
  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'credit_wallet_refund: p_amount_cents must be positive, got %', p_amount_cents;
  END IF;
  IF p_reference IS NULL OR length(trim(p_reference)) = 0 THEN
    RAISE EXCEPTION 'credit_wallet_refund: p_reference is required for idempotency';
  END IF;

  -- Same atomic UPDATE-first, row-locking pattern as credit_wallet_deposit
  -- (migration 004) -- a refund and any concurrent credit/debit for the
  -- same user block on this row rather than racing on a stale read.
  UPDATE public.users
  SET
    wallet = COALESCE(wallet, '{}'::jsonb)
             || jsonb_build_object('currency', COALESCE(wallet->>'currency', p_currency))
             || jsonb_build_object('balance', COALESCE((wallet->>'balance')::bigint, 0) + p_amount_cents),
    update_time = now()
  WHERE id = p_user_id
  RETURNING
    (wallet->>'balance')::bigint - p_amount_cents,
    (wallet->>'balance')::bigint
  INTO v_previous_balance, v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'credit_wallet_refund: no users row for id %', p_user_id;
  END IF;

  -- Ledger row second, same compensate-on-duplicate pattern as
  -- migrations 004/007: if this reference was already refunded, undo
  -- the write above and report credited = false rather than double-
  -- crediting a retried refund.
  BEGIN
    INSERT INTO public.wallet_ledger (id, user_id, changeset, metadata, create_time, update_time)
    VALUES (
      gen_random_uuid(),
      p_user_id,
      jsonb_build_object(
        'amount', p_amount_cents,
        'currency', p_currency,
        'type', 'refund',
        'description', p_reason || ': ' || p_reference,
        'previous_balance', v_previous_balance,
        'new_balance', v_new_balance
      ),
      jsonb_build_object('source', p_reason, 'reference', p_reference),
      now(),
      now()
    );
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.users
    SET
      wallet = wallet || jsonb_build_object('balance', v_previous_balance),
      update_time = now()
    WHERE id = p_user_id;

    RETURN QUERY SELECT FALSE, v_previous_balance;
    RETURN;
  END;

  RETURN QUERY SELECT TRUE, v_new_balance;
END;
$$;

-- ------------------------------------------------------------
-- Lock it down, same posture as migrations 004/007: this moves real
-- money -- only service-role (server-side routes, never the browser)
-- should be able to call it.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.credit_wallet_refund(UUID, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_wallet_refund(UUID, BIGINT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.credit_wallet_refund(UUID, BIGINT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.credit_wallet_refund(UUID, BIGINT, TEXT, TEXT, TEXT) TO service_role;
