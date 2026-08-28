import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
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
 *
 * Task 33, Part 1 — this route no longer calls B-Pay-backend directly
 * (that was Task 32's finding, and this is what unblocks it). It now:
 *   1. Writes a public.payment_sessions row with the real amount/
 *      currency/customer details (see
 *      supabase_migration_006_payment_sessions.sql), using the
 *      service-role admin client -- needed unconditionally here now,
 *      not just for the guest flow, since RLS on payment_sessions has
 *      zero policies (default-deny) by design.
 *   2. Invokes the `initialize-payment` Supabase Edge Function with
 *      just `{ reference }` -- that function re-reads the row itself
 *      and is the one that actually calls B-Pay-backend's POST
 *      /api/pay. See that function's own file header for the full
 *      write-up, including the explicit scope note that webhooks stay
 *      on B-Pay-backend for now (this session's product-owner
 *      direction), not moving to the Edge Function yet.
 *
 * Also removed: the old authenticated-flow `wallet_ledger` insert that
 * used to mark a top-up "pending" (`amount_cents: 0, type: 'bonus',
 * description: ...`). Two reasons, not one: (a) payment_sessions now
 * *is* the pending-state record, making that insert purely redundant;
 * and (b) per migration 004's header comment, wallet_ledger's real
 * live columns are `changeset`/`create_time`/`update_time`, not
 * `amount_cents`/`type`/`description` at all -- so that insert was
 * very likely already silently failing against the actual schema
 * before this change (same bug class migration 005 found in
 * guestCheckout.ts). Flagging this explicitly rather than quietly
 * dropping it: worth a project-owner confirmation that no other code
 * depended on that row ever having existed, though nothing found via
 * grep reads it back anywhere.
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

    // Service-role client, unconditionally now -- payment_sessions has
    // no RLS policies at all (default-deny for both anon and
    // authenticated), by design, same posture as wallet_ledger's own
    // money-adjacent tables. See migration 006's header for the full
    // reasoning.
    const admin = createAdminClient();

    let reference: string;
    let sessionRow: Record<string, unknown>;

    if (user) {
      // --- AUTHENTICATED FLOW ---
      const { data: profile } = await supabase
        .from('users')
        .select('artist_name, email')
        .eq('id', user.id)
        .single();

      reference = `WLT-${user.id.slice(0, 8)}-${Date.now()}`;
      sessionRow = {
        reference,
        user_id: user.id,
        customer_email: profile?.email || user.email!,
        customer_name: profile?.artist_name || 'Mavins User',
        provider: 'korapay',
        amount,
        currency,
        ...(paymentCurrency && paymentCurrency !== settlementCurrency
          ? { payment_currency: paymentCurrency, settlement_currency: settlementCurrency }
          : {}),
        metadata: {
          user_id: user.id,
          type: 'wallet_topup',
          description: 'Mavins Wallet Top-up',
        },
      };
    } else {
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

      // No user_id yet -- there's no account until payment succeeds.
      // The guest's email is the anchor; verify/webhook resolve it
      // into an account (see src/lib/auth/guestCheckout.ts).
      reference = `GST-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      sessionRow = {
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
          type: 'wallet_topup_guest',
          description: 'Mavins Wallet Top-up (guest)',
        },
      };
    }

    const { error: insertError } = await admin.from('payment_sessions').insert(sessionRow);
    if (insertError) {
      console.error('payment_sessions insert error:', insertError);
      return NextResponse.json(
        { error: 'Could not start checkout. Please try again in a moment.' },
        { status: 500 }
      );
    }

    // The admin client's project URL doubles as its Functions base URL
    // (supabase-js derives `${url}/functions/v1/<name>` internally) --
    // no separate functions client/URL needed.
    const { data: fnResult, error: fnError } = await admin.functions.invoke('initialize-payment', {
      body: { reference },
    });

    if (fnError || !fnResult?.success || !fnResult?.checkout_url) {
      console.error('initialize-payment edge function did not return a checkout_url:', fnError || fnResult);
      return NextResponse.json(
        { error: fnResult?.error || 'Could not start checkout. Please try again in a moment.' },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      checkout_url: fnResult.checkout_url,
      reference,
    });
  } catch (err: any) {
    console.error('Payment initialize error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to initialize payment' },
      { status: 500 }
    );
  }
}

