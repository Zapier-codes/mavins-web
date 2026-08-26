import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const event = payload.event;
    const data = payload.data;

    if (event !== 'charge.success') {
      return NextResponse.json({ received: true });
    }

    const reference = data.reference;
    const amount = data.amount;
    const email = data.customer?.email;

    const supabase = createAdminClient();

    // Find payment record
    const { data: payment } = await supabase
      .from('payments')
      .select('id, user_id, metadata')
      .eq('reference', reference)
      .single();

    if (!payment) {
      console.warn('Webhook: payment not found for reference', reference);
      return NextResponse.json({ received: true });
    }

    // Update payment status
    await supabase.from('payments').update({
      status: 'success',
      paid_at: new Date().toISOString(),
      metadata: { ...payment.metadata, webhook_data: data },
    }).eq('id', payment.id);

    // Credit wallet via users.wallet JSONB
    if (payment.user_id) {
      const { data: userData } = await supabase
        .from('users')
        .select('wallet')
        .eq('id', payment.user_id)
        .single();

      const currentWallet = userData?.wallet ? (typeof userData.wallet === 'string' ? JSON.parse(userData.wallet) : userData.wallet) : {};
      const currentBalance = currentWallet?.balance || 0;
      const newBalance = currentBalance + Math.round(amount * 100);

      // Update users.wallet
      await supabase.from('users').update({
        wallet: { balance: newBalance, currency: 'USD' },
        update_time: new Date().toISOString(),
      }).eq('id', payment.user_id);

      // Log to wallet_ledger
      await supabase.from('wallet_ledger').insert({
        id: crypto.randomUUID(),
        user_id: payment.user_id,
        changeset: {
          amount: Math.round(amount * 100),
          currency: 'USD',
          type: 'deposit',
          description: `Wallet top-up via webhook: ${reference}`,
          previous_balance: currentBalance,
          new_balance: newBalance,
        },
        metadata: { source: 'korapay_webhook', reference },
        create_time: new Date().toISOString(),
        update_time: new Date().toISOString(),
      });
    }

    return NextResponse.json({ received: true, credited: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ received: true, error: error.message }, { status: 500 });
  }
}
