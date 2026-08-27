import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin } from '@/lib/auth/isAdmin';
import { calculatePricing } from '@/lib/campaign/pricing';

/**
 * POST /api/campaigns/create
 *
 * Fixes "new row violates row-level security policy for table
 * track_campaigns" on launch — happening even for the confirmed
 * admin account (role = 'admin' in the DB per Task 11, wallet funded
 * per the product owner). The insert was previously done client-side
 * with the anon-key client (`createCampaign()` in
 * campaign.service.ts), relying on `auth.uid() = artist_id` passing
 * at request time. Whatever the live-DB specifics are (this sandbox
 * has no network access to Supabase to inspect them directly — same
 * limitation noted on every prior task that needed it), the fix
 * follows the same pattern already proven for the admin dashboard's
 * analogous read-side RLS problem (Task 14): stop depending on the
 * browser's RLS-scoped session for a write we can fully authorize
 * server-side instead.
 *
 * This route verifies the caller's own session (cookie-based,
 * `auth.getUser()`), derives `artistId` from that verified session
 * (never trusts a client-supplied id), resolves `isAdmin` the same
 * single-sourced way as the rest of the app, then performs the wallet
 * check/deduction and the campaign insert with the service-role
 * client — which bypasses RLS entirely, so a stale/mismatched client
 * session can no longer block a legitimate launch.
 */

interface CreateCampaignBody {
  sourceUrl: string;
  viewCount: number;
  genre?: string;
  geographicTier?: string;
  targetCountries?: string[];
}

async function getWalletBalanceCents(admin: ReturnType<typeof createAdminClient>, userId: string): Promise<number> {
  const { data, error } = await admin.from('users').select('wallet').eq('id', userId).single();
  if (error || !data?.wallet) return 0;
  const wallet = typeof data.wallet === 'string' ? JSON.parse(data.wallet) : data.wallet;
  return wallet?.balance || 0;
}

async function debitWallet(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  amountCents: number,
  description: string
) {
  const currentBalance = await getWalletBalanceCents(admin, userId);
  const newBalance = Math.max(0, currentBalance - amountCents);

  const { error: walletError } = await admin
    .from('users')
    .update({ wallet: { balance: newBalance, currency: 'USD' }, update_time: new Date().toISOString() })
    .eq('id', userId);
  if (walletError) throw walletError;

  await admin.from('wallet_ledger').insert({
    id: crypto.randomUUID(),
    user_id: userId,
    changeset: {
      amount: -amountCents,
      currency: 'USD',
      type: 'debit',
      description,
      previous_balance: currentBalance,
      new_balance: newBalance,
    },
    metadata: { source: 'campaign_service' },
    create_time: new Date().toISOString(),
    update_time: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const body: CreateCampaignBody = await request.json();
    if (!body?.sourceUrl || !body?.viewCount) {
      return NextResponse.json({ success: false, error: 'sourceUrl and viewCount are required' }, { status: 400 });
    }

    const admin = createAdminClient();

    // RLS's "own row" policy would permit this same read client-side too,
    // but we're already server-side with the verified session, so read
    // straight through the service-role client for one less round trip.
    const { data: profile } = await admin.from('users').select('role').eq('id', authUser.id).single();
    const callerIsAdmin = isAdmin({ email: authUser.email, role: profile?.role });

    const pricing = calculatePricing(body.viewCount);

    if (!callerIsAdmin) {
      const balanceCents = await getWalletBalanceCents(admin, authUser.id);
      if (balanceCents < pricing.totalCostCents) {
        return NextResponse.json(
          { success: false, error: 'Insufficient wallet balance. Please add funds.' },
          { status: 400 }
        );
      }
      await debitWallet(
        admin,
        authUser.id,
        pricing.totalCostCents,
        `Campaign creation: ${body.sourceUrl.slice(0, 50)}`
      );
    }

    const { data, error } = await admin
      .from('track_campaigns')
      .insert({
        source_url: body.sourceUrl,
        artist_id: authUser.id,
        total_budget_cents: callerIsAdmin ? 0 : pricing.totalCostCents,
        spent_cents: 0,
        geographic_tier: body.geographicTier || 'local',
        target_countries: body.targetCountries || [],
        target_genres: body.genre ? [body.genre] : [],
        current_stage: 'planting',
        is_active: true,
        is_paused: false,
        total_streams: 0,
      })
      .select('id')
      .single();

    if (error) {
      // Non-admin wallet debit already happened above — if the insert
      // itself fails, refund it rather than leaving the artist charged
      // for a campaign that was never created.
      if (!callerIsAdmin) {
        await debitWallet(admin, authUser.id, -pricing.totalCostCents, `Refund: failed campaign creation`);
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, campaignId: data.id });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to create campaign' }, { status: 500 });
  }
}
