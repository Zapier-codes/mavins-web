// src/lib/nakama/nakamaClient.ts
//
// Task 48-c Part 2 (handover.md) — CORRECTED direction, per explicit
// product-owner correction this session: Supabase Auth's own `id` is
// the ONE source of truth. Nakama is a downstream, linked identity
// keyed by that SAME id via `authenticateCustom(supabaseUserId)` —
// established right after a normal Supabase login/signup succeeds,
// never the other way around. This supersedes this file's original
// version (and Part 1's `/api/auth/nakama-bridge` route/
// `resolveOrLinkNakamaIdentity()`, which had built the reverse flow —
// authenticate against Nakama FIRST, then mint a NEW Supabase session
// from that identity). Product owner confirmed removal directly: both
// of Part 1's files were deleted outright, not left as dead code. See
// Task 48-c's own handover.md entry for the full correction write-up.
//
// Deliberately a SEPARATE, small file from
// src/services/nakama/nakama.service.ts, not a re-export of it — that
// file mixes in `authenticateServer()` (the SERVER's own system
// identity, used for leaderboard writes, a completely different actor
// from an end-user's own session) and other server-oriented methods.
// Pulling all of that into a 'use client' bundle would be needless
// bloat and conflates two different authentication actors that happen
// to share a Nakama instance, even though nothing in that file is
// actually secret (Nakama client keys, unlike server keys, are meant
// to be public/embeddable — the `NEXT_PUBLIC_NAKAMA_KEY` env var
// naming already reflects this).

import { Client } from '@heroiclabs/nakama-js';

const NAKAMA_HOST = process.env.NEXT_PUBLIC_NAKAMA_SERVER || 'nakama-mmpb.onrender.com';
const NAKAMA_PORT = process.env.NEXT_PUBLIC_NAKAMA_PORT || '443';
const NAKAMA_KEY = process.env.NEXT_PUBLIC_NAKAMA_KEY || 'defaultkey';
const NAKAMA_USE_SSL = true;

let clientSingleton: Client | null = null;

function getClient(): Client {
  if (!clientSingleton) {
    clientSingleton = new Client(NAKAMA_KEY, NAKAMA_HOST, NAKAMA_PORT, NAKAMA_USE_SSL);
  }
  return clientSingleton;
}

export interface NakamaSyncResult {
  token: string;
}

/**
 * Establishes/refreshes a Nakama session for the CURRENT Supabase user,
 * keyed by their real Supabase Auth `id` as Nakama's own custom id —
 * so Nakama never mints or owns a separate canonical identity, it just
 * mirrors the one Supabase already established. Call this right after
 * a successful Supabase sign-up or sign-in, once `user.id` is known.
 *
 * `create: true` is always safe to pass here (not just on first
 * signup) — Nakama's `authenticateCustom` is idempotent-by-id: an
 * existing custom id just logs back in, a new one gets created. No
 * separate "is this a new or returning user" branch needed the way
 * this app's own Supabase signup/signin split requires, since there's
 * no password/credential to get wrong here — `id` alone is the whole
 * identifier.
 *
 * Deliberately non-fatal from the caller's perspective if this
 * fails — a Supabase session is already fully valid and usable on its
 * own (it's the actual source of truth); losing Nakama sync only means
 * Nakama-backed features (leaderboards, etc.) won't work for this
 * session until the next successful call, not that the user's login
 * itself is broken. Callers should catch/log, never block navigation
 * on this.
 */
export async function syncNakamaSession(supabaseUserId: string, username?: string): Promise<NakamaSyncResult> {
  const client = getClient();
  const session = await client.authenticateCustom(supabaseUserId, true, username);
  return { token: session.token };
}
