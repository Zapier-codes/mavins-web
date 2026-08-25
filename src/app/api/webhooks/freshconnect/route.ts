import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * POST /api/webhooks/freshconnect
 * Receives Fresh Connect order status updates.
 *
 * Expected payload:
 * {
 *   order: number,
 *   status: "Pending" | "In progress" | "Partial" | "Completed" | "Canceled",
 *   charge: string,
 *   start_count: string,
 *   remains: string,
 *   currency: string
 * }
 *
 * On Completed: mark campaign as completed.
 * On Partial: calculate refund = (remains / quantity) * total_budget_cents.
 * On Canceled: full refund.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const payload = await request.json();
    const { order, status, remains } = payload;

    if (!order || !status) {
      return NextResponse.json({ error: 'Missing order or status' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server config error' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find campaign by fresh_connect_order_id
    const { data: campaign, error: campError } = await supabase
      .from('track_campaigns')
      .select('*')
      .eq('fresh_connect_order_id', order.toString())
      .single();

    if (campError || !campaign) {
      console.error('[FreshConnect Webhook] Campaign not found for order:', order);
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const totalBudget = campaign.total_budget_cents;
    const delivered = parseInt(payload.start_count || '0');
    const remaining = parseInt(remains || '0');

    if (status === 'Completed') {
      await supabase
        .from('track_campaigns')
        .update({
          current_stage: 'completed',
          completed_at: new Date().toISOString(),
          is_active: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);
    } else if (status === 'Partial') {
      // Calculate refund for undelivered portion
      const refundCents = Math.round((remaining / (delivered + remaining)) * totalBudget);
      if (refundCents > 0) {
        await supabase.from('wallet_ledger').insert({
          user_id: campaign.artist_id,
          amount_cents: refundCents,
          type: 'bonus',
          description: `Fresh Connect partial refund (order ${order}): ${remaining} undelivered`,
        });
      }
      await supabase
        .from('track_campaigns')
        .update({
          spent_cents: totalBudget - refundCents,
          is_active: false,
          current_stage: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);
    } else if (status === 'Canceled') {
      // Full refund
      await supabase.from('wallet_ledger').insert({
        user_id: campaign.artist_id,
        amount_cents: totalBudget,
        type: 'bonus',
        description: `Fresh Connect cancellation refund (order ${order})`,
      });
      await supabase
        .from('track_campaigns')
        .update({
          spent_cents: 0,
          is_active: false,
          current_stage: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', campaign.id);
    }

    return NextResponse.json({ received: true, order, status });
  } catch (err: any) {
    console.error('Fresh Connect webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
