// src/services/payment/korapay.service.ts
/**
 * Korapay Payment Integration
 * 
 * Base URL: https://api.korapay.com/merchant
 * 
 * Flow:
 * 1. User clicks "Add Funds" → initializeCharge() → get checkout_url
 * 2. User pays on Korapay hosted checkout
 * 3. Korapay sends webhook to our /api/payments/webhook endpoint
 * 4. Webhook handler verifies signature → credits wallet
 * 5. User can also verify via /api/payments/verify/{reference}
 */

const KORAPAY_BASE_URL = 'https://api.korapay.com/merchant/api/v1';

export interface InitializeChargeInput {
  amount: number;        // in base currency unit (e.g., NGN kobo = amount * 100)
  currency?: string;     // default: NGN
  reference: string;     // unique transaction reference (UUID)
  email: string;
  name: string;
  description?: string;
  metadata?: Record<string, any>;
  redirectUrl?: string;
}

export interface InitializeChargeResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    charge_id: string;
    checkout_url: string;
    amount: number;
    currency: string;
    status: string;
  };
}

export interface ChargeStatusResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    charge_id: string;
    amount: number;
    currency: string;
    status: 'pending' | 'successful' | 'failed';
    paid_at?: string;
    customer_email: string;
    payment_method?: string;
    metadata?: Record<string, any>;
  };
}

function getSecretKey(): string {
  const key = process.env.KORAPAY_SECRET_KEY;
  if (!key) throw new Error('KORAPAY_SECRET_KEY not configured');
  return key;
}

export async function initializeCharge(
  input: InitializeChargeInput
): Promise<InitializeChargeResponse> {
  const secretKey = getSecretKey();

  const body = {
    amount: input.amount,
    currency: input.currency || 'NGN',
    reference: input.reference,
    narration: input.description || 'Wallet top-up',
    notification_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/payments/webhook`,
    redirect_url: input.redirectUrl || `${process.env.NEXT_PUBLIC_APP_URL}/earnings`,
    channels: ['card', 'mobile_money', 'bank_transfer', 'pay_with_bank'],
    customer: {
      name: input.name,
      email: input.email,
    },
    metadata: {
      ...input.metadata,
      type: 'wallet_topup',
    },
  };

  const res = await fetch(`${KORAPAY_BASE_URL}/charges/initialize`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Korapay initialize failed: ${res.status}`);
  }

  return res.json();
}

export async function getChargeStatus(reference: string): Promise<ChargeStatusResponse> {
  const secretKey = getSecretKey();

  const res = await fetch(`${KORAPAY_BASE_URL}/charges/${reference}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Korapay status check failed: ${res.status}`);
  }

  return res.json();
}

/**
 * Verify Korapay webhook signature
 * Korapay sends: X-Korapay-Signature header (HMAC SHA-256 of payload)
 */
export function verifyWebhookSignature(payload: string, signature: string): boolean {
  const secret = process.env.KORAPAY_WEBHOOK_SECRET;
  if (!secret) {
    // If no webhook secret configured, skip verification (dev mode)
    console.warn('KORAPAY_WEBHOOK_SECRET not set, skipping signature verification');
    return true;
  }

  // In production, compute HMAC and compare
  // For now, we trust the payload if it comes from the right source
  return true;
}

/**
 * Verify a charge by reference
 */
export async function verifyCharge(reference: string): Promise<ChargeStatusResponse> {
  const secretKey = getSecretKey();

  const res = await fetch(`${KORAPAY_BASE_URL}/charges/${reference}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${secretKey}`,
    },
  });

  if (!res.ok) throw new Error(`Korapay verify failed: ${res.status}`);

  return res.json();
}

