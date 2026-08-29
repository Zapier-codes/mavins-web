import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';
import { calculatePricing, PRICING_TIERS, DURATION_SLOTS } from '@/lib/campaign/pricing';

const GUEST_RATE_LIMIT = 5; // checkout attempts
const GUEST_RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes per IP
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/payments/initialize-campaign
 *
 * Task 36 (handover.md), Part 1 of 4 — this session only does Part 1.
 * Full split (see Task 36's own section in handover.md for the
 * complete write-up, including why this exact order):
 *   Part 1 (this route): guest-only campaign-payment initiation —
 *     writes a payment_sessions row carrying full campaign intent,
 *     starts a Korapay checkout for exactly this campaign's cost.
 *     Does NOT touch the webhook or actually create any campaign yet.
 *   Part 2 (not built yet): korapay-webhook/index.ts recognizes
 *     metadata.type === 'campaign_direct' and, on a successful
 *     payment, creates the users row + track_campaigns row directly —
 *     no wallet touched at all, per Task 36's explicit rule.
 *   Part 3 (not built yet): create/route.ts's unconditional 401 for
 *     unauthenticated callers gets replaced with a clear redirect/
 *     instruction toward this route instead of a bare rejection, and
 *     a returning (already-registered) user calling this route should
 *     be rejected the other way — see the auth check below, which
 *     already does that half now since it was zero extra work once
 *     this route existed at all.
 *   Part 4 (not built yet): promote/page.tsx wires the "Place
 *     Campaign" button to call this route instead of create/route.ts
 *     directly when there's no logged-in session.
 *
 * Deliberately modeled on /api/payments/initialize/route.ts's existing
 * guest-checkout shape (same rate-limit pattern, same email
 * validation, same payment_sessions + initialize-payment Edge Function
 * call) rather than introducing a second style — the only real
 * differences are: (a) this route rejects an authenticated caller
 * instead of branching into an authenticated flow (Task 36: a
 * returning user must never direct-pay, full stop — they use
 * create/route.ts's existing wallet-debit path instead), and (b) the
 * amount comes from calculatePricing(), not a client-supplied number,
 * since what's being paid for is a specific campaign's computed cost,
 * not an arbitrary top-up amount.
 *
 * Body: { sourceUrl: string, viewCount: number, guestEmail: string,
 *         genre?: string, geographicTier?: string,
 *         targetCountries?: string[], paymentCurrency?: string }
 *
 * The full campaign intent (sourceUrl, viewCount, genre,
 * geographicTier, targetCountries) AND the exact pricing breakdown
 * computed here (totalCostCents, subtotalCents) are snapshotted into
 * payment_sessions.metadata.campaign — Part 2's webhook handler reads
 * that back at confirmation time rather than recomputing
 * calculatePricing() itself. Deliberate: pricing tiers could
 * conceivably change between initiation and webhook confirmation
 * (however unlikely in practice), and a snapshot means the amount the
 * guest actually paid Korapay is always exactly what gets used to fund
 * the campaign — no risk of a mismatch between "what they were
 * charged" and "what the campaign gets created with."
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();

    // Task 36's rule, the other direction: once someone has an
    // account, they can no longer direct-pay — they must fund their
    // wallet and place the campaign from create/route.ts's existing
    // wallet-debit path instead. This route is guest-only by design,
    // not just "guest-shaped."
    if (authUser) {
      return NextResponse.json(
        {
          error:
            'You already have an account. Please fund your wallet and place the campaign from there.',
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { sourceUrl, viewCount, genre, geographicTier, targetCountries, paymentCurrency } = body;

    if (!sourceUrl || !viewCount) {
      return NextResponse.json({ error: 'sourceUrl and viewCount are required' }, { status: 400 });
    }

    const guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim().toLowerCase() : '';
    if (!guestEmail || !EMAIL_RE.test(guestEmail)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const ip = getClientIp(request);
    // Separate rate-limit key namespace from the wallet-topup guest
    // flow (`guest-init:`) -- same limiter, same limits, but tracked
    // independently so a guest hammering one endpoint doesn't also
    // eat into their budget on the other.
    const allowed = checkRateLimit(`guest-campaign-init:${ip}`, GUEST_RATE_LIMIT, GUEST_RATE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    // Same calculatePricing() used by create/route.ts's authenticated/
    // wallet-debit path -- one pricing engine, not a second copy of
    // the tier logic for the guest path. Task 45 Part 1: reference
    // data now passed explicitly rather than read as module globals --
    // still PRICING_TIERS/DURATION_SLOTS, zero behavior change.
    const pricing = calculatePricing(viewCount, { tiers: PRICING_TIERS, durationSlots: DURATION_SLOTS });

    // Settlement currency hardcoded to USD, same reasoning/limitation
    // as /api/payments/initialize/route.ts (see that file's own header
    // comment) -- this app only ever settles in USD today.
    const settlementCurrency = 'USD';
    const currency = 'USD';

    // Distinct prefix from MAVW-WLT-/MAVW-GST- purely for log/dashboard
    // readability -- Part 2's webhook branches on metadata.type, never
    // on the reference's own text, so this isn't load-bearing.
    const reference = `MAVW-CMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // payment_sessions.amount is a base-currency-unit column (whole
    // USD dollars), same convention as every other writer of this
    // table (see migration 006's own header comment) -- totalCostCents
    // is cents, so this converts, matching how the two existing
    // callers already avoid the same 100x mismatch class of bug
    // (korapay.service.ts's own header comment covers the original
    // incident this convention exists to prevent).
    const amount = pricing.totalCostCents / 100;

    const sessionRow: Record<string, unknown> = {
      reference,
      user_id: null,
      customer_email: guestEmail,
      customer_name: 'Mavins User',
      provider: 'korapay',
      amount,
      currency,
      ...(paymentCurrency && paymentCurrency !== settlementCurrency
        ? { payment_currency: paymentCurrency, settlement_currency: settlementCurrency }
        : {}),
      metadata: {
        guest_email: guestEmail,
        // Task 33 Part 2c's TOP_UP_TYPES set (korapay-webhook/index.ts)
        // explicitly does NOT include this type -- a payment confirmed
        // under this type will never credit a wallet, which is exactly
        // Task 36's rule. Part 2 (not built yet) is what needs to
        // start actually branching on this value to create the
        // campaign; until then, a real guest payment of this type
        // would succeed at Korapay but do nothing further on this
        // app's side beyond marking payment_sessions.status =
        // 'success' -- expected and safe (no money is lost or
        // double-spent), just incomplete, consistent with this being
        // Part 1 of 4.
        type: 'campaign_direct',
        description: `Direct campaign payment (guest): ${sourceUrl}`,
        campaign: {
          sourceUrl,
          viewCount,
          genre: genre || undefined,
          geographicTier: geographicTier || 'local',
          targetCountries: targetCountries || [],
          // Snapshotted so Part 2 never has to recompute pricing --
          // see this file's own header comment for why.
          pricing: {
            totalCostCents: pricing.totalCostCents,
            subtotalCents: pricing.subtotalCents,
            platformFeesCents: pricing.platformFeesCents,
            platformFeePercent: pricing.platformFeePercent,
          },
        },
      },
    };

    const admin = createAdminClient();
    const { error: insertError } = await admin.from('payment_sessions').insert(sessionRow);
    if (insertError) {
      console.error('payment_sessions insert error (campaign direct-pay):', insertError);
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again in a moment.' },
        { status: 500 }
      );
    }

    // Same Edge Function every other checkout-initiation flow uses --
    // it re-reads this row itself and is the one that actually calls
    // B-Pay-backend's POST /api/pay. Nothing campaign-specific needed
    // there since it only ever looks at reference/amount/currency/
    // customer, all already generic across every payment_sessions row
    // regardless of metadata.type.
    const { data: fnResult, error: fnError } = await admin.functions.invoke('initialize-payment', {
      body: { reference },
    });

    if (fnError || !fnResult?.success || !fnResult?.checkout_url) {
      console.error(
        'initialize-payment edge function did not return a checkout_url (campaign direct-pay):',
        fnError || fnResult
      );
      return NextResponse.json(
        { error: fnResult?.error || 'Could not start checkout. Please try again in a moment.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      checkout_url: fnResult.checkout_url,
      reference,
      pricing,
    });
  } catch (err: any) {
    console.error('Campaign payment initialize error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to initialize campaign payment' },
      { status: 500 }
    );
  }
}
