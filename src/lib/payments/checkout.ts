/**
 * Shared checkout-initialization helper.
 *
 * Extracted from fund-wallet/page.tsx (Task 28) so an already-
 * authenticated user with insufficient (or zero) wallet balance can be
 * sent straight to Korapay's checkout from wherever they triggered a
 * payment — e.g. promote/page.tsx — without being routed through the
 * fund-wallet page/form at all. That page's email field exists for
 * guests who have no account yet; an authenticated user's email is
 * already known from their session, so there is nothing for them to
 * fill in there.
 *
 * Owns the full round-trip: POST /api/payments/initialize, validate
 * the returned checkout_url, attach our own verify page as the
 * redirect_url, stash a guest fallback in sessionStorage only when
 * there's no session, and navigate the browser there directly.
 *
 * Resolves to an error message string on failure. On success it
 * navigates the browser away (`window.location.href = ...`) and never
 * resolves — callers only need to handle the string-error case, e.g.:
 *
 *   const error = await initializeCheckout({ amountUsd, redirectTo });
 *   if (error) { alert(error); setIsSubmitting(false); }
 */
export async function initializeCheckout(params: {
  /** Whole USD dollars — this app's own accounting currency is
   * always USD; see the comment on `amount` in fund-wallet/page.tsx
   * for why this is never multiplied into subunits or converted
   * client-side. */
  amountUsd: number;
  /** Where to send the user after a confirmed payment. */
  redirectTo: string;
  /** Korapay Dynamic Currency Conversion hint — checkout-display
   * only, never used to convert `amountUsd` itself. Pass `null`/
   * `undefined` to charge/display directly in USD (correct for a
   * US-based payer, or if geo detection hasn't resolved yet). */
  dccCurrency?: string | null;
  /** Omit entirely for an authenticated user — the backend reads
   * their identity from the session. Only pass this for a genuine
   * guest checkout. */
  guestEmail?: string;
}): Promise<string | void> {
  const { amountUsd, redirectTo, dccCurrency, guestEmail } = params;

  try {
    const res = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: Math.round(amountUsd),
        currency: 'USD',
        ...(dccCurrency ? { paymentCurrency: dccCurrency } : {}),
        ...(guestEmail ? { guestEmail } : {}),
      }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      return data.error || 'Could not start checkout. Please try again.';
    }

    if (guestEmail) {
      // Guest fallback only — an authenticated user's session already
      // carries them through verification without needing this.
      try {
        sessionStorage.setItem('mavins_pending_verify', JSON.stringify({
          reference: data.reference,
          redirect: redirectTo,
        }));
      } catch {}
    }

    // data.checkout_url can come back missing/malformed if the render
    // backend or Korapay itself hiccups upstream — without this
    // guard, `new URL()` throws the raw, unhelpful "Failed to
    // construct 'URL': Invalid URL" straight at the user.
    let checkoutUrl: URL;
    try {
      checkoutUrl = new URL(data.checkout_url);
    } catch {
      return 'Could not start checkout — the payment link we received was invalid. Please try again.';
    }

    const callbackParams = new URLSearchParams({ redirect: redirectTo });
    const verifyCallback = `${window.location.origin}/fund-wallet/verify?reference=${encodeURIComponent(data.reference)}&${callbackParams.toString()}`;
    // Some Korapay checkout configs read the return URL from a query
    // param; harmless to include even if the render-backend already
    // set one, since ours is what our own verify page expects.
    checkoutUrl.searchParams.set('redirect_url', verifyCallback);

    window.location.href = checkoutUrl.toString();
  } catch (err: any) {
    return err?.message || 'Something went wrong. Please try again.';
  }
}
