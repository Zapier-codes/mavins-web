import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Task 46e (handover.md) — every admin write logs to admin_actions
 * (migration 015). Extracted here because this session adds audit
 * logging to five more routes (Task 46a's pricing-tiers, duration-
 * slots, countries, genres, genre-country-affinity) on top of the two
 * that already had it (fees/route.ts, campaigns/[id]/route.ts) —
 * without this, that would be a sixth-through-thirteenth near-identical
 * copy of the same insert+error-handling block. Those first two routes
 * are deliberately left as they are, not refactored to call this —
 * they already work correctly and reviewing/touching working code for
 * a DRY-ness argument that only applies going forward isn't worth the
 * risk here.
 *
 * Deliberately fire-and-log, not fire-and-throw — matches both
 * existing call sites' own established posture exactly: an
 * audit-insert failure (network blip, admin_actions briefly
 * unavailable) must never roll back or fail the request for the real
 * write that already succeeded. Losing the audit *record* of a real
 * change is a lesser failure than losing the change itself by
 * pretending it didn't happen. Logged loudly to server logs either
 * way, never silently swallowed.
 */
export interface AuditLogEntry {
  adminId: string;
  action: string; // dot-namespaced, e.g. 'pricing_tiers.create' — see migration 015's own header comment
  tableName: string;
  recordId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

export async function logAdminAction(admin: SupabaseClient, entry: AuditLogEntry): Promise<void> {
  const { error } = await admin.from('admin_actions').insert({
    admin_id: entry.adminId,
    action: entry.action,
    table_name: entry.tableName,
    record_id: entry.recordId ?? null,
    old_value: entry.oldValue ?? null,
    new_value: entry.newValue ?? null,
  });
  if (error) {
    console.error(
      `admin_actions audit insert failed for action '${entry.action}'`,
      error,
      { tableName: entry.tableName, recordId: entry.recordId }
    );
  }
}
