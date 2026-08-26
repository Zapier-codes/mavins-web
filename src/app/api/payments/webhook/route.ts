import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature } from '@/services/payment/korapay.service';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { resolveOrCreateGuestAccount, creditWalletTopUp } from '@/lib/auth/guestCheckout';

/**
 * POST /api/payments/webhook
 * Receives Korapay webhooks for charge.success, charge.failed events
 *
 * This is the source of truth for crediting a wallet -- it has to work
 * even if the browser that started the checkout never comes back (tab
 * closed, phone died, network drop after paying). For authenticated
 * top-ups metadata.user_id is already there. For guest top-ups there's
 * only metadata.guest_email, so this resolves/creates the account the
 * same way the verify route does. No session is issued from here --
 * a webhook has no browser to hand a session to; the client-triggered
 * verify call (or, failing that, a normal login) is what gets the
 * guest into a session, this endpoint's job is just "money is safe."
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
      const { reference, amount, currency } = data;
      const metadata = data.metadata || {};
      const userId = metadata.user_id;
      const guestEmail = metadata.guest_email;

      if (userId) {
        // --- AUTHENTICATED FLOW (unchanged) ---
        const supabase = await createServerSupabaseClient();

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
      } else if (guestEmail) {
        // --- GUEST FLOW ---
        const account = await resolveOrCreateGuestAccount(guestEmail);
        const { credited } = await creditWalletTopUp({
          userId: account.userId,
          amountCents: amount,
          reference,
          channel: data.payment_method,
        });

        if (credited) {
          console.log(`Guest wallet credited: ${amount} ${currency} for ${guestEmail} (user ${account.userId})`);
        }
      } else {
        console.error('Webhook missing user_id/guest_email in metadata:', reference);
        return NextResponse.json({ error: 'Missing user identifier' }, { status: 400 });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error('Webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
