-- ============================================================
-- Migration 004 — credit_wallet_deposit(): atomic, idempotent
-- wallet crediting for confirmed deposits.
-- ============================================================
--
-- Written against the ACTUAL live schema (confirmed via
-- information_schema.columns, not the aspirational supabase_schema.sql
-- file, which has drifted from production):
--
--   users.wallet          jsonb NOT NULL DEFAULT '{}'   -- real balance lives here, as {balance, currency}
--   users.update_time     timestamptz NOT NULL DEFAULT now()
--   wallet_ledger.id            uuid
--   wallet_ledger.user_id       uuid
--   wallet_ledger.changeset     jsonb NOT NULL   -- no flat amount_cents/type/description columns exist
--   wallet_ledger.metadata      jsonb NOT NULL
--   wallet_ledger.create_time   timestamptz NOT NULL DEFAULT now()
--   wallet_ledger.update_time   timestamptz NOT NULL DEFAULT now()
--
-- Problem this replaces: THREE separate places currently do their own
-- inline "read users.wallet, add in JS, write it back" —
-- src/app/api/payments/webhook/route.ts, src/app/api/payments/verify/
-- [reference]/route.ts, and src/services/campaign/campaign.service.ts's
-- updateWallet(). All three are non-atomic (a webhook retry and a
-- verify-page load landing at the same moment can both read the same
-- starting balance and both add on top of it -- a lost update). None of
-- them are idempotent against a duplicate delivery. And a fourth place,
-- guestCheckout.ts's creditWalletTopUp(), is calling columns
-- (amount_cents, type, description) that DON'T EXIST on the live table
-- at all -- every guest top-up going through that path is erroring.
--
-- This migration adds ONE function all deposit-crediting call sites
-- should route through instead.

-- ------------------------------------------------------------
-- 1. Idempotency guard: one ledger row per (user, reference).
--    A partial unique index rather than a table-wide constraint, since
--    other wallet_ledger rows (campaign spend debits, refunds, etc.)
--    don't necessarily carry a `reference` in metadata at all.
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_user_reference_unique
  ON public.wallet_ledger (user_id, (metadata->>'reference'))
  WHERE metadata->>'reference' IS NOT NULL;

-- ------------------------------------------------------------
-- 2. The function itself.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.credit_wallet_deposit(
  p_user_id UUID,
  p_amount_cents BIGINT,
  p_reference TEXT,
  p_source TEXT DEFAULT 'korapay',
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
    RAISE EXCEPTION 'credit_wallet_deposit: p_amount_cents must be positive, got %', p_amount_cents;
  END IF;
  IF p_reference IS NULL OR length(trim(p_reference)) = 0 THEN
    RAISE EXCEPTION 'credit_wallet_deposit: p_reference is required for idempotency';
  END IF;

  -- Atomic read-modify-write. The UPDATE row-locks this users row for the
  -- rest of the transaction, so a second call for the same user (e.g. the
  -- webhook and the browser's /verify hit both firing for the same
  -- payment within milliseconds of each other) blocks here and sees the
  -- balance THIS call just wrote, not the stale pre-credit value --
  -- eliminating the lost-update race the old inline JS had.
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
    RAISE EXCEPTION 'credit_wallet_deposit: no users row for id %', p_user_id;
  END IF;

  -- Ledger row second. If this reference was already credited, the
  -- unique index throws here -- and we compensate by subtracting the
  -- amount we just (wrongly, in that case) added above, in a single
  -- atomic statement, then report credited = false.
  BEGIN
    INSERT INTO public.wallet_ledger (id, user_id, changeset, metadata, create_time, update_time)
    VALUES (
      gen_random_uuid(),
      p_user_id,
      jsonb_build_object(
        'amount', p_amount_cents,
        'currency', p_currency,
        'type', 'deposit',
        'description', 'Wallet top-up via ' || p_source || ': ' || p_reference,
        'previous_balance', v_previous_balance,
        'new_balance', v_new_balance
      ),
      jsonb_build_object('source', p_source, 'reference', p_reference),
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
-- 3. Lock it down. This moves real money -- only the service-role
--    client (used server-side in the webhook/verify routes, never
--    exposed to the browser) should be able to call it. An
--    authenticated user calling this directly from the client could
--    otherwise credit their own wallet arbitrarily.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION public.credit_wallet_deposit(UUID, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_wallet_deposit(UUID, BIGINT, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE ALL ON FUNCTION public.credit_wallet_deposit(UUID, BIGINT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.credit_wallet_deposit(UUID, BIGINT, TEXT, TEXT, TEXT) TO service_role;
