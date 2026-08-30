'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { cn } from '@/lib/utils/cn';
import { Wallet, ArrowRight, ShieldCheck, Loader2 } from 'lucide-react';
import { useGeo } from '@/components/providers/GeoProvider';
import { getKorapayDccCurrency } from '@/lib/currency/korapayDccCurrency';
import { initializeCheckout } from '@/lib/payments/checkout';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FundWalletForm() {
  const { user, isAuthenticated } = useAuth();
  const searchParams = useSearchParams();

  // amount comes in as whole USD dollars (matches how the pricing
  // engine and the rest of the UI display cost -- pricing.ts's
  // totalCostCents is USD cents; promote/page.tsx already divides by
  // 100 before landing here). We do NOT convert this client-side into
  // any other currency -- see the DCC comment in handleSubmit below.
  const prefillAmount = Number(searchParams.get('amount')) || 0;
  const redirectTo = searchParams.get('redirect') || '/';
  const reason = searchParams.get('reason');

  const [amount, setAmount] = useState(prefillAmount > 0 ? prefillAmount : 50);
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Best-effort local currency for Korapay's Dynamic Currency
  // Conversion (DCC) -- purely a checkout-display hint forwarded
  // as-is; never used to convert `amount` itself. null means "no DCC,
  // charge/display directly in USD" (also the correct behavior for a
  // US/UK/etc. payer, or if geo detection fails).
  const [dccCurrency, setDccCurrency] = useState<string | null>(null);
  const { geo, loading: geoLoading } = useGeo();

  useEffect(() => {
    if (prefillAmount > 0) setAmount(prefillAmount);
  }, [prefillAmount]);

  useEffect(() => {
    if (geoLoading) return;
    setDccCurrency(getKorapayDccCurrency(geo?.countryCode));
  }, [geo, geoLoading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!amount || amount < 1) {
      setError('Minimum top-up is $1');
      return;
    }
    if (!isAuthenticated && !EMAIL_RE.test(email)) {
      setError('Enter a valid email so we can confirm your payment');
      return;
    }

    setIsSubmitting(true);
    // Korapay's charges/initialize wants the amount in the base
    // currency unit, NOT subunits -- confirmed directly against
    // developers.korapay.com (see B-Pay-backend's handover.md, Task
    // 7). `amount` here is already whole USD dollars (see the comment
    // above `amount` state). This app's own accounting currency is
    // USD, always -- a non-US payer's local-currency checkout display
    // is handled entirely by Korapay's own Dynamic Currency
    // Conversion, driven by `paymentCurrency` below. See
    // src/lib/payments/checkout.ts for the full round-trip this now
    // shares with promote/page.tsx's direct-to-checkout path.
    const error = await initializeCheckout({
      amountUsd: Math.round(amount),
      redirectTo,
      dccCurrency,
      ...(isAuthenticated ? {} : { guestEmail: email }),
    });
    if (error) {
      setError(error);
      setIsSubmitting(false);
    }
    // No `else` -- success navigates the browser away inside
    // initializeCheckout; there's nothing left to do here.
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-accent-light to-accent-dark mb-4">
            <Wallet className="w-7 h-7 text-background" />
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
            <label className="block text-sm font-medium mb-1.5">Amount ($)</label>
            <input
              type="number"
              min={1}
              step={1}
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
              'w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-semibold text-background',
              'bg-gradient-to-r from-accent-light to-accent hover:brightness-110 transition-all',
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
