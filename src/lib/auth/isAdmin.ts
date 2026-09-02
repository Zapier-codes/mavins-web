// src/lib/auth/isAdmin.ts
//
// Single source of truth for "is this user an admin", usable from both
// client components and server-only code (API routes) alike — deliberately
// has no 'use client' directive and no React import, so it's safe to pull
// into a route handler without dragging AuthProvider's client boundary
// along with it.

/**
 * Bootstrap admin identity — email only. Task 46's own note flagged
 * this file's PASSWORD field as "already compromised" (plaintext in
 * git history + pasted directly in a chat conversation) — the
 * password field itself has been REMOVED here, not rotated-in-place,
 * because it was dead code: grepped across this whole repo and
 * confirmed nothing ever actually compared against it. The real,
 * live password check happens natively inside Supabase Auth itself
 * (encrypted, in `auth.users`) whenever this account signs in — this
 * file never needed to know or store it at all. The actual compromised
 * credential has been rotated on the Supabase side directly (confirmed
 * by the product owner, 2026-08-29) — this code-side cleanup is a
 * separate, independent fix: removing a value that shouldn't have
 * lived in source in the first place, regardless of rotation.
 *
 * The email below is not sensitive on its own — it's just an
 * identifier, and its only job is bootstrapping "who's admin" before
 * any DB `role='admin'` row exists yet (see isAdmin() below: DB role
 * is checked FIRST, this is only the fallback).
 */
export const ADMIN_CONFIG = {
  email: 'bossblingzs@gmail.com',
} as const;

/**
 * Task 46e's confirmed decision ("Confirmed decisions" section,
 * Option A): root plus this many *assigned* admins = 4 people total
 * with any admin access. A single named constant, not inlined into
 * `api/admin/users/[id]/route.ts`'s cap check or any UI string, per
 * that same task's own recommendation — if this number ever changes,
 * it changes in exactly one place.
 */
export const MAX_ASSIGNED_ADMINS = 3;

