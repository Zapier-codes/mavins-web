/**
 * Shared listener-token helpers — extracted from
 * `api/listener/balance/route.ts` (Task 66 Part a sub-part i) while
 * fixing a real security gap in `api/listener/bpay-tag/route.ts`
 * (Task 67 Part f-ii-i): that route trusted a raw, client-supplied
 * `listenerId` with no verification at all. That was a defensible
 * trust model when this whole listener-earnings feature was assumed
 * native-Velune-only (the same posture `record_campaign_stream`/
 * `ensure_device_listener`/`request_listener_withdrawal` still
 * correctly use, since Velune itself is the trusted caller there) —
 * but the real, product-owner-confirmed architecture (Task 66's own
 * "Core Decision Summary") puts listener-facing UI on `mavins-web`
 * itself, reached from an anonymous browser, not the Velune app
 * directly. An anonymous web request presenting a bare UUID is not a
 * credential — anyone who saw or guessed another listener's device id
 * could have hijacked their `bpay_tag`. `balance/route.ts` already
 * solved this correctly (a signed, expiring HMAC token, never a raw
 * id); `bpay-tag/route.ts` needed the same fix, not a second, weaker
 * pattern invented for it. This file exists so both routes verify
 * tokens identically, not via two independently-maintained copies of
 * the same HMAC logic.
 *
 * See `api/listener/token/route.ts`'s own header comment for the full
 * token format and the `LISTENER_TOKEN_SECRET` env var requirement —
 * not repeated here.
 */
import crypto from 'crypto';

export function getListenerTokenSecret(): string | null {
  return process.env.LISTENER_TOKEN_SECRET || null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export type VerifyTokenResult = { deviceId: string } | { error: string };

/**
 * Verifies signature + expiry, returns the trusted deviceId or an
 * error code. Constant-time signature comparison
 * (`crypto.timingSafeEqual`), matching this codebase's own existing
 * Korapay/Paystack webhook-signature-verification standard.
 */
export function verifyListenerToken(token: string, secret: string): VerifyTokenResult {
  const parts = token.split('.');
  if (parts.length !== 2) return { error: 'malformed_token' };
  const [payload, signature] = parts;

  const expectedSignature = base64url(crypto.createHmac('sha256', secret).update(payload).digest());
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { error: 'invalid_signature' };
  }

  let decoded: { deviceId?: unknown; exp?: unknown };
  try {
    decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { error: 'malformed_payload' };
  }

  if (typeof decoded.deviceId !== 'string' || typeof decoded.exp !== 'number') {
    return { error: 'malformed_payload' };
  }
  if (decoded.exp < Math.floor(Date.now() / 1000)) {
    return { error: 'token_expired' };
  }

  return { deviceId: decoded.deviceId };
}
