import { createClient } from '@supabase/supabase-js';
import { purchaseGrowthMetrics } from '../../../src/lib/growth/purchaseMetrics';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (_req) => {
  try {
    const { data: purchases, error } = await supabase.rpc('process_daily_growth_purchases');
    
    if (error) {
      console.error('process_daily_growth_purchases error:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const results = [];
    for (const row of purchases || []) {
      try {
        // Get campaign source_url
        const { data: campaign } = await supabase
          .from('track_campaigns')
          .select('source_url')
          .eq('id', row.campaign_id)
          .single();

        if (!campaign?.source_url) continue;

        // Purchase from provider
        const orderResult = await purchaseGrowthMetrics({
          service: row.service_id,
          link: campaign.source_url,
          quantity: row.quantity,
        });

        // Record the order
        await supabase.from('campaign_service_orders').insert({
          campaign_id: row.campaign_id,
          service_id: row.service_id,
          provider_order_id: orderResult.order.toString(),
          metric_type: 'views',
          quantity_ordered: row.quantity,
          cost_cents: row.cost_cents,
          status: 'pending',
        });

        // Deduct from remaining budget
        await supabase.rpc('deduct_growth_budget', {
          p_campaign_id: row.campaign_id,
          p_amount_cents: row.cost_cents,
        });

        results.push({ campaign_id: row.campaign_id, service_id: row.service_id, order_id: orderResult.order, quantity: row.quantity, cost: row.cost_cents });
      } catch (purchaseError: any) {
        console.error(`Purchase failed for campaign ${row.campaign_id}:`, purchaseError.message);
        results.push({ campaign_id: row.campaign_id, error: purchaseError.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), { status: 200 });
  } catch (err: any) {
    console.error('Daily growth purchase error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
