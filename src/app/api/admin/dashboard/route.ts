import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth/requireAdmin';

/**
 * GET /api/admin/dashboard
 *
 * Returns the full users / campaigns / wallet-ledger data the admin
 * dashboard needs, fetched with the service-role client so RLS
 * ("own row only" on `users` and `wallet_ledger`) doesn't silently
 * limit an admin to seeing just their own row.
 *
 * This replaces admin/page.tsx querying those tables directly with the
 * regular anon-key client, which is why the dashboard could look sparse
 * even for a real admin — RLS was doing exactly what it's supposed to,
 * just not what the admin view needs.
 *
 * Task 46a — now uses the shared requireAdmin() helper
 * (src/lib/auth/requireAdmin.ts) instead of its own inline copy of the
 * same check. This route's own semantics (admin-or-reject, no
 * ownership fallback) match requireAdmin() exactly, so it's a safe,
 * behavior-preserving swap — unlike api/campaigns/cancel|create|
 * add-funds, which allow a non-admin to act on their own resource and
 * therefore need `isAdmin` as a flag, not a hard gate; those three are
 * deliberately left as their own inline checks rather than force-fit
 * onto a helper shaped for a different use case.
 */
export async function GET() {
  try {
    const { response } = await requireAdmin();
    if (response) return response;

    const admin = createAdminClient();
    const [usersRes, campaignsRes, ledgerRes] = await Promise.all([
      admin.from('users').select('*').order('created_at', { ascending: false }).limit(50),
      admin
        .from('track_campaigns')
        .select('*, artist:users(artist_name, email)')
        .order('created_at', { ascending: false })
        .limit(50),
      admin
        .from('wallet_ledger')
        .select('*, user:users(artist_name, email)')
        .order('created_at', { ascending: false })
        .limit(50),
    ]);

    if (usersRes.error || campaignsRes.error || ledgerRes.error) {
      return NextResponse.json(
        {
          error:
            usersRes.error?.message ||
            campaignsRes.error?.message ||
            ledgerRes.error?.message ||
            'Failed to load admin data',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      users: usersRes.data ?? [],
      campaigns: campaignsRes.data ?? [],
      ledger: ledgerRes.data ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Unexpected error' }, { status: 500 });
  }
}
