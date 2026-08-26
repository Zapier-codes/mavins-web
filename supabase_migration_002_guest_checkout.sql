-- ============================================================
-- Migration 002 — Guest checkout support
-- Run this in Supabase SQL Editor AFTER supabase_schema.sql
-- ============================================================

-- Tracks whether the artist has finished the post-signup profile
-- step (artist name, genre, etc). Defaults false for every account.
-- Guests who tap "Skip for now" stay false — it's a nudge, not a gate.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE;

-- Lets us tell "signed up the normal way" apart from "auto-created
-- at the moment of a guest wallet top-up" for support/analytics.
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS is_guest_created BOOLEAN DEFAULT FALSE;

-- Guest checkout has to look a user up by email (to decide "new
-- account" vs "this email already exists") before it has a session,
-- so it always goes through the service-role client. This index just
-- keeps that lookup (and the case-insensitive match) cheap.
CREATE INDEX IF NOT EXISTS idx_users_email_lower
    ON public.users (lower(email));

-- Existing accounts predate this column — treat them as already
-- past onboarding so we don't retroactively nag current users.
UPDATE public.users
    SET profile_completed = TRUE
    WHERE profile_completed IS DISTINCT FROM TRUE
      AND created_at < NOW();
