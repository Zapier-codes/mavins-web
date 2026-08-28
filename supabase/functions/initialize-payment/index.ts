// supabase/functions/initialize-payment/index.ts
//
// Task 33, Part 1 — the Supabase Edge Function that is now "this
// backend's caller" per B-Pay-backend's handover.md, Decision 1.
//
// Flow: the Next.js app (src/app/api/payments/initialize/route.ts)
// generates a `reference`, writes a row to public.payment_sessions
// with the real amount/currency/customer details, then invokes THIS
// function with just `{ reference }`. This function re-reads those
// details from the row itself (not from whatever the caller passes at
// invoke time -- defense in depth, since the row was already
// validated/rate-limited server-side before this function ever runs),
// calls B-Pay-backend's POST /api/pay, and writes the result back.
//
// Scope note (explicit product-owner direction this session): webhooks
// and payment verification stay on B-Pay-backend for now. This
// function only ever moves a row from 'pending' -> 'checkout_created'
// (or leaves it 'pending' with `last_error` set, on failure) -- it
// never sets 'success'/'failed', since those states depend on a
// webhook this function doesn't receive yet. See
// supabase_migration_006_payment_sessions.sql's header for the same
// note and what a later task should do about it.
//
// Per Supabase's own current guidance (supabase.com/docs/guides/
// ai-tools/ai-prompts/edge-functions, checked this session): use
// Deno.serve() directly (no deno.land/std http/server.ts import
// needed), and import external deps via a versioned `jsr:`/`npm:`
// specifier, not deno.land/x or esm.sh.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Mirrors src/services/payment/korapay.service.ts's own unwrapping
// logic on the Next.js side (kept in sync manually -- see that file's
// header comment for the full explanation of *why* B-Pay-backend's
// routes.js double-nests the response): routes.js wraps whichever
// provider actually ran under its own `data` key, and Korapay's own
// response is itself `{ status, message, data: {...} }`, so the real
// checkout_url sits at json.data.data.checkout_url, not
// json.data.checkout_url. Falls back to json.data in case a future
// B-Pay-backend change flattens this, rather than assuming the double
// nesting is permanent.
function unwrapBPayResponse(json: any): any {
  return json?.data?.data ?? json?.data ?? {};
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let reference: string;
  try {
    const body = await req.json();
    reference = typeof body?.reference === 'string' ? body.reference.trim() : '';
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  if (!reference) {
    return jsonResponse({ error: 'reference is required' }, 400);
  }

  // These two are automatically available to every deployed Edge
  // Function -- no manual `supabase secrets set` needed for them
  // specifically (unlike BPAY_BACKEND_URL below, which is NOT
  // auto-provided).
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Not auto-provided -- must be set explicitly:
  //   supabase secrets set BPAY_BACKEND_URL=https://b-pay-backend.onrender.com
  // Matches src/services/payment/korapay.service.ts's own
  // RENDER_BACKEND_URL default, kept as a fallback here too so this
  // still works before that secret is set for the first time.
  const bpayBackendUrl = Deno.env.get('BPAY_BACKEND_URL') || 'https://b-pay-backend.onrender.com';

  const { data: session, error: fetchError } = await supabase
    .from('payment_sessions')
    .select('*')
    .eq('reference', reference)
    .single();

  if (fetchError || !session) {
    return jsonResponse({ error: `No payment_sessions row found for reference '${reference}'` }, 404);
  }

  // Idempotency guard: B-Pay-backend itself does NOT deduplicate
  // (per Decision 1 -- it "accept[s] whatever reference it's given...
  // and forward[s] it as-is to the provider"), so a duplicate invoke
  // of this function (e.g. a client retry after a slow response) must
  // not re-initiate a second charge with the provider. If we already
  // have a checkout_url, hand back the SAME one rather than calling
  // B-Pay-backend again.
  if (session.status !== 'pending') {
    return jsonResponse({
      success: session.status === 'checkout_created',
      reference,
      status: session.status,
      checkout_url: session.checkout_url ?? null,
      note: 'Payment session already processed; not re-initiating.',
    });
  }

  const payload: Record<string, unknown> = {
    provider: session.provider,
    amount: session.amount,
    currency: session.currency,
    reference: session.reference,
    customer: {
      email: session.customer_email,
      name: session.customer_name ?? undefined,
    },
    metadata: session.metadata ?? {},
  };
  // Only forwarded when both are set -- matches korapay.service.ts's
  // own guard and B-Pay-backend's providers/korapay.js, which requires
  // both together too.
  if (session.payment_currency && session.settlement_currency) {
    payload.payment_currency = session.payment_currency;
    payload.settlement_currency = session.settlement_currency;
  }

  let bpayJson: any;
  try {
    const res = await fetch(`${bpayBackendUrl}/api/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    bpayJson = await res.json().catch(() => ({}));

    if (!res.ok) {
      const message = bpayJson?.message || bpayJson?.error || `B-Pay-backend returned ${res.status}`;
      await supabase
        .from('payment_sessions')
        .update({ last_error: message, provider_response: bpayJson, updated_at: new Date().toISOString() })
        .eq('reference', reference);
      return jsonResponse({ success: false, error: message }, 502);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Network error calling B-Pay-backend';
    await supabase
      .from('payment_sessions')
      .update({ last_error: message, updated_at: new Date().toISOString() })
      .eq('reference', reference);
    return jsonResponse({ success: false, error: message }, 502);
  }

  const inner = unwrapBPayResponse(bpayJson);
  const checkoutUrl = inner?.checkout_url;

  if (!checkoutUrl || typeof checkoutUrl !== 'string') {
    const message =
      bpayJson?.message ||
      bpayJson?.data?.message ||
      'B-Pay-backend did not return a checkout URL.';
    await supabase
      .from('payment_sessions')
      .update({ last_error: message, provider_response: bpayJson, updated_at: new Date().toISOString() })
      .eq('reference', reference);
    return jsonResponse({ success: false, error: message }, 502);
  }

  await supabase
    .from('payment_sessions')
    .update({
      status: 'checkout_created',
      checkout_url: checkoutUrl,
      provider_response: bpayJson,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('reference', reference);

  return jsonResponse({ success: true, reference, checkout_url: checkoutUrl });
});
