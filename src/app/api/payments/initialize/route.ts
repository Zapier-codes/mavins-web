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
 * Authenticated:  Body: { amount: number, currency?: string }
 * Guest:          Body: { amount: number, currency?: string, guestEmail: string }
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
    const { amount, currency = 'NGN' } = body;

    if (!amount || amount < 100) {
      return NextResponse.json({ error: 'Minimum amount is 100 NGN' }, { status: 400 });
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
