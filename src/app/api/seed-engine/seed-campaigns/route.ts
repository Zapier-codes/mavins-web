import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';

/**
 * POST /api/seed-engine/seed-campaigns
 *
 * Admin-only endpoint to trigger synthetic campaign creation for seed users.
 * Calls the ensure_seed_campaigns() SQL function (migration 024) which is
 * idempotent: seeds that already have an active campaign are skipped.
 *
 * Task 55: gives seed users their own visible campaigns for the leaderboard.
 * No demo badges, no disclaimers — mixed indistinguishably with real campaigns.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const admin = createAdminClient();
    const { data: profile } = await admin
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single();

    const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });

    if (!callerIsAdmin) {
      return NextResponse.json(
        { success: false, error: 'Admin access required' },
        { status: 403 }
      );
    }

    const { data, error } = await admin.rpc('ensure_seed_campaigns');

    if (error) {
      console.error('ensure_seed_campaigns RPC error:', error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({
      success: true,
      created: row?.created_count ?? 0,
      skipped: row?.skipped_count ?? 0,
      message: `Seed campaigns ensured. Created: ${row?.created_count ?? 0}, Skipped: ${row?.skipped_count ?? 0}`,
    });
  } catch (error: any) {
    console.error('Seed campaigns endpoint error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
