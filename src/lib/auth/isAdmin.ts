// src/lib/auth/isAdmin.ts
//
// Single source of truth for "is this user an admin", usable from both
// client components and server-only code (API routes) alike — deliberately
// has no 'use client' directive and no React import, so it's safe to pull
// into a route handler without dragging AuthProvider's client boundary
// along with it.

/** Hardcoded admin credentials — the single source of truth. */
export const ADMIN_CONFIG = {
  email: 'bossblingzs@gmail.com',
  password: '$Password7492',
} as const;

/** Check if a user is admin by DB role OR hardcoded email fallback. */
export function isAdmin(user: { email?: string | null; role?: string | null } | null | undefined): boolean {
  if (!user) return false;
  // DB role takes priority
  if (user.role === 'admin') return true;
  // Fallback to hardcoded email for the config admin
  return user.email?.toLowerCase().trim() === ADMIN_CONFIG.email.toLowerCase().trim();
}
