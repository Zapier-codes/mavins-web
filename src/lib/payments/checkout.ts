/**
 * Shared checkout-initialization helpers.
 *
 * `initializeCheckout` was extracted from fund-wallet/page.tsx
 * (Task 28) so an already-authenticated user with insufficient (or
 * zero) wallet balance can be sent straight to Korapay's checkout from
 * wherever they triggered a payment — e.g. promote/page.tsx — without
 * being routed through the fund-wallet page/form at all. That page's
 * email field exists for guests who have no account yet; an
 * authenticated user's email is already known from their session, so
 * there is nothing for them to fill in there.
 *
 * `initializeCampaignCheckout` (Task 36 Part 4) is the guest
 * direct-pay-for-a-campaign counterpart — see its own doc comment
 * below for how it differs.
 *
 * Both own the full round-trip: POST to the relevant initialize route,
 * validate the returned checkout_url, attach our own verify route as
 * the redirect_url (via the shared `redirectToCheckout` below), and
 * navigate the browser there directly.
 *
 * Both resolve to an error message string on failure. On success they
 * navigate the browser away (`window.location.href = ...`) and never
 * resolve — callers only need to handle the string-error case, e.g.:
 *
 *   const error = await initializeCheckout({ amountUsd, redirectTo });
 *   if (error) { alert(error); setIsSubmitting(false); }
 */

/**
 * Shared by both initializeCheckout and initializeCampaignCheckout
 * below: turn a successful init response into a browser navigation to
 * Korapay's checkout, with our own verify route wired in as the
 * return URL. Extracted rather than duplicated in both callers so the
 * URL-guard / verify-callback logic (and any future fix to it) can't
 * drift between the two flows the way the old fund-wallet/verify page
 * duplication did.
 */
function redirectToCheckout(data: { checkout_url: string; reference: string }, redirectTo: string): string | void {
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

  // Points DIRECTLY at the verify API route, not at a page in between
  // — see this file's header comment for why that matters (the
  // now-deleted fund-wallet/verify page's fetch()/.json() mismatch).
  const callbackParams = new URLSearchParams({ redirect: redirectTo });
  const verifyCallback = `${window.location.origin}/api/payments/verify/${encodeURIComponent(data.reference)}?${callbackParams.toString()}`;
  // Some Korapay checkout configs read the return URL from a query
  // param; harmless to include even if the render-backend already
  // set one, since ours is what our own verify route expects.
  checkoutUrl.searchParams.set('redirect_url', verifyCallback);

  window.location.href = checkoutUrl.toString();
}

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

    return redirectToCheckout(data, redirectTo);
  } catch (err: any) {
    return err?.message || 'Something went wrong. Please try again.';
  }
}

/**
 * Task 36 Part 4 — the guest direct-pay-for-a-campaign counterpart to
 * initializeCheckout above. Calls Part 1's
 * POST /api/payments/initialize-campaign instead of the wallet
 * top-up route: same payment_sessions + Korapay-checkout shape under
 * the hood, but the body is the full campaign intent (what's being
 * paid for) rather than a bare dollar amount, and the server derives
 * the charge amount itself via calculatePricing() — never trust a
 * client-supplied total for what a guest is charged.
 *
 * Guest-only by construction, same as the route it calls: an
 * authenticated caller should never reach this — promote/page.tsx's
 * own auth branch is what enforces that, this function doesn't
 * re-check it.
 *
 * Same resolves-to-error-string-or-navigates-away contract as
 * initializeCheckout — see that function's own doc comment.
 */
export async function initializeCampaignCheckout(params: {
  sourceUrl: string;
  viewCount: number;
  guestEmail: string;
  genre?: string;
  geographicTier?: string;
  targetCountries?: string[];
  /** Korapay DCC hint — same meaning/limits as initializeCheckout's. */
  paymentCurrency?: string | null;
  /** Where to send the guest after a confirmed payment. */
  redirectTo: string;
}): Promise<string | void> {
  const { redirectTo, paymentCurrency, ...campaignBody } = params;

  try {
    const res = await fetch('/api/payments/initialize-campaign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...campaignBody,
        ...(paymentCurrency ? { paymentCurrency } : {}),
      }),
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      return data.error || 'Could not start checkout. Please try again.';
    }

    return redirectToCheckout(data, redirectTo);
  } catch (err: any) {
    return err?.message || 'Something went wrong. Please try again.';
  }
}
