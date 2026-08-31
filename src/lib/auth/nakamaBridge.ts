// src/lib/auth/nakamaBridge.ts
//
// Task 48-c Part 1 (handover.md) — the actual bridge logic 48-b Part
// d's synthesis unblocked: given a Nakama identity a client has
// already authenticated with (verified server-side by
// nakamaService.verifyClientSession(), never trusted from raw client
// input), find or create the linked `public.users` row and mint a
// real Supabase Auth session for it.
//
// Confirmed architecture (48-b Part d, decided per explicit
// instruction to stop surfacing this as an open question): additive
// dual-identity. `auth_user_id` stores the Nakama-native id;
// `id`/`auth.uid()` stays a real Supabase Auth identity, created and
// maintained exactly the way this app's existing signup flow already
// does, for every user regardless of which system authenticated them
// first. This file does NOT make `id` itself Nakama-native — that
// would break every `USING (auth.uid() = id)` RLS policy in this
// project (48-b Part d's own reasoning, not re-litigated here).
//
// Session-minting mechanism deliberately reuses this exact codebase's
// own already-proven pattern from guestCheckout.ts's
// resolveOrCreateGuestAccount() — admin.auth.admin.createUser() (or,
// for an existing linked row, admin.auth.admin.updateUserById() to
// rotate a fresh password) followed by a plain-client
// signInWithPassword() — rather than an untested magic-link/OTP
// exchange flow this sandbox has no live environment to verify
// against. The generated password is never surfaced to the caller and
// never needed again; a Nakama-native user's real "login" is Nakama
// itself, not this password.

import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export interface NakamaBridgeResult {
  userId: string;
  isNewAccount: boolean;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
  } | null;
}

function generateBridgePassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'nkm_' + Buffer.from(bytes).toString('base64url');
}

async function mintSessionForEmail(email: string, password: string) {
  // Deliberately a fresh, plain client (not the admin client) —
  // signInWithPassword is a normal auth call and doesn't need/want the
  // service-role key. Same reasoning as guestCheckout.ts's own copy of
  // this exact pattern.
  const anonClient = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  return anonClient.auth.signInWithPassword({ email, password });
}

/**
 * Resolves a verified Nakama identity to a `public.users` row, linking
 * or creating one as needed, and mints a real Supabase session for it.
 *
 * `nakamaUserId` MUST already be verified server-side (see
 * `nakamaService.verifyClientSession()`) before this is ever called —
 * this function trusts it completely and does not re-verify anything
 * about it.
 *
 * `email` is required for the underlying Supabase Auth account this
 * function provisions on first contact — Nakama's own `authenticateCustom`/
 * `authenticateDevice` flows don't always collect a real email, so the
 * caller (the bridge route) is responsible for deciding where that
 * comes from (Nakama's own email field if using `authenticateEmail`,
 * or a synthesized placeholder like `guestCheckout.ts`'s own guest
 * accounts use in spirit — NOT decided here, since it's a product/UX
 * question about what a Nakama-native user's account should show as
 * their email, not a technical one this bridge function should guess
 * at silently). Left as a required parameter so the caller is forced
 * to make that decision explicitly rather than this function picking
 * a default.
 */
export async function resolveOrLinkNakamaIdentity(
  nakamaUserId: string,
  email: string,
  nakamaUsername?: string | null
): Promise<NakamaBridgeResult> {
  const admin = createAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from('users')
    .select('id, email')
    .eq('auth_user_id', nakamaUserId)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    // Already linked — rotate a fresh one-time password and mint a
    // session with it. We deliberately don't (and can't) reuse
    // whatever password this row was created with, since it's never
    // stored anywhere retrievable — same "never surfaced, never
    // needed again" property guestCheckout.ts's own generated
    // passwords have, just re-generated per bridge call instead of
    // once at creation time.
    const freshPassword = generateBridgePassword();
    const { error: updateError } = await admin.auth.admin.updateUserById(existing.id, {
      password: freshPassword,
    });
    if (updateError) throw updateError;

    const { data: signInData, error: signInError } = await mintSessionForEmail(
      existing.email,
      freshPassword
    );

    if (signInError || !signInData.session) {
      console.error('Nakama bridge: session mint failed for existing linked user:', signInError);
      return { userId: existing.id, isNewAccount: false, session: null };
    }

    return {
      userId: existing.id,
      isNewAccount: false,
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
        expires_at: signInData.session.expires_at,
      },
    };
  }

  // No existing link — provision a brand-new Supabase Auth identity
  // and a matching public.users row, exactly mirroring
  // resolveOrCreateGuestAccount()'s own new-account path.
  const password = generateBridgePassword();
  const normalizedEmail = email.trim().toLowerCase();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { created_via: 'nakama_bridge', nakama_user_id: nakamaUserId },
  });

  if (createError) {
    // Same race-condition handling as resolveOrCreateGuestAccount():
    // another request could have linked this exact Nakama identity
    // between our lookup and this call.
    const { data: raceWinner, error: raceLookupError } = await admin
      .from('users')
      .select('id')
      .eq('auth_user_id', nakamaUserId)
      .maybeSingle();

    if (raceLookupError || !raceWinner) throw createError;

    return { userId: raceWinner.id, isNewAccount: false, session: null };
  }

  const authUser = created.user;
  if (!authUser) throw new Error('Nakama bridge account creation returned no user');

  const { error: insertError } = await admin.from('users').insert({
    id: authUser.id,
    auth_user_id: nakamaUserId,
    username:
      nakamaUsername?.trim() || `nakama_${authUser.id.replace(/-/g, '').slice(0, 12)}`,
    email: normalizedEmail,
    profile_completed: false,
    // metadata_json confirmed genuinely free/unused (48-b Part b) —
    // exactly the "stash bolt-on provisioning data" use case its own
    // synthesis note anticipated.
    metadata_json: { provisioned_via: 'nakama', linked_at: new Date().toISOString() },
  });

  if (insertError) throw insertError;

  const { data: signInData, error: signInError } = await mintSessionForEmail(
    normalizedEmail,
    password
  );

  if (signInError || !signInData.session) {
    console.error('Nakama bridge: session mint failed after account creation:', signInError);
    return { userId: authUser.id, isNewAccount: true, session: null };
  }

  return {
    userId: authUser.id,
    isNewAccount: true,
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at,
    },
  };
}
