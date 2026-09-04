-- Migration 034: bpay_tag on public.users (Task 67, Part f — split
-- into f-i/f-ii per explicit instruction; this is f-i, the schema
-- half only).
--
-- Lets a listener store the B-Pay wallet tag their earnings should be
-- credited to (Task 67's own "Context" section — the real payout
-- destination is a B-Pay wallet, credited via `@bpay_tag`, not a bank
-- account). Part f-ii (not this migration) still needs to build the
-- actual UI surface for a listener to submit/confirm this value —
-- this migration only adds somewhere for it to be stored.
--
-- Stored WITHOUT the leading "@" — confirmed by reading B-Pay's own
-- resolve_tag Edge Function directly (Edges-Enterprise/B-PAY,
-- supabase/functions/resolve_tag/index.ts): it strips the "@" itself
-- before querying (`cleanTag = tag.slice(1)`, then
-- `.eq('bpay_tag', cleanTag)`), so B-Pay's own `profiles.bpay_tag`
-- column never includes it either. Whatever UI Part f-ii builds
-- should strip a leading "@" if the listener types one, the same way
-- B-Pay's own app already does, rather than storing it inconsistently
-- with the table this will eventually be looked up against (Task 67
-- Part e, not built yet).
--
-- Nullable, not unique. Nullable because most rows on this table
-- (artists, and listeners who've never claimed a payout) will never
-- have one. Not unique because two different Mavins-web listener
-- identities pointing at the same B-Pay tag isn't an abuse vector
-- worth blocking at the schema level -- a payout is always computed
-- from that specific listener_id's own real listening activity
-- (Task 49's own pool-calculation logic), never pooled across rows,
-- so there's nothing to gain by registering multiple listener
-- identities against one tag beyond what each of those identities
-- individually earned on its own.
--
-- Loose format check only -- non-empty after trimming whitespace, and
-- rejects a leading "@" specifically (so a listener who pastes the
-- tag including the "@" from B-Pay's own UI gets a clear rejection
-- rather than a silently-wrong stored value) -- not a full validation
-- against B-Pay's own real tag-format rules, which aren't confirmed
-- from this sandbox (B-Pay's own repo has no visible CHECK constraint
-- on this column either, per Task 67's own schema-audit note that the
-- real schema needs a dashboard-access confirmation this session
-- doesn't have).
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bpay_tag TEXT
    CHECK (bpay_tag IS NULL OR (length(trim(bpay_tag)) > 0 AND bpay_tag NOT LIKE '@%'));

-- Worth flagging, caught via a Python simulation of this exact CHECK
-- before considering it done: the constraint validates the *trimmed*
-- length is non-zero, but doesn't rewrite the stored value -- a tag
-- submitted with surrounding whitespace (" johndoe ") passes this
-- CHECK and gets stored with the whitespace intact, which would then
-- fail to match a later exact-equality lookup against a clean
-- "johndoe". Trimming (and stripping a leading "@", per the note
-- above) is the calling application's own job -- whatever inserts
-- into this column (Part f-ii's UI route, or Part e's own write path)
-- must trim before writing; this CHECK only rejects the clearly-empty
-- case, it doesn't normalize.

-- The eventual payout-crediting lookup (Task 67 Part e) will query by
-- this column directly ("does this listener have a tag on file, and
-- what is it") -- indexed for that access pattern now rather than
-- left to a future sequential scan once real rows start populating
-- it. Partial (WHERE bpay_tag IS NOT NULL) since most rows on this
-- table will never have a value here.
CREATE INDEX IF NOT EXISTS idx_users_bpay_tag
  ON public.users (bpay_tag)
  WHERE bpay_tag IS NOT NULL;

COMMENT ON COLUMN public.users.bpay_tag IS
  'B-Pay wallet tag (no leading @) a listener has linked for payout crediting. Task 67 Part f-i. Nullable -- most rows never set this.';
