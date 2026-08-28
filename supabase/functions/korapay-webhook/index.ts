// supabase/functions/korapay-webhook/index.ts
//
// Closes the gap Task 33 Part 1 deliberately left open: per the
// project owner's explicit direction (confirmed in chat, see
// B-Pay-backend's handover.md, "Project owner decisions" -> Decision 1),
// this Edge Function -- not B-Pay-backend's own /api/webhooks/korapay
// route -- is now the real receiver of Korapay's webhook. It verifies
// the signature, updates the matching public.payment_sessions row, and
// writes the raw payload back for audit/debugging.
//
// Signature verification is ported from B-Pay-backend's own
// providers/korapay.js#verifyWebhookSignature (confirmed directly
// against developers.korapay.com/docs/webhooks by that repo's Task 4)
// -- same algorithm, same "hash only body.data, not the full payload"
// behavior, re-verified against Node's crypto module before being
// translated to Deno's node:crypto compat import (this sandbox has no
// network access to actually run Deno, so this substitution was the
// closest available verification -- see this session's commit message
// for the exact cases checked).
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

// Identical algorithm to B-Pay-backend's providers/korapay.js
// #verifyWebhookSignature -- kept in sync manually, same as
// initialize-payment/index.ts already does for unwrapBPayResponse.
// Hex-encoded HMAC-SHA256 of ONLY the `data` object (not the full
// body) -- Korapay's own official examples hash
// `JSON.stringify(req.body.data)` specifically.
function verifyKorapaySignature(secretKey: string, body: any, signature: string | null): boolean {
  if (!signature) return false;
  const hash = createHmac('sha256', secretKey).update(JSON.stringify(body?.data)).digest('hex');
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

  // Read as text first, not req.json() directly -- we need the exact
  // parsed object for both signature verification (hashes body.data)
  // and downstream use, and re-reading req.json() twice would throw
  // ("body already consumed"). A parse failure here is treated the
  // same as B-Pay-backend's own webhook route treats it: can't verify
  // a signature over an unparseable body, so reject before even
  // looking at headers.
  let body: any;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  // Not auto-provided by the platform (unlike SUPABASE_URL/
  // SUPABASE_SERVICE_ROLE_KEY below) -- must be set explicitly:
  //   supabase secrets set KORAPAY_SECRET_KEY=sk_... --project-ref atojskxrxfsbpeefigtm
  // This is the SAME secret key value B-Pay-backend's own Korapay
  // provider uses for this identical check -- not a new/different key.
  const korapaySecretKey = Deno.env.get('KORAPAY_SECRET_KEY');
  if (!korapaySecretKey) {
    // Fail closed, not open -- an unconfigured secret must never be
    // treated as "signature check skipped, trust the payload".
    console.error('korapay-webhook: KORAPAY_SECRET_KEY is not set');
    return jsonResponse({ error: 'Webhook receiver misconfigured' }, 500);
  }

  const signature = req.headers.get('x-korapay-signature');
  if (!verifyKorapaySignature(korapaySecretKey, body, signature)) {
    console.error('korapay-webhook: signature verification FAILED');
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
