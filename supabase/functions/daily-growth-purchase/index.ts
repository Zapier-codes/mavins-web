import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const GROWTH_API_BASE = 'https://growth-metrics-provider.com/api/v2';
const GROWTH_API_KEY = Deno.env.get('GROWTH_METRICS_API_KEY')!;

async function purchaseGrowthMetrics(service: string, link: string, quantity: number): Promise<{ order: number }> {
  const res = await fetch(`${GROWTH_API_BASE}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: GROWTH_API_KEY, action: 'add', service, link, quantity }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || 'Purchase failed');
  return { order: data.order };
}

Deno.serve(async (_req) => {
  try {
    const { data: purchases, error } = await supabase.rpc('process_daily_growth_purchases');
    if (error) {
      console.error('RPC error:', error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    const results = [];
    for (const row of purchases || []) {
      try {
        const { data: campaign } = await supabase
          .from('track_campaigns')
          .select('source_url')
          .eq('id', row.campaign_id)
          .single();

        if (!campaign?.source_url) continue;

        const orderResult = await purchaseGrowthMetrics(row.service_id, campaign.source_url, row.quantity);

        await supabase.from('campaign_service_orders').insert({
          campaign_id: row.campaign_id,
          service_id: row.service_id,
          provider_order_id: orderResult.order.toString(),
          metric_type: 'views',
          quantity_ordered: row.quantity,
          cost_cents: row.cost_cents,
          status: 'pending',
        });

        await supabase.rpc('deduct_growth_budget', {
          p_campaign_id: row.campaign_id,
          p_amount_cents: row.cost_cents,
        });

        results.push({ campaign_id: row.campaign_id, order_id: orderResult.order, quantity: row.quantity, cost: row.cost_cents });
      } catch (e: any) {
        console.error(`Failed: ${row.campaign_id}`, e.message);
        results.push({ campaign_id: row.campaign_id, error: e.message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), { status: 200 });
  } catch (err: any) {
    console.error('Fatal error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
