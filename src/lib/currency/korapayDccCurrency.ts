// src/lib/currency/korapayDccCurrency.ts
/**
 * Maps a geo-detected country code to a currency Korapay's Dynamic
 * Currency Conversion (DCC) can actually convert to at checkout --
 * https://developers.korapay.com/docs/dynamic-currency-conversion.
 *
 * Deliberately restricted to Korapay's own confirmed-supported currency
 * list (see B-Pay-backend's handover.md, Task 7:
 * NGN, GHS, KES, ZAR, USD, XAF, XOF, EGP, TZS). A country not in this
 * map (or one whose local currency Korapay doesn't support) should NOT
 * get a `payment_currency` -- the caller should omit it and let the
 * charge go through in the app's own base currency (USD) with no
 * conversion, rather than guessing at an unsupported code and having
 * Korapay reject the request.
 *
 * NOTE ON PREREQUISITES (cannot be satisfied from this codebase):
 * DCC itself requires the merchant's Korapay account to have Currency
 * Conversion product access (Kora-granted) AND, per currency, the
 * "Allow this merchant to settle payments in another currency" toggle
 * enabled under Settings > Settlements on Korapay's own dashboard. This
 * map being populated does not mean DCC will actually work in
 * production -- that depends on account-level configuration only the
 * project owner can confirm/enable directly with Korapay.
 */
export const KORAPAY_DCC_CURRENCY_BY_COUNTRY: Record<string, string> = {
  NG: 'NGN',
  GH: 'GHS',
  KE: 'KES',
  ZA: 'ZAR',
  EG: 'EGP',
  TZ: 'TZS',
  // XAF (Central Africa CFA franc) — Korapay-supported, shared by
  // several countries; listing the ones most relevant to this project's
  // existing target-country list (see geoAffinity.ts).
  CM: 'XAF',
  // XOF (West Africa CFA franc) — same pattern as XAF above.
  CI: 'XOF',
  SN: 'XOF',
};

/**
 * Returns a Korapay-DCC-eligible currency for the given country code,
 * or null if the country isn't mapped (including US/GB/etc., which
 * should just pay directly in USD with no conversion needed).
 */
export function getKorapayDccCurrency(countryCode: string | null | undefined): string | null {
  if (!countryCode) return null;
  return KORAPAY_DCC_CURRENCY_BY_COUNTRY[countryCode.toUpperCase()] || null;
}
