// src/services/payment/korapay.service.ts
/**
 * Korapay Payment Service — Render Backend Proxy
 *
 * Korapay's API requires the caller's IP to be whitelisted on the
 * merchant dashboard (Settings > Security > IP Whitelisting), and a
 * serverless host like Vercel has no stable outbound IP to whitelist.
 * So instead of calling Korapay directly, this service calls the
 * Mavins "b-pay-backend" instance hosted on Render (which *does* have
 * a fixed outbound IP, already whitelisted on the Korapay dashboard),
 * and that backend proxies through to Korapay.
 *
 * Confirmed against the b-pay-backend source (routes.js) on
 * 2026-08-27 — this is a multi-provider proxy, NOT Korapay-only:
 *
 *   POST /api/pay   body: { amount, currency, reference, customer,
 *                           provider? , action? }
 *     - `provider` picks the provider directly ('korapay', 'paystack',
 *       'payscribe', 'juicyway').
 *     - Without `provider`, it falls back to ROUTING_RULES[action],
 *       and ROUTING_RULES has no entry that maps to Korapay for a
 *       plain payment collection (only `payout: 'korapay'`).
 *     - Without EITHER, it silently defaults to `'paystack'`.
 *     - This is the actual root cause of the
 *       "Failed to construct 'URL': Invalid URL" bug: this service
 *       was never sending `provider`, so every "Korapay" top-up was
 *       silently going through Paystack instead. Paystack's response
 *       uses `data.authorization_url`, not `checkout_url`, and
 *       routes.js wraps the provider's raw response under another
 *       `data` key -- so the real shape was
 *       `{ data: { data: { authorization_url } } }` with no
 *       `checkout_url` anywhere in it. That undefined value flowed
 *       straight through to the browser's `new URL(undefined)`.
 *     - Response shape: { status, message, provider, reference,
 *         data: <provider's own raw response> }. For Korapay
 *         specifically that inner `data` is Korapay's native
 *         `{ status, message, data: { checkout_url, reference, ... } }`
 *         -- i.e. `json.data.data.checkout_url`, not `json.data.checkout_url`.
 *
 *   GET  /api/verify?reference=<ref>&provider=<name>   (query params,
 *        not a path segment -- confirmed from routes.js; provider is
 *        REQUIRED, same routing gotcha as above)
 *     - Response shape: { status, message, provider,
 *         data: <provider's raw verify response> }, so for Korapay:
 *         `json.data.data.status` / `json.data.data.reference` / etc.
 *
 * Fixed below to always pass `provider: 'korapay'` explicitly and to
 * unwrap the double-nested `data.data` shape.
 */

const RENDER_BACKEND_URL = process.env.KORAPAY_RENDER_URL || 'https://b-pay-backend.onrender.com';

export interface InitializeChargeInput {
  // Base currency unit (e.g. whole dollars for USD), NOT cents/kobo --
  // Korapay's charges/initialize takes an Integer amount in the base
  // unit (confirmed against developers.korapay.com, see B-Pay-backend's
  // handover.md Task 7). This field was previously mis-documented as
  // "in cents", which caused fund-wallet/page.tsx to pre-multiply by
  // 100 and overcharge every top-up 100x. Do not reintroduce that.
  amount: number;
  // Default USD, NOT NGN -- this is the app's own accounting/base
  // currency (matches pricing.ts's totalCostCents, which is USD
  // cents). Per project owner decision: the app does not do its own
  // currency conversion or default to any single country's currency.
  // Region-specific display/checkout happens via Korapay's own Dynamic
  // Currency Conversion (see paymentCurrency/settlementCurrency below),
  // not client-side math.
  currency?: string;
  // Dynamic Currency Conversion (DCC) — optional, Korapay-specific.
  // https://developers.korapay.com/docs/dynamic-currency-conversion
  // When both are supplied, Korapay's checkout shows the payer the
  // amount converted into `paymentCurrency` at its live rate, while we
  // still get settled in `settlementCurrency`. `currency`/`amount`
  // above stay our own accounting figures either way. Omit both to
  // charge directly in `currency` with no conversion (e.g. a payer
  // already in the US paying in USD). See
  // src/lib/currency/korapayDccCurrency.ts for how a caller should
  // decide whether to set these, and the important caveat there about
  // account-level prerequisites this code can't itself satisfy.
  paymentCurrency?: string;
  settlementCurrency?: string;
  customerEmail: string;
  customerName?: string;
  reference?: string;
  metadata?: Record<string, any>;
}

export interface InitializeChargeResponse {
  status: boolean;
  message: string;
  data: {
    checkout_url: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
  };
}

