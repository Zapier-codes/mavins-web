// src/services/campaign/campaignCancellation.service.ts
/**
 * Shared cancel-and-refund logic for public.track_campaigns, extracted
 * from `api/campaigns/cancel/route.ts` so it has exactly one
 * implementation — Task 40's own "fee/refund arithmetic lives in
 * exactly one place" rule, applied here too, ahead of Task 46c's admin
 * dashboard needing to call this same logic (Part B of this split).
 *
 * Task 46c's own note flagged an open question: "does an admin cancel
 * refund like a user cancel does?" This is that decision, recorded and
 * implemented — confirmed directly by the product owner ("close out"
 * = cancel; use the industry-standard mitigation; the platform's 10%
 * is never refundable): **yes, identically** — this function doesn't
 * know or care who initiated the cancel, same as the existing route
 * already didn't (it already allowed `callerIsAdmin` through the same
 * code path via its ownership check). Nothing about the refund
 * arithmetic itself changes based on who clicked cancel.
 *
 * "Platform's 10% is never refundable" — already fully satisfied,
 * confirmed directly against `api/campaigns/create/route.ts`'s own
 * insert comment: `total_budget_cents` is deliberately the 90%
 * subtotal only, fee already netted out before this table is ever
 * written to. This function refunds `total_budget_cents - spent_cents`
 * — the fee was never part of either number, so it structurally can't
 * leak into a refund here. Nothing new needed for that half of the
 * decision; recording that it was verified, not assumed.
 *
 * "Industry standard mitigation" — interpreted here as: trust
 * `spent_cents` as the actual-consumption figure, since for every
 * campaign that can currently be cancelled through this path (i.e.
 * every real campaign — see below), it genuinely is real-time-accurate,
 * not a stale/lagging estimate. `record_campaign_stream`
 * (`seedEngine.service.ts`'s only write path, called once per
 * simulated play) increments `spent_cents` the moment each unit of
 * delivery happens — there's no polling delay or webhook lag to
 * mitigate for that path.
 *
 * A DIFFERENT, genuinely time-based or reconciliation-based mitigation
 * was considered and deliberately NOT built here, for two concrete,
 * verified-not-assumed reasons: (1) `track_campaigns` has no stored
 * campaign-duration or start-date column anywhere in this schema (only
 * `stage_started_at`, which tracks the *current stage's* start, not
 * the campaign's overall planned length) — a time-based proration
 * literally has no data to compute against without a schema addition,
 * which is out of scope for extracting already-working logic; (2) the
 * one delivery channel where `spent_cents` genuinely COULD lag behind
 * reality — Fresh Connect (`freshconnect.service.ts`,
 * `api/webhooks/freshconnect/route.ts`) — is currently entirely
 * unwired: `addOrder()` is never called anywhere in this codebase, so
 * `fresh_connect_order_id` is never set on any real campaign, and that
 * webhook's own lookup can never match a row. This function's
 * `spent_cents`-based approach is therefore already correct for every
 * campaign that can actually reach it today.
 *
 * **Real, separate bug found while tracing this — flagged, not fixed
 * here, deliberately kept out of this task's scope:** that Fresh
 * Connect webhook inserts directly into `wallet_ledger` with
 * `type: 'bonus'`, bypassing `credit_wallet_refund` (migration 008)
 * entirely — it never updates `users.wallet.balance` at all, isn't
 * idempotent against a retried webhook call, and mislabels a refund as
 * a bonus in ledger reporting. Worth its own task once Fresh Connect
 * is actually wired into campaign creation — fixing dead code now
 * would blur this task's scope for zero live benefit today.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CancelCampaignResult {
  success: boolean;
  error?: string;
  /** Cents actually refunded — 0 if nothing was owed, or if this was
   * a duplicate call and the refund had already landed previously. */
  refundedCents?: number;
}

/**
 * Cancel a campaign and refund its unspent, fee-excluded budget.
 * Caller (the route) is responsible for authentication and the
 * ownership/admin check — this function does the mutation only, same
 * separation Task 46c's own admin route already uses between
 * `requireAdmin()` and its own mutation logic.
 */
export async function cancelCampaignAndRefund(
  admin: SupabaseClient,
  campaignId: string
): Promise<CancelCampaignResult> {
  const { data: campaign, error: fetchError } = await admin
    .from('track_campaigns')
    .select('id, artist_id, total_budget_cents, spent_cents')
    .eq('id', campaignId)
    .single();

  if (fetchError || !campaign) {
    return { success: false, error: 'Campaign not found' };
  }

  const unspent = (campaign.total_budget_cents || 0) - (campaign.spent_cents || 0);
  let refundedCents = 0;

  if (unspent > 0 && campaign.artist_id) {
    const { data: refundData, error: refundError } = await admin.rpc('credit_wallet_refund', {
      p_user_id: campaign.artist_id,
      p_amount_cents: unspent,
      // Campaign id is a stable, unique key for this specific refund —
      // reusing it as the idempotency reference means a duplicate
      // cancel call (retried request, or a user and an admin cancelling
      // the same campaign in a race) can't double-refund it.
      p_reference: `cancel-${campaignId}`,
      p_reason: 'campaign_refund',
    });

    if (refundError) {
      console.error('cancelCampaignAndRefund: credit_wallet_refund failed', refundError);
      return { success: false, error: 'Failed to refund wallet' };
    }

    const row = Array.isArray(refundData) ? refundData[0] : refundData;
    if (row?.credited) {
      refundedCents = unspent;
    } else {
      // Already refunded by a previous call — not an error, fall
      // through and still (re-)apply the cancellation status below.
      console.log(`cancelCampaignAndRefund: reference cancel-${campaignId} already refunded, continuing`);
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
    return { success: false, error: updateError.message };
  }

  return { success: true, refundedCents };
}
