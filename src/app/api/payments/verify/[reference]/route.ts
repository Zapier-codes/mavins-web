import { NextRequest, NextResponse } from 'next/server';
import { verifyCharge } from '@/services/payment/korapay.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveOrCreateGuestAccount, creditWalletTopUp } from '@/lib/auth/guestCheckout';
import { checkRateLimit, getClientIp } from '@/lib/security/rateLimit';

const GUEST_RATE_LIMIT = 15;
const GUEST_RATE_WINDOW_MS = 10 * 60 * 1000;

/**
 * GET /api/payments/verify/{reference}
 *
 * Checks the status of a Korapay charge and credits the wallet if
 * successful. Called by the client right after redirect from Korapay
 * checkout -- this is the fast, client-triggered path; the webhook
 * (src/app/api/payments/webhook/route.ts) is the authoritative
 * server-to-server path and does the same crediting idempotently in
 * case this call never happens (tab closed, network drop, etc).
 *
 * Two shapes of caller:
 *  - Logged-in user topping up: unchanged from before.
 *  - Guest who just paid with no account yet: resolves/creates the
 *    account here and, only for a brand-new account, returns session
 *    tokens for the client to apply via supabase.auth.setSession().
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  try {
    const { reference } = params;
    if (!reference) {
      return NextResponse.json({ error: 'Reference required' }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // --- AUTHENTICATED FLOW (unchanged) ---
      const result = await verifyCharge(reference);

      if (result.data.status === 'successful') {
        const { data: existing } = await supabase
          .from('wallet_ledger')
          .select('*')
          .eq('user_id', user.id)
          .ilike('description', `%${reference}%`)
          .gt('amount_cents', 0)
          .single();

        if (!existing) {
          await supabase.from('wallet_ledger').insert({
            user_id: user.id,
            amount_cents: result.data.amount,
            type: 'bonus',
            description: `Wallet top-up via ${result.data.channel || 'korapay'}: ${reference}`,
          });
        }

        return NextResponse.json({
          success: true,
          status: result.data.status,
          amount: result.data.amount,
          reference: result.data.reference,
        });
      }

      return NextResponse.json({
        success: false,
        status: result.data.status,
        reference: result.data.reference,
      });
    }

    // --- GUEST FLOW ---
    const ip = getClientIp(request);
    const allowed = checkRateLimit(`guest-verify:${ip}`, GUEST_RATE_LIMIT, GUEST_RATE_WINDOW_MS);
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a few minutes and try again.' },
        { status: 429 }
      );
    }

    const result = await verifyCharge(reference);

    if (result.data.status !== 'successful') {
      return NextResponse.json({
        success: false,
        status: result.data.status,
        reference: result.data.reference,
      });
    }

    const guestEmail = result.data.metadata?.guest_email;
    if (!guestEmail) {
      return NextResponse.json(
        { error: 'This payment has no account to attach to. Please contact support.' },
        { status: 400 }
      );
    }

    const account = await resolveOrCreateGuestAccount(guestEmail);
    await creditWalletTopUp({
      userId: account.userId,
      amountCents: result.data.amount,
      reference,
      channel: result.data.channel,
    });

    if (account.isNewAccount && account.session) {
      return NextResponse.json({
        success: true,
        status: result.data.status,
        amount: result.data.amount,
        reference: result.data.reference,
        account: { created: true, profileCompleted: false },
        session: account.session,
      });
    }

    // Existing account (or session mint failed) -- funds are credited,
    // but we deliberately do not hand out a session for an account we
    // didn't just create. See src/lib/auth/guestCheckout.ts for why.
    return NextResponse.json({
      success: true,
      status: result.data.status,
      amount: result.data.amount,
      reference: result.data.reference,
      account: { created: account.isNewAccount, profileCompleted: account.profileCompleted },
      requiresLogin: true,
    });
  } catch (err: any) {
    console.error('Payment verify error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to verify payment' },
      { status: 500 }
    );
  }
}
