'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { cn } from '@/lib/utils/cn';
import { Wallet, ArrowRight, ShieldCheck, Loader2, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FundWalletForm() {
  const { user, isAuthenticated } = useAuth();
  const searchParams = useSearchParams();

  const prefillAmount = Number(searchParams.get('amount')) || 0;
  const redirectTo = searchParams.get('redirect') || '/';
  const reason = searchParams.get('reason');

  const [amount, setAmount] = useState(prefillAmount > 0 ? prefillAmount : 5000);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (prefillAmount > 0) setAmount(prefillAmount);
  }, [prefillAmount]);

  // Pre-fill email if user is authenticated
  useEffect(() => {
    if (isAuthenticated && user?.email) {
      setEmail(user.email);
    }
  }, [isAuthenticated, user]);

  const validateEmail = (val: string): boolean => {
    if (!val.trim()) {
      setEmailError('Email is required to process payment');
      return false;
    }
    if (!EMAIL_RE.test(val.trim())) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError('');
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!amount || amount < 100) {
      setError('Minimum top-up is ₦100');
      return;
    }

    // ALWAYS validate email — even authenticated users need a confirmed email on file
    if (!validateEmail(email)) {
      return;
    }

    setIsSubmitting(true);
    try {
      const callbackParams = new URLSearchParams({ redirect: redirectTo });

      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency: 'NGN',
          email: email.trim(),
          ...(isAuthenticated ? {} : { guestEmail: email.trim() }),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Could not start checkout. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (!isAuthenticated) {
        try {
          sessionStorage.setItem('mavins_pending_verify', JSON.stringify({
            reference: data.reference,
            redirect: redirectTo,
          }));
        } catch {}
      }

      const verifyCallback = `${window.location.origin}/fund-wallet/verify?reference=${encodeURIComponent(data.reference)}&${callbackParams.toString()}`;
      const checkoutUrl = new URL(data.checkout_url);
      checkoutUrl.searchParams.set('redirect_url', verifyCallback);

      // Show success message briefly before redirect
      setSuccess('Redirecting to secure checkout...');
      setTimeout(() => {
        window.location.href = checkoutUrl.toString();
      }, 800);
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 mb-4 shadow-lg shadow-emerald-500/20">
            <Wallet className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Fund your wallet</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-2">
            {reason === 'launch_campaign'
              ? "You'll be redirected back to launch your campaign after payment."
              : reason === 'insufficient_funds'
              ? "Add funds to complete your campaign launch."
              : "Secure payment via Korapay."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Email — ALWAYS shown, pre-filled for logged-in users */}
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">
              <span className="flex items-center gap-1.5">
                <Mail className="w-4 h-4" /> Email Address
              </span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError('');
              }}
              onBlur={() => validateEmail(email)}
              placeholder="your@email.com"
              className={cn(
                'w-full px-4 py-3.5 rounded-xl glass-input text-sm transition-all',
                emailError && 'border-red-400/50 ring-1 ring-red-400/20'
              )}
              required
            />
            {emailError && (
              <p className="text-xs text-red-400 mt-1.5 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {emailError}
              </p>
            )}
            {!isAuthenticated && !emailError && (
              <p className="text-[11px] text-[var(--subtle-foreground)] mt-1.5">
                We'll create your account automatically after payment.
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium mb-1.5 text-[var(--muted-foreground)]">Amount (₦)</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--subtle-foreground)] font-semibold">₦</span>
              <input
                type="number"
                min="100"
                step="100"
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full pl-10 pr-4 py-3.5 rounded-xl glass-input text-sm font-semibold"
                required
              />
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {[1000, 5000, 10000, 25000, 50000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setAmount(preset)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all active:scale-95',
                    amount === preset
                      ? 'bg-[#1db954] text-black'
                      : 'chip-card text-[var(--muted-foreground)]'
                  )}
                >
                  ₦{preset.toLocaleString()}
                </button>
              ))}
            </div>
          </div>

          {/* Error / Success messages */}
          {error && (
            <div className="p-3 rounded-xl bg-red-400/10 border border-red-400/20 text-sm text-red-400 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 rounded-xl bg-emerald-400/10 border border-emerald-400/20 text-sm text-emerald-400 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ShieldCheck className="w-5 h-5" />
                Pay ₦{amount.toLocaleString()}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="text-[11px] text-center text-[var(--subtle-foreground)]">
            Secured by Korapay · SSL encrypted
          </p>
        </form>
      </div>
    </div>
  );
}

export default function FundWalletPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    }>
      <FundWalletForm />
    </Suspense>
  );
}
