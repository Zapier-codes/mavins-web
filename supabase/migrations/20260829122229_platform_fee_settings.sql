-- ============================================================
-- Migration 014 — Task 46b-a: platform_fee_settings
-- ============================================================
--
-- First of the 46b-a..46b-e chain (handover.md, Task 46b). This part
-- is SCHEMA ONLY: the table below is not read or written by any app
-- code yet -- 46b-b wires the one real call site (calculatePricing()'s
-- PLATFORM_FEE_PERCENT + korapay-webhook/index.ts's DEPOSIT_FEE_RATE)
-- to read from it, 46b-c builds the admin API route that's the only
-- thing ever allowed to write a new row, 46b-d is the admin UI, 46b-e
-- is the audit trail. Building all four together in one pass here
-- would violate this file's own "one task per session" rule this
-- 5-way split exists to enforce -- see 46b's own intro paragraph.
--
-- Checked for a naming collision against everything migration 010-013
-- created before picking `platform_fee_settings` -- none found.
--
-- WHY APPEND-ONLY, NOT AN UPDATE-IN-PLACE SINGLE ROW: 46b's own spec
-- confirms the fee rate must be "forward-only, never retroactive" --
-- a rate change must never be able to reach back and change what an
-- already-created campaign was priced under. An UPDATE-in-place design
-- (one row, mutated) makes that a matter of trusting every future
-- session/admin action to never touch history -- structurally
-- unenforceable. Append-only makes "what rate was active at time T"
-- a fact you can always reconstruct later (whichever row's
-- `changed_at` is the latest one <= T), and "the current rate" is
-- simply "the latest row, period" -- no separate `is_current` flag to
-- ever get out of sync with reality.
--
-- Note this table does NOT need its own validity-range columns
-- (valid_from/valid_until) to satisfy "never retroactive" -- that
-- invariant is actually enforced one level up, by something already
-- true of this codebase before this migration: `track_campaigns` (and
-- the deposit-side `payment_sessions`/`wallet_ledger` rows) already
-- snapshot the ACTUAL fee amount charged into their own row at
-- creation time (Task 35/40's own established pattern), not a live
-- reference to "whatever the current rate is." So an old campaign's
-- own stored total_budget_cents already reflects the rate that was
-- current when IT was created, permanently, regardless of how many
-- rows get appended here afterward. This table only needs to answer
-- "what's the rate right now, for the next thing about to be priced"
-- -- which "latest row" answers directly, with zero extra structure.
--
-- REPRESENTATION NOTE for whoever builds 46b-b next: both percentages
-- below are stored as a PERCENT on a 0-100 scale (e.g. 5 means 5%),
-- matching PLATFORM_FEE_PERCENT's existing convention in
-- src/lib/campaign/pricing.ts exactly. This does NOT match
-- DEPOSIT_FEE_RATE's existing convention in
-- supabase/functions/korapay-webhook/index.ts, which is currently a
-- 0-1 FRACTION (0.05, not 5) -- 46b-b's own call-site swap needs to
-- convert (`deposit_fee_percent / 100`) at that one spot, not treat
-- the raw column value as already being a fraction. Chosen as
-- percent-on-both, not fraction-on-both, because an admin typing "5"
-- into 46b-d's form field for "5%" is the form 46b-d's own spec
-- describes ("show the current rate, accept a new one") -- fraction
-- input (0.05) would be a worse admin UX for no benefit to either
-- reading call site, both of which can trivially divide by 100 once.
--
-- Seeded with one initial row matching the CURRENT, twice-reconfirmed
-- values (see handover.md's top box "Fee rate flip-flopped twice"
-- note): 10% campaign fee, 5% deposit fee. This is NOT a rate change
-- -- it's this table's bootstrap row, so 46b-b's future swap from
-- constant to table-read is a behavioral no-op on the day it ships.
-- `changed_by` is NULL for this row specifically: no admin action
-- produced it, it's this migration's own seed -- the column stays
-- NOT NULL-less (nullable) for exactly this case, not because a real
-- admin edit should ever leave it NULL (46b-c's future route should
-- always populate it from the authenticated admin's own user id).

CREATE TABLE IF NOT EXISTS public.platform_fee_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Percent, 0-100 scale -- see REPRESENTATION NOTE above.
  campaign_fee_percent NUMERIC NOT NULL CHECK (campaign_fee_percent >= 0 AND campaign_fee_percent <= 100),
  deposit_fee_percent NUMERIC NOT NULL CHECK (deposit_fee_percent >= 0 AND deposit_fee_percent <= 100),
  -- Nullable: NULL only for this migration's own seed row (see above).
  -- 46b-c's future write route should always populate this from the
  -- authenticated admin's session -- never trust a client-supplied
  -- value for who made the change.
  changed_by UUID REFERENCES public.users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "The current rate" query pattern is always `ORDER BY changed_at DESC
-- LIMIT 1` -- this table will have a handful of rows for a very long
-- time (fee changes are rare, deliberate, high-stakes actions per this
-- task's own framing), so a dedicated index is more a documentation
-- of intent than a real performance need today, matching migration
-- 011's own diligence on this point rather than skipping it because
-- volume happens to be low right now.
CREATE INDEX IF NOT EXISTS platform_fee_settings_changed_at_idx
  ON public.platform_fee_settings (changed_at DESC);

-- ------------------------------------------------------------
-- RLS: readable the same way pricing_tiers/duration_slots/etc. already
-- are (migration 010) -- public SELECT, `USING (true)`. This is
-- deliberately NOT locked to service_role-only like platform_revenue
-- (migration 011): platform_revenue is pure internal accounting no
-- user-facing code path ever needs, whereas the fee rate is exactly
-- the kind of reference data `useReferenceData()`'s existing
-- browser-client fetch pattern (Task 45 Part 2) will need to read
-- once 46b-b wires it up, the same way it already reads pricing_tiers
-- today. No INSERT/UPDATE/DELETE policy is granted to `anon` or
-- `authenticated` at all -- per 46b-a's own spec ("writable only via
-- the new admin API route 46b-c builds, never directly"), every write
-- happens via `service_role` from that future route, same posture
-- platform_revenue already established for money-adjacent writes.
-- ------------------------------------------------------------
ALTER TABLE public.platform_fee_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read platform_fee_settings" ON public.platform_fee_settings FOR SELECT USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.platform_fee_settings FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON public.platform_fee_settings FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.platform_fee_settings FROM anon;
GRANT ALL ON public.platform_fee_settings TO service_role;

-- Bootstrap row -- see the long comment above for why this exact
-- value pair and why changed_by is NULL here specifically.
INSERT INTO public.platform_fee_settings (campaign_fee_percent, deposit_fee_percent, changed_by)
VALUES (10, 5, NULL);
