// supabase/functions/korapay-webhook/index.ts
//
// Closes the gap Task 33 Part 1 deliberately left open: per the
// project owner's explicit direction (confirmed in chat, see
// B-Pay-backend's handover.md, "Project owner decisions" -> Decision 1),
// this Edge Function -- not B-Pay-backend's own /api/webhooks/korapay
// route -- is the real destination for Korapay's webhook, in the sense
// that it's what ultimately updates payment_sessions AND (as of Task
// 33 Part 2b, this session) credits the wallet. It verifies a
// signature, updates the matching public.payment_sessions row, credits
// the deposit, and writes the raw payload back for audit/debugging.
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
// Task 33 Part 2b (this session): on a verified charge.success event,
// this function now also credits the wallet -- resolving/creating a
// guest account by customer_email when user_id is null (same pattern
// as src/lib/auth/guestCheckout.ts#resolveOrCreateGuestAccount, ported
// here rather than imported, since that file uses Next.js path aliases
// and a Node-only admin client that don't exist in this Deno runtime),
// computing the net amount per Task 40's rule (THIS function deducts
// the 5% deposit fee; credit_wallet_deposit, migration 004, does no
// arithmetic, it only persists the net figure it's handed), and
// calling that RPC. Crediting happens BEFORE payment_sessions.status
// is written to 'success' (deliberately reordered from how this file's
// own header comment used to describe the plan) -- see the handler
// body below for why: crediting first means a crediting failure keeps
// the row out of the 'success'/'failed' idempotency short-circuit, so
// a Korapay retry will actually retry the credit instead of silently
// skipping it forever.
//
// NOT this function's job yet (Task 33 Part 2c, still open): gating
// this on payment_sessions.metadata.type actually being a top-up.
// Right now EVERY successful charge.success gets credited,
// unconditionally -- harmless today because no other session type
// exists yet (Tasks 36/37, direct campaign payment, are both still on
// hold), but this is a real, temporary gap, not a design decision --
// see handover.md's Task 33 Part 2c note, which must land before any
// direct-campaign-payment session type goes live.
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

// Ported from src/lib/auth/guestCheckout.ts#resolveOrCreateGuestAccount
// -- same lookup-then-create-then-race-recheck shape, same
// is_guest_created/username-derivation convention (that file's own
// comment explains why: users.username is NOT NULL with no default).
// Deliberately NOT a straight import: that file uses a Next.js path
// alias (`@/lib/supabase/admin`) and assumes a Node runtime, neither
// of which exist here. Also deliberately simpler: this function only
// ever needs a user id back, never a browser session (there's no
// browser on the other end of a webhook), so the sign-in-immediately-
// after-creation step that file has is dropped entirely.
async function resolveOrCreateGuestUserId(supabase: any, email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing, error: lookupError } = await supabase
    .from('users')
    .select('id')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (lookupError) throw lookupError;
  if (existing) return existing.id;

  // Only ever used to satisfy createUser()'s required field -- never
  // surfaced, never signed in with, never needed again (unlike the
  // Next.js version, which does sign in with it once, immediately).
  const passwordBytes = new Uint8Array(24);
  crypto.getRandomValues(passwordBytes);
  const password = 'gst_' + btoa(String.fromCharCode(...passwordBytes)).replace(/[+/=]/g, '');

  const { data: created, error: createError } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { created_via: 'guest_checkout_webhook' },
  });

  if (createError) {
    // Race: the same email got created between our lookup and this
    // call -- e.g. two webhook deliveries for two different guest
    // payments using the same email, landing within milliseconds of
    // each other. Re-resolve instead of failing the whole webhook.
    const { data: raceWinner, error: raceLookupError } = await supabase
      .from('users')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (raceLookupError || !raceWinner) throw createError;
    return raceWinner.id;
  }

  const authUser = created.user;
  if (!authUser) throw new Error('Guest account creation returned no user');

  const { error: insertError } = await supabase.from('users').insert({
    id: authUser.id,
    username: `guest_${authUser.id.replace(/-/g, '').slice(0, 12)}`,
    email: normalizedEmail,
    profile_completed: false,
    is_guest_created: true,
  });

  if (insertError) throw insertError;

  return authUser.id;
}