/** Check if a user is admin by DB role OR hardcoded email fallback. */
export function isAdmin(user: { email?: string | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  // DB role takes priority
  if (user.role === 'admin') return true;
  // Fallback to hardcoded email for the config admin
  return user.email?.toLowerCase().trim() === ADMIN_CONFIG.email.toLowerCase().trim();
}

/**
 * Task 46f-b — distinct from `isAdmin()` above ("has any admin
 * access at all") on purpose: some actions (assigning/changing another
 * admin's role or permissions — see 46e's "Admin roles" note, "an
 * assigned admin, even a 'full' one, should not be able to grant
 * themselves or another admin more access") are root-only, not just
 * admin-only. Root is identified purely by the same bootstrap email
 * `isAdmin()` already falls back to — there is no DB row/column that
 * marks a user "root" (see `ADMIN_CONFIG`'s own doc comment: root
 * predates and sits outside the `admin_role`/`admin_permissions`
 * columns migration 016 added for *assigned* admins specifically).
 * Deliberately does NOT also accept `role === 'admin'` the way
 * `isAdmin()` does — an assigned admin with `role: 'admin'` in the DB
 * is exactly the case this function needs to say "no" to.
 */
export function isRootAdmin(user: { email?: string | null } | null | undefined): boolean {
  if (!user) return false;
  return user.email?.toLowerCase().trim() === ADMIN_CONFIG.email.toLowerCase().trim();
}

/**
 * Task 46f-d — the concrete capability-key taxonomy, produced exactly
 * the way 46f-d's own spec text describes: grepped every route gated
 * by `requireAdmin()` across 46a/46b/46c/46f-b (9 route files, 18
 * individual `requireAdmin()` call sites — confirmed via grep before
 * writing this, not assumed), none of which had an assigned key yet,
 * and assigned one per distinct route+action here.
 *
 * NOT yet confirmed by the product owner — this is the "concrete list"
 * 46f-d's own text says to take to them ("here are the N specific
 * things an assigned admin can be individually granted, does this
 * match what you meant by 'a few roles separately'"), not a
 * rubber-stamped final taxonomy. Wired into `requireAdmin()` below
 * regardless, because every existing admin (`root` and any
 * `admin_role: 'full'` row — which migration 016 already backfilled
 * every pre-46f admin to) passes every key unconditionally, so nothing
 * breaks or narrows access for anyone today by this taxonomy existing
 * in code before it's formally confirmed. Only a *future*
 * `admin_role: 'custom'` assignment would ever actually be constrained
 * by these exact key names — and 46f-c's own admin UI already shows a
 * plain notice instead of a capability picker for `'custom'` until
 * this list is confirmed, so no one can be granted a mismatched/
 * stale key set in the meantime.
 *
 * Grouped by resource, one key per distinct mutation surface — the
 * five reference-data tables got their own key each (not one shared
 * `reference_data:edit`) since they're genuinely five separate admin
 * pages today and a regional-ops-style limited admin (e.g. "can edit
 * countries, not pricing") is a plausible real request; collapsing
 * them would remove a distinction this taxonomy can't easily add back
 * later without a second product-owner round-trip.
 */
export const ADMIN_CAPABILITIES = {
  DASHBOARD_VIEW: 'dashboard:view', // GET /api/admin/dashboard
  PRICING_TIERS_EDIT: 'pricing_tiers:edit', // POST/PATCH/DELETE /api/admin/pricing-tiers
  DURATION_SLOTS_EDIT: 'duration_slots:edit', // POST/PATCH/DELETE /api/admin/duration-slots
  COUNTRIES_EDIT: 'countries:edit', // POST/PATCH/DELETE /api/admin/countries
  GENRES_EDIT: 'genres:edit', // POST/PATCH/DELETE /api/admin/genres
  GENRE_COUNTRY_AFFINITY_EDIT: 'genre_country_affinity:edit', // POST/DELETE /api/admin/genre-country-affinity
  FEES_VIEW: 'fees:view', // GET /api/admin/fees
  FEES_EDIT: 'fees:edit', // POST /api/admin/fees
  CAMPAIGNS_OVERRIDE: 'campaigns:override', // PATCH /api/admin/campaigns/[id]
  USERS_WALLET_ADJUST: 'users:wallet_adjust', // PATCH /api/admin/users/[id], action=adjust_wallet
  USERS_GRANT_STARTING_CAPITAL: 'users:grant_starting_capital', // PATCH /api/admin/users/[id], action=grant_starting_capital
  USERS_MANAGE_ROLE: 'users:manage_role', // PATCH /api/admin/users/[id], action=set_role — root-only regardless (isRootAdmin() gate), kept as a key for completeness/consistency
  GENRE_TILE_MAPPING_VIEW: 'genre_tile_mapping:view', // GET /api/admin/genre-tile-mapping
  GENRE_TILE_MAPPING_EDIT: 'genre_tile_mapping:edit', // PATCH /api/admin/genre-tile-mapping
} as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[keyof typeof ADMIN_CAPABILITIES];

/**
 * Task 46f-d — the actual per-capability check, called from
 * `requireAdmin()` below once a route passes a `requiredCapability`.
 * Assumes the caller has ALREADY passed the coarse `isAdmin()` check
 * (i.e. this only ever runs for someone who is definitely *some kind*
 * of admin) — this function's only job is the finer-grained "which
 * specific things can this admin do" question.
 *
 * - root: everything, unconditionally (per isRootAdmin()'s own doc
 *   comment — root sits outside the admin_role/admin_permissions
 *   model entirely).
 * - admin_role 'full': everything (same access as root, just a
 *   revocable DB row instead of the hardcoded bootstrap account).
 * - admin_role 'monitor': every `*:view`-suffixed key, nothing else —
 *   a naming-convention check rather than a hardcoded list, so a
 *   future `:view` key added to ADMIN_CAPABILITIES above
 *   automatically becomes monitor-safe without a second edit here.
 * - admin_role 'custom': only keys present in that row's own
 *   `admin_permissions` array.
 * - admin_role NULL/undefined (a `role: 'admin'` row that predates
 *   migration 016's backfill, or otherwise never got migrated): treated
 *   as 'full', matching that migration's own explicit backfill intent
 *   ("preserves every existing admin's current access with zero silent
 *   narrowing") — a defensive fallback for a case that shouldn't
 *   actually occur post-migration, not a deliberately-designed tier.
 */
export function hasCapability(
  user: { email?: string | null; adminRole?: string | null; adminPermissions?: string[] | null } | null | undefined,
  requiredCapability: string
): boolean {
  if (!user) return false;
  if (isRootAdmin(user)) return true;

  const adminRole = user.adminRole;
  if (adminRole === 'full' || adminRole === null || adminRole === undefined) return true;
  if (adminRole === 'monitor') return requiredCapability.endsWith(':view');
  if (adminRole === 'custom') return (user.adminPermissions || []).includes(requiredCapability);

  return false;
}
