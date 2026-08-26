import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/serviceClient';
import { createUserFromPayment } from '@/lib/auth/guestCheckout';

export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  const reference = params.reference;
  const searchParams = request.nextUrl.searchParams;
  const redirectPath = searchParams.get('redirect') || '/';

  try {
    const supabase = createServiceClient();

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

    // Credit wallet via users.wallet JSONB + wallet_ledger.changeset
    if (existing?.user_id) {
      // Get current wallet
      const { data: userData } = await supabase
        .from('users')
        .select('wallet')
        .eq('id', existing.user_id)
        .single();

      const currentWallet = userData?.wallet ? (typeof userData.wallet === 'string' ? JSON.parse(userData.wallet) : userData.wallet) : {};
      const currentBalance = currentWallet?.balance || 0;
      const newBalance = currentBalance + Math.round(amount * 100);

      // Update users.wallet
      await supabase.from('users').update({
        wallet: { balance: newBalance, currency: 'USD' },
        update_time: new Date().toISOString(),
      }).eq('id', existing.user_id);

      // Log to wallet_ledger
      await supabase.from('wallet_ledger').insert({
        id: crypto.randomUUID(),
        user_id: existing.user_id,
        changeset: {
          amount: Math.round(amount * 100),
          currency: 'USD',
          type: 'deposit',
          description: `Wallet top-up via Korapay: ${reference}`,
          previous_balance: currentBalance,
          new_balance: newBalance,
        },
        metadata: { source: 'korapay_verify', reference },
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
      });
    }

    // Guest checkout: create account if needed
    const pending = existing?.metadata?.guest_checkout;
    if (pending && email) {
      await createUserFromPayment(supabase, email, reference, amount);
    }

    return NextResponse.redirect(new URL(redirectPath, request.url));
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return NextResponse.redirect(
      new URL(`/fund-wallet?error=${encodeURIComponent('Server error during verification')}`, request.url)
    );
  }
}
