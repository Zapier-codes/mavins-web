-- Migration 013: payment_sessions.channels / default_channel
--
-- Task 30d (2026-08-29) -- server-side-computed Korapay checkout
-- channel selection (mobile_money/bank_transfer/card/pay_with_bank),
-- mirroring how payment_currency/settlement_currency (migration 006)
-- already carry Dynamic Currency Conversion's per-session values.
-- Written by /api/payments/initialize/route.ts from an independent
-- server-side country lookup (Vercel's x-vercel-ip-country request
-- header, NOT anything the client sends) via
-- src/lib/currency/korapayChannels.ts's getKorapayChannels() -- see
-- that route's own comment for why this specifically must not trust
-- a client-supplied value, unlike payment_currency/settlement_currency
-- above it, which (worth being honest about, not silently implying
-- otherwise) currently ARE just persisted from whatever the client
-- claims, a pre-existing gap this migration/task does not fix.
--
-- NULL for the ~19 of 25 target countries with no confirmed Korapay
-- channel coverage (Task 30a) -- same "NULL means no coverage, not
-- 'not filled in yet'" convention migration 012 already established
-- for countries.korapay_channels/korapay_default_channel, which is
-- exactly where this data is read from at write time.

ALTER TABLE public.payment_sessions
  ADD COLUMN IF NOT EXISTS channels JSONB,
  ADD COLUMN IF NOT EXISTS default_channel TEXT;

COMMENT ON COLUMN public.payment_sessions.channels IS
  'Korapay checkout channel strings (e.g. ["mobile_money"]) for this session''s payer, server-computed from their IP-derived country at initiate time. NULL = no confirmed coverage for that country; Korapay picks its own default. Never client-supplied -- see Task 30d.';
COMMENT ON COLUMN public.payment_sessions.default_channel IS
  'Which of `channels` to pre-select on Korapay''s checkout UI. NULL is valid even when `channels` is set (no default preference configured for that country) -- see migration 012.';
