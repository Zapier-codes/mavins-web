// supabase/functions/korapay-webhook/index.ts
//
// Closes the gap Task 33 Part 1 deliberately left open: per the
// project owner's explicit direction (confirmed in chat, see
// B-Pay-backend's handover.md, "Project owner decisions" -> Decision 1),
// this Edge Function -- not B-Pay-backend's own /api/webhooks/korapay
// route -- is the real destination for Korapay's webhook, in the sense
// that it's what ultimately updates payment_sessions. It verifies a
// signature, updates the matching public.payment_sessions row, and
// writes the raw payload back for audit/debugging.
//
// Task 42 -- who signs what this function verifies changed. Korapay's
// dashboard has exactly one webhook-URL slot account-wide, and the
// project owner is running multiple multi-tenant apps beyond this one
// that also need Korapay webhooks -- so B-Pay-backend now sits in
// front as a single gateway (webhookGateway.js there), verifies
// Korapay's own signature ONCE, and fans each event out to whichever
// app's `reference` prefix matches (this app's prefix: `MAVW`). Once
// Korapay's dashboard is re-pointed at that gateway (confirmed done as
// of this task, see handover.md), Korapay never calls this function
// directly again -- the gateway does, with its OWN internal signature,
// not Korapay's. Verifying Korapay's x-korapay-signature here now
// would always fail, since this function will never see a
// genuine-from-Korapay request again. See verifyGatewaySignature below
// for the new algorithm, copied exactly from B-Pay-backend's
// webhookGateway.js#signForward so the two sides agree byte-for-byte.
//
// NOT this function's job (deliberately out of scope, left for the
// very next task -- see handover.md's Task 33 Part 2 note): actually
// crediting a wallet. This function only ever writes
// payment_sessions.status to 'success' or 'failed' plus the raw
// provider_response -- Part 2 is what reads that status change and
// decides whether/how much to credit, with the first-time-vs-
// returning-user distinction Decision 2 describes. Keeping those two
// concerns in separate commits/functions rather than one.
//
// Per Supabase's own current guidance (supabase.com/docs/guides/
// ai-tools/ai-prompts/edge-functions, same source initialize-payment's
// own header cites): Deno.serve() directly, `jsr:`/`npm:`/`node:`
// specifiers, not deno.land/x or esm.sh.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createHmac, timingSafeEqual } from 'node:crypto';

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

