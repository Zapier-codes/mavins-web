import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';

/**
 * POST /api/campaigns/add-funds
 *
 * Task 34 (handover.md): campaign.service.ts's addFundsToCampaign()
 * used to debit the wallet with a direct, non-atomic
 * `users.wallet` read-modify-write from the browser's anon-key
 * client (updateWallet()) — Task 38's debit_wallet_balance RPC exists
 * for exactly this (atomic, idempotent, insufficient-balance handled
 * as a normal outcome) but is locked to service_role only, so the
 * anon/authenticated client could never legally call it anyway.
 * Moving this server-side, same pattern as /api/campaigns/create and
 * /api/campaigns/cancel.
 *
 * Body: { campaignId: string, additionalCents: number }
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
    const additionalCents = Number(body?.additionalCents);
    if (!campaignId || !Number.isFinite(additionalCents) || additionalCents <= 0) {
      return NextResponse.json(
        { success: false, error: 'campaignId and a positive additionalCents are required' },
        { status: 400 }
      );
    }

    const admin = createAdminClient();

    const { data: profile } = await admin.from('users').select('role').eq('id', authUser.id).single();
    const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });

    const { data: campaign, error: fetchError } = await admin
      .from('track_campaigns')
      .select('id, artist_id, total_budget_cents')
      .eq('id', campaignId)
      .single();

    if (fetchError || !campaign) {
      return NextResponse.json({ success: false, error: 'Campaign not found' }, { status: 404 });
    }

    // Ownership check — a non-admin can only add funds to their own
    // campaign (server-verified, same as /api/campaigns/cancel).
    if (!callerIsAdmin && campaign.artist_id !== authUser.id) {
      return NextResponse.json({ success: false, error: 'Not authorized to fund this campaign' }, { status: 403 });
    }
    if (!campaign.artist_id) {
      return NextResponse.json({ success: false, error: 'Campaign has no owner to debit' }, { status: 400 });
    }

    // debit_wallet_balance (migration 007) does its own atomic
    // sufficient-balance check internally — no separate pre-check read
    // needed here, same reasoning as /api/campaigns/create's own debit
    // call.
    const debitReference = crypto.randomUUID();
    const { data: debitData, error: debitError } = await admin.rpc('debit_wallet_balance', {
      p_user_id: campaign.artist_id,
      p_amount_cents: additionalCents,
      p_reference: debitReference,
      p_reason: 'campaign_topup',
    });

    if (debitError) {
      console.error('Campaign add-funds: debit_wallet_balance failed', debitError);
      return NextResponse.json({ success: false, error: 'Failed to debit wallet' }, { status: 500 });
    }

    const row = Array.isArray(debitData) ? debitData[0] : debitData;
    if (!row?.debited) {
      const insufficientBalance = row?.error_code === 'insufficient_balance';
      return NextResponse.json(
        { success: false, error: insufficientBalance ? 'Insufficient wallet balance. Please add funds.' : 'Failed to debit wallet' },
        { status: insufficientBalance ? 400 : 500 }
      );
    }

    const { error: updateError } = await admin
      .from('track_campaigns')
      .update({
        total_budget_cents: (campaign.total_budget_cents || 0) + additionalCents,
        updated_at: new Date().toISOString(),
      })
      .eq('id', campaignId);

    if (updateError) {
      // The debit already succeeded, so this campaign's budget total
      // is now understated relative to what was actually charged —
      // same class of edge case /api/campaigns/create's own
      // compensating-refund comment describes, just the inverse
      // direction (here the debit succeeded but the follow-up UPDATE,
      // not an INSERT, failed). Surfacing the error rather than
      // silently swallowing it so it isn't invisible; a proper fix
      // would need its own reconciliation path, out of scope here.
      console.error('Campaign add-funds: debit succeeded but budget update failed', updateError, { campaignId, debitReference });
      return NextResponse.json({ success: false, error: 'Wallet debited but campaign budget update failed — contact support with reference ' + debitReference }, { status: 500 });
    }

    return NextResponse.json({ success: true, newBalanceCents: row.new_balance_cents });
  } catch (err: any) {
    console.error('Campaign add-funds error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to add funds' }, { status: 500 });
  }
}
