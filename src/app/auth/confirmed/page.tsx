'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { Loader2, CheckCircle2, XCircle, Zap } from 'lucide-react';

/**
 * Task 47 item 5 (handover.md) — the confirmation-screen build-out
 * this item's own note explicitly left open, rather than guessed at.
 * The note's suggested precedent to mirror ("fund-wallet/verify's own
 * shape") was confirmed stale — that page no longer exists, and
 * checkout redirects now point straight at an API route. Building
 * this fresh here, not modeled on anything that used to exist.
 *
 * This turned out to be more than a themed loading screen. `@supabase/
 * ssr`'s `createBrowserClient` (login/page.tsx's real signUp() call —
 * the only one actually used anywhere in this app; api/auth/
 * create-user/route.ts is dead code, zero callers anywhere) defaults
 * to PKCE auth, which means an email-confirmation link carries a
 * `?code=` param that has to be explicitly EXCHANGED for a session via
 * `exchangeCodeForSession()` — grepped the whole app for that function
 * name before writing this page: zero hits anywhere. That call
 * genuinely didn't exist. Confirming an email was silently only
 * marking it confirmed in Supabase's own `auth.users` table — it never
 * actually logged the user in here, regardless of which page the old,
 * unset `emailRedirectTo` happened to land them on. Fixed alongside
 * this page: login/page.tsx's real signUp() call now explicitly sets
 * `emailRedirectTo` to point here (see that file's own comment).
 *
 * Known, inherent PKCE limitation, not introduced by this fix: the
 * code_verifier PKCE needs to complete the exchange is stored in the
 * SAME browser that called signUp() — confirming from a different
 * browser/device (e.g. opening the email on a phone after signing up
 * on desktop) will correctly show this page's error state, not
 * silently succeed. This is standard PKCE behavior every app using it
 * has to accept, not something worth working around here.
 */
function ConfirmedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const code = searchParams.get('code');
    if (!code) {
      // A genuinely valid state to land here in, not just a failure:
      // e.g. the link was already used once (Supabase invalidates a
      // PKCE code after its first exchange), or someone navigated here
      // directly with no code at all.
      setStatus('error');
      setErrorMessage('This confirmation link is invalid or has already been used.');
      return;
    }

    (async () => {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus('error');
        setErrorMessage(error.message || 'This confirmation link is invalid or has expired.');
        return;
      }
      setStatus('success');

      // Same profile_completed branch login/page.tsx's own sign-in
      // path already uses — a freshly confirmed user is functionally
      // in the same position as someone who just signed in for the
      // first time, so route them the same way rather than inventing
      // a third path.
      const { data: { user } } = await supabase.auth.getUser();
      let profileCompleted = true;
      if (user) {
        const { data: profile } = await supabase
          .from('users')
          .select('profile_completed')
          .eq('id', user.id)
          .single();
        profileCompleted = !!profile?.profile_completed;
      }

      const target = profileCompleted
        ? redirectTo
        : `/complete-profile?redirect=${encodeURIComponent(redirectTo)}`;

      // Brief pause so the success state is actually visible rather
      // than flashing past — the exchange above is often fast enough
      // that redirecting instantly would just look like this page
      // never rendered.
      setTimeout(() => router.push(target), 1200);
    })();
  }, [searchParams, redirectTo, router]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[var(--accent)]/5 rounded-full blur-3xl animate-ambient" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient-slow" />
      </div>

      <div className="relative w-full max-w-sm text-center">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/20 mb-6">
          <Zap className="w-7 h-7 text-[var(--background)]" />
        </div>

        <div className="glass-strong rounded-2xl p-8">
          {status === 'loading' && (
            <>
              <Loader2 className="w-10 h-10 mx-auto text-[var(--accent)] animate-spin mb-4" />
              <h1 className="text-lg font-semibold mb-1">Confirming your email...</h1>
              <p className="text-sm text-[var(--subtle-foreground)]">This will just take a moment.</p>
            </>
          )}
          {status === 'success' && (
            <>
              <CheckCircle2 className="w-10 h-10 mx-auto text-[var(--accent)] mb-4" />
              <h1 className="text-lg font-semibold mb-1">Email confirmed!</h1>
              <p className="text-sm text-[var(--subtle-foreground)]">Taking you to your account...</p>
            </>
          )}
          {status === 'error' && (
            <>
              <XCircle className="w-10 h-10 mx-auto text-[#ef4444] mb-4" />
              <h1 className="text-lg font-semibold mb-1">Confirmation failed</h1>
              <p className="text-sm text-[var(--subtle-foreground)] mb-4">{errorMessage}</p>
              <button
                onClick={() => router.push('/login')}
                className="px-4 py-2 rounded-xl bg-[var(--accent)] text-[var(--background)] text-sm font-semibold hover:brightness-110 transition-all"
              >
                Back to sign in
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ConfirmedPage() {
  return (
    <Suspense fallback={null}>
      <ConfirmedContent />
    </Suspense>
  );
}
