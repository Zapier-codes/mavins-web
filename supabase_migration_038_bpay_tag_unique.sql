-- ============================================================
-- Migration 038 — Task 49 Part b-ii-ii-b, Part (b) prerequisite:
-- enforce that a bpay_tag can only ever be linked to ONE listener
-- account on this side of the system.
-- ============================================================
--
-- REVERSES migration 034's own explicit "not unique" decision, per a
-- new, direct product-owner instruction this session: "a tag already
-- connected to an account cannot be reused by another account." That
-- instruction supersedes 034's stated reasoning (which argued no
-- abuse vector existed because payout is always computed from a
-- listener's own individually-earned activity) -- fixed FORWARD here,
-- not by editing 034's own already-applied migration, matching this
-- project's own established precedent for correcting an earlier
-- migration's decision (migration 037 renamed a column forward rather
-- than rewriting 030/031's history; same posture applied here to a
-- constraint instead of a column name).
--
-- Why this matters concretely for Part (b) (the disbursement RPC this
-- same migration set introduces, migration 039): that RPC resolves a
-- claimable cycle's payout destination by looking up
-- `bpay_profiles.id` FROM the listener's own `users.bpay_tag`. If two
-- different `users` rows (two different listener identities) were
-- ever allowed to save the same tag, disbursement would still work
-- mechanically (both would resolve to the same real B-Pay account),
-- but the system would have no way to tell, at write time, whether
-- that was the same person using the app on two devices (fine) or one
-- party collecting multiple listener identities' independent payouts
-- into a single external account it doesn't actually control the
-- other identity's login for (a real dispute/support-liability
-- surface, not a hypothetical one, once real money starts moving).
-- This is the same reasoning every payout-holding platform with a
-- linked-external-account model already applies -- Stripe Connect
-- refuses to attach a bank account/debit card already attached to a
-- different connected account ("This account has already been added
-- to a different account"), and PayPal's linked-bank/card flow
-- rejects a bank account or card already linked to another PayPal
-- account for the identical reason: a payout destination is treated
-- as a scarce, exclusively-claimed resource per real-world recipient,
-- not a many-to-one label. Adopting the same rule here rather than
-- inventing a weaker one for this app specifically.
--
-- Enforced as a PARTIAL unique index (WHERE bpay_tag IS NOT NULL),
-- not a bare UNIQUE column constraint -- migration 034's own column
-- is nullable (most rows never set a tag at all), and a bare UNIQUE
-- constraint in Postgres already treats multiple NULLs as
-- non-conflicting by default, so a partial index isn't strictly
-- required for correctness here -- but it's used anyway to keep this
-- index's own intent self-documenting (it exists to police non-null
-- tags specifically) and consistent with migration 034's own
-- existing partial index (`idx_users_bpay_tag ... WHERE bpay_tag IS
-- NOT NULL`) on the same column, rather than mixing a full and a
-- partial index on one column for no reason.
--
-- NOT retroactively cleaning up any pre-existing duplicate values --
-- this migration only prevents new duplicates going forward. If any
-- duplicate non-null `bpay_tag` values already exist on live data
-- (none are known to from this sandbox -- Task 67 Part f-ii-ii, the
-- only UI surface that ever writes this column, was only just wired
-- up and no live-traffic volume is confirmed), creating this index
-- will fail loudly at migration time rather than silently succeeding
-- over corrupted data -- which is the correct failure mode: it forces
-- a real look at the live rows before this constraint goes live,
-- rather than this migration silently picking a "winner" row and
-- nulling out the rest out from under whichever listener didn't get
-- picked.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_bpay_tag_unique
  ON public.users (bpay_tag)
  WHERE bpay_tag IS NOT NULL;

-- Migration 034's own non-partial lookup index (`idx_users_bpay_tag`)
-- is now fully redundant -- any query it served is served at least as
-- well by this unique index, which Postgres can also use for equality
-- lookups. Dropped rather than left as dead weight duplicating the
-- same column/predicate.
DROP INDEX IF EXISTS public.idx_users_bpay_tag;

COMMENT ON COLUMN public.users.bpay_tag IS
  'B-Pay wallet tag (no leading @) a listener has linked for payout crediting. Task 67 Part f-i (migration 034). UNIQUE across all listener accounts as of migration 038, per direct product-owner instruction -- a tag already linked to one account can never be linked to another. Nullable -- most rows never set this.';
