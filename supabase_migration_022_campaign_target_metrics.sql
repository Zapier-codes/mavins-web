-- ============================================================
-- Migration 022 — Task 51: persist target_view_count /
-- estimated_duration_days on track_campaigns
-- ============================================================
--
-- Task 51 (handover.md) needs a campaign success page that shows
-- "target views" and "estimated duration" for a specific campaign.
-- Checked directly before writing this page: neither value is
-- persisted anywhere. calculatePricing()'s result (pricing.viewCount,
-- pricing.durationSlot) is computed at insert time in both
-- create/route.ts and the guest direct-pay path
-- (korapay-webhook/index.ts's createDirectCampaign), used to size the
-- wallet debit / stored budget, and then discarded — never written to
-- the row itself. Without this, the success page would have to guess
-- or re-derive these from total_budget_cents, which is lossy (the
-- same subtotal maps to a range of possible view counts depending on
-- which tier boundary it landed on) and would silently drift from
-- what the artist actually saw at checkout.
--
-- Both columns are nullable, no default, no backfill — every
-- campaign created before this migration ships keeps showing exactly
-- what it always has (nothing here to reconstruct accurately for old
-- rows); only campaigns created after the two insert-site code
-- changes that accompany this migration will have real values.

ALTER TABLE public.track_campaigns
  ADD COLUMN IF NOT EXISTS target_view_count BIGINT,
  ADD COLUMN IF NOT EXISTS estimated_duration_days INT;
