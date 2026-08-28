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

    // No sessionStorage fallback needed here: `reference` is a URL
    // PATH segment on the target below (`/api/payments/verify/
    // [reference]`), not a query param — the exact class of thing a
    // return-URL rewrite might strip is `redirect_url`'s own query
    // string, not its path, so `reference` survives even if `redirect`
    // doesn't (the route's own `redirectPath = searchParams.get(...) ||
    // '/'` already covers that gracefully). The old
    // `mavins_pending_verify` sessionStorage write that used to live
    // here existed only to work around that same risk for the
    // now-deleted `/fund-wallet/verify` PAGE (see the comment on
    // `verifyCallback` below for why that page is gone) — removed
    // along with it rather than left as dead code nothing reads.

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

    // Points DIRECTLY at the verify API route now, not at a
    // `/fund-wallet/verify` page in between. That page used to
    // `fetch()` this same route and `.json()`-parse the response — but
    // Task 33 Part 2a (handover.md) rewrote this route to do a plain
    // `NextResponse.redirect(...)` instead of returning JSON, and
    // nothing updated that page to match. `fetch()` follows redirects
    // by default, so it would land on whatever HTML page the route
    // redirected to and `.json()` it — throwing a SyntaxError on every
    // single payment, success or failure, leaving the guest stranded on
    // a broken "confirming your payment" screen even though their
    // payment (and, per Task 36 Part 2, their campaign) had already
    // gone through server-side. Found and fixed this session, along
    // with deleting that now-fully-dead page — see handover.md's
    // "checkout.ts verify-callback" note (search Task 36 Part 4) for
    // the full writeup. A real browser navigation here (not a fetch)
    // is exactly what this server-redirect route wants and already
    // correctly handles.
    const callbackParams = new URLSearchParams({ redirect: redirectTo });
    const verifyCallback = `${window.location.origin}/api/payments/verify/${encodeURIComponent(data.reference)}?${callbackParams.toString()}`;
    // Some Korapay checkout configs read the return URL from a query
    // param; harmless to include even if the render-backend already
    // set one, since ours is what our own verify route expects.
    checkoutUrl.searchParams.set('redirect_url', verifyCallback);

    window.location.href = checkoutUrl.toString();
  } catch (err: any) {
    return err?.message || 'Something went wrong. Please try again.';
  }
}
