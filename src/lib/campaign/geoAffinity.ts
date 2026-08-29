// src/lib/campaign/geoAffinity.ts
/**
 * Genre → geography affinity engine.
 *
 * IMPORTANT — what this actually is: a curated, hand-tuned heuristic table
 * of "which markets historically respond to which genres," not a real-time
 * content-analysis or audio-fingerprinting system. We cannot listen to or
 * "understand" a pasted YouTube link — there's no audio/video analysis
 * pipeline here. What we *can* do responsibly is:
 *   1. Use the genre the artist explicitly selects (they know their own
 *      song better than any heuristic could guess from a URL).
 *   2. Score that genre against a market-affinity table built from general,
 *      well-known listening patterns (e.g. Afrobeats over-indexes in
 *      Nigeria/Ghana/UK; Amapiano in South Africa; Reggae/Dancehall in
 *      Jamaica; Gospel in Nigeria/Kenya/US; Jazz in the US/France/
 *      Netherlands, etc).
 *   3. Nudge the ranking slightly toward the artist's own detected market
 *      (an artist's home market is very often a strong starting audience).
 *
 * This is presented to the user as a *recommendation*, not a guarantee —
 * keep any UI copy honest about that.
 */

export interface TargetCountry {
  code: string;
  country: string;
  flag: string;
}

export const TARGET_COUNTRIES: TargetCountry[] = [
  { code: 'NG', country: 'Nigeria', flag: '🇳🇬' },
  { code: 'GH', country: 'Ghana', flag: '🇬🇭' },
  { code: 'ZA', country: 'South Africa', flag: '🇿🇦' },
  { code: 'KE', country: 'Kenya', flag: '🇰🇪' },
  { code: 'US', country: 'United States', flag: '🇺🇸' },
  { code: 'GB', country: 'United Kingdom', flag: '🇬🇧' },
  { code: 'FR', country: 'France', flag: '🇫🇷' },
  { code: 'DE', country: 'Germany', flag: '🇩🇪' },
  { code: 'IN', country: 'India', flag: '🇮🇳' },
  { code: 'BR', country: 'Brazil', flag: '🇧🇷' },
  { code: 'JM', country: 'Jamaica', flag: '🇯🇲' },
  { code: 'CA', country: 'Canada', flag: '🇨🇦' },
  { code: 'AE', country: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'NL', country: 'Netherlands', flag: '🇳🇱' },
  // --- Added to grow the pool from 14 to 25 (Task 23 prerequisite) ---
  // West/East African Afrobeats-adjacent markets:
  { code: 'CI', country: "Côte d'Ivoire", flag: '🇨🇮' },
  { code: 'SN', country: 'Senegal', flag: '🇸🇳' },
  { code: 'TZ', country: 'Tanzania', flag: '🇹🇿' },
  { code: 'UG', country: 'Uganda', flag: '🇺🇬' },
  { code: 'EG', country: 'Egypt', flag: '🇪🇬' },
  // Top global/IFPI-tracked streaming markets not yet covered:
  { code: 'MX', country: 'Mexico', flag: '🇲🇽' },
  { code: 'ES', country: 'Spain', flag: '🇪🇸' },
  { code: 'IT', country: 'Italy', flag: '🇮🇹' },
  { code: 'AU', country: 'Australia', flag: '🇦🇺' },
  { code: 'SE', country: 'Sweden', flag: '🇸🇪' },
  { code: 'KR', country: 'South Korea', flag: '🇰🇷' },
];

