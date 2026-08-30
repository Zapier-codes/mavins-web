'use client';

import React, { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils/cn';
import { Mail, Lock, ArrowRight, Zap, Eye, EyeOff } from 'lucide-react';

// Task 17 fix: complete-profile existed but nothing ever routed a user
// into it. Both branches below now check/route through it:
//   - Sign up -> brand new row, profile_completed is always false by
//     default -> straight to /complete-profile.
//   - Sign in -> existing account may have skipped it last time, so we
//     look up profile_completed and only send them through it if it's
//     still false; otherwise go straight to the intended destination.
// Either way `redirect` is threaded through so complete-profile lands
// the user where they were actually headed (matches the ?redirect=
// pattern middleware.ts already uses for /admin).
function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (isSignUp) {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { artist_name: email.split('@')[0] },
          // Task 47 item 5's confirmation-screen note: this call
          // previously set no emailRedirectTo at all, so Supabase fell
          // back to its dashboard-configured "Site URL" default — not
          // discoverable from code, and not something this sandbox can
          // check. Setting it explicitly here removes that dependency
          // entirely: whatever the dashboard default is, it no longer
          // matters, since this always wins. Points at the new
          // /auth/confirmed page (see that page for the other half of
          // this fix — exchanging the ?code= param this redirect
          // carries for a real session, which nothing in this app did
          // before regardless of which page it landed on).
          emailRedirectTo: `${window.location.origin}/auth/confirmed?redirect=${encodeURIComponent(redirectTo)}`,
        },
      });
      if (signUpError) setError(signUpError.message);
      else {
        // Create user profile
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('users').insert({
            id: user.id,
            email,
            artist_name: email.split('@')[0],
          });
          // Brand-new row -> profile_completed defaults to false ->
          // always send a fresh signup through complete-profile.
          router.push(`/complete-profile?redirect=${encodeURIComponent(redirectTo)}`);
        } else {
          // No active session yet (e.g. email confirmation required) —
          // nothing to route into complete-profile until they're
          // actually signed in, so fall back to prior behavior.
          router.push('/');
        }
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        setError(signInError.message);
      } else {
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
        if (!profileCompleted) {
          router.push(`/complete-profile?redirect=${encodeURIComponent(redirectTo)}`);
        } else {
          router.push(redirectTo);
        }
      }
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[var(--accent)]/5 rounded-full blur-3xl animate-ambient" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient-slow" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/20 mb-4">
            <Zap className="w-7 h-7 text-[var(--background)]" />
          </div>
          <h1 className="text-2xl font-bold">{isSignUp ? 'Create Account' : 'Welcome Back'}</h1>
          <p className="text-sm text-[var(--subtle-foreground)] mt-1">
            {isSignUp ? 'Start your artist journey' : 'Sign in to your account'}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-strong rounded-2xl p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-[#ef4444]/10 border border-[#ef4444]/20 text-sm text-[#ef4444]">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--subtle-foreground)]" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-10 pr-4 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs text-[var(--muted-foreground)] mb-1.5">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--subtle-foreground)]" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-10 pr-10 py-3 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--subtle-foreground)]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-[var(--accent)] text-[var(--background)] font-semibold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            ) : (
              <>
                {isSignUp ? 'Create Account' : 'Sign In'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--subtle-foreground)] mt-4">
          {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
            className="text-[var(--accent)] hover:underline font-medium"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
