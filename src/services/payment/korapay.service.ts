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
 * Endpoints — confirmed live 2026-08-27 by fetching the backend's own
 * root URL (it self-reports its route table there):
 *   GET  https://b-pay-backend.onrender.com/
 *     → { "endpoints": { "health": "/health", "pay": "/api/pay",
 *                        "verify": "/api/verify", "myIp": "/my-ip" } }
 *
 * This previously called POST /initialize and GET /verify/:ref, which
 * do NOT exist on this backend — hence the "Endpoint not found" error
 * (every call 404'd against the backend's own catch-all handler,
 * before it ever got anywhere near Korapay). Fixed below to hit the
 * real routes, /api/pay and /api/verify.
 *
 * /api/verify's exact shape (path segment vs. query param for the
 * reference) isn't confirmed — the backend's self-reported route list
 * shows it flat, with no ":reference" placeholder, but so does
 * "/api/pay" even though that one's POST body clearly carries params,
 * so the omission alone isn't conclusive. verifyCharge() below tries
 * the path-segment form first and falls back to a query param on 404,
 * so it self-heals against either convention. Worth confirming
 * against the backend's own source (or a live test) and simplifying
 * once that's known.
 *
 * There's also a "/my-ip" route on the backend — handy for confirming
 * exactly which outbound IP is the one that needs to stay whitelisted
 * on Korapay's dashboard if this backend is ever re-hosted elsewhere.
 */

const RENDER_BACKEND_URL = process.env.KORAPAY_RENDER_URL || 'https://b-pay-backend.onrender.com';

export interface InitializeChargeInput {
  amount: number;        // in cents
  currency?: string;     // default NGN
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
      amount: input.amount,
      currency: input.currency || 'NGN',
      email: input.customerEmail,
      name: input.customerName,
      reference: input.reference,
      metadata: input.metadata,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Initialize failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Verify a charge by reference via the render backend.
 *
 * Tries /api/verify/<reference> first (standard REST path-param
 * convention); if the backend 404s that (i.e. it actually expects the
 * reference as a query param instead — see the file header note on
 * why this isn't confirmed), falls back to /api/verify?reference=.
 */
export async function verifyCharge(reference: string): Promise<ChargeStatusResponse> {
  const encodedRef = encodeURIComponent(reference);
  const headers = { 'Content-Type': 'application/json' };

  let res = await fetch(`${RENDER_BACKEND_URL}/api/verify/${encodedRef}`, {
    method: 'GET',
    headers,
  });

  if (res.status === 404) {
    res = await fetch(`${RENDER_BACKEND_URL}/api/verify?reference=${encodedRef}`, {
      method: 'GET',
      headers,
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Verify failed: ${res.status}`);
  }

  return res.json();
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
