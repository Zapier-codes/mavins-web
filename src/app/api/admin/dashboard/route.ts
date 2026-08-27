import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';

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
 * IMPORTANT: unlike a naive "just call createAdminClient() and return
 * everything" route, this checks the *caller's own session* first and
 * requires it to actually belong to an admin (DB role, or the hardcoded
 * fallback email — same single source of truth as the rest of the app,
 * `isAdmin()` from AuthProvider) before ever touching the service-role
 * client. Skipping that check would mean any authenticated user could
 * hit this endpoint directly and dump every user's data and the full
 * wallet ledger, since the service role bypasses RLS entirely.
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // RLS's "own row" policy permits this — a user can always read their
    // own `role`, regardless of what the rest of this route needs it for.
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single();

    const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });
    if (!callerIsAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

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
