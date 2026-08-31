-- ============================================================
-- Migration 006 — payment_sessions: the Supabase-side record of a
-- payment intent, per B-Pay-backend's "Project owner decisions" →
-- Decision 1 (Task 33, Part 1).
-- ============================================================
--
-- Architecture this implements (see B-Pay-backend's own handover.md,
-- Decision 1, for the full/authoritative write-up): this app generates
-- a `reference` at the moment payment is initiated and writes it here
-- BEFORE any provider is contacted. From that point on, the Supabase
-- Edge Function (supabase/functions/initialize-payment) is the one
-- that actually calls B-Pay-backend's POST /api/pay, using the row
-- this migration creates as its source of truth for amount/currency/
-- customer -- not whatever a caller happens to pass at invoke time.
--
-- Scope note (this session, per explicit product-owner direction):
-- webhooks and payment *verification* are staying on B-Pay-backend for
-- now, NOT moving to this Edge Function yet -- Decision 1's full
-- vision (edge function also receives the provider webhook and writes
-- the result back here) is intentionally NOT implemented by this
-- migration or its companion Edge Function. `status` below therefore
-- only ever reaches 'checkout_created' from this session's own code;
-- nothing here yet flips it to 'success'/'failed' from a webhook. A
-- later task should either add that, or explicitly confirm the
-- decision to keep webhooks on B-Pay-backend permanently and update
-- Decision 1's own write-up to match reality instead of the original
-- full vision.
--
-- NEW, standalone table -- deliberately not touching users/
-- wallet_ledger, which migration 004's own header notes have already
-- drifted from what supabase_schema.sql aspirationally describes. This
-- table has no such history yet, so it uses plain created_at/
-- updated_at rather than guessing which convention (created_at vs.
-- migration 004's discovered create_time/update_time) the live DB
-- would "really" want for a column that doesn't exist anywhere yet.
--
-- Customer email/name are captured directly on this row (not joined
-- from `users` at read time) so the Edge Function never has to touch
-- the users table at all -- sidesteps that same schema-drift risk
-- entirely for this new code path.

CREATE TABLE IF NOT EXISTS public.payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES public.users(id),  -- NULL for guest checkouts
  customer_email TEXT NOT NULL,
  customer_name TEXT,
  provider TEXT NOT NULL DEFAULT 'korapay',
  -- Base currency unit (e.g. whole USD dollars), NOT cents/kobo --
  -- matches this app's own accounting convention everywhere else
  -- (pricing.ts's totalCostCents aside, which is a display/campaign-
  -- pricing concern, not this table's). See korapay.service.ts's
  -- InitializeChargeInput comment for the prior 100x-overcharge bug
  -- this convention avoids repeating.
  amount NUMERIC NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  -- Korapay Dynamic Currency Conversion hint -- both null, or both
  -- set, never one alone (matches korapay.service.ts's own guard).
  payment_currency TEXT,
  settlement_currency TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'checkout_created', 'success', 'failed')),
  checkout_url TEXT,
  -- Set on a failed attempt to call B-Pay-backend (network error,
  -- non-2xx, missing checkout_url) -- NOT a provider-confirmed
  -- decline, since nothing here observes webhooks yet (see scope note
  -- above). Left in place after a later successful retry rather than
  -- cleared, so the history of a flaky first attempt isn't lost.
  last_error TEXT,
  -- Whatever the calling route wants attached (e.g. campaign details,
  -- 'type': 'wallet_topup' vs a direct campaign payment) -- passed
  -- through to B-Pay-backend's own `metadata` field as-is.
  metadata JSONB NOT NULL DEFAULT '{}',
  -- Raw response captured from B-Pay-backend by the Edge Function, for
  -- debugging a failed or unexpected call without needing Render's own
  -- logs.
  provider_response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT payment_sessions_user_or_guest
    CHECK (user_id IS NOT NULL OR customer_email IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_payment_sessions_user_id
  ON public.payment_sessions (user_id) WHERE user_id IS NOT NULL;

-- Row Level Security, with ZERO policies defined below -- this is
-- intentional default-deny for both `anon` and `authenticated`, not an
-- oversight. Every access to this table goes through a service-role
-- client: the Next.js API route writes the initial row (already true
-- server-side, via src/lib/supabase/admin.ts's createAdminClient(),
-- same client guest checkout already uses for pre-session users table
-- access), and the Edge Function reads/updates it using its own
-- auto-provided SUPABASE_SERVICE_ROLE_KEY. This mirrors wallet_ledger's
-- own "moves-money-adjacent data isn't directly client-writable"
-- posture (see migration 004's REVOKE/GRANT block on
-- credit_wallet_deposit) -- a payment intent row is exactly that kind
-- of data, even before any money has actually moved.
ALTER TABLE public.payment_sessions ENABLE ROW LEVEL SECURITY;
