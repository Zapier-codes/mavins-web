import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isRootAdmin, hasCapability, ADMIN_CAPABILITIES, MAX_ASSIGNED_ADMINS } from '@/lib/auth/isAdmin';
import { logAdminAction } from '@/lib/admin/auditLog';

/**
 * Admin-mutating actions on a `public.users` row. Task 46f-b
 * (handover.md) — 46d's existing `/admin/users` page is currently
 * read-only (a plain table, per that task's own "did not touch"
 * note); this route is what a future 46f-c UI wires real buttons up
 * to. Three mutually-exclusive action shapes, same "one `action`
 * discriminant, reject a body that mixes shapes" pattern
 * `admin/campaigns/[id]/route.ts` already established (Task 46c) —
 * chosen for consistency, not reinvented here.
 *
 * PATCH body is one of:
 *   1. `{ action: 'adjust_wallet', amountCents: number, reason: string }`
 *      — support-case wallet correction. `amountCents` may be
 *      negative (a downward correction) or positive; zero is
 *      rejected as a meaningless no-op. `reason` is required
 *      (non-empty) — same accountability rule 46c's admin-cancel
 *      route already established for money-adjacent admin actions
 *      ("more correct and more defensible after the fact" — that
 *      route's own words, equally true here). Writes one
 *      `wallet_ledger` row, `type: 'bonus'` (that CHECK constraint's
 *      only type that fits an admin-originated credit/debit that
 *      isn't an `earning`/`withdrawal`/`fee` — confirmed against
 *      `supabase_schema.sql` directly, not assumed) — there is no
 *      separate stored balance column to update; every wallet
 *      balance in this app is `SUM(wallet_ledger.amount_cents)`
 *      already (`get_wallet_balance` RPC), so inserting the
 *      correction row IS the adjustment.
 *   2. `{ action: 'grant_starting_capital', amountCents: number }`
 *      — one-time admin-initiated credit. `amountCents` must be
 *      positive (a "grant" that's zero or negative isn't a grant).
 *      Also a `wallet_ledger` insert, `type: 'bonus'`, per 46f-a's
 *      own design note (migration 016's header comment) recommending
 *      reuse of the existing type rather than a new migration for a
 *      one-time, non-recurring category — `description` is a fixed,
 *      greppable string (not admin-supplied) specifically so this
 *      stays distinguishable from an `adjust_wallet` 'bonus' row
 *      after the fact, per that same design note's own reasoning.
 *   3. `{ action: 'set_role', adminRole: 'full'|'monitor'|'custom', adminPermissions?: string[] }`
 *      — root-only, enforced server-side via `isRootAdmin()` (NOT
 *      `requireAdmin()`'s own `isAdmin()` check, which any assigned
 *      admin also passes) — per 46e's own "Admin roles" note: "an
 *      assigned admin, even a 'full' one, should not be able to grant
 *      themselves or another admin more access." A non-root caller
 *      gets a 403 here even though `requireAdmin()` already let them
 *      through the door — this is a second, stricter gate on top,
 *      not a replacement for it. Only works on a user who is
 *      **already** `role = 'admin'` — sets/changes *how much* an
 *      existing admin can do (`admin_role`/`admin_permissions`), not
 *      *whether* they're an admin at all. See `reassign_role` below
 *      for that.
 *   4. `{ action: 'reassign_role', role: string }` — **Task 48-a**,
 *      root-only (`isRootAdmin()`, same posture as `set_role` above).
 *      Sets the base `role` column itself to any value — this is what
 *      actually makes someone an admin for the first time, or revokes
 *      an existing admin back to a regular user; `set_role` above
 *      only ever operates on someone who's already `role = 'admin'`.
 *      No enum/allowlist restriction on `role`'s value beyond basic
 *      shape (non-empty, trimmed, ≤20 chars — the DB column's own
 *      `character_maximum_length`, confirmed via this task's own
 *      Group 1 query) — deliberately, since this task's whole point
 *      (per its own title, "admin any→any reassignment") is that root
 *      can set a user to any role, not a fixed set this route would
 *      otherwise be gatekeeping. Three things happen together, not as
 *      separate calls:
 *        - **Promoting someone to `'admin'` for the first time**
 *          (target's current `role` isn't already `'admin'`, new
 *          value is) enforces `MAX_ASSIGNED_ADMINS` (Task 46e's
 *          confirmed Option A — root + 3 = 4 total) by counting
 *          existing `role = 'admin'` rows and rejecting a 4th
 *          assignment with a clear error, not a generic 500 or a
 *          silently-accepted-then-broken state. `admin_role`/
 *          `admin_permissions` are deliberately left `NULL` on
 *          promotion, not defaulted here — `hasCapability()`'s own
 *          documented fallback already treats a `NULL admin_role` as
 *          `'full'`, so a freshly-promoted admin has full access
 *          until root explicitly narrows them via a *separate*
 *          `set_role` call. This route does **not** also trigger a
 *          `grant_starting_capital` call — that stays root's own
 *          explicit second step (per Task 46e's confirmed "one-time,
 *          locked at assignment" decision, which describes a
 *          deliberate choice root makes, not something to
 *          auto-trigger on every promotion regardless of amount).
 *        - **Revoking an existing admin** (current `role` is
 *          `'admin'`, new value isn't) clears `admin_role`/
 *          `admin_permissions` back to `NULL` in the same update —
 *          not strictly required for security (`isAdmin()`'s own
 *          `role === 'admin'` check already cuts off access the
 *          instant `role` changes, regardless of any stale
 *          `admin_role` left behind — confirmed by reading
 *          `isAdmin()`/`requireAdmin()` directly before writing this,
 *          not assumed), but leaving privilege data on a non-admin row
 *          is bad hygiene and would be actively confusing if that
 *          person is ever promoted again later without a fresh,
 *          explicit `set_role` call.
 *        - **Any other reassignment** (neither side is `'admin'` —
 *          e.g. `'artist'` → `'listener'`) is a plain column update,
 *          no cap check, no `admin_role` touch.
 *      What this does **not** decide: Task 48-e's still-open
 *      "on revocation, does role revert to `'artist'` specifically or
 *      something remembered from before promotion" question — this
 *      route takes whatever `role` value the caller sends and doesn't
 *      infer or default one on revocation. That's a UI-layer decision
 *      (what value the revoke button actually sends), not this route's
 *      job to guess at.
 *
 * Every successful write logs to `admin_actions` (migration 015,
 * `logAdminAction()` — Task 46e's shared helper) with a distinct
 * dot-namespaced action per kind of change (`users.wallet_adjustment`,
 * `users.starting_capital_grant`, `users.set_admin_role`), same
 * non-blocking-on-audit-failure posture every other admin route in
 * this task already has: the real write has already committed by the
 * time the audit insert runs, so a failed audit insert is logged
 * loudly but never rolls back or fails the request.
 */

