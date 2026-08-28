/**
 * Client-side wallet balance reader.
 *
 * Reads directly off the already-loaded auth `user` object (populated
 * via `select('*')` on `users` in AuthProvider, so `user.wallet` is
 * always present with zero extra fetch) — never makes a network call
 * itself. This is intentionally the same shape as
 * `campaign.service.ts`'s server-side `getWalletBalanceCents(userId)`,
 * which reads the same `users.wallet` JSONB column, just from the
 * server with a fresh query instead of the client's already-loaded
 * copy.
 *
 * A balance of exactly 0 covers both "no wallet row/JSON at all yet"
 * and "wallet exists but is empty" — for payment-routing purposes
 * these are the same case: a brand-new authenticated user (who has
 * never funded anything) reads as 0 here, same as a guest. See
 * handover.md, Task 28's correction: a 0 balance should route
 * straight to checkout, never through an attempt-then-catch
 * "insufficient funds" cycle — that cycle is for a *returning* user
 * whose balance is merely short, not for someone who provably has
 * nothing yet.
 */
export function getWalletBalanceCents(user: any): number {
  if (!user?.wallet) return 0;
  const wallet = typeof user.wallet === 'string' ? JSON.parse(user.wallet) : user.wallet;
  return wallet?.balance || 0;
}
