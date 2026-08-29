// src/lib/auth/requireAdmin.ts
//
// Task 46a — extracted from the identical ~15-line block that was
// copy-pasted across api/admin/dashboard/route.ts, api/campaigns/
// cancel/route.ts, api/campaigns/create/route.ts, and api/campaigns/
// add-funds/route.ts (four existing call sites, confirmed by grep
// before writing this). Task 46a alone adds five more admin-only
// routes (one per reference-data table) that would otherwise need the
// same block a fifth, sixth, seventh, eighth, and ninth time — every
// copy is a chance for one of them to drift or be typed slightly
// wrong (e.g. forgetting the `.single()`, or checking `role` before
// confirming `authUser` exists). Server-only: never import this from
// a 'use client' file, same restriction as admin.ts's service-role
// client it wraps.

import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';

export interface AdminContext {
  /** Service-role client — bypasses RLS, same instance every existing admin route already used individually. */
  admin: ReturnType<typeof createAdminClient>;
  /** The authenticated caller's own Supabase Auth user record. */
  authUser: { id: string; email?: string | null };
}

/**
 * Confirms the current request's session belongs to an admin (DB
 * `role='admin'`, or the hardcoded bootstrap-email fallback — see
 * isAdmin.ts) before handing back a service-role client. Returns
 * either `{ context }` (proceed) or `{ response }` (a ready-to-return
 * 401/403 NextResponse — the caller should `return` it immediately,
 * not inspect it further).
 *
 * Deliberately does NOT accept a required-permission argument yet —
 * every admin today is all-or-nothing (`isAdmin()` is a single
 * boolean). Task 46's own "Confirmed decisions" note (handover.md)
 * describes a future `role: 'root'|'full'|'monitor'|'custom'` +
 * per-capability `permissions` model for 46d/46e — when that lands,
 * this is the one function every admin route already funnels through,
 * so it's the natural place to add a `requiredCapability` parameter
 * later without touching every route a second time.
 */
export async function requireAdmin(): Promise<
  { context: AdminContext; response?: undefined } | { context?: undefined; response: NextResponse }
> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();

  if (!authUser) {
    return { response: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  }

  // RLS's "own row" policy permits this — a user can always read their
  // own `role`, regardless of what the caller needs it for.
  const { data: profile } = await supabase.from('users').select('role').eq('id', authUser.id).single();

  const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });
  if (!callerIsAdmin) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return { context: { admin: createAdminClient(), authUser } };
}
