-- Migration 023 — genre-locked, fair-rotation queue-slot campaign selection
--
-- Task 59 Part 1 of 3 (handover.md) — the corrected design's queue
-- mechanic ("every 4th real song, the 5th is a campaign song,
-- genre-locked, no competitive scoring of any kind — every live,
-- genre-matching campaign gets fair rotational placement over time").
--
-- Deliberately a NEW function, not a rewrite of get_trending_campaigns
-- in place. That function's existing trending_score-ranked shape
-- (migrations 020/021, Tasks 57/58) is exactly the mechanic Task 59
-- corrected as wrong for the queue use case -- but it's still what
-- Velune's home banner currently calls (Task 59 Round 2's own trace of
-- CampaignRepository.kt), and reworking the banner is Part 3, not
-- Part 1. Changing get_trending_campaigns's own behavior now would
-- silently change what's currently live for the banner before that
-- surface's own rebuild is even designed. Adding this alongside it
-- keeps Part 1 a pure addition -- nothing currently deployed changes
-- behavior until Part 2 (Velune) is actually built and starts calling
-- this new function instead.
--
-- Fairness mechanism: per-genre least-recently-served rotation, not
-- randomization and not a stored cursor/index. Chosen over pure
-- randomness because "no race to the top... all is accommodated for"
-- (the product owner's own words) reads as a guarantee, not a
-- statistical likelihood -- true LRU rotation means every eligible
-- campaign in a genre gets served before any repeats, every time,
-- with no small-sample luck involved (pure `ORDER BY random()` can by
-- chance serve the same campaign twice in a row while another goes
-- unseen -- statistically fair over a large N, not guaranteed fair
-- turn-by-turn). LRU-based fair rotation is itself a well-established,
-- industry-standard pattern for exactly this kind of "give everyone a
-- turn" scheduling problem, not a novel mechanism invented here.
--
-- No stream count, budget size, trending_score, or any other
-- performance signal enters this function's selection logic anywhere
-- -- deliberately, since any of those would silently reintroduce the
-- exact competitive-ranking behavior this task exists to remove.

-- Purpose-specific column, not a reuse of the existing `updated_at`
-- (which changes for many unrelated reasons -- admin overrides, stream
-- count updates -- and would give a noisy, meaningless "freshness"
-- signal for rotation fairness if reused). NULL means "never served a
-- queue slot yet" -- ordered first via NULLS FIRST below, so every
-- campaign gets its first turn before any campaign gets a second.
ALTER TABLE public.track_campaigns
    ADD COLUMN IF NOT EXISTS last_queue_slot_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.get_next_campaign_for_queue_slot(p_genre TEXT)
RETURNS TABLE (
    campaign_id UUID, track_id UUID, artist_id UUID,
    artist_name TEXT, track_title TEXT, cover_url TEXT,
    source_url TEXT, resolved_song_id TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    v_campaign_id UUID;
BEGIN
    -- Fail-closed, per Task 59 Round 3's own resolved rule: no genre
    -- signal, no injection, full stop. Never guess a genre or fall
    -- back to an ungated pick -- "a hip-hop campaign must never appear
    -- in a non-hip-hop queue" is absolute, and an empty/NULL p_genre
    -- means the caller doesn't actually know this queue's genre.
    IF p_genre IS NULL OR btrim(p_genre) = '' THEN
        RETURN;
    END IF;

    -- Atomic pick-and-mark. FOR UPDATE SKIP LOCKED (not a plain FOR
    -- UPDATE) so two concurrent callers picking a queue slot at the
    -- same moment don't block each other or both land on the same
    -- "most overdue" campaign -- the second caller simply moves on to
    -- the next-fairest candidate instead of waiting or colliding.
    -- `tc.id` as a secondary sort key is only a stable tiebreaker for
    -- the common case of multiple campaigns tied at
    -- last_queue_slot_at IS NULL (every brand-new campaign starts
    -- there) -- it does not introduce any preference by itself.
    SELECT tc.id INTO v_campaign_id
    FROM public.track_campaigns tc
    WHERE tc.is_active AND NOT tc.is_paused
      AND p_genre = ANY(tc.target_genres)
    ORDER BY tc.last_queue_slot_at ASC NULLS FIRST, tc.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1;

    IF v_campaign_id IS NULL THEN
        RETURN; -- no eligible campaign in this genre right now
    END IF;

    UPDATE public.track_campaigns
    SET last_queue_slot_at = NOW()
    WHERE id = v_campaign_id;

    RETURN QUERY
    SELECT tc.id, tc.track_id, tc.artist_id, u.artist_name, t.title,
           t.cover_url, tc.source_url, tc.resolved_song_id
    FROM public.track_campaigns tc
    LEFT JOIN public.tracks t ON t.id = tc.track_id
    JOIN public.users u ON u.id = tc.artist_id
    WHERE tc.id = v_campaign_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_next_campaign_for_queue_slot(TEXT) TO anon;

-- Deliberately NOT included in this migration, flagged rather than
-- silently built -- Task 59's own "industry-standard refinements"
-- section proposed these but marked them suggestions, not confirmed:
--   - Frequency capping (same listener shouldn't see the identical
--     campaign repeatedly within one session) -- would need a
--     per-listener/per-session parameter this function doesn't take
--     yet (p_user_id, an exclusion set, or similar).
--   - Any interaction with Task 49's play-recording/earnings flow --
--     this function only SELECTS which campaign fills a slot; the
--     actual play event (and its own 60-second earnings threshold)
--     is recorded separately, unchanged, whenever Velune actually
--     plays the returned song.
-- Both left for a future part/task once confirmed, not guessed at
-- here.
