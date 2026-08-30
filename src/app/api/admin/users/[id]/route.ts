import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/requireAdmin';
import { isRootAdmin } from '@/lib/auth/isAdmin';
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
 *      not a replacement for it.
 *
 * **Deliberately NOT built this session — flagging why rather than
 * silently guessing:** `set_role` only works on a user who ALREADY
 * has `role = 'admin'` in the DB (rejects 400 otherwise, with a
 * message saying so). Two related operations this does NOT cover:
 * promoting a brand-new user to admin for the first time, and fully
 * revoking an existing admin's access back to a regular user. Both
 * would need writing to the base `role` column itself — and per
 * migration 016's own header comment, `role`'s exact schema/allowed
 * values were never found in this repo's tracked migration history
 * (added directly against the live DB outside this workflow at some
 * earlier point) — this route can't confirm what a "not admin" value
 * for that column should be (`'artist'`? `NULL`? something else?)
 * without guessing at an access-control field, which is exactly the
 * kind of silent guess this whole task has repeatedly flagged against
 * doing. Worth a quick confirmation before a future session extends
 * this action to handle first-time promotion/full revocation, same
 * "worth confirming, not silently picked" posture as everything else
 * still open in this task.
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

  if (body.action !== 'adjust_wallet' && body.action !== 'grant_starting_capital' && body.action !== 'set_role') {
    return NextResponse.json(
      { success: false, error: "action must be 'adjust_wallet', 'grant_starting_capital', or 'set_role'" },
      { status: 400 }
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

  // --- set_role (root-only) ---
  if (!isRootAdmin(context.authUser)) {
    return NextResponse.json({ success: false, error: 'Only the root admin can assign admin roles' }, { status: 403 });
  }

  if (targetUser.role !== 'admin') {
    // See this file's own header comment ("Deliberately NOT built
    // this session") for why first-time promotion isn't handled here.
    return NextResponse.json(
      { success: false, error: 'This user is not an admin yet — first-time admin promotion is not yet supported by this route' },
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