function financeAmount(value: unknown, fieldName: string, requirePositive: boolean): { value: number } | { error: string } {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { error: `${fieldName} must be a whole number of cents` };
  }
  if (requirePositive && n <= 0) {
    return { error: `${fieldName} must be a positive number of cents` };
  }
  if (!requirePositive && n === 0) {
    return { error: `${fieldName} cannot be zero — that would be a no-op adjustment` };
  }
  return { value: n };
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const { context, response } = await requireAdmin();
  if (response) return response;

  const targetUserId = params.id;
  if (!targetUserId) {
    return NextResponse.json({ success: false, error: 'user id is required' }, { status: 400 });
  }

  const body = await request.json();

  if (
    body.action !== 'adjust_wallet' &&
    body.action !== 'grant_starting_capital' &&
    body.action !== 'set_role' &&
    body.action !== 'reassign_role'
  ) {
    return NextResponse.json(
      { success: false, error: "action must be 'adjust_wallet', 'grant_starting_capital', 'set_role', or 'reassign_role'" },
      { status: 400 }
    );
  }

  // Task 46f-d: this route covers three different mutations behind one
  // PATCH handler, each needing a DIFFERENT capability -- can't pass a
  // single static key to requireAdmin() above the way every
  // single-action admin route does, since the action isn't known until
  // the body is parsed. requireAdmin() above only confirmed "some kind
  // of admin"; this is the finer-grained check, using the adminRole/
  // adminPermissions it already exposed on `context` for exactly this
  // multi-action case (see AdminContext's own doc comment).
  //
  // NOTE for `set_role` specifically: this check does NOT replace the
  // existing, stricter `isRootAdmin()` gate further down in that
  // branch -- a `hasCapability` pass here just means "not obviously
  // forbidden by the capability system" (a 'full'-role admin passes
  // every key, including this one), while the dedicated root-only
  // enforcement below is what actually stops a non-root 'full' admin
  // from granting roles, per 46e's own "an assigned admin, even a
  // 'full' one, should not be able to grant themselves or another
  // admin more access" decision. Both checks run; neither substitutes
  // for the other.
  const actionCapability =
    body.action === 'adjust_wallet'
      ? ADMIN_CAPABILITIES.USERS_WALLET_ADJUST
      : body.action === 'grant_starting_capital'
        ? ADMIN_CAPABILITIES.USERS_GRANT_STARTING_CAPITAL
        : ADMIN_CAPABILITIES.USERS_MANAGE_ROLE; // covers both set_role and reassign_role

  if (
    !hasCapability(
      { email: context.authUser.email, adminRole: context.adminRole, adminPermissions: context.adminPermissions },
      actionCapability
    )
  ) {
    return NextResponse.json(
      { success: false, error: `Forbidden — missing capability: ${actionCapability}` },
      { status: 403 }
    );
  }

  // Confirm the target exists before doing anything else — every
  // branch below needs this, and a clear 404 up front beats a
  // confusing downstream failure (a foreign-key violation on the
  // wallet_ledger insert, or a 0-rows-affected UPDATE that looks like
  // silent success) for a typo'd/deleted user id.
  const { data: targetUser, error: readError } = await context.admin
    .from('users')
    .select('id, role, admin_role, admin_permissions, artist_name, email')
    .eq('id', targetUserId)
    .maybeSingle();

  if (readError) return NextResponse.json({ success: false, error: readError.message }, { status: 500 });
  if (!targetUser) return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });

  // --- adjust_wallet ---
  if (body.action === 'adjust_wallet') {
    const amount = financeAmount(body.amountCents, 'amountCents', false);
    if ('error' in amount) return NextResponse.json({ success: false, error: amount.error }, { status: 400 });

    if (typeof body.reason !== 'string' || body.reason.trim() === '') {
      return NextResponse.json({ success: false, error: 'reason is required for a wallet adjustment' }, { status: 400 });
    }

    const { data: ledgerRow, error: insertError } = await context.admin
      .from('wallet_ledger')
      .insert({
        user_id: targetUserId,
        amount_cents: amount.value,
        type: 'bonus',
        description: `Admin wallet adjustment (${amount.value > 0 ? '+' : ''}${amount.value}¢): ${body.reason.trim()}`,
      })
      .select()
      .single();

    if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });

    await logAdminAction(context.admin, {
      adminId: context.authUser.id,
      action: 'users.wallet_adjustment',
      tableName: 'wallet_ledger',
      recordId: ledgerRow.id,
      newValue: { userId: targetUserId, amountCents: amount.value, reason: body.reason.trim() },
    });

    return NextResponse.json({ success: true, ledgerEntry: ledgerRow });
  }

  // --- grant_starting_capital ---
  if (body.action === 'grant_starting_capital') {
    const amount = financeAmount(body.amountCents, 'amountCents', true);
    if ('error' in amount) return NextResponse.json({ success: false, error: amount.error }, { status: 400 });

    const { data: ledgerRow, error: insertError } = await context.admin
      .from('wallet_ledger')
      .insert({
        user_id: targetUserId,
        amount_cents: amount.value,
        type: 'bonus',
        // Fixed, greppable description — not admin-supplied — per
        // migration 016's own design note, so this stays
        // distinguishable from an adjust_wallet 'bonus' row later.
        description: `Starting capital grant — admin ${context.authUser.id}`,
      })
      .select()
      .single();

    if (insertError) return NextResponse.json({ success: false, error: insertError.message }, { status: 500 });

    await logAdminAction(context.admin, {
      adminId: context.authUser.id,
      action: 'users.starting_capital_grant',
      tableName: 'wallet_ledger',
      recordId: ledgerRow.id,
      newValue: { userId: targetUserId, amountCents: amount.value },
    });

    return NextResponse.json({ success: true, ledgerEntry: ledgerRow });
  }

  // --- set_role (root-only) — only ever changes admin_role/
  // admin_permissions on a user who is ALREADY role='admin'. See
  // reassign_role below for changing the base role column itself
  // (including first-time promotion/revocation).
  if (body.action === 'set_role') {
    if (!isRootAdmin(context.authUser)) {
      return NextResponse.json({ success: false, error: 'Only the root admin can assign admin roles' }, { status: 403 });
    }

    if (targetUser.role !== 'admin') {
      return NextResponse.json(
        {
          success: false,
          error: "This user is not an admin yet — use action: 'reassign_role' with role: 'admin' to promote them first, then set_role to configure their admin_role/permissions",
        },
        { status: 400 }
      );
    }

    if (body.adminRole !== 'full' && body.adminRole !== 'monitor' && body.adminRole !== 'custom') {
      return NextResponse.json({ success: false, error: "adminRole must be 'full', 'monitor', or 'custom'" }, { status: 400 });
    }

    let adminPermissions: string[] = [];
    if (body.adminRole === 'custom') {
      if (!Array.isArray(body.adminPermissions)) {
        return NextResponse.json({ success: false, error: 'adminPermissions must be an array of strings when adminRole is custom' }, { status: 400 });
      }
      adminPermissions = body.adminPermissions.map(String);
    }
    // adminPermissions stays [] for 'full'/'monitor' regardless of what
    // the request sent — those two roles imply their fixed capability
    // set in code (per migration 016's own comment), so a stale/
    // inconsistent permissions array is never persisted for them.

    const { data: updatedUser, error: updateError } = await context.admin
      .from('users')
      .update({ admin_role: body.adminRole, admin_permissions: adminPermissions })
      .eq('id', targetUserId)
      .select('id, admin_role, admin_permissions')
      .single();

    if (updateError) return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });

    await logAdminAction(context.admin, {
      adminId: context.authUser.id,
      action: 'users.set_admin_role',
      tableName: 'users',
      recordId: targetUserId,
      oldValue: { adminRole: targetUser.admin_role, adminPermissions: targetUser.admin_permissions },
      newValue: { adminRole: body.adminRole, adminPermissions },
    });

    return NextResponse.json({ success: true, user: updatedUser });
  }

  // --- reassign_role (root-only) — Task 48-a. Changes the base `role`
  // column itself: first-time admin promotion, full revocation back to
  // a regular user, or any other role→role change. See this file's own
  // header comment for the full behavior (headcount cap on promotion,
  // admin_role/admin_permissions cleared on revocation, plain update
  // otherwise).
  if (!isRootAdmin(context.authUser)) {
    return NextResponse.json({ success: false, error: 'Only the root admin can reassign roles' }, { status: 403 });
  }

  const newRole = typeof body.role === 'string' ? body.role.trim() : '';
  if (!newRole) {
    return NextResponse.json({ success: false, error: 'role is required and must be a non-empty string' }, { status: 400 });
  }
  // Matches the DB column's own character_maximum_length (confirmed
  // via this task's own Group 1 information_schema query) — reject
  // here with a clear message rather than let a too-long value hit an
  // opaque DB-level truncation/error.
  if (newRole.length > 20) {
    return NextResponse.json({ success: false, error: 'role must be 20 characters or fewer' }, { status: 400 });
  }

  const wasAdmin = targetUser.role === 'admin';
  const willBeAdmin = newRole === 'admin';

  // First-time promotion: enforce the headcount cap. Root itself isn't
  // a `role='admin'` row at all (isRootAdmin() is purely the bootstrap
  // email check — see isAdmin.ts's own doc comment), so counting
  // `role='admin'` rows here counts *assigned* admins only, which is
  // exactly what MAX_ASSIGNED_ADMINS caps — root is implicitly the "+1"
  // in "root + 3 = 4 total" and never counted against its own cap.
  if (!wasAdmin && willBeAdmin) {
    const { count: currentAdminCount, error: countError } = await context.admin
      .from('users')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin');

    if (countError) return NextResponse.json({ success: false, error: countError.message }, { status: 500 });

    if ((currentAdminCount ?? 0) >= MAX_ASSIGNED_ADMINS) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot assign a new admin — the maximum of ${MAX_ASSIGNED_ADMINS} assigned admins (plus root) has already been reached.`,
        },
        { status: 409 }
      );
    }
  }

  const updatePayload: { role: string; admin_role?: null; admin_permissions?: null } = { role: newRole };
  // Revocation: clear stale privilege data. Not a security requirement
  // (isAdmin()'s own role==='admin' check already cuts off access the
  // moment `role` changes — confirmed by reading isAdmin.ts/
  // requireAdmin.ts directly, not assumed) — this is hygiene, so a
  // future re-promotion doesn't inherit stale admin_role/permissions
  // from before without an explicit fresh set_role call.
  if (wasAdmin && !willBeAdmin) {
    updatePayload.admin_role = null;
    updatePayload.admin_permissions = null;
  }

  const { data: reassignedUser, error: reassignError } = await context.admin
    .from('users')
    .update(updatePayload)
    .eq('id', targetUserId)
    .select('id, role, admin_role, admin_permissions')
    .single();

  if (reassignError) return NextResponse.json({ success: false, error: reassignError.message }, { status: 500 });

  await logAdminAction(context.admin, {
    adminId: context.authUser.id,
    action: 'users.reassign_role',
    tableName: 'users',
    recordId: targetUserId,
    oldValue: { role: targetUser.role, adminRole: targetUser.admin_role, adminPermissions: targetUser.admin_permissions },
    newValue: {
      role: newRole,
      adminRole: updatePayload.admin_role !== undefined ? updatePayload.admin_role : targetUser.admin_role,
      adminPermissions: updatePayload.admin_permissions !== undefined ? updatePayload.admin_permissions : targetUser.admin_permissions,
    },
  });

  return NextResponse.json({ success: true, user: reassignedUser });
}
