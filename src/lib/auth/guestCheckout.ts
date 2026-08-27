// src/lib/auth/guestCheckout.ts
//
// Turns "someone paid Korapay with this email" into either:
//   (a) a brand-new users row + a real Supabase session for them, or
//   (b) a wallet credit onto an EXISTING account, with NO session.
//
// (b) matters for a reason worth spelling out: Korapay's checkout
// just collects an email for the receipt — it doesn't prove the
// payer owns that inbox. If we auto-logged people in whenever the
// email happened to match an existing account, anyone could type in
// a stranger's email at checkout and get handed a live session for
// that stranger's real account. So: brand-new email → we know this
// payment is what created the account, safe to log them straight in.
// Existing email → we credit the funds (so money is never lost) but
// send them to /login instead of minting a session.
//
// Everything here runs through the service-role client (see
// src/lib/supabase/admin.ts) because this all happens before any
// browser session exists — RLS would block every read/write
// otherwise, including the "does this email already exist" check
// that the safety guard above depends on.

import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

export interface GuestAccountResult {
  userId: string;
  isNewAccount: boolean;
  profileCompleted: boolean;
  session: {
    access_token: string;
    refresh_token: string;
    expires_at?: number;
  } | null;
}

function generateGuestPassword(): string {
  // Only ever used server-side, once, to mint a session immediately
  // after creation via signInWithPassword — never surfaced to the
  // user and never needed again (they can set a real password later
  // from Settings, same as any account).
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return 'gst_' + Buffer.from(bytes).toString('base64url');
}

/**
 * Resolves an email to a users row, creating one (auth + public.users)
 * if it doesn't exist yet. Only returns a `session` for accounts it
 * just created.
 */
export async function resolveOrCreateGuestAccount(email: string): Promise<GuestAccountResult> {
  const normalizedEmail = email.trim().toLowerCase();
  const admin = createAdminClient();

  const { data: existing, error: lookupError } = await admin
    .from('users')
    .select('id, profile_completed')
    .ilike('email', normalizedEmail)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    return {
      userId: existing.id,
      isNewAccount: false,
      profileCompleted: !!existing.profile_completed,
      session: null,
    };
  }

  const password = generateGuestPassword();

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
    user_metadata: { created_via: 'guest_checkout' },
  });

  if (createError) {
    // Race: another request (or the webhook, firing around the same
    // moment as the client-triggered verify call) created this exact
    // account between our lookup and this call. Re-resolve by email
    // instead of erroring the payment out.
    const { data: raceWinner, error: raceLookupError } = await admin
      .from('users')
      .select('id, profile_completed')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (raceLookupError || !raceWinner) throw createError;

    return {
      userId: raceWinner.id,
      isNewAccount: false,
      profileCompleted: !!raceWinner.profile_completed,
      session: null,
    };
  }

  const authUser = created.user;
  if (!authUser) throw new Error('Guest account creation returned no user');

  // users.username is NOT NULL with no default (confirmed via
  // information_schema.columns against the live DB) -- this INSERT was
  // missing it entirely, so it was failing on every brand-new guest
  // checkout before this fix. Derived from the auth user's own UUID
  // rather than the email, so it's guaranteed unique without needing a
  // retry-on-collision loop.
  const { error: insertError } = await admin.from('users').insert({
    id: authUser.id,
    username: `guest_${authUser.id.replace(/-/g, '').slice(0, 12)}`,
    email: normalizedEmail,
    profile_completed: false,
    is_guest_created: true,
  });

  if (insertError) throw insertError;

  // Mint a session for the account we just created. Deliberately a
  // fresh, plain client here (not the admin client) — signInWithPassword
  // is a normal auth call and doesn't need/want the service-role key.
  const anonClient = createSupabaseJsClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });

  if (signInError || !signInData.session) {
    // Account and wallet credit still succeed even if this fails —
    // worst case the guest lands on /login instead of being auto-signed
    // in, which is a degraded UX, not a broken payment.
    console.error('Guest session mint failed after account creation:', signInError);
    return {
      userId: authUser.id,
      isNewAccount: true,
      profileCompleted: false,
      session: null,
    };
  }

  return {
    userId: authUser.id,
    isNewAccount: true,
    profileCompleted: false,
    session: {
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
      expires_at: signInData.session.expires_at,
    },
  };
}

/**
 * Credits a wallet top-up. Atomic + idempotent on `reference` via the
 * credit_wallet_deposit() RPC (see
 * supabase_migration_004_credit_wallet_deposit.sql) — this used to do its
 * own idempotency check + insert against amount_cents/type/description
 * columns that don't exist on the live wallet_ledger table (it only has
 * `changeset`/`metadata` jsonb columns), so every guest top-up through
 * this path was erroring before this fix.
 */
export async function creditWalletTopUp(params: {
  userId: string;
  amountCents: number;
  reference: string;
  channel?: string;
}): Promise<{ credited: boolean }> {
  const admin = createAdminClient();
  const { userId, amountCents, reference, channel } = params;

  const { data, error } = await admin.rpc('credit_wallet_deposit', {
    p_user_id: userId,
    p_amount_cents: amountCents,
    p_reference: reference,
    p_source: channel || 'korapay',
  });

  if (error) throw error;

  const credited = Array.isArray(data) ? data[0]?.credited : data?.credited;
  return { credited: !!credited };
}
