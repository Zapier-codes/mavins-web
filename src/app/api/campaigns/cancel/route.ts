import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';
import { cancelCampaignAndRefund } from '@/services/campaign/campaignCancellation.service';

/**
 * POST /api/campaigns/cancel
 *
 * Task 34 (handover.md): campaign.service.ts's cancelCampaign() used
 * to refund unspent budget with a direct, non-atomic
 * `users.wallet` read-modify-write from the browser's anon-key
 * client (updateWallet()) — a second, independent crediting authority
 * running in parallel with the RPCs, and one the anon/authenticated
 * roles can't legally reach anyway now that migration 008's
 * credit_wallet_refund is locked to service_role only (same lockdown
 * as migrations 004/007). Moving this server-side, same pattern as
 * /api/campaigns/create and /api/campaigns/add-funds.
 *
 * The actual cancel-and-refund mechanics now live in
 * campaignCancellation.service.ts's cancelCampaignAndRefund() — pulled
 * out this session (part of the 3-way "close out" task split, part A)
 * so Task 46c's admin dashboard can call the exact same logic instead
 * of a second, duplicated implementation. This route keeps the
 * authentication + ownership/admin check, which is genuinely
 * route-specific (46c's admin route already gates through
 * `requireAdmin()` instead, a different check) — only the mutation
 * itself moved.
 *
 * Body: { campaignId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const campaignId = body?.campaignId;
    if (!campaignId) {
      return NextResponse.json({ success: false, error: 'campaignId is required' }, { status: 400 });
    }

    const admin = createAdminClient();

    const { data: profile } = await admin.from('users').select('role').eq('id', authUser.id).single();
    const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });

    const { data: campaign, error: fetchError } = await admin
      .from('track_campaigns')
      .select('id, artist_id')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    // Ownership check — a non-admin can only cancel their own campaign.
    // (Server-verified, unlike the old client-side path which trusted
    // RLS to enforce this on a direct table write.)
    if (!callerIsAdmin && campaign.artist_id !== authUser.id) {
      return NextResponse.json({ success: false, error: 'Not authorized to cancel this campaign' }, { status: 403 });
    }

    const result = await cancelCampaignAndRefund(admin, campaignId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Campaign cancel error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to cancel campaign' }, { status: 500 });
  }
}

