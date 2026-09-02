-- ============================================================
-- Migration 011 — platform_revenue: a dedicated ledger for the
-- platform's own fee income, separate from any user's wallet.
-- ============================================================
--
-- This is Task 35/40's one shared remaining open item (handover.md):
-- the 10% campaign-placement fee and 5% deposit fee are both
-- correctly computed and deducted already (Task 35/40's main body of
-- work) -- but the amount taken was never recorded anywhere as
-- platform revenue. Confirmed by grep across every live migration and
-- every app call site before writing this: no platform_revenue table,
-- no revenue-tagged wallet_ledger rows, nothing -- the fee amount
-- existed only transiently inside a pricing calculation, then was
-- gone.
--
-- Why a NEW table, not a new `wallet_ledger` row type: wallet_ledger
-- is scoped to per-USER balance history -- every row there answers
-- "what happened to this person's wallet." Platform revenue isn't
-- about any one user's wallet; reusing wallet_ledger would mean
-- answering "how much has the platform earned" only by summing across
-- every user's rows, mixing two different accounting concerns into
-- one table. This mirrors how Stripe Connect keeps "application fees"
-- as their own object, distinct from a connected account's balance --
-- the fee-taker and the fee-payer need independently queryable,
-- independently reconcilable records.
--
-- One row per fee actually taken. `source_reference` ties back to
-- whatever caused it (a payment_sessions.reference for a deposit fee,
-- a track_campaigns.id or the debit/payment reference for a campaign
-- fee) -- kept as free-form TEXT rather than a foreign key, since the
-- two fee types reference different tables and this is a read-mostly
-- reporting table, not something that needs referential-integrity
-- enforcement the way a money-moving table would.

CREATE TABLE IF NOT EXISTS public.platform_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'campaign_fee' (the 10% platform fee taken on campaign placement)
  -- or 'deposit_fee' (the 5% payment-gateway fee taken on a deposit).
  -- A plain TEXT check rather than a Postgres ENUM -- easier to extend
  -- later (e.g. a future withdrawal fee) without an ALTER TYPE.
  type TEXT NOT NULL CHECK (type IN ('campaign_fee', 'deposit_fee')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  -- The user whose action generated this fee -- NOT the platform's
  -- own account (there isn't one). Nullable only in case a future fee
  -- type is ever not tied to a single user; every fee type that exists
  -- today always has one.
  user_id UUID REFERENCES public.users(id),
  -- Ties back to the originating payment/campaign -- see header
  -- comment for why this is TEXT, not a FK.
  source_reference TEXT,
  -- Free-form context (e.g. gross_amount_cents/net_amount_cents for a
  -- deposit fee, or subtotal_cents/total_cost_cents for a campaign
  -- fee) -- enough to reconstruct exactly how this row's amount_cents
  -- was derived without re-deriving it from a separate table's history.
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  create_time TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency: the same pattern as every other money-adjacent write in
-- this codebase (migrations 004/007/008) -- a caller-supplied
-- source_reference must be unique PER FEE TYPE, so a retried webhook
-- delivery or a retried campaign-creation attempt can catch a
-- unique_violation and treat it as "already recorded" rather than
-- double-counting revenue. Partial (WHERE source_reference IS NOT
-- NULL) so a hypothetical future fee type without a natural reference
-- isn't blocked from having multiple NULL rows.
CREATE UNIQUE INDEX IF NOT EXISTS platform_revenue_type_reference_unique
  ON public.platform_revenue (type, source_reference)
  WHERE source_reference IS NOT NULL;

-- Reporting query pattern this is built for: "total revenue by type
-- over a date range" -- an index on (type, create_time) makes that a
-- straightforward index scan rather than a full table scan once this
-- table has real volume.
CREATE INDEX IF NOT EXISTS platform_revenue_type_create_time_idx
  ON public.platform_revenue (type, create_time);

-- ------------------------------------------------------------
-- RLS: this is platform-internal financial data, not something any
-- individual user should ever read (a user seeing "we took a 10% fee
-- from you" as a raw ledger row isn't a UX this app exposes anywhere
-- today, and it's genuinely platform-confidential in aggregate --
-- total revenue shouldn't be queryable by a regular authenticated
-- user via PostgREST). No SELECT/INSERT/UPDATE/DELETE policy is
-- granted to `anon` or `authenticated` at all -- every write happens
-- via `service_role` (the admin client), same posture as
-- `wallet_ledger`'s own money-adjacent writes.
-- ------------------------------------------------------------
ALTER TABLE public.platform_revenue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.platform_revenue FROM PUBLIC;
REVOKE ALL ON public.platform_revenue FROM authenticated;
REVOKE ALL ON public.platform_revenue FROM anon;
GRANT ALL ON public.platform_revenue TO service_role;
