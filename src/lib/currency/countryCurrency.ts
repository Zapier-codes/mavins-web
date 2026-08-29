// src/lib/currency/countryCurrency.ts
/**
 * Task 29 — the single source of truth this reconciles into existing.
 *
 * Previously `TARGET_COUNTRIES` (src/lib/campaign/geoAffinity.ts, the
 * campaign-targeting pool) and `COUNTRY_CURRENCY` (a local const in
 * src/app/promote/page.tsx, used only for the "here's roughly what
 * that costs in your currency" display hint) were two hand-maintained
 * lists that had drifted apart: TARGET_COUNTRIES grew to 25 entries via
 * Task 23, COUNTRY_CURRENCY stayed at its original 20 and only
 * overlapped on 12 codes. It also carried 9 codes (EU, PK, BD, ID, PH,
 * MY, SG, SA, TR) that were never targeting-relevant at all -- a
 * leftover generic currency list from before this app had a real
 * target-country concept.
 *
 * TARGET_COUNTRIES was the authoritative list (it's what
 * GeoTargetingSection and the genre-affinity engine actually target;
 * as of Task 45 Part 4 stage 2 those 25 countries live in Supabase,
 * migration 010's `countries` table, not that now-deleted module
 * constant). This file exists solely to give every one of those 25
 * countries a currency for display purposes -- it is keyed 1:1 with
 * that countries list and nothing else. checkCountryCurrencyDrift()
 * below makes future drift loud (a console.warn) instead of silent --
 * call it once wherever the countries list is actually available.
 *
 * IMPORTANT — what `rate` is and isn't: a static, hand-entered,
 * approximate NGN → local-currency conversion factor, for display only
 * ("about $32" next to the real NGN price). It WILL go stale. It is
 * NEVER plumbed into an actual charge amount anywhere in this codebase
 * -- the real charge is always in the app's base currency (NGN) unless
 * Korapay's Dynamic Currency Conversion applies, which is a completely
 * separate, narrower list (see korapayDccCurrency.ts below) gated by
 * Korapay's own account-level settlement configuration. If accurate
 * live rates are ever needed for something that touches money, replace
 * this with a real rate service -- don't extend the hardcoded numbers.
 *
 * Cross-checked against Korapay's confirmed-supported currency set
 * (NGN, GHS, KES, ZAR, USD, XAF, XOF, EGP, TZS — see
 * korapayDccCurrency.ts's doc comment) as this task required. The
 * result, flagged rather than papered over: only 8 of these 25
 * countries (NG, GH, KE, ZA, EG, TZ, CI, SN) can actually be charged
 * in their own local currency via Korapay DCC today. The other 17 show
 * an informational local-currency estimate on the pricing card but are
 * still charged in NGN/USD at checkout -- see `isKorapayDccEligible`
 * below, already wired into promote/page.tsx's checkout-display hint
 * (Task 28). This gap is real, not a bug in this file: closing it
 * either means Korapay adding DCC support for more currencies, or this
 * app adding a second payment provider for those markets (Task 30).
 */

import type { TargetCountry } from '@/lib/campaign/geoAffinity';
import { getKorapayDccCurrency } from './korapayDccCurrency';

export interface CountryCurrency {
  code: string;
  symbol: string;
  /** Approximate NGN → this currency factor. Display only — see file doc comment. */
  rate: number;
}

// Keyed 1:1 with TARGET_COUNTRIES. Grouped by shared currency (EUR,
// XOF) where that's genuinely how those currencies work, not by
// coincidence.
export const COUNTRY_CURRENCY: Record<string, CountryCurrency> = {
  // --- Korapay DCC-eligible (see isKorapayDccEligible below) ---
  NG: { code: 'NGN', symbol: '₦', rate: 1 },
  GH: { code: 'GHS', symbol: 'GH₵', rate: 0.0098 },
  KE: { code: 'KES', symbol: 'KSh', rate: 0.084 },
  ZA: { code: 'ZAR', symbol: 'R', rate: 0.012 },
  EG: { code: 'EGP', symbol: 'E£', rate: 0.032 },
  TZ: { code: 'TZS', symbol: 'TSh', rate: 1.69 },
  CI: { code: 'XOF', symbol: 'CFA', rate: 0.39 },
  SN: { code: 'XOF', symbol: 'CFA', rate: 0.39 },

  // --- Display-only estimate; charged in NGN/USD, no live DCC ---
  US: { code: 'USD', symbol: '$', rate: 0.00065 },
  GB: { code: 'GBP', symbol: '£', rate: 0.00051 },
  FR: { code: 'EUR', symbol: '€', rate: 0.00060 },
  DE: { code: 'EUR', symbol: '€', rate: 0.00060 },
  NL: { code: 'EUR', symbol: '€', rate: 0.00060 },
  ES: { code: 'EUR', symbol: '€', rate: 0.00060 },
  IT: { code: 'EUR', symbol: '€', rate: 0.00060 },
  IN: { code: 'INR', symbol: '₹', rate: 0.054 },
  BR: { code: 'BRL', symbol: 'R$', rate: 0.0033 },
  JM: { code: 'JMD', symbol: 'J$', rate: 0.10 },
  CA: { code: 'CAD', symbol: 'C$', rate: 0.00088 },
  AE: { code: 'AED', symbol: 'د.إ', rate: 0.0024 },
  UG: { code: 'UGX', symbol: 'USh', rate: 2.41 },
  MX: { code: 'MXN', symbol: 'Mex$', rate: 0.011 },
  AU: { code: 'AUD', symbol: 'A$', rate: 0.00098 },
  SE: { code: 'SEK', symbol: 'kr', rate: 0.0068 },
  KR: { code: 'KRW', symbol: '₩', rate: 0.90 },
};

/**
 * Whether Korapay can actually charge this country's payer in their
 * own local currency (Dynamic Currency Conversion), as opposed to
 * COUNTRY_CURRENCY above just showing an informational estimate. Thin
 * wrapper so callers don't need to import korapayDccCurrency.ts
 * separately just to answer this one question.
 */
export function isKorapayDccEligible(countryCode: string | null | undefined): boolean {
  return getKorapayDccCurrency(countryCode) !== null;
}

// Dev-time drift guard: this file's COUNTRY_CURRENCY is keyed 1:1
// against the countries list, which used to be the TARGET_COUNTRIES
// module constant this file imported directly. Task 45 Part 4 (stage
// 2) deleted that constant (geoAffinity.ts's countries now live in
// Supabase, migration 010) — there is no longer a synchronous,
// always-available list to check against at module-load time here.
// Converted into a function callers invoke once they actually have a
// countries list (e.g. promote/page.tsx, once useReferenceData()
// resolves) instead of a top-level side effect. Same warning
// behavior as before, just no longer able to run itself
// automatically on import.
export function checkCountryCurrencyDrift(countries: TargetCountry[]): void {
  if (process.env.NODE_ENV === 'production') return;
  const missing = countries.map((c) => c.code).filter((code) => !COUNTRY_CURRENCY[code]);
  if (missing.length > 0) {
    console.warn(
      `[countryCurrency] reference-data countries has ${missing.length} code(s) with no ` +
      `currency entry: ${missing.join(', ')}. Add them to COUNTRY_CURRENCY in ` +
      `src/lib/currency/countryCurrency.ts to keep the two lists reconciled.`
    );
  }
}