// Score 0-100: how strongly a genre typically resonates in that market.
// Deliberately conservative and roughly-banded (not falsely precise).
export const GENRE_COUNTRY_AFFINITY: Record<string, Record<string, number>> = {
  Afrobeats:    { NG: 98, GH: 88, GB: 72, US: 60, ZA: 55, KE: 50, FR: 40, CA: 42, AE: 38, NL: 35, BR: 25, IN: 15, DE: 30, JM: 45, CI: 55, SN: 50, TZ: 35, UG: 38, EG: 20, MX: 20, ES: 22, IT: 20, AU: 30, SE: 18, KR: 12 },
  Amapiano:     { ZA: 97, NG: 70, GH: 45, GB: 50, US: 38, KE: 40, NL: 30, FR: 25, CA: 28, AE: 30, BR: 15, IN: 10, DE: 22, JM: 20, CI: 30, SN: 25, TZ: 45, UG: 40, EG: 15, MX: 12, ES: 15, IT: 12, AU: 22, SE: 15, KR: 8 },
  'Hip-Hop':    { US: 95, GB: 70, CA: 68, FR: 55, DE: 45, NG: 60, ZA: 45, JM: 40, AE: 35, NL: 40, BR: 42, IN: 30, GH: 40, KE: 32, CI: 35, SN: 30, TZ: 30, UG: 28, EG: 25, MX: 45, ES: 40, IT: 42, AU: 55, SE: 40, KR: 50 },
  'R&B':        { US: 92, GB: 65, CA: 60, NG: 55, GH: 40, ZA: 42, FR: 35, DE: 30, JM: 38, AE: 25, NL: 30, BR: 25, IN: 18, KE: 28, CI: 25, SN: 22, TZ: 22, UG: 20, EG: 20, MX: 30, ES: 28, IT: 25, AU: 45, SE: 35, KR: 40 },
  Pop:          { US: 90, GB: 80, DE: 55, FR: 55, CA: 60, NL: 50, BR: 50, IN: 45, AE: 40, NG: 42, ZA: 40, KE: 30, GH: 30, JM: 25, CI: 30, SN: 28, TZ: 25, UG: 22, EG: 35, MX: 55, ES: 60, IT: 58, AU: 65, SE: 62, KR: 55 },
  Electronic:   { DE: 92, NL: 85, GB: 65, US: 55, FR: 55, AE: 45, CA: 40, ZA: 35, BR: 40, IN: 25, NG: 22, GH: 15, KE: 15, JM: 15, CI: 18, SN: 15, TZ: 12, UG: 12, EG: 25, MX: 35, ES: 50, IT: 45, AU: 42, SE: 70, KR: 35 },
  Reggae:       { JM: 98, GB: 55, US: 45, ZA: 30, NG: 35, GH: 30, KE: 25, DE: 20, FR: 20, NL: 25, CA: 30, AE: 15, IN: 10, BR: 20, CI: 20, SN: 18, TZ: 15, UG: 12, EG: 10, MX: 25, ES: 22, IT: 20, AU: 25, SE: 15, KR: 8 },
  Gospel:       { NG: 90, US: 70, KE: 65, GH: 60, ZA: 55, GB: 35, CA: 30, DE: 12, FR: 12, NL: 15, AE: 20, BR: 25, IN: 20, JM: 30, CI: 30, SN: 20, TZ: 40, UG: 45, EG: 15, MX: 20, ES: 10, IT: 10, AU: 20, SE: 10, KR: 15 },
  Highlife:     { GH: 95, NG: 75, GB: 30, US: 20, ZA: 15, KE: 15, CA: 18, DE: 10, FR: 10, NL: 12, AE: 10, BR: 8, IN: 5, JM: 15, CI: 25, SN: 15, TZ: 10, UG: 10, EG: 5, MX: 5, ES: 5, IT: 5, AU: 8, SE: 5, KR: 3 },
  Jazz:         { US: 80, FR: 70, NL: 60, GB: 55, DE: 55, ZA: 40, NG: 25, GH: 20, CA: 45, AE: 25, BR: 45, IN: 20, KE: 18, JM: 20, CI: 20, SN: 25, TZ: 15, UG: 12, EG: 20, MX: 25, ES: 30, IT: 35, AU: 35, SE: 30, KR: 20 },
  Rock:         { US: 78, GB: 78, DE: 65, FR: 50, CA: 60, NL: 45, BR: 50, IN: 30, ZA: 35, NG: 20, GH: 15, KE: 18, AE: 20, JM: 15, CI: 12, SN: 10, TZ: 10, UG: 10, EG: 15, MX: 40, ES: 35, IT: 40, AU: 55, SE: 45, KR: 30 },
  'Afro-fusion':{ NG: 92, GB: 65, US: 55, GH: 60, ZA: 48, KE: 42, CA: 35, FR: 30, DE: 25, NL: 28, AE: 30, BR: 20, IN: 15, JM: 30, CI: 40, SN: 35, TZ: 30, UG: 32, EG: 18, MX: 20, ES: 22, IT: 20, AU: 28, SE: 18, KR: 12 },
  Drill:        { GB: 85, US: 78, NG: 55, FR: 45, CA: 40, DE: 25, ZA: 25, GH: 30, NL: 25, AE: 15, BR: 15, IN: 10, KE: 15, JM: 20, CI: 15, SN: 12, TZ: 10, UG: 10, EG: 10, MX: 20, ES: 25, IT: 22, AU: 30, SE: 25, KR: 20 },
  Dancehall:    { JM: 96, GB: 50, US: 45, NG: 40, GH: 35, ZA: 25, CA: 35, DE: 15, FR: 18, NL: 20, AE: 15, BR: 22, IN: 10, KE: 20, CI: 18, SN: 15, TZ: 12, UG: 10, EG: 8, MX: 22, ES: 20, IT: 18, AU: 25, SE: 15, KR: 10 },
};

