import { NextRequest, NextResponse } from 'next/server';
import { initializeCharge } from '@/services/payment/korapay.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';

const GUEST_RATE_LIMIT = 5; // checkout attempts
const GUEST_RATE_WINDOW_MS = 10 * 60 * 1000; // per 10 minutes per IP
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/payments/initialize
 *
 * `amount` is in the base currency unit (whole dollars for USD, the
 * app's own default/accounting currency -- matching what /fund-wallet
 * displays to the user) -- NOT cents/kobo. See korapay.service.ts's
 * InitializeChargeInput comment for why this matters (a prior
 * caller-side ×100-assuming-NGN here caused a 100x overcharge bug,
 * fixed this session, then corrected again per project owner
 * direction: this app does not default to or convert into NGN
 * client-side at all -- USD is the default, and Korapay's own Dynamic
 * Currency Conversion (DCC) handles showing a non-US payer their local
 * currency at checkout. See `paymentCurrency` below.
 *
 * Authenticated:  Body: { amount: number, currency?: string, paymentCurrency?: string }
 * Guest:          Body: { amount: number, currency?: string, paymentCurrency?: string, guestEmail: string }
 *
 * `paymentCurrency` (optional): the payer's own local currency, as
 * resolved client-side via geo-IP (see
 * src/lib/currency/korapayDccCurrency.ts) -- NOT computed or converted
 * here, just forwarded. When present, this triggers Korapay's DCC:
 * the payer sees the converted amount in their currency at checkout,
 * while we still get settled in USD (this app's settlement_currency,
 * hardcoded below since this app only ever settles in USD today).
 * When absent, the payer just pays the USD amount directly.
 *
 * Creates a Korapay checkout session for a wallet top-up. Guests
 * (no session) can hit this too -- that's the whole point of "insufficient
 * funds opens the fund-wallet page before an account exists" -- but since
 * anonymous visitors triggering real checkout-session creation is a
 * spam/fraud surface, guest calls are rate-limited by IP.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const body = await request.json();
    const { amount, currency = 'USD', paymentCurrency } = body;
    // Settlement currency is hardcoded to USD -- this app only ever
    // settles in USD today (see Korapay dashboard settings, Settlements
    // section, which is where this would actually need to change, not
    // here). Only meaningful when paymentCurrency is also set (DCC).
    const settlementCurrency = 'USD';

    // $1 is a placeholder floor to reject zero/negative/garbage input,
    // not a considered business minimum -- the cheapest real campaign
    // tier costs several dollars (see pricing.ts's PRICING_TIERS). If
    // the project owner wants a specific minimum top-up, replace this
    // with that number explicitly rather than relying on this floor.
    if (!amount || amount < 1) {
      return NextResponse.json({ error: 'Minimum amount is $1' }, { status: 400 });
    }

    if (user) {
      // --- AUTHENTICATED FLOW (unchanged) ---
      const { data: profile } = await supabase
        .from('users')
        .select('artist_name, email')
        .eq('id', user.id)
        .single();

      const reference = `WLT-${user.id.slice(0, 8)}-${Date.now()}`;

      const result = await initializeCharge({
        amount,
        currency,
        ...(paymentCurrency && paymentCurrency !== settlementCurrency
          ? { paymentCurrency, settlementCurrency }
          : {}),
        reference,
        customerEmail: profile?.email || user.email!,
        customerName: profile?.artist_name || 'Mavins User',
        metadata: {
          user_id: user.id,
          type: 'wallet_topup',
          description: 'Mavins Wallet Top-up',
        },
      });

      // Store pending transaction
      await supabase.from('wallet_ledger').insert({
        user_id: user.id,
        amount_cents: 0, // Will be updated on webhook confirmation
        type: 'bonus',
        description: `Pending top-up: ${reference}`,
      });

      if (!result.data?.checkout_url) {
        console.error('Korapay initialize returned no checkout_url (authenticated flow):', result);
        return NextResponse.json(
          { error: 'Could not start checkout. Please try again in a moment.' },
          { status: 502 }
        );
      }

      return NextResponse.json({
        success: true,
        checkout_url: result.data.checkout_url,
        reference: result.data.reference,
      });
    }

    // --- GUEST FLOW ---
    const guestEmail = typeof body.guestEmail === 'string' ? body.guestEmail.trim().toLowerCase() : '';

    if (!guestEmail || !EMAIL_RE.test(guestEmail)) {
      return NextResponse.json({ error: 'A valid email is required' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const allowed = checkRateLimit(`guest-init:${ip}`, GUEST_RATE_LIMIT, GUEST_RATE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    // No user_id yet -- there's no account until payment succeeds. The
    // guest's email is the only anchor; verify/webhook resolve it into
    // an account (see src/lib/auth/guestCheckout.ts). Nothing gets
    // written to wallet_ledger here since there's no user_id to attach
    // a pending row to yet.
    const reference = `GST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await initializeCharge({
      amount,
      currency,
      ...(paymentCurrency && paymentCurrency !== settlementCurrency
        ? { paymentCurrency, settlementCurrency }
        : {}),
      reference,
      customerEmail: guestEmail,
      customerName: 'Mavins User',
      metadata: {
        guest_email: guestEmail,
        type: 'wallet_topup_guest',
        description: 'Mavins Wallet Top-up (guest)',
      },
    });

    if (!result.data?.checkout_url) {
      console.error('Korapay initialize returned no checkout_url (guest flow):', result);
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again in a moment.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      checkout_url: result.data.checkout_url,
      reference: result.data.reference,
    });
  } catch (err: any) {
    console.error('Payment initialize error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to initialize payment' },
      { status: 500 }
    );
  }
}
