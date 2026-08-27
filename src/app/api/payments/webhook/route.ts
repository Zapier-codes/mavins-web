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

    // Credit wallet atomically via credit_wallet_deposit() RPC (see
    // supabase_migration_004_credit_wallet_deposit.sql) -- replaces the
    // previous inline read-modify-write, which raced with /verify hitting
    // the same payment concurrently and wasn't idempotent against a
    // duplicate webhook delivery.
    if (payment.user_id) {
      const { data: creditResult, error: creditError } = await supabase.rpc('credit_wallet_deposit', {
        p_user_id: payment.user_id,
        p_amount_cents: Math.round(amount * 100),
        p_reference: reference,
        p_source: 'korapay_webhook',
      });

      if (creditError) {
        console.error('Webhook: credit_wallet_deposit failed', creditError);
        return NextResponse.json({ received: true, error: creditError.message }, { status: 500 });
      }

      const credited = Array.isArray(creditResult) ? creditResult[0]?.credited : creditResult?.credited;
      return NextResponse.json({ received: true, credited: !!credited });
    }

    return NextResponse.json({ received: true, credited: false });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ received: true, error: error.message }, { status: 500 });
  }
}
