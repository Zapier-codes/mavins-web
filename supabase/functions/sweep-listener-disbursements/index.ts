// supabase/functions/sweep-listener-disbursements/index.ts
//
// Task 49, Part (c-b) — scheduler wiring for the listener-payout
// sweep. Part (c-a) (migration 041,
// `sweep_claimable_withdrawals_for_disbursement()`) already finds
// every 'claimable' listener_earnings cycle and disburses it via
// disburse_listener_withdrawal() -- but nothing calls that RPC on a
// cadence yet. This function is that caller: a thin, stateless wrapper
// invoked on a schedule (see the deploy command below for the two
// scheduling options), same "function exists, cron wiring is a
// separate concern" posture as compute_daily_payout_pool and
// promote_pending_withdrawals_to_claimable already established
// elsewhere in this project.
//
// Deliberately NOT an HTTP-triggered, request-time call -- migration
// 041's own header already established why: a withdrawal REQUEST only
// moves a cycle to 'pending' (migration 040); nothing is 'claimable'
// until 50 calendar days later, and there is no listener HTTP request
// present at that moment for a route to hang a disbursement call off
// of. This function exists to be invoked by a scheduler, not a user.
//
// service_role-only downstream: the RPC itself is already
// service_role-only (migration 041's own REVOKE/GRANT), so this
// function's own service-role client is what's actually allowed to
// call it -- matching every other scheduler-invoked function in this
// project (daily-growth-purchase's own service-role client is the
// same pattern).
//
// Per Supabase's own current guidance (supabase.com/docs/guides/
// ai-tools/ai-prompts/edge-functions): use Deno.serve() directly, and
// import external deps via a versioned `jsr:` specifier -- matching
// this repo's own initialize-payment and daily-growth-purchase
// functions rather than introducing a different import style.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("🟢 sweep-listener-disbursements: run started");

    // Task 49 Part (c-d), migration 043 — p_triggered_by attributes
    // this function's own runs in listener_disbursement_sweep_runs as
    // 'edge_function', distinct from the (c-c) admin route ('admin')
    // and the real pg_cron scheduler ('cron', migration 043's own
    // re-registered job command). This function itself isn't currently
    // invoked by anything (Option A wires the cron job directly to the
    // RPC, migration 042) -- this label is for if/when it's ever used
    // as the Option B fallback described in this file's own header.
    const { data, error } = await supabase.rpc(
      "sweep_claimable_withdrawals_for_disbursement",
      { p_triggered_by: "edge_function" }
    );

    if (error) {
      // Matches migration 041's own RPC-level error posture: this is
      // the sweep call itself failing (e.g. RPC not found, connection
      // issue), not an individual cycle failing -- per-row failures
      // are already caught inside the RPC's own BEGIN/EXCEPTION block
      // and rolled up into cycles_skipped_other instead of surfacing
      // here.
      console.error("🔴 sweep RPC error:", error);
      return jsonResponse({ success: false, error: error.message }, 500);
    }

    // The RPC's RETURNS TABLE(...) comes back as a single-row array
    // via .rpc() -- unwrap it rather than returning the array as-is,
    // since every caller of this function (a manual curl, a future
    // (c-c) admin route, (c-d) observability logging) wants the one
    // summary row, not an array-of-one to re-unwrap themselves.
    const summary = Array.isArray(data) ? data[0] : data;

    console.log("✅ sweep-listener-disbursements: run complete", summary);

    // (c-d) (observability / audit-table persistence of this summary)
    // is its own, still-open sub-part per Task 49's own write-up --
    // deliberately not folded in here. This function's job is only to
    // invoke the sweep on a schedule and report the outcome to
    // whatever called it (a cron log, or a future (c-c) admin route).
    return jsonResponse({ success: true, ...summary });
  } catch (err) {
    console.error("🔴 sweep-listener-disbursements: unexpected error", err);
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});
