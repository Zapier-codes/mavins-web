// src/services/currency/currency.service.ts
/**
 * Live USD-based exchange rates, used to:
 *  1. Convert the pricing engine's USD price into the NGN amount that
 *     actually gets charged via Korapay (the wallet is NGN-kobo
 *     denominated end-to-end — see wallet_ledger.amount_cents).
 *  2. Show the artist a friendly "≈ [their local currency]" estimate
 *     next to the USD price, using the currency ipapi.co resolved for
 *     their IP (see ipGeolocation.service.ts).
 *
 * Free, no-key-required endpoint (open.er-api.com), ECB/central-bank
 * sourced, refreshed roughly daily on their end. Cached client-side for
 * an hour so repeated renders/navigations don't re-fetch.
 */

const RATES_ENDPOINT = 'https://open.er-api.com/v6/latest/USD';
const CACHE_KEY = 'mavins_fx_rates_usd';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedRates {
  rates: Record<string, number>;
  fetchedAt: number;
}

let memoryCache: CachedRates | null = null;

// Fallback used only if the live rate fetch fails entirely (offline, API
// down, ad blocker). Approximate, occasionally-updated pegs — good enough
// to avoid a hard failure, never used when a live rate is available.
const FALLBACK_RATES: Record<string, number> = {
  NGN: 1550,
  USD: 1,
  GBP: 0.78,
  EUR: 0.92,
  GHS: 15.2,
  KES: 129,
  ZAR: 18.1,
  CAD: 1.37,
};

async function fetchLiveRates(): Promise<Record<string, number> | null> {
  try {
    const res = await fetch(RATES_ENDPOINT, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.result !== 'success' || !data?.rates) return null;
    return data.rates as Record<string, number>;
  } catch {
    return null;
  }
}

export async function getUsdExchangeRates(): Promise<Record<string, number>> {
  const now = Date.now();

  if (memoryCache && now - memoryCache.fetchedAt < CACHE_TTL_MS) {
    return memoryCache.rates;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(CACHE_KEY);
      if (stored) {
        const parsed: CachedRates = JSON.parse(stored);
        if (now - parsed.fetchedAt < CACHE_TTL_MS) {
          memoryCache = parsed;
          return parsed.rates;
        }
      }
    } catch {
      // ignore storage errors, fall through to network
    }
  }

  const live = await fetchLiveRates();
  const rates = live || FALLBACK_RATES;
  const entry: CachedRates = { rates, fetchedAt: now };
  memoryCache = entry;
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    // ignore storage errors — in-memory cache still applies this session
  }
  return rates;
}

/**
 * Converts a USD-cents amount (the pricing engine's native unit) into the
 * major-unit amount of `targetCurrency` (e.g. 3500 USD-cents, "NGN" ->
 * 54250.00 naira), using the live rate. Falls back to the static peg
 * table if live rates are unavailable.
 */
export async function convertUsdCentsTo(usdCents: number, targetCurrency: string): Promise<number> {
  const rates = await getUsdExchangeRates();
  const rate = rates[targetCurrency] ?? FALLBACK_RATES[targetCurrency];
  if (!rate) return usdCents / 100; // unknown currency — no conversion possible, return USD amount as-is
  return (usdCents / 100) * rate;
}

/**
 * Same conversion, but returns the amount in the target currency's
 * smallest unit (kobo/cents) as an integer — what payment processors
 * like Korapay expect for their `amount` field.
 */
export async function convertUsdCentsToMinorUnits(usdCents: number, targetCurrency: string): Promise<number> {
  const majorUnits = await convertUsdCentsTo(usdCents, targetCurrency);
  return Math.round(majorUnits * 100);
}

const CURRENCY_LOCALE_HINTS: Record<string, string> = {
  NGN: 'en-NG',
  GHS: 'en-GH',
  KES: 'en-KE',
  ZAR: 'en-ZA',
  GBP: 'en-GB',
  EUR: 'de-DE',
  CAD: 'en-CA',
};

export function formatCurrency(amount: number, currencyCode: string): string {
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALE_HINTS[currencyCode] || 'en-US', {
      style: 'currency',
      currency: currencyCode,
      maximumFractionDigits: amount >= 1000 ? 0 : 2,
    }).format(amount);
  } catch {
    // Intl throws on an unrecognized ISO 4217 code — fall back to a plain prefix
    return `${currencyCode} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
}
