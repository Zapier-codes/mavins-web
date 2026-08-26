// src/lib/security/rateLimit.ts
//
// Basic in-memory sliding-window rate limiter for the guest payment
// endpoints (guests can trigger real Korapay checkout-session creation
// with no account behind them, which is a fraud/spam surface bots
// can hit directly).
//
// This is intentionally simple and per-instance: on Vercel serverless
// each instance has its own memory, so a determined attacker spread
// across enough cold starts can get around it. It stops casual/naive
// abuse cheaply with zero extra infra. If real abuse shows up, swap
// this for Upstash Ratelimit (Redis-backed, works across instances)
// or push blocking to the Vercel/WAF layer instead — this module's
// call sites don't need to change either way.

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

// Periodically drop empty buckets so this doesn't grow unbounded
// across a long-lived instance.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

function sweep(windowMs: number) {
  const now = Date.now();
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

/**
 * Returns true if the call under `key` is allowed, false if it should
 * be rejected (e.g. respond 429).
 */
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  sweep(windowMs);
  const now = Date.now();
  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return true;
}

/**
 * Best-effort client IP extraction behind Vercel's proxy.
 */
export function getClientIp(req: Request): string {
  const headers = req.headers;
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return headers.get('x-real-ip') || 'unknown';
}