// Task 45 Part 1 -- mirrors migration 010's `countries`/`genres`/
// `genre_country_affinity` table shapes, same reasoning as
// PricingReferenceData in pricing.ts (see that file for the fuller
// comment).
export interface GeoReferenceData {
  countries: TargetCountry[];
  genreCountryAffinity: Record<string, Record<string, number>>;
}

export interface GeoRecommendation extends TargetCountry {
  score: number;
  isHomeMarket: boolean;
}

/**
 * Rank markets for a given genre. If the artist's own detected country is
 * known, it gets a small relevance bump (home-market audiences convert
 * fastest) — capped so it can't override a genuinely poor genre fit.
 *
 * Task 45 Part 1 -- takes `referenceData` instead of reading
 * TARGET_COUNTRIES/GENRE_COUNTRY_AFFINITY as module globals (same
 * reasoning as calculatePricing() in pricing.ts). Audited fresh, per
 * that task's own instruction not to assume this function needs the
 * same multi-step pipeline treatment without checking: it doesn't.
 * Unlike calculatePricing()'s five genuinely separable concerns (tier
 * lookup, subtotal, fee, duration, savings), this function has exactly
 * ONE arithmetic concern -- a base-score lookup plus a single
 * conditional home-market bump, both part of the same "what's this
 * market's score" question, not two composable rules. No
 * PricingStep-style pipeline was built here; if a genuinely separate
 * geo-scoring rule ever needs to compose with this one (e.g. a
 * "trending in this market right now" signal, layered on top of the
 * static affinity table), that would be the point to revisit this
 * decision, not before.
 */
export function getRecommendedGeographies(
  genre: string | null,
  homeCountryCode: string | null | undefined,
  referenceData: GeoReferenceData
): GeoRecommendation[] {
  const table = (genre && referenceData.genreCountryAffinity[genre]) || null;

  return referenceData.countries.map((meta) => {
    const base = table ? table[meta.code] ?? 20 : 40; // no genre picked yet → flat-ish baseline
    const isHomeMarket = !!homeCountryCode && homeCountryCode === meta.code;
    const score = Math.min(100, base + (isHomeMarket ? 8 : 0));
    return { ...meta, score, isHomeMarket };
  }).sort((a, b) => b.score - a.score);
}

/**
 * Returns a random, genre-weighted subset of `poolSize` countries out of
 * the full pool, weighted so higher-affinity markets are more likely to
 * appear — but never a fixed/deterministic set. Weighted sampling without
 * replacement (roulette-wheel selection): repeatedly pick a country at
 * random, weighted by its affinity score, remove it from the remaining
 * candidates, and repeat until `poolSize` distinct countries are chosen.
 * Intended to be re-called (via a `useMemo` keyed on genre) whenever the
 * artist changes genre, so they never see the exact same set twice.
 *
 * Task 45 Part 1 -- `referenceData` threaded through to
 * getRecommendedGeographies() below; placed after `homeCountryCode` and
 * before `poolSize` so `poolSize`'s default stays usable by callers
 * that don't want to override it.
 */
export function getGeoTargetingPool(
  genre: string | null,
  homeCountryCode: string | null | undefined,
  referenceData: GeoReferenceData,
  poolSize: number = 8
): GeoRecommendation[] {
  const ranked = getRecommendedGeographies(genre, homeCountryCode, referenceData);
  if (ranked.length <= poolSize) return ranked;

  const candidates = [...ranked];
  const chosen: GeoRecommendation[] = [];

  while (chosen.length < poolSize && candidates.length > 0) {
    const weights = candidates.map((r) => r.score + 1); // +1 so a 0 score can still be picked
    const total = weights.reduce((sum, w) => sum + w, 0);
    let roll = Math.random() * total;
    let idx = 0;
    for (; idx < weights.length - 1; idx++) {
      roll -= weights[idx];
      if (roll <= 0) break;
    }
    const [picked] = candidates.splice(idx, 1);
    chosen.push(picked);
  }

  return chosen.sort((a, b) => b.score - a.score);
}

/**
 * Task 45 Part 1 -- unchanged. Takes no reference data (a pure
 * numeric->label mapping), nothing to parameterize.
 */
export function scoreLabel(score: number): { label: string; tone: 'strong' | 'good' | 'moderate' | 'light' } {
  if (score >= 75) return { label: 'Strong fit', tone: 'strong' };
  if (score >= 50) return { label: 'Good fit', tone: 'good' };
  if (score >= 30) return { label: 'Moderate fit', tone: 'moderate' };
  return { label: 'Light fit', tone: 'light' };
}
