'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { cn } from '@/lib/utils/cn';
import { Wallet, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FundWalletForm() {
  const { user, isAuthenticated } = useAuth();
  const searchParams = useSearchParams();

  // amount comes in as whole NGN (matches how the pricing engine and
  // the rest of the UI display cost); we convert to cents at submit.
  const prefillAmount = Number(searchParams.get('amount')) || 0;
  const redirectTo = searchParams.get('redirect') || '/';
  const reason = searchParams.get('reason');

  const [amount, setAmount] = useState(prefillAmount > 0 ? prefillAmount : 5000);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (prefillAmount > 0) setAmount(prefillAmount);
  }, [prefillAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!amount || amount < 100) {
      setError('Minimum top-up is ₦100');
      return;
    }
    if (!isAuthenticated && !EMAIL_RE.test(email)) {
      setError('Enter a valid email so we can confirm your payment');
      return;
    }

    setIsSubmitting(true);
    try {
      // The verify callback needs to know where to send the guest
      // back to (and, on success, the redirect target survives the
      // Korapay round-trip via the querystring on our own /fund-wallet/verify
      // page, not via Korapay itself).
      const callbackParams = new URLSearchParams({ redirect: redirectTo });

      const res = await fetch('/api/payments/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency: 'NGN',
          ...(isAuthenticated ? {} : { guestEmail: email }),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || 'Could not start checkout. Please try again.');
        setIsSubmitting(false);
        return;
      }

      if (!isAuthenticated) {
        // Stash the redirect target + reference locally too, as a
        // fallback in case Korapay's own success_url handling drops
        // our query params on the way back.
        try {
          sessionStorage.setItem('mavins_pending_verify', JSON.stringify({
            reference: data.reference,
            redirect: redirectTo,
          }));
        } catch {}
      }

      const verifyCallback = `${window.location.origin}/fund-wallet/verify?reference=${encodeURIComponent(data.reference)}&${callbackParams.toString()}`;
      const checkoutUrl = new URL(data.checkout_url);
      // Some Korapay checkout configs read the return URL from a query
      // param; harmless to include even if the render-backend already
      // set one, since ours is what our own verify page expects.
      checkoutUrl.searchParams.set('redirect_url', verifyCallback);

      window.location.href = checkoutUrl.toString();
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 mb-4">
            <Wallet className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold">Fund your wallet</h1>
          <p className="text-sm text-muted-foreground mt-2">
            {reason === 'launch_campaign'
              ? "You'll need funds to launch that campaign — top up to continue."
              : 'Add funds to promote your music.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isAuthenticated && (
            <div>
              <label className="block text-sm font-medium mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border bg-background"
                required
              />
              <p className="text-xs text-muted-foreground mt-1.5">
                No account needed yet — we'll create one automatically once your payment confirms.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1.5">Amount (₦)</label>
            <input
              type="number"
              min={100}
              step={100}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl border bg-background text-lg font-semibold"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className={cn(
              'w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-white',
              'bg-gradient-to-r from-emerald-500 to-teal-500 hover:opacity-90 transition-opacity',
              isSubmitting && 'opacity-60 cursor-not-allowed'
            )}
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                Continue to payment
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="w-3.5 h-3.5" />
            Secured by Korapay
          </p>
        </form>
      </div>
    </div>
  );
}

export default function FundWalletPage() {
  return (
    <Suspense fallback={null}>
      <FundWalletForm />
    </Suspense>
  );
}
