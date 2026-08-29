-- ============================================================
-- Migration 015 — Task 46b-e: admin_actions (minimal audit trail)
-- ============================================================
--
-- 46b-e's own spec (handover.md, Task 46): "explicitly flagged as
-- mandatory for 46b to be considered shippable, not optional... If
-- 46e's table doesn't exist yet when this is reached, build the
-- minimal version of it needed here first (old value, new value, who,
-- when) rather than skipping the audit requirement — a fuller 46e can
-- extend/rename it later if needed."
--
-- Checked before writing this: no admin_actions (or similarly-named)
-- table exists anywhere in migrations 001-014 — confirmed via grep,
-- not assumed. This IS that "build the minimal version first" table,
-- not a placeholder for one.
--
-- Deliberately GENERIC, not fee-specific, even though 46b-e's own
-- call site (the /api/admin/fees POST route) is the only writer this
-- session actually wires up: `action`/`table_name` let 46a's and
-- 46c's own future admin writes reuse this same table (46e's own text
-- says as much — "every mutation from 46a/46b/46c needs" this, not
-- just 46b's). Building a fee-settings-only shape now would mean
-- either a second table later or a migration renaming/widening this
-- one — the generic shape costs nothing extra today and avoids both.
--
-- old_value/new_value are JSONB, not fee-specific columns, for the
-- same reason: a countries-table edit's "old/new value" looks nothing
-- like a fee-settings edit's, and this table needs to represent both
-- without a schema change per admin surface that adopts it.

CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable in principle (matches platform_fee_settings.changed_by's
  -- own nullable-for-non-admin-actions precedent, migration 014) but
  -- every real write from an admin route should always populate this
  -- from requireAdmin()'s own authUser.id — never trust a
  -- client-supplied admin id, same rule migration 014's changed_by
  -- comment already established for that column.
  admin_id UUID REFERENCES public.users(id),
  -- e.g. 'fee_settings.update' -- a stable, greppable string per kind
  -- of write, not a free-text description. Dot-namespaced so future
  -- actions from 46a ('countries.create', 'pricing_tiers.delete', ...)
  -- and 46c ('campaign.override_views', 'campaign.pause', ...) sort
  -- and filter naturally without a separate category column.
  action TEXT NOT NULL,
  -- The table the write actually landed in -- e.g.
  -- 'platform_fee_settings'. Redundant with the prefix of `action` in
  -- practice, but kept as its own column rather than parsed out of
  -- `action` every time an admin-log viewer (46d, not built yet) needs
  -- to filter "show me every change to table X" -- a direct column
  -- is a plain equality filter; parsing a string isn't.
  table_name TEXT NOT NULL,
  -- The affected row's own id, TEXT not UUID -- some tables this will
  -- eventually cover use a TEXT primary key (pricing_tiers.id is a
  -- slug like 'starter', countries.code is 'NG'), not every admin-
  -- editable table in this app uses a UUID pk the way
  -- platform_fee_settings does.
  record_id TEXT,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_actions_created_at_idx ON public.admin_actions (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_actions_table_name_idx ON public.admin_actions (table_name);

-- ------------------------------------------------------------
-- RLS: same posture as migration 011's platform_revenue -- this is
-- platform-internal audit data, not something any user-facing code
-- path or client-side RLS-permitted read ever needs. service_role
-- only, both for the write (every insert comes from an admin route's
-- already-authenticated context.admin client, per requireAdmin()) and
-- for reads -- a future 46d audit-log viewer page should read this
-- through its own admin-gated API route (matching how
-- api/admin/dashboard/route.ts already reads other RLS-restricted
-- tables), not via a client-side RLS-permitted SELECT policy.
-- ------------------------------------------------------------
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.admin_actions FROM PUBLIC;
REVOKE ALL ON public.admin_actions FROM authenticated;
REVOKE ALL ON public.admin_actions FROM anon;
GRANT ALL ON public.admin_actions TO service_role;
