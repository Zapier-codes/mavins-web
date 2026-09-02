-- ============================================================
-- Migration 019 — Task 49 Part a: listener-earnings schema.
-- ============================================================
--
-- Builds exactly the three mavins-web-side tables named in Task 49's
-- own "Implementation roadmap" (handover.md), items 1-3 — schema only,
-- matching that spec's column list verbatim rather than reinterpreting
-- it, since this session's job is to execute Part a as already
-- written, not re-litigate the policy decisions above it (Q1-Q6) that
-- a prior same-project session already resolved.
--
-- Item 4 of that same roadmap ("Velune schema addition... tracked for
-- Velune repo, not this one") is explicitly NOT this migration's job —
-- confirmed genuinely out of reach from this sandbox (Velune isn't
-- cloned here), consistent with this file's own established cross-repo
-- handoff pattern (B-Pay-backend's own payout work is tracked the same
-- way elsewhere in this file).
--
-- WORTH FLAGGING PLAINLY, not silently building around: Task 49's own
-- "Velune investigation" section (above this migration, same file)
-- found that Velune's current schema tracks only a single anonymous
-- aggregate play-count per campaign — no per-listener identity, no
-- per-play duration anywhere. The ">=60s qualifies for payment" gate
-- this schema's own `qualifies_for_payment` column depends on has
-- nothing real to compute from until that Velune-side work exists.
-- These tables are correct and buildable regardless (they don't
-- require Velune's schema to exist first, only to eventually write
-- into them), but nothing here should be read as "this feature is now
-- end-to-end buildable" — the roadmap's own item 4 is still a real,
-- unbuilt, cross-repo prerequisite for this schema to ever receive
-- genuine data, not a formality.

-- ------------------------------------------------------------
-- 1. listener_play_events — Velune writes directly (Q5, confirmed:
--    "Velune writes to supabase while mavins-web reads from
--    supabase"), Mavins-web reads only. Every play is recorded
--    regardless of duration; qualifies_for_payment is the derived
--    >=60s flag, not a second table.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listener_play_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id UUID NOT NULL REFERENCES public.users(id),
  campaign_id UUID NOT NULL REFERENCES public.track_campaigns(id),
  played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  listen_duration_seconds INTEGER NOT NULL CHECK (listen_duration_seconds >= 0),
  -- Generated, not just defaulted -- this derivation is a fixed
  -- business rule (>=60s), not something any writer (including
  -- Velune's own direct-write credential, per Q5) should be able to
  -- set independently of the duration it's supposed to be derived
  -- from.
  qualifies_for_payment BOOLEAN GENERATED ALWAYS AS (listen_duration_seconds >= 60) STORED,
  track_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listener_play_events_listener_idx ON public.listener_play_events (listener_id);
CREATE INDEX IF NOT EXISTS listener_play_events_campaign_idx ON public.listener_play_events (campaign_id);
-- Both the daily-pool computation (Part b, "count of qualifying plays
-- that day") and per-listener task-board visibility ("has this
-- listener already played this campaign") filter on played_at/
-- campaign_id/listener_id together -- one composite index serving
-- both known query shapes rather than three single-column ones.
CREATE INDEX IF NOT EXISTS listener_play_events_lookup_idx
  ON public.listener_play_events (campaign_id, listener_id, played_at);

ALTER TABLE public.listener_play_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.listener_play_events FROM PUBLIC;
REVOKE ALL ON public.listener_play_events FROM anon;
GRANT ALL ON public.listener_play_events TO service_role;
-- Task 49's own Q6 sub-question (how a Velune signup actually lands in
-- this shared `public.users` table -- Nakama-native, direct, or
-- something else) is explicitly UNCONFIRMED as of this migration
-- (flagged in that task's own text as "not done this session,
-- required groundwork for whoever picks up Part a"). Writing an
-- `auth.uid() = listener_id`-style policy here would silently assume
-- an answer to that open question. Locked to service_role only for
-- now, same posture this codebase already uses for every other
-- money-adjacent table (platform_revenue, admin_actions,
-- wallet-mutating RPCs) -- Velune's own write credential and any
-- future direct-authenticated-listener read policy should both be
-- added deliberately once Q6's sub-question actually has an answer,
-- not assumed here.
REVOKE ALL ON public.listener_play_events FROM authenticated;

-- ------------------------------------------------------------
-- 2. listener_earnings — Mavins-web manages. One row per listener
--    per NET-50 cycle (Q3/Q4/round-2's confirmed cycle structure),
--    running balance + status through that cycle's lifecycle.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listener_earnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listener_id UUID NOT NULL REFERENCES public.users(id),
  cycle_number INTEGER NOT NULL,
  cycle_start_date DATE NOT NULL,
  cycle_end_date DATE NOT NULL,
  total_qualifying_plays INTEGER NOT NULL DEFAULT 0,
  earnings_cents BIGINT NOT NULL DEFAULT 0,
  withdrawn_cents BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'accumulating'
    CHECK (status IN ('accumulating', 'claimable', 'claimed', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One row per listener per cycle -- Part b's own eligibility state
  -- machine needs to find "this listener's current cycle" without
  -- ambiguity; without this, a bug in whatever creates these rows
  -- could silently duplicate a cycle instead of erroring loudly.
  UNIQUE (listener_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS listener_earnings_listener_idx ON public.listener_earnings (listener_id);
CREATE INDEX IF NOT EXISTS listener_earnings_status_idx ON public.listener_earnings (status);

ALTER TABLE public.listener_earnings ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.listener_earnings FROM PUBLIC;
REVOKE ALL ON public.listener_earnings FROM anon;
GRANT ALL ON public.listener_earnings TO service_role;
-- Unlike listener_play_events above, this table's real money balance
-- IS something Part d's own listed frontend requirement ("Earnings
-- balance display... Play history table") needs an authenticated
-- listener to read directly -- own-row SELECT only, matching this
-- table's own "listener_id" ownership column, no write path for
-- anyone but service_role (crediting/status transitions are Part b's
-- job, computed centrally, never a client-supplied value).
REVOKE ALL ON public.listener_earnings FROM authenticated;
GRANT SELECT ON public.listener_earnings TO authenticated;
CREATE POLICY "Listener earnings readable by owner" ON public.listener_earnings
  FOR SELECT USING (auth.uid() = listener_id);

-- ------------------------------------------------------------
-- 3. daily_payout_pool — computed daily (by a cron/Edge Function not
--    built in this migration -- Part a's own roadmap text describes
--    this table's schema, the computation job itself is Part b work).
--    Platform-wide aggregate, not scoped to any one listener.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daily_payout_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_date DATE NOT NULL UNIQUE,
  gross_ad_spend_cents BIGINT NOT NULL,
  net_revenue_pool_cents BIGINT NOT NULL,
  listener_pool_cents BIGINT NOT NULL,
  total_qualifying_plays INTEGER NOT NULL,
  -- NUMERIC, not BIGINT/cents-as-integer like every other money column
  -- in this schema -- this one specific field is a computed *rate*
  -- (pool / play-count), not a discrete money amount of its own, and
  -- genuinely needs fractional-cent precision internally (dividing a
  -- pool across potentially thousands of plays) even though every
  -- amount actually credited to a listener_earnings row afterward is
  -- still rounded to whole cents there, same as every other ledger
  -- entry in this app.
  rate_per_stream_cents NUMERIC(12, 6) NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.daily_payout_pool ENABLE ROW LEVEL SECURITY;

-- Platform-internal aggregate, not any one listener's own data --
-- same full lockdown as platform_revenue (migration 011), not the
-- read-own-row shape listener_earnings above has. No listed frontend
-- requirement in Task 49's own Part d needs a listener to read this
-- table directly (they read their own listener_earnings balance
-- instead) -- if a future "today's platform-wide payout pool" public
-- display is ever wanted, that's a new, deliberate read policy to add
-- then, not assumed here.
REVOKE ALL ON public.daily_payout_pool FROM PUBLIC;
REVOKE ALL ON public.daily_payout_pool FROM authenticated;
REVOKE ALL ON public.daily_payout_pool FROM anon;
GRANT ALL ON public.daily_payout_pool TO service_role;
