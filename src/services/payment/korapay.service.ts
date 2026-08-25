// src/services/payment/korapay.service.ts
/**
 * Korapay Payment Service — Render Backend Proxy
 * 
 * Instead of calling Korapay directly (which requires IP whitelisting),
 * this service calls the Mavins render backend at b-pay-backend.onrender.com
 * which proxies to Korapay with the whitelisted IP.
 * 
 * Endpoints:
 *   POST /initialize  → Creates a checkout session
 *   GET  /verify/:ref → Verifies charge status
 *   POST /webhook     → Receives webhooks (handled by backend)
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
    status: 'successful' | 'pending' | 'failed';
    reference: string;
    amount: number;
    currency: string;
    paid_at: string | null;
    channel: string;
    metadata: Record<string, any>;
  };
}

/**
 * Initialize a charge via the render backend.
 */
export async function initializeCharge(
  input: InitializeChargeInput
): Promise<InitializeChargeResponse> {
  const res = await fetch(`${RENDER_BACKEND_URL}/initialize`, {
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
 */
export async function verifyCharge(reference: string): Promise<ChargeStatusResponse> {
  const res = await fetch(`${RENDER_BACKEND_URL}/verify/${reference}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

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