// Task 40's rule, applied: THIS function computes and deducts the fee
// -- 5% on deposits -- credit_wallet_deposit (migration 004) does no
// arithmetic of its own, it only persists whatever p_amount_cents it's
// handed. payment_sessions.amount is a base currency unit (e.g. whole
// dollars, confirmed by that migration's own header comment), so this
// also does the base-unit-to-cents conversion migration 004's callers
// are all expected to do themselves.
const DEPOSIT_FEE_RATE = 0.05;

async function creditDeposit(
  supabase: any,
  params: { userId: string; grossAmount: number; currency: string; reference: string },
): Promise<{ credited: boolean; newBalanceCents: number | null }> {
  const netAmountCents = Math.round(params.grossAmount * (1 - DEPOSIT_FEE_RATE) * 100);

  const { data, error } = await supabase.rpc('credit_wallet_deposit', {
    p_user_id: params.userId,
    p_amount_cents: netAmountCents,
    p_reference: params.reference,
    p_source: 'korapay',
    p_currency: params.currency,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return { credited: !!row?.credited, newBalanceCents: row?.new_balance_cents ?? null };
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
    .select('id, status, user_id, customer_email, amount, currency')
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
  // Important, and why crediting (below) happens BEFORE this row ever
  // reaches 'success': once it's here, this function will never look
  // at this reference again, so anything that hasn't happened by the
  // time status flips to 'success' never will via a retry.
  if (session.status === 'success' || session.status === 'failed') {
    console.log(`korapay-webhook: reference '${reference}' already '${session.status}', duplicate delivery ignored`);
    return jsonResponse({ received: true, note: 'Already processed' });
  }

  // Task 33 Part 2b: credit the deposit BEFORE writing status =
  // 'success' -- not after, despite that being the more obvious
  // reading of "when it writes status = 'success', it also credits"
  // from this file's own header comment / handover.md's task note.
  // Reasoning: credit_wallet_deposit is idempotent (migration 004's
  // own unique index on (user_id, reference)), so calling it more than
  // once for the same payment is always safe -- but the idempotency
  // short-circuit just above is NOT safe to leave crediting behind:
  // once status = 'success', this function acknowledges every future
  // retry without looking at the row again. If crediting happened
  // AFTER that write and then failed (network blip, a bad guest-email
  // lookup, anything), the row would be permanently stuck at
  // 'success' with no wallet credit and no retry path to fix it. Doing
  // it first means a crediting failure below returns a 500, Korapay
  // retries, and the retry reaches this same code again (status is
  // still 'pending'/'checkout_created', so it doesn't hit the
  // short-circuit) -- safe by construction rather than by hoping
  // nothing fails in between two writes.
  if (newStatus === 'success') {
    try {
      const userId = session.user_id ?? (await resolveOrCreateGuestUserId(supabase, session.customer_email));

      const { credited, newBalanceCents } = await creditDeposit(supabase, {
        userId,
        grossAmount: session.amount,
        currency: session.currency,
        reference,
      });

      console.log(
        `korapay-webhook: credited='${credited}' for reference '${reference}', user '${userId}'` +
        (newBalanceCents !== null ? `, new_balance_cents=${newBalanceCents}` : ''),
      );
    } catch (creditError) {
      // A genuine failure to credit -- 500 so Korapay retries. Do NOT
      // write payment_sessions.status here; leaving it at
      // 'pending'/'checkout_created' is exactly what keeps a retry
      // able to reach this branch again. See the comment above this
      // block for the full reasoning.
      console.error(`korapay-webhook: FAILED to credit deposit for reference '${reference}'`, creditError);
      return jsonResponse({ error: 'Failed to credit deposit' }, 500);
    }
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
    // retrying would never help. Note: if newStatus === 'success', the
    // credit above has already happened by this point and will NOT be
    // re-attempted on retry (the retry will find status still not
    // 'success' and re-run the credit block too) -- credit_wallet_deposit's
    // own idempotency (see creditDeposit's comment) is what makes that
    // safe rather than a double-credit.
    console.error(`korapay-webhook: failed to update payment_sessions for '${reference}'`, updateError);
    return jsonResponse({ error: 'Failed to update payment session' }, 500);
  }

  console.log(`korapay-webhook: reference '${reference}' -> '${newStatus}'`);

  // Part 2c (gating this on payment_sessions.metadata.type actually
  // being a top-up) is NOT implemented yet -- see this file's header
  // comment and handover.md's Task 33 Part 2c note. Every successful
  // charge currently gets credited unconditionally.
  return jsonResponse({ received: true, reference, status: newStatus });
});