// Task 42 -- verifies B-Pay-backend's webhookGateway.js#signForward
// output, not Korapay's own signature (see this file's header comment
// for why that changed). Algorithm copied exactly: HMAC-SHA256 hex
// digest, compared via timingSafeEqual against the
// X-Gateway-Signature header.
//
// Deliberately hashes the RAW request body text, not a re-serialized
// copy of the parsed object -- signForward computes its HMAC over
// `JSON.stringify(rawBody)` on the Node/Render side and sends that
// exact string as the HTTP body, so hashing the literal bytes this
// function received guarantees byte-for-byte agreement. Re-parsing
// then re-stringifying before hashing (the old Korapay-signature code
// below this function's predecessor did that, safely, only because
// Korapay computes ITS signature server-side over the same data it
// sends and isn't sensitive to how we re-serialize on our end) would
// introduce a real risk here instead: nothing guarantees Deno's
// JSON.stringify and Node's produce identical output for every
// possible payload (unicode escaping, edge-case number formatting),
// and a mismatch would silently and intermittently reject genuine
// gateway forwards.
function verifyGatewaySignature(secret: string, rawBodyText: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = createHmac('sha256', secret).update(rawBodyText).digest('hex');
  const hashBuffer = Buffer.from(hash, 'utf8');
  const sigBuffer = Buffer.from(signature, 'utf8');
  if (hashBuffer.length !== sigBuffer.length) return false;
  return timingSafeEqual(hashBuffer, sigBuffer);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Read as text first, not req.json() directly -- needed both for
  // signature verification (HMAC'd over the exact raw bytes received,
  // not a re-serialized copy -- see verifyGatewaySignature's comment
  // above for why that distinction matters here) and for JSON.parse
  // below. Re-reading req.json() twice would throw ("body already
  // consumed"). A read/parse failure here is treated the same as
  // B-Pay-backend's own webhook route treats it: can't verify a
  // signature over an unparseable body, so reject before even looking
  // at headers.
  let rawBodyText: string;
  try {
    rawBodyText = await req.text();
  } catch {
    return jsonResponse({ error: 'Could not read request body' }, 400);
  }

  let body: any;
  try {
    body = JSON.parse(rawBodyText);
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Task 42 -- this now verifies B-Pay-backend gateway's forwarding
  // signature, not Korapay's own key (see this file's header comment).
  // Must be the SAME value set as MAVW_WEBHOOK_FORWARD_SECRET in
  // B-Pay-backend's Render dashboard -- the two sides only work if
  // they share the identical value. Not auto-provided by the platform
  // (unlike SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY below) -- must be
  // set explicitly:
  //   supabase secrets set MAVW_WEBHOOK_FORWARD_SECRET=<value> --project-ref atojskxrxfsbpeefigtm
  const forwardSecret = Deno.env.get('MAVW_WEBHOOK_FORWARD_SECRET');
  if (!forwardSecret) {
    // Fail closed, not open -- an unconfigured secret must never be
    // treated as "signature check skipped, trust the payload".
    console.error('korapay-webhook: MAVW_WEBHOOK_FORWARD_SECRET is not set');
    return jsonResponse({ error: 'Webhook receiver misconfigured' }, 500);
  }

  const signature = req.headers.get('x-gateway-signature');
  if (!verifyGatewaySignature(forwardSecret, rawBodyText, signature)) {
    console.error('korapay-webhook: gateway signature verification FAILED');
    return jsonResponse({ error: 'Invalid webhook signature' }, 401);
  }

  const { event, data } = body || {};
  const reference = data?.reference;

  console.log(`korapay-webhook: verified event '${event}' for reference '${reference}'`);

  if (!reference) {
    // Verified signature, but nothing to match against payment_sessions.
    // Acknowledge (200) so Korapay doesn't retry-storm us over a
    // payload shape it will never resend correctly -- same
    // "acknowledge, log, don't 5xx" posture B-Pay-backend's own
    // webhook route already uses for unrecognized event shapes.
    console.warn(`korapay-webhook: event '${event}' had no data.reference, nothing to update`);
    return jsonResponse({ received: true });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Only charge.success/charge.failed map onto payment_sessions, which
  // only ever tracks the collect/checkout side of a payment (see
  // supabase_migration_006_payment_sessions.sql's own CHECK
  // constraint: status is pending/checkout_created/success/failed,
  // nothing transfer- or refund-shaped). transfer.*/refund.* events
  // are real Korapay webhook events (per B-Pay-backend's own Task 4
  // findings) but have no corresponding row here to update -- log and
  // acknowledge, same as B-Pay-backend's own route already does for
  // them.
  let newStatus: 'success' | 'failed' | null = null;
  if (event === 'charge.success') newStatus = 'success';
  else if (event === 'charge.failed') newStatus = 'failed';

  if (!newStatus) {
    console.log(`korapay-webhook: event '${event}' has no payment_sessions mapping, logged only`);
    return jsonResponse({ received: true });
  }

  const { data: session, error: fetchError } = await supabase
    .from('payment_sessions')
    .select('id, status')
    .eq('reference', reference)
    .single();

  if (fetchError || !session) {
    // Acknowledge anyway -- see the no-reference case above for the
    // same reasoning. A reference we don't recognize might belong to
    // a payment initiated before this function existed, or a stale
    // retry; either way, erroring here just makes Korapay retry a
    // request nothing here will ever resolve.
    console.warn(`korapay-webhook: no payment_sessions row for reference '${reference}'`);
    return jsonResponse({ received: true });
  }

  // Idempotency: a webhook already resolved to success/failed should
  // not flip back and forth on a duplicate delivery (Korapay, like
  // most providers, does retry). 'pending'/'checkout_created' are the
  // only states this function should actually transition out of.
  if (session.status === 'success' || session.status === 'failed') {
    console.log(`korapay-webhook: reference '${reference}' already '${session.status}', duplicate delivery ignored`);
    return jsonResponse({ received: true, note: 'Already processed' });
  }

  const { error: updateError } = await supabase
    .from('payment_sessions')
    .update({
      status: newStatus,
      provider_response: body,
      updated_at: new Date().toISOString(),
    })
    .eq('id', session.id);

  if (updateError) {
    // A real failure to persist -- this one IS worth a 500 so Korapay
    // retries, unlike the "acknowledge and move on" cases above where
    // retrying would never help.
    console.error(`korapay-webhook: failed to update payment_sessions for '${reference}'`, updateError);
    return jsonResponse({ error: 'Failed to update payment session' }, 500);
  }

  console.log(`korapay-webhook: reference '${reference}' -> '${newStatus}'`);

  // Part 2 (wallet-crediting, first-time-vs-returning-user logic) is
  // NOT called from here yet -- see this file's header comment and
  // handover.md's Task 33 Part 2 note. This function's job ends at
  // "payment_sessions now reflects reality."
  return jsonResponse({ received: true, reference, status: newStatus });
});
