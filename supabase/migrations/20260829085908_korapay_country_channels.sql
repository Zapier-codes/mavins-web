-- ============================================================
-- Migration 012 — Korapay channel data on public.countries
-- ============================================================
--
-- Task 30b (handover.md) — extends migration 010's `countries` table
-- with the per-country Korapay channel data Task 30a researched and
-- sourced directly from Korapay's own current docs. Deliberately
-- extending this existing Supabase-backed table rather than adding a
-- new hardcoded TS file — Task 45 was a recent, deliberate move away
-- from exactly that pattern (see this repo's handover.md, Task 30b's
-- own note, for the full reasoning); adding a fresh hardcoded array
-- one task later would cut directly against it.
--
-- `korapay_channels`: the Korapay `channels` values valid for this
-- country, or NULL if none are confirmed. NULL is a real, intentional
-- state here, not "not yet filled in" — it means "no confirmed Korapay
-- channel coverage for this country; let Korapay pick its own default
-- channel selection instead of sending this field at all." See Task
-- 30c (not yet built) for how a NULL here should be read.
--
-- `korapay_default_channel`: which of `korapay_channels` to pre-select
-- on Korapay's checkout UI. This is a UX preference, not a Korapay
-- requirement -- picking a different one wouldn't break anything, it
-- would just pre-highlight a different option. `card` was chosen for
-- Nigeria as a reasonable default (most broadly familiar payment
-- method), not because Korapay or the product owner specified it --
-- flagging this as a judgment call a UX-focused session could
-- reasonably revisit, not a researched fact like the channels
-- themselves are.
--
-- Only 6 of the 25 rows get real values below, per Task 30a's own
-- findings:
--   - NG: card, bank_transfer, pay_with_bank (all Nigeria/NGN-only,
--     per developers.korapay.com/docs/accept-payments)
--   - GH, KE, CI, TZ, EG: mobile_money only (Ghana/Kenya/Ivory Coast/
--     Tanzania/Egypt -- the 6 currencies Korapay's mobile money
--     coverage spans, minus Cameroon which isn't one of this app's 25
--     target countries)
-- The other 19 rows (17 with no Korapay coverage under any currency,
-- plus ZA and SN -- both explicitly flagged by Task 30a as genuine,
-- unresolved ambiguities rather than guessed at) are deliberately left
-- NULL. See Task 30a's own write-up in handover.md for the full
-- sourcing and the exact reasoning behind each ZA/SN flag -- don't
-- fill those two in later without actually resolving the ambiguity
-- (a support@korapay.com confirmation, per that note), not just
-- picking one interpretation to stop them looking incomplete.

ALTER TABLE public.countries
  ADD COLUMN IF NOT EXISTS korapay_channels TEXT[],
  ADD COLUMN IF NOT EXISTS korapay_default_channel TEXT;

UPDATE public.countries
  SET korapay_channels = ARRAY['card', 'bank_transfer', 'pay_with_bank'],
      korapay_default_channel = 'card'
  WHERE code = 'NG';

UPDATE public.countries
  SET korapay_channels = ARRAY['mobile_money'],
      korapay_default_channel = 'mobile_money'
  WHERE code IN ('GH', 'KE', 'CI', 'TZ', 'EG');

-- Every other row (including ZA and SN) keeps korapay_channels/
-- korapay_default_channel as NULL -- no UPDATE needed, that's already
-- the column default for every existing row after the ALTER TABLE
-- above.
