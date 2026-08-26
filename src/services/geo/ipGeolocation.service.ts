// src/services/geo/ipGeolocation.service.ts
/**
 * Best-effort client-side IP geolocation via ipapi.co, used only to guess
 * the artist's own market so we can nudge geo-targeting recommendations
 * (see geoAffinity.ts) toward their likely home audience. This is a
 * convenience default, never a hard requirement — every caller must
 * tolerate `null` (ad blockers, ipapi.co rate limits, offline, privacy
 * extensions, and non-browser/SSR contexts all resolve to null).
 *
 * We never persist raw IP addresses; only the resolved country is kept,
 * and only in-memory + sessionStorage for the current session.
 */

export interface DetectedGeo {
  countryCode: string;
  countryName: string;
  currencyCode: string | null;
}

const SESSION_KEY = 'mavins_detected_geo';
let cached: DetectedGeo | null | undefined; // undefined = not yet attempted

export async function detectUserGeo(): Promise<DetectedGeo | null> {
  if (cached !== undefined) return cached;

  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem(SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Older cached entries (before currencyCode existed) won't have
        // the field — treat those as a miss so we re-fetch once and pick
        // up the currency instead of caching `undefined` forever.
        if (parsed && 'currencyCode' in parsed) {
          cached = parsed;
          return cached ?? null;
        }
      }
    } catch {
      // sessionStorage unavailable (private mode, etc.) — fall through to network
    }
  }

  try {
    const res = await fetch('https://ipapi.co/json/', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`ipapi.co responded ${res.status}`);
    const data = await res.json();

    // ipapi.co returns an `error: true` + `reason` body (still 200) when
    // it can't resolve or the caller is rate-limited — treat as a miss.
    if (data?.error || !data?.country_code) {
      cached = null;
      return null;
    }

    const geo: DetectedGeo = {
      countryCode: data.country_code,
      countryName: data.country_name || data.country_code,
      currencyCode: typeof data.currency === 'string' ? data.currency : null,
    };
    cached = geo;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(geo));
    } catch {
      // ignore storage failures — in-memory cache still applies this session
    }
    return geo;
  } catch {
    cached = null;
    return null;
  }
}
