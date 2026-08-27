import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveOrCreateGuestAccount, creditWalletTopUp } from '@/lib/auth/guestCheckout';

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

    // Verify with Korapay
    const verifyRes = await fetch(`https://api.korapay.com/merchant/api/v1/charges/${reference}`, {
      headers: {
        Authorization: `Bearer ${process.env.KORAPAY_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const verifyData = await verifyRes.json();
    if (!verifyRes.ok || verifyData.data?.status !== 'success') {
      return NextResponse.redirect(
        new URL(`/fund-wallet?error=${encodeURIComponent('Payment verification failed')}`, request.url)
      );
    }

    const amount = verifyData.data.amount;
    const email = verifyData.data.customer?.email;

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

    // Guest checkout: create account if needed
    const pending = existing?.metadata?.guest_checkout;
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
