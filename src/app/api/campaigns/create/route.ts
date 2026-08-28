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

// Task 34 (handover.md): the old getWalletBalanceCents() helper that
// used to live here was only needed by this route's previous local
// compensating-refund write (a manual balance read before a manual
// wallet update). That write is gone — the refund now goes through
// credit_wallet_refund (migration 008), which does its own atomic
// balance read/write internally, so no pre-read is needed here.

/**
 * Task 38 (handover.md): the primary wallet debit for campaign
 * placement now goes through debit_wallet_balance() (migration 007) —
 * atomic (row-locked balance check + write) and idempotent (same
 * wallet_ledger reference-uniqueness migration 004 already added),
 * replacing this route's own previous local `debitWallet()` helper,
 * which did a non-atomic read-modify-write with no idempotency guard
 * at all. That old helper was itself flagged in Task 34 as a THIRD
 * independent direct-write path on users.wallet, alongside
 * campaign.service.ts's updateWallet() — this call site is now fixed;
 * that other one is Task 34's own remaining scope, not touched here.
 *
 * `p_reference` uses the campaign's own future id isn't known yet at
 * debit time (insert hasn't happened), so a fresh UUID is minted here
 * and threaded through to the insert below purely as the idempotency
 * key for this one debit attempt — not the campaign's row id.
 */
async function debitWalletForCampaign(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  amountCents: number,
  reference: string
): Promise<{ debited: boolean; newBalanceCents: number; errorCode: string | null }> {
  const { data, error } = await admin.rpc('debit_wallet_balance', {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_reference: reference,
    p_reason: 'campaign_placement',
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    debited: !!row?.debited,
    newBalanceCents: row?.new_balance_cents ?? 0,
    errorCode: row?.error_code ?? null,
  };
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

    // Reference for this debit attempt's idempotency key -- see
    // debitWalletForCampaign's own comment for why this isn't the
    // campaign's row id (doesn't exist yet at this point).
    const debitReference = crypto.randomUUID();

    if (!callerIsAdmin) {
      // debit_wallet_balance (migration 007) does its own atomic
      // balance check internally now -- no separate pre-check read
      // needed here, which also closes the old TOCTOU gap between
      // this route's balance read and its since-removed local write.
      const debitResult = await debitWalletForCampaign(
        admin,
        authUser.id,
        pricing.totalCostCents,
        debitReference
      );
      if (!debitResult.debited) {
        // 'insufficient_balance' is the expected shape here per Task
        // 38/36 -- surfaced as a normal 400, not a 500. Any other
        // error_code the RPC might one day return still lands here
        // too, on the same "couldn't debit, don't create the
        // campaign" branch.
        return NextResponse.json(
          { success: false, error: 'Insufficient wallet balance. Please add funds.' },
          { status: 400 }
        );
      }
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
      //
      // Task 34 (handover.md): this used to be a narrow local
      // non-atomic write, flagged as a known gap against "RPC is the
      // only writer." Migration 008 added credit_wallet_refund
      // specifically for this compensating-credit case (distinct from
      // credit_wallet_deposit, which is semantically for real
      // payment-provider deposits — ledger type 'deposit' would be
      // wrong here). Reuses debitReference as the idempotency key so a
      // retried failed-insert can't double-refund the same debit.
      if (!callerIsAdmin) {
        const { error: refundError } = await admin.rpc('credit_wallet_refund', {
          p_user_id: authUser.id,
          p_amount_cents: pricing.totalCostCents,
          p_reference: debitReference,
          p_reason: 'campaign_create_failed',
        });
        if (refundError) {
          // The debit succeeded but neither the campaign insert nor
          // the refund did — surface loudly rather than silently
          // leaving the artist charged with nothing to show for it.
          console.error('Campaign create: compensating credit_wallet_refund failed', refundError, { userId: authUser.id, debitReference });
        }
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, campaignId: data.id });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to create campaign' }, { status: 500 });
  }
}
