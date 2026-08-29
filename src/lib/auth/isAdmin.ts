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

/** Check if a user is admin by DB role OR hardcoded email fallback. */
export function isAdmin(user: { email?: string | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  // DB role takes priority
  if (user.role === 'admin') return true;
  // Fallback to hardcoded email for the config admin
  return user.email?.toLowerCase().trim() === ADMIN_CONFIG.email.toLowerCase().trim();
}
