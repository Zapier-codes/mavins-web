-- ============================================================
-- Migration 036 — Task 70 Part (c) / B-PAY's own Task 2b-c:
-- bpay_profiles + bpay_wallet_ledger + atomic credit/debit RPCs
-- ============================================================
--
-- Authored here (mavins-web), not in the B-PAY fork itself, per Task
-- 70 Part (c)'s own explicit instruction — same precedent already
-- established for track_campaigns/listener_play_events, whose
-- migrations live in this repo despite Velune (a different app
-- entirely) being their real reader/writer.
--
-- Directly unblocked by B-PAY's own handover.md (cloned and read this
-- session, not assumed): the old B-PAY Supabase project is being
-- discarded entirely, clean launch, confirmed by direct product-owner
-- instruction — no live schema dump or backfill needed (B-PAY's own
-- Task 2a/2d, already closed on that basis). This migration is B-PAY's
-- own Task 2b ("design a bpay_wallet_ledger-style table") + 2c
-- ("atomic RPCs for credit/debit"), done from the Mavins-web side per
-- (c)'s own instruction.
--
-- Namespacing, per Task 70 Part (c)'s own reasoning: `profiles`
-- doesn't exist anywhere in this schema (confirmed directly, safe to
-- use bare) but is prefixed `bpay_` anyway, matching every other
-- table this task's own plan already prefixes -- consistency over
-- taking the one available bare name. `wallet_ledger` IS already
-- taken (Mavins' own artist-campaign-spending ledger, a genuinely
-- different domain, wrong FK target, wrong `type` values for this
-- app's own transactions) -- `bpay_wallet_ledger` avoids both the
-- collision and the confusion.
--
-- Columns on bpay_profiles are deliberately minimal -- only what's
-- been directly confirmed by reading B-PAY's own real code this
-- session (`resolve_tag/index.ts`: id, payscribe_account_number,
-- full_name, bpay_tag; `stores/auth-store.ts`: balance) -- not a
-- guessed-complete schema. Extend, don't redesign, as more real
-- columns are confirmed by whoever builds B-PAY's own Task 1
-- (consolidating its duplicate provider integrations) and needs them.
--
-- Ledger design: single-entry, append-only, not double-entry --
-- matches this same ecosystem's own already-established precedent
-- (migration 019's listener_earnings/daily_payout_pool, and Mavins'
-- own pre-existing wallet_ledger) rather than introducing a different
-- accounting model for one app in the same family of products.
-- Double-entry (a paired debit+credit row per transaction, common for
-- multi-party ledgers) is a defensible alternative but adds real
-- complexity this app's own transaction types (a person sending to
-- another person's SAME bpay_profiles table, not an external ledger)
-- don't clearly need yet -- can be migrated to later if B-PAY's own
-- Task 1 consolidation surfaces a concrete reason to.
--
-- `balance` on bpay_profiles is a real, stored, cached column, not
-- removed -- but per this task's own explicit "atomic increment, not
-- read-then-write" requirement, the ONLY way it may ever change after
-- this migration is through credit_bpay_wallet()/debit_bpay_wallet()
-- below, which write a matching ledger row in the exact same
-- transaction. This gives fast reads (a plain column, no SUM() over
-- the whole ledger on every balance check) and full auditability (the
-- ledger is the real record) without the race condition B-PAY's own
-- client-side `WalletCard` balance-sync code currently has (read
-- current value, compute new value, separate UPDATE call -- flagged
-- directly in this task's own "Security finding" bullets).

CREATE TABLE IF NOT EXISTS public.bpay_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bpay_tag TEXT UNIQUE NOT NULL,
  full_name TEXT,
  payscribe_account_number TEXT,
  balance_cents BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bpay_profiles_bpay_tag_idx ON public.bpay_profiles (bpay_tag);

CREATE TABLE IF NOT EXISTS public.bpay_wallet_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.bpay_profiles(id),
  -- Signed amount: positive for a credit, negative for a debit -- one
  -- column, not separate credit_cents/debit_cents columns, so
  -- SUM(amount_cents) over a profile's own rows always equals their
  -- current balance_cents directly (a useful invariant to assert/
  -- reconcile against later, per this migration's own verification
  -- note below).
  amount_cents BIGINT NOT NULL,
  balance_after_cents BIGINT NOT NULL,
  -- Minimal set inferred from B-PAY's own real feature directories
  -- (app/(app)/: airtime, ajo, bills, bundles, card, fund, send) --
  -- checked directly against that repo's actual folder structure, not
  -- guessed from the generic starter-template README, which describes
  -- none of this app's real features. Extend as B-PAY's own Task 1/3+
  -- work surfaces more real transaction types -- not exhaustive by
  -- design, matching this migration's own "minimal, not guessed-
  -- complete" posture for bpay_profiles above.
  type TEXT NOT NULL CHECK (type IN (
    'deposit', 'send', 'receive', 'airtime', 'bundle_purchase',
    'bill_payment', 'ajo_contribution', 'ajo_payout', 'card_funding',
    'refund', 'reversal'
  )),
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bpay_wallet_ledger_profile_id_idx
  ON public.bpay_wallet_ledger (profile_id, created_at DESC);

-- service_role-only, matching every other money-adjacent table in
-- this codebase (listener_play_events, listener_earnings,
-- daily_payout_pool) -- no client of any kind should read or write
-- these directly; the RPCs below are the only sanctioned entry point.
REVOKE ALL ON public.bpay_profiles FROM PUBLIC;
REVOKE ALL ON public.bpay_profiles FROM anon;
REVOKE ALL ON public.bpay_profiles FROM authenticated;
GRANT ALL ON public.bpay_profiles TO service_role;

REVOKE ALL ON public.bpay_wallet_ledger FROM PUBLIC;
REVOKE ALL ON public.bpay_wallet_ledger FROM anon;
REVOKE ALL ON public.bpay_wallet_ledger FROM authenticated;
GRANT ALL ON public.bpay_wallet_ledger TO service_role;

-- credit_bpay_wallet(): atomic increment + ledger row in one
-- transaction. Mirrors this project's own already-established
-- credit_wallet_deposit()/debit_wallet_balance() naming and posture
-- closely, `bpay_`-prefixed per this task's own namespacing rule.
CREATE OR REPLACE FUNCTION public.credit_bpay_wallet(
  p_profile_id UUID,
  p_amount_cents BIGINT,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS public.bpay_wallet_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_new_balance BIGINT;
    v_ledger_row public.bpay_wallet_ledger;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'credit_bpay_wallet: p_amount_cents must be positive, got %', p_amount_cents;
    END IF;

    UPDATE public.bpay_profiles
    SET balance_cents = balance_cents + p_amount_cents,
        updated_at = now()
    WHERE id = p_profile_id
    RETURNING balance_cents INTO v_new_balance;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'credit_bpay_wallet: no bpay_profiles row for id %', p_profile_id;
    END IF;

    INSERT INTO public.bpay_wallet_ledger (
        profile_id, amount_cents, balance_after_cents, type, description, metadata
    )
    VALUES (
        p_profile_id, p_amount_cents, v_new_balance, p_type, p_description, p_metadata
    )
    RETURNING * INTO v_ledger_row;

    RETURN v_ledger_row;
END;
$$;

-- debit_bpay_wallet(): same atomicity guarantee, negative ledger
-- entry. Does NOT clamp at zero or silently allow overdraft -- raises
-- instead, so a caller (Mavins-web's own crediting logic never calls
-- this one, but B-PAY's own future pay-out/send flows will) gets a
-- real error to handle rather than a wallet silently going negative.
-- Whether overdraft should ever be allowed for any B-PAY feature is a
-- product decision for whoever builds those flows, not decided here.
CREATE OR REPLACE FUNCTION public.debit_bpay_wallet(
  p_profile_id UUID,
  p_amount_cents BIGINT,
  p_type TEXT,
  p_description TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL
)
RETURNS public.bpay_wallet_ledger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance BIGINT;
    v_new_balance BIGINT;
    v_ledger_row public.bpay_wallet_ledger;
BEGIN
    IF p_amount_cents <= 0 THEN
        RAISE EXCEPTION 'debit_bpay_wallet: p_amount_cents must be positive, got %', p_amount_cents;
    END IF;

    SELECT balance_cents INTO v_current_balance
    FROM public.bpay_profiles
    WHERE id = p_profile_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'debit_bpay_wallet: no bpay_profiles row for id %', p_profile_id;
    END IF;

    IF v_current_balance < p_amount_cents THEN
        RAISE EXCEPTION 'debit_bpay_wallet: insufficient balance (has %, needs %)', v_current_balance, p_amount_cents;
    END IF;

    UPDATE public.bpay_profiles
    SET balance_cents = balance_cents - p_amount_cents,
        updated_at = now()
    WHERE id = p_profile_id
    RETURNING balance_cents INTO v_new_balance;

    INSERT INTO public.bpay_wallet_ledger (
        profile_id, amount_cents, balance_after_cents, type, description, metadata
    )
    VALUES (
        p_profile_id, -p_amount_cents, v_new_balance, p_type, p_description, p_metadata
    )
    RETURNING * INTO v_ledger_row;

    RETURN v_ledger_row;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.credit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.credit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.credit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.debit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) FROM anon;
REVOKE ALL ON FUNCTION public.debit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.debit_bpay_wallet(UUID, BIGINT, TEXT, TEXT, JSONB) TO service_role;
