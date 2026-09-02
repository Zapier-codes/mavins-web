-- ============================================================
-- Migration 005 — add missing profile_completed / is_guest_created
-- columns to public.users
-- ============================================================
--
-- Found while fixing the wallet-deposit RPC (migration 004):
-- src/lib/auth/guestCheckout.ts's resolveOrCreateGuestAccount() and
-- src/app/complete-profile/page.tsx both read/write
-- users.profile_completed, and guestCheckout.ts also writes
-- users.is_guest_created -- but per the live information_schema.columns
-- dump, NEITHER column exists on the real table. Every brand-new guest
-- checkout has been failing at account-creation time (the INSERT errors
-- on an unknown column), before it ever reaches the wallet-crediting
-- step this session was asked to fix.
--
-- Additive only -- NOT NULL with a DEFAULT is safe to add to a table
-- with existing rows (Postgres backfills the default, no rewrite of
-- existing data needed, no application code elsewhere assumes these
-- columns are absent).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_guest_created BOOLEAN NOT NULL DEFAULT FALSE;
