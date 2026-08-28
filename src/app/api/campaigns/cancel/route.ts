import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';

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
      .select('id, artist_id, total_budget_cents, spent_cents')
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

    const unspent = (campaign.total_budget_cents || 0) - (campaign.spent_cents || 0);

    if (unspent > 0 && campaign.artist_id) {
      const { data: refundData, error: refundError } = await admin.rpc('credit_wallet_refund', {
        p_user_id: campaign.artist_id,
        p_amount_cents: unspent,
        // Campaign id is a stable, unique key for this specific
        // refund — reusing it as the idempotency reference means a
        // duplicate cancel call (e.g. a retried request) can't
        // double-refund the same unspent balance twice.
        p_reference: `cancel-${campaignId}`,
        p_reason: 'campaign_refund',
      });
      if (refundError) {
        console.error('Campaign cancel: credit_wallet_refund failed', refundError);
        return NextResponse.json({ success: false, error: 'Failed to refund wallet' }, { status: 500 });
      }
      const row = Array.isArray(refundData) ? refundData[0] : refundData;
      if (!row?.credited) {
        // Already refunded (duplicate call) — not an error, fall
        // through and still (re-)apply the cancellation status below.
        console.log(`Campaign cancel: reference cancel-${campaignId} already refunded, continuing`);
      }
    }

    const { error: updateError } = await admin
      .from('track_campaigns')
      .update({
        is_active: false,
        is_paused: false,
        current_stage: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    if (updateError) {
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Campaign cancel error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to cancel campaign' }, { status: 500 });
  }
}
