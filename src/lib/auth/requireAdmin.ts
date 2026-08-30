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
import { isAdmin, hasCapability, type AdminCapability } from '@/lib/auth/isAdmin';

export interface AdminContext {
  /** Service-role client — bypasses RLS, same instance every existing admin route already used individually. */
  admin: ReturnType<typeof createAdminClient>;
  /** The authenticated caller's own Supabase Auth user record. */
  authUser: { id: string; email?: string | null };
  /**
   * Task 46f-d: exposed so a multi-action route (one PATCH handler
   * covering several different mutations, each needing a DIFFERENT
   * capability — see api/admin/users/[id]/route.ts) can call
   * `hasCapability()` itself once it knows which action the request
   * body is actually asking for, rather than `requireAdmin()` having
   * to guess a single capability before the body is even parsed. A
   * single-action route should just pass `requiredCapability` to
   * `requireAdmin()` directly instead and never need to look at these
   * two fields at all.
   */
  adminRole: string | null;
  adminPermissions: string[] | null;
}

/**
 * Confirms the current request's session belongs to an admin (DB
 * `role='admin'`, or the hardcoded bootstrap-email fallback — see
 * isAdmin.ts) before handing back a service-role client. Returns
 * either `{ context }` (proceed) or `{ response }` (a ready-to-return
 * 401/403 NextResponse — the caller should `return` it immediately,
 * not inspect it further).
 *
 * Task 46f-d: `requiredCapability` is the extension point this
 * function's own doc comment already anticipated ("the natural place
 * to add a `requiredCapability` parameter later without touching
 * every route a second time" — that "later" is now). Every one of the
 * 9 admin route files was updated in the same commit as this parameter
 * being added, so nothing is left calling this with an implicit
 * "any admin, no specific capability" gap — pass the exact
 * `ADMIN_CAPABILITIES` key that route/action corresponds to. See
 * `isAdmin.ts`'s own `ADMIN_CAPABILITIES`/`hasCapability()` doc
 * comments for the full taxonomy and exactly how each `admin_role`
 * tier is evaluated against it — not re-explained here to avoid two
 * copies of the same reasoning drifting apart.
 */
export async function requireAdmin(requiredCapability?: AdminCapability): Promise<
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
  // own `role`/`admin_role`/`admin_permissions`, regardless of what the
  // caller needs it for.
  const { data: profile } = await supabase
    .from('users')
    .select('role, admin_role, admin_permissions')
    .eq('id', authUser.id)
    .single();

  const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });
  if (!callerIsAdmin) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  if (requiredCapability) {
    const allowed = hasCapability(
      { email: authUser.email, adminRole: profile?.admin_role, adminPermissions: profile?.admin_permissions },
      requiredCapability
    );
    if (!allowed) {
      return {
        response: NextResponse.json(
          { error: `Forbidden — missing capability: ${requiredCapability}` },
          { status: 403 }
        ),
      };
    }
  }

  return {
    context: {
      admin: createAdminClient(),
      authUser,
      adminRole: profile?.admin_role ?? null,
      adminPermissions: profile?.admin_permissions ?? null,
    },
  };
}