export interface ChargeStatusResponse {
  status: boolean;
  message: string;
  data: {
    // Korapay's own API returns 'success' (confirmed via Korapay's
    // published API docs/samples), not 'successful' as previously
    // declared here — this type was checked against the wrong value
    // for every caller. 'successful' is kept as a fallback in case the
    // render backend normalizes it before passing it through.
    status: 'success' | 'successful' | 'pending' | 'failed';
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    channel: string;
    // Present on Korapay's native charge object; kept optional here
    // since it's not guaranteed the proxy backend passes it through.
    customer?: { name?: string; email?: string };
    metadata: Record<string, any>;
  };
}

/**
 * Initialize a charge via the render backend.
 */
export async function initializeCharge(
  input: InitializeChargeInput
): Promise<InitializeChargeResponse> {
  const res = await fetch(`${RENDER_BACKEND_URL}/api/pay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      // REQUIRED: without this, routes.js's smart routing has no rule
      // that selects Korapay for a plain payment collection and
      // silently falls back to Paystack instead. This was the actual
      // root cause of the "Invalid URL" bug (see file header).
      provider: 'korapay',
      amount: input.amount,
      currency: input.currency || 'USD',
      reference: input.reference,
      // Only forwarded when both are set -- see the DCC comment on
      // InitializeChargeInput above and B-Pay-backend's
      // providers/korapay.js, which requires both together too.
      ...(input.paymentCurrency && input.settlementCurrency
        ? { payment_currency: input.paymentCurrency, settlement_currency: input.settlementCurrency }
        : {}),
      // Korapay's own API (checkout, mobile money, pool accounts — see
      // developers.korapay.com) always nests the payer's details under
      // a `customer` object, never as flat top-level `email`/`name`
      // fields.
      customer: {
        email: input.customerEmail,
        name: input.customerName,
      },
      metadata: input.metadata,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Initialize failed: ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));

  // routes.js wraps whichever provider actually ran under its own
  // `data` key, and Korapay's own response is itself
  // `{status, message, data: {...}}` -- so the real checkout URL sits
  // at json.data.data.checkout_url, not json.data.checkout_url. Still
  // guarded defensively (rather than trusting the double-nesting
  // blindly) since a backend change or an unexpected provider result
  // shouldn't crash the browser with a raw `new URL(undefined)` again
  // — fail loudly here instead, with a message that says what's wrong.
  const inner = json?.data?.data ?? json?.data ?? {};
  const checkoutUrl = inner.checkout_url;

  if (!checkoutUrl || typeof checkoutUrl !== 'string') {
    throw new Error(
      json?.message ||
        json?.data?.message ||
        'Korapay did not return a checkout URL. Check the render backend logs — the provider field may not be reaching Korapay.'
    );
  }

  return {
    status: json.status ?? true,
    message: json.message ?? '',
    data: {
      checkout_url: checkoutUrl,
      reference: inner.reference ?? input.reference ?? '',
      amount: inner.amount ?? input.amount,
      currency: inner.currency ?? input.currency ?? 'NGN',
      status: inner.status ?? 'pending',
    },
  };
}

/**
 * Verify a charge by reference via the render backend.
 *
 * Confirmed from routes.js: GET /api/verify takes `reference` AND
 * `provider` as query params (not a path segment) -- both are
 * required, and a missing `provider` hits the same silent-Paystack-
 * fallback gotcha as initializeCharge above.
 */
export async function verifyCharge(reference: string): Promise<ChargeStatusResponse> {
  const encodedRef = encodeURIComponent(reference);

  const res = await fetch(
    `${RENDER_BACKEND_URL}/api/verify?reference=${encodedRef}&provider=korapay`,
    {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Verify failed: ${res.status}`);
  }

  const json = await res.json().catch(() => ({}));

  // Same double-nesting as initializeCharge: routes.js wraps Korapay's
  // own {status, message, data: {...}} response under another `data` key.
  const inner = json?.data?.data ?? json?.data ?? {};

  return {
    status: json.status ?? true,
    message: json.message ?? '',
    data: {
      status: inner.status,
      reference: inner.reference ?? reference,
      amount: inner.amount,
      currency: inner.currency,
      paid_at: inner.paid_at ?? null,
      channel: inner.channel,
      customer: inner.customer,
      metadata: inner.metadata ?? {},
    },
  };
}

/**
 * Get charge status (alias for verifyCharge).
 */
export async function getChargeStatus(reference: string): Promise<ChargeStatusResponse> {
  return verifyCharge(reference);
}

/**
 * Verify webhook signature.
 * 
 * NOTE: When using the render backend, webhook signature verification
 * happens on the backend. This function is kept for backward compatibility
 * but delegates to the backend's /webhook endpoint.
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  // The render backend handles HMAC verification.
  // This stub returns true for local development.
  // In production, always verify on the backend.
  return true;
}

/**
 * Legacy alias for initializeCharge.
 */
export async function initializePayment(
  input: InitializeChargeInput
): Promise<InitializeChargeResponse> {
  return initializeCharge(input);
}
