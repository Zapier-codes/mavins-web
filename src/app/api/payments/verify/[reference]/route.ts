import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/payments/verify/[reference]
 *
 * Task 33 Part 2a — rewritten to be a PURE READ of `payment_sessions`.
 * This route used to (a) call Korapay directly via the render-backend
 * proxy to ask "did this succeed?", and (b) credit the wallet itself
 * based on that answer — a second, independent crediting path running
 * in parallel with the webhook route, racing it, and deciding success/
 * failure from a different source of truth (a live provider call)
 * than the webhook did (Korapay's own signed event delivery). Per the
 * product owner's explicit direction this session: wallet crediting
 * must wait on webhook-confirmed status, and only one path may ever
 * decide a payment succeeded. That path is now exclusively
 * `supabase/functions/korapay-webhook/index.ts`, which is the only
 * code in this project that writes `payment_sessions.status` — see
 * handover.md's Task 33 Part 2 note for the full audit that led here.
 *
 * This route's only remaining job: read that same status back for the
 * user landing on this URL after checkout, and redirect accordingly.
 * It does NOT call Korapay, does NOT write payment_sessions, does NOT
 * touch the wallet, and does NOT create a guest account — all of that
 * (guest account resolution + the actual `credit_wallet_deposit` call,
 * with the net-of-fee amount per Task 40's rule) is Part 2b/2c's job,
 * triggered from the webhook path once a session is confirmed
 * 'success', not from a user's browser landing back on this page.
 * `resolveOrCreateGuestAccount`/`creditWalletTopUp` in
 * `src/lib/auth/guestCheckout.ts` are therefore unused by this route
 * now (temporarily 0 callers project-wide) — they are NOT dead code,
 * they're exactly what Part 2b will call from the webhook side. Don't
 * delete them.
 *
 * The old `korapay.service.ts` this route used to import
 * (`verifyCharge`) has been deleted entirely — it was already fully
 * unused elsewhere per this session's grep, and its
 * `verifyWebhookSignature` export was a stub that unconditionally
 * returned `true`, which is exactly the kind of dormant landmine this
 * cleanup exists to remove before something accidentally wires it back
 * in.
 *
 * The old `payments` table this route (and the now-deleted
 * `src/app/api/payments/webhook/route.ts`) used to read/write is no
 * longer touched anywhere in this app's code as of this change —
 * `payment_sessions` (migration 006) is the only table involved.
 * The `payments` table itself has NOT been dropped (a destructive
 * schema change is a separate decision, out of scope here) — flagging
 * for a future session/product-owner call, not fixed.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { reference: string } }
) {
  const reference = params.reference;
  const searchParams = request.nextUrl.searchParams;
  const redirectPath = searchParams.get('redirect') || '/';

  try {
    const supabase = createAdminClient();

    const { data: session, error } = await supabase
      .from('payment_sessions')
      .select('status')
      .eq('reference', reference)
      .single();

    if (error || !session) {
      console.warn('Verify: no payment_sessions row for reference', reference);
      return NextResponse.redirect(
        new URL(`/fund-wallet?error=${encodeURIComponent('We could not find that payment. If you were charged, contact support with reference ' + reference)}`, request.url)
      );
    }

    if (session.status === 'success') {
      // Crediting already happened (or is happening) on the webhook
      // path, not here — this route only reports status.
      return NextResponse.redirect(new URL(redirectPath, request.url));
    }

    if (session.status === 'failed') {
      return NextResponse.redirect(
        new URL(`/fund-wallet?error=${encodeURIComponent('Payment failed. Please try again.')}`, request.url)
      );
    }

    // 'pending' or 'checkout_created' — Korapay's webhook hasn't landed
    // yet. Do NOT call Korapay directly to resolve this faster — that
    // is exactly the bypass-the-webhook pattern this rewrite removes.
    // Redirect with an informational (not error) message; a nicer
    // "we're confirming your payment" experience with auto-refresh/
    // polling is future work (Task 33 Part 3's success screen, or a
    // dedicated follow-up), not attempted here to keep this change
    // scoped to removing the redundant crediting path, not building a
    // new UX.
    return NextResponse.redirect(
      new URL(`/fund-wallet?info=${encodeURIComponent('Your payment is being confirmed — this can take a minute. Reference: ' + reference)}`, request.url)
    );
  } catch (error: any) {
    console.error('Payment verification error:', error);
    return NextResponse.redirect(
      new URL(`/fund-wallet?error=${encodeURIComponent('Server error while checking payment status')}`, request.url)
    );
  }
}
