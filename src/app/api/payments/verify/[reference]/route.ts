import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrCreateGuestAccount, creditWalletTopUp } from '@/lib/auth/guestCheckout';
import { verifyCharge } from '@/services/payment/korapay.service';

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  const reference = params.reference;
  const searchParams = request.nextUrl.searchParams;
  const redirectPath = searchParams.get('redirect') || '/';

  try {
    const supabase = createAdminClient();

    // Check if already processed
    const { data: existing } = await supabase
      .from('payments')
      .select('status, user_id, metadata')
      .eq('reference', reference)
      .single();

    if (existing?.status === 'success') {
      // Already credited — just redirect
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    // Verify via the render backend proxy — NOT a direct call to
    // Korapay. Korapay requires the caller's IP to be whitelisted, and
    // this route runs on Vercel (no stable outbound IP), so a direct
    // call here would be rejected the same way /initialize would be
    // if it skipped the proxy. See korapay.service.ts's file header
    // for the full "Endpoint not found" diagnosis — this route was the
    // one place that had never been switched over to the proxy.
    let verifyData;
    try {
      verifyData = await verifyCharge(reference);
    } catch (verifyErr: any) {
      console.error('Payment verification error (render backend):', verifyErr);
      return NextResponse.redirect(
        new URL(`/fund-wallet?error=${encodeURIComponent('Payment verification failed')}`, request.url)
      );
    }

    // Korapay's own API returns status: 'success' — 'successful' is
    // accepted too in case the proxy backend normalizes it.
    const chargeStatus = verifyData.data?.status;
    if (chargeStatus !== 'success' && chargeStatus !== 'successful') {
      return NextResponse.redirect(
        new URL(`/fund-wallet?error=${encodeURIComponent('Payment verification failed')}`, request.url)
      );
    }

    const amount = verifyData.data.amount;
    // Prefer Korapay's own customer.email, but fall back to the email
    // we stored at /initialize time (existing.metadata.guest_email) —
    // it's not confirmed the render proxy passes `customer` through on
    // /api/verify (see korapay.service.ts), so don't let guest account
    // resolution silently break on that alone.
    const email = verifyData.data.customer?.email || existing?.metadata?.guest_email;

    // Update payment record
    await supabase.from('payments').update({
      status: 'success',
      paid_at: new Date().toISOString(),
      metadata: { ...existing?.metadata, korapay_response: verifyData.data },
    }).eq('reference', reference);

    // Credit wallet atomically via credit_wallet_deposit() RPC (see
    // supabase_migration_004_credit_wallet_deposit.sql) -- same function
    // the webhook route calls, so a webhook delivery and this route
    // firing for the same payment (this route runs from the browser
    // landing back on /promote after checkout) can't double-credit --
    // the second call is a no-op via the reference-based unique index.
    if (existing?.user_id) {
      const { error: creditError } = await supabase.rpc('credit_wallet_deposit', {
        p_user_id: existing.user_id,
        p_amount_cents: Math.round(amount * 100),
        p_reference: reference,
        p_source: 'korapay_verify',
      });
      if (creditError) {
        console.error('Verify: credit_wallet_deposit failed', creditError);
        return NextResponse.redirect(
          new URL(`/fund-wallet?error=${encodeURIComponent('Could not credit wallet — contact support with reference ' + reference)}`, request.url)
        );
      }
    }

    // Guest checkout: create account if needed.
    // /api/payments/initialize stores this as `type: 'wallet_topup_guest'`
    // plus `guest_email` — not a `guest_checkout` flag, which was never
    // actually set anywhere, so this branch could never have fired.
    const pending = existing?.metadata?.type === 'wallet_topup_guest';
    if (pending && email) {
      const guestAccount = await resolveOrCreateGuestAccount(email);
      await creditWalletTopUp({
        userId: guestAccount.userId,
        amountCents: Math.round(amount * 100),
        reference,
        channel: 'korapay',
      });
      // Note: guestAccount.session (only populated for brand-new
      // accounts) isn't applied here — this route only redirects, it
      // doesn't set auth cookies. New guests land on /login same as
      // returning ones for now; wiring an auto-login session is a
      // separate follow-up if the product owner wants that UX.
    }

    return NextResponse.redirect(new URL(redirectPath, request.url));
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return NextResponse.redirect(
      new URL(`/fund-wallet?error=${encodeURIComponent('Server error during verification')}`, request.url)
    );
  }
}
