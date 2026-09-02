import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const GROWTH_API_BASE = "https://freshconnectpanel.com/api/v2";
const GROWTH_API_KEY = Deno.env.get("GROWTH_METRICS_API_KEY")!;

async function purchaseGrowthMetrics(service: string, link: string, quantity: number): Promise<{ order: number }> {
  const res = await fetch(GROWTH_API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: GROWTH_API_KEY, action: "add", service, link, quantity }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Purchase failed");
  return { order: data.order };
}

Deno.serve(async (_req) => {
  try {
    console.log("🟢 Edge Function called");

    const { data: purchases, error } = await supabase.rpc("process_daily_growth_purchases");
    if (error) {
      console.error("RPC error:", error);
      return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }

    if (!purchases || purchases.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0, results: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Group by campaign_id (the RPC may return multiple rows per campaign)
    const campaignMap = new Map();
    for (const row of purchases) {
      if (!campaignMap.has(row.campaign_id)) {
        campaignMap.set(row.campaign_id, []);
      }
      campaignMap.get(row.campaign_id).push(row);
    }

    const allResults = [];
    let anySuccess = false;

    for (const [campaignId, rows] of campaignMap) {
      let campaignAnySuccess = false;
      const campaignResults = [];

      for (const row of rows) {
        try {
          console.log(`🔄 Processing campaign ${campaignId}, service ${row.service_id}`);
          const orderResult = await purchaseGrowthMetrics(
            row.service_id,
            row.source_url,
            row.quantity
          );
          console.log(`✅ Order placed: ${orderResult.order}`);

          await supabase.from("campaign_service_orders").insert({
            campaign_id: row.campaign_id,
            service_id: row.service_id,
            provider_order_id: orderResult.order.toString(),
            metric_type: "views",
            quantity_ordered: row.quantity,
            cost_cents: row.cost_cents,
            status: "pending",
          });

          await supabase.rpc("deduct_growth_budget", {
            p_campaign_id: row.campaign_id,
            p_amount_cents: row.cost_cents,
          });

          campaignAnySuccess = true;
          anySuccess = true;
          campaignResults.push({ service_id: row.service_id, order_id: orderResult.order });
        } catch (e: any) {
          console.error(`❌ Failed for campaign ${campaignId}, service ${row.service_id}:`, e.message);
          campaignResults.push({ service_id: row.service_id, error: e.message });
        }
      }

      // After processing all services for this campaign, update its status
      if (campaignAnySuccess) {
        // At least one service succeeded – campaign is live
        await supabase
          .from("track_campaigns")
          .update({
            is_active: true,
            purchase_status: 'live',
            current_stage: 'branching'
          })
          .eq("id", campaignId);
      } else {
        // No service succeeded – campaign failed
        await supabase
          .from("track_campaigns")
          .update({
            is_active: false,
            purchase_status: 'failed'
          })
          .eq("id", campaignId);
      }

      allResults.push({ campaign_id: campaignId, results: campaignResults });
    }

    return new Response(JSON.stringify({
      success: true,
      processed: allResults.length,
      results: allResults,
      anySuccess
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Fatal error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
