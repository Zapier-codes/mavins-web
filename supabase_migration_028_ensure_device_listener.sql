-- ============================================================
-- Migration 028 — Task 49 Part b-a: device-ID listener provisioning
-- ============================================================
--
-- Real, current blocker this closes, confirmed by reading migration
-- 027's own committed code directly (not re-derived from older notes):
-- record_campaign_stream() only writes a listener_play_events row when
-- `v_is_seed IS FALSE` — which requires p_user_id to already match a
-- real public.users row. Per that migration's own header comment,
-- Velune's actual callers (MusicService.kt/CampaignRepository.kt) pass
-- either a per-device UUID (getOrCreateCampaignDeviceId(), the norm —
-- Velune has no login at all, per the product owner's own direct
-- instruction elsewhere in this file) or a last-resort random UUID.
-- Neither matches any public.users row today, so v_is_seed is NULL,
-- and NO row is ever written for either case — meaning
-- listener_play_events stays permanently empty for the actual, normal
-- case this whole feature exists for. Part b's payout-pool calculation
-- (not this migration) would otherwise be built against a table that
-- can never receive real data. This migration is the fix: a device ID
-- needs to become a real public.users row BEFORE record_campaign_stream
-- is called with it, not after.
--
-- Deliberately does NOT touch record_campaign_stream() itself, and
-- deliberately does NOT try to distinguish "device ID" from "random
-- last-resort UUID" at the database layer — both cases are handled
-- identically by this function (upsert-or-noop), and the actual
-- distinction (real per-device persisted ID vs. a one-off throwaway)
-- is a Velune-side client concern for a later part, not something this
-- migration can or should infer from a bare UUID alone.
--
-- Simpler than this project's existing guest-checkout account creation
-- (src/lib/auth/guestCheckout.ts / supabase/functions/korapay-webhook/
-- index.ts's own resolveOrCreateGuestUserId) on purpose: those mint a
-- real auth.users row via auth.admin.createUser, because that flow
-- exists to eventually let a guest log in for real. A device-ID
-- listener never does — there is nothing to log into, no password, no
-- session, by the product owner's own explicit "no login" design for
-- this whole app. So this function only ever touches public.users
-- directly, with no auth.users counterpart at all. This does mean a
-- device-ID listener's own future earnings READ path (Part c or later,
-- not this migration) cannot rely on auth.uid()-gated RLS the way a
-- real logged-in user's data can — already flagged as a distinct, still
-- -open problem elsewhere in this task's own notes; not solved here.
--
-- Column choices, following the exact minimal-insert pattern already
-- proven working elsewhere in this same schema (korapay-webhook's own
-- guest-resolution insert) rather than guessing a full column list:
-- explicit id/username/email/role only, every other column (points,
-- streak, tier, wallet, user_type, is_active) left to its own existing
-- default. `username` has no column default (confirmed elsewhere in
-- this project) so it's always set explicitly here, deterministically
-- derived from the device UUID so it's stable across repeat calls
-- (irrelevant functionally since ON CONFLICT DO NOTHING makes repeats
-- a no-op regardless, but keeps the value meaningful if ever inspected
-- directly). `email` is UNIQUE NOT NULL with no sensible real value for
-- a device with no signup — a deterministic, obviously-synthetic,
-- non-deliverable placeholder (a `.internal` TLD, never resolvable)
-- rather than a fabricated-looking real address, so nothing downstream
-- (notification systems, support tooling) could mistake it for a real
-- inbox. `role` is set explicitly to 'listener' — NOT this app's
-- general new-signup default ('artist', migration 018) — since this
-- function's entire purpose is provisioning a row for a confirmed
-- listener identity; the general signup default exists for a
-- different, broader context (the app's own /login flow) that doesn't
-- apply here.
CREATE OR REPLACE FUNCTION public.ensure_device_listener(p_device_id UUID)
RETURNS UUID LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
BEGIN
    INSERT INTO public.users (id, username, email, role)
    VALUES (
        p_device_id,
        'listener_' || REPLACE(p_device_id::TEXT, '-', ''),
        'device-' || REPLACE(p_device_id::TEXT, '-', '') || '@listener.mavins.internal',
        'listener'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN p_device_id;
END;
$$;

-- Granted to anon, same posture as record_campaign_stream() itself —
-- Velune calls this with its own anon key, no authenticated session
-- exists to require (there is no login, by design).
GRANT EXECUTE ON FUNCTION public.ensure_device_listener(UUID) TO anon;
