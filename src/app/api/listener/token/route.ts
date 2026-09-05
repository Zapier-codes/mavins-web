// src/app/api/listener/token/route.ts
/**
 * POST /api/listener/token
 *
 * Task 66 Part a, sub-part i (this sub-split done via explicit
 * instruction — Part a itself covers steps 1/2/3/7 of that task's own
 * "Implementation Tasks" list; split here into i = steps 1+2, the two
 * backend API routes, self-contained and independently testable with
 * no UI to build yet, and ii = steps 3+7, the `/earn` page itself +
 * wiring it to real campaign data, which needs i's endpoints to exist
 * first). This is step 1: issue a signed token for a device ID.
 *
 * Identity model, exactly as Task 66's own "Core Decision Summary"
 * specifies: "Fully anonymous – device ID only... No login, no
 * password, no Supabase Auth dependency." Confirmed by reading the
 * one existing sibling route (`api/listener/bpay-tag/route.ts`) before
 * writing this — that route DOES use a real Supabase Auth session
 * (`createServerSupabaseClient().auth.getUser()`), which is a genuine,
 * real discrepancy against Task 66's own explicit "no Supabase Auth"
 * spec, worth flagging plainly rather than silently copying. Not
 * reconciled here — out of this sub-part's own scope, and Task 49's
 * own "real identity deferred until withdrawal" framing suggests the
 * two routes may simply belong to two different points in the same
 * listener's lifecycle (anonymous while earning, real/authenticated
 * only once money needs to actually move) rather than one being wrong
 * — but that's a real open question for whoever eventually reconciles
 * them, not assumed settled here.
 *
 * Body: { deviceId: string }  -- a UUID, matching
 * `ensure_device_listener(p_device_id UUID)`'s own parameter type
 * (migration 028) and Velune's own `getOrCreateCampaignDeviceId()`
 * convention (confirmed by reading that migration's own header
 * comment directly, not assumed) -- the device UUID IS the
 * `public.users.id` directly, no separate mapping table or lookup
 * step exists or is needed.
 *
 * Response: { token: string, expiresAt: number (unix seconds) }
 *
 * Token format — a minimal, hand-rolled signed payload, not a full JWT
 * library (no existing HMAC-signing precedent anywhere in this
 * codebase, confirmed via grep before choosing this over adding a new
 * dependency for something this small):
 *   `${base64url(JSON.stringify({ deviceId, exp }))}.${base64url(HMAC-SHA256(payload, secret))}`
 * `GET /api/listener/balance` (sub-part i's other half, this same
 * commit) verifies the signature and `exp` before trusting `deviceId`
 * from the token — never re-derives it from anything else.
 *
 * REQUIRES a new env var, LISTENER_TOKEN_SECRET, not previously used
 * anywhere in this codebase — must be set in the deployment
 * environment before this route (or /api/listener/balance) can work
 * at all. Not something this sandbox can set for a live deployment;
 * flagged here and in this session's own handover note.
 *
 * Expiry: 15 minutes (900s) — Task 66's own spec says "short expiry"
 * without a specific number; this is a judgment call, not a
 * researched or confirmed figure, chosen to comfortably cover "get
 * redirected back from Velune after a play and check the updated
 * balance" without needing a fresh token for every single page view
 * in that window. Worth revisiting if real usage shows it's too
 * short/long once this is actually live.
 */
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const TOKEN_TTL_SECONDS = 15 * 60;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function getSecret(): string | null {
  return process.env.LISTENER_TOKEN_SECRET || null;
}

export async function POST(request: NextRequest) {
  try {
    const secret = getSecret();
    if (!secret) {
      // A missing secret is a deployment-configuration error, not a
      // client mistake -- 500, not 400, and logged loudly rather than
      // silently issuing an unsigned/insecure token as a fallback.
      console.error('POST /api/listener/token: LISTENER_TOKEN_SECRET is not set');
      return NextResponse.json({ success: false, error: 'Server not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => null);
    const deviceId = body?.deviceId;

    if (typeof deviceId !== 'string' || !UUID_RE.test(deviceId)) {
      return NextResponse.json({ success: false, error: 'deviceId must be a valid UUID' }, { status: 400 });
    }

    // Idempotent -- ON CONFLICT DO NOTHING (migration 028's own body).
    // Creates the public.users row for this device on its first-ever
    // token request; every subsequent call for the same device is a
    // safe no-op. Uses the admin client since this route has no
    // Supabase Auth session to go through at all, by this feature's
    // own design (see this file's own header comment above).
    const admin = createAdminClient();
    const { error: provisionError } = await admin.rpc('ensure_device_listener', { p_device_id: deviceId });

    if (provisionError) {
      console.error('POST /api/listener/token: ensure_device_listener failed', provisionError);
      return NextResponse.json({ success: false, error: 'Failed to provision listener' }, { status: 500 });
    }

    const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
    const payload = base64url(JSON.stringify({ deviceId, exp }));
    const signature = base64url(crypto.createHmac('sha256', secret).update(payload).digest());
    const token = `${payload}.${signature}`;

    return NextResponse.json({ success: true, token, expiresAt: exp });
  } catch (err: any) {
    console.error('POST /api/listener/token error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Failed to issue token' }, { status: 500 });
  }
}
