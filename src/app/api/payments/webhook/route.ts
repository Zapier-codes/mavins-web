import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/services/payment/korapay.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

/**
 * POST /api/payments/webhook
 * Receives Korapay webhooks for charge.success, charge.failed events
 */
export async function POST(request: NextRequest) {
  try {
    const payload = await request.text();
    const signature = request.headers.get('x-korapay-signature') || '';

    // Verify signature
    if (!verifyWebhookSignature(payload, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const event = JSON.parse(payload);
    const { event: eventType, data } = event;

    if (eventType === 'charge.success') {
      const { reference, amount, currency, customer } = data;
      const metadata = data.metadata || {};
      const userId = metadata.user_id;

      if (!userId) {
        console.error('Webhook missing user_id in metadata:', reference);
        return NextResponse.json({ error: 'Missing user_id' }, { status: 400 });
      }

      const supabase = await createServerSupabaseClient();

      // Check if already credited (idempotency)
      const { data: existing } = await supabase
        .from('wallet_ledger')
        .select('*')
        .eq('user_id', userId)
        .ilike('description', `%${reference}%`)
        .gt('amount_cents', 0)
        .single();

      if (!existing) {
        await supabase.from('wallet_ledger').insert({
          user_id: userId,
          amount_cents: amount,
          type: 'bonus',
          description: `Wallet top-up via ${data.payment_method || 'korapay'}: ${reference}`,
        });

        console.log(`Wallet credited: ${amount} ${currency} for user ${userId}`);
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
