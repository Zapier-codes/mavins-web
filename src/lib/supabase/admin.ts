// src/lib/supabase/admin.ts
//
// Service-role Supabase client. This bypasses Row Level Security, so it
// must NEVER be imported from a 'use client' file or shipped to the
// browser — it only ever runs inside API routes / server code.
//
// Why this exists (rather than reusing the normal server client):
// guest checkout has to look a user up by email — and possibly create
// one — *before* there is any session for RLS to key off of. The
// "Users can read own data" / "update own data" policies on
// public.users are `auth.uid() = id`, which is correct for everything
// else in the app but means an anonymous request can never see
// whether an email is already registered. That check, the guest
// users-row insert, and (from the webhook, which has no browser
// session at all) crediting an *existing* user's wallet all need to
// go through here instead.
//
// Requires SUPABASE_SERVICE_ROLE_KEY to be set (Supabase dashboard →
// Project Settings → API → service_role key). Do not reuse
// NEXT_PUBLIC_SUPABASE_ANON_KEY here — that key is intentionally
// public and RLS-bound.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error(
    'src/lib/supabase/admin.ts was imported into client-side code. ' +
    'The service-role key must never reach the browser — only import ' +
    'this from API routes / server-only modules.'
  );
}

let adminClient: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL environment variable');
  }
  if (!serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
      'Guest checkout (account auto-creation on wallet top-up) needs this ' +
      'to look up/create users ahead of any session existing. Set it in ' +
      'Vercel env vars — never prefix it with NEXT_PUBLIC_.'
    );
  }

  adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return adminClient;
}
