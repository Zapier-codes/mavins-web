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
];

const COUNTRY_CODES = TARGET_COUNTRIES.map((c) => c.code);

// Score 0-100: how strongly a genre typically resonates in that market.
// Deliberately conservative and roughly-banded (not falsely precise).
export const GENRE_COUNTRY_AFFINITY: Record<string, Record<string, number>> = {
  Afrobeats:    { NG: 98, GH: 88, GB: 72, US: 60, ZA: 55, KE: 50, FR: 40, CA: 42, AE: 38, NL: 35, BR: 25, IN: 15, DE: 30, JM: 45 },
  Amapiano:     { ZA: 97, NG: 70, GH: 45, GB: 50, US: 38, KE: 40, NL: 30, FR: 25, CA: 28, AE: 30, BR: 15, IN: 10, DE: 22, JM: 20 },
  'Hip-Hop':    { US: 95, GB: 70, CA: 68, FR: 55, DE: 45, NG: 60, ZA: 45, JM: 40, AE: 35, NL: 40, BR: 42, IN: 30, GH: 40, KE: 32 },
  'R&B':        { US: 92, GB: 65, CA: 60, NG: 55, GH: 40, ZA: 42, FR: 35, DE: 30, JM: 38, AE: 25, NL: 30, BR: 25, IN: 18, KE: 28 },
  Pop:          { US: 90, GB: 80, DE: 55, FR: 55, CA: 60, NL: 50, BR: 50, IN: 45, AE: 40, NG: 42, ZA: 40, KE: 30, GH: 30, JM: 25 },
  Electronic:   { DE: 92, NL: 85, GB: 65, US: 55, FR: 55, AE: 45, CA: 40, ZA: 35, BR: 40, IN: 25, NG: 22, GH: 15, KE: 15, JM: 15 },
  Reggae:       { JM: 98, GB: 55, US: 45, ZA: 30, NG: 35, GH: 30, KE: 25, DE: 20, FR: 20, NL: 25, CA: 30, AE: 15, IN: 10, BR: 20 },
  Gospel:       { NG: 90, US: 70, KE: 65, GH: 60, ZA: 55, GB: 35, CA: 30, DE: 12, FR: 12, NL: 15, AE: 20, BR: 25, IN: 20, JM: 30 },
  Highlife:     { GH: 95, NG: 75, GB: 30, US: 20, ZA: 15, KE: 15, CA: 18, DE: 10, FR: 10, NL: 12, AE: 10, BR: 8, IN: 5, JM: 15 },
  Jazz:         { US: 80, FR: 70, NL: 60, GB: 55, DE: 55, ZA: 40, NG: 25, GH: 20, CA: 45, AE: 25, BR: 45, IN: 20, KE: 18, JM: 20 },
  Rock:         { US: 78, GB: 78, DE: 65, FR: 50, CA: 60, NL: 45, BR: 50, IN: 30, ZA: 35, NG: 20, GH: 15, KE: 18, AE: 20, JM: 15 },
  'Afro-fusion':{ NG: 92, GB: 65, US: 55, GH: 60, ZA: 48, KE: 42, CA: 35, FR: 30, DE: 25, NL: 28, AE: 30, BR: 20, IN: 15, JM: 30 },
  Drill:        { GB: 85, US: 78, NG: 55, FR: 45, CA: 40, DE: 25, ZA: 25, GH: 30, NL: 25, AE: 15, BR: 15, IN: 10, KE: 15, JM: 20 },
  Dancehall:    { JM: 96, GB: 50, US: 45, NG: 40, GH: 35, ZA: 25, CA: 35, DE: 15, FR: 18, NL: 20, AE: 15, BR: 22, IN: 10, KE: 20 },
};

export interface GeoRecommendation extends TargetCountry {
  score: number;
  isHomeMarket: boolean;
}

/**
 * Rank markets for a given genre. If the artist's own detected country is
 * known, it gets a small relevance bump (home-market audiences convert
 * fastest) — capped so it can't override a genuinely poor genre fit.
 */
export function getRecommendedGeographies(
  genre: string | null,
  homeCountryCode?: string | null
): GeoRecommendation[] {
  const table = (genre && GENRE_COUNTRY_AFFINITY[genre]) || null;

  return COUNTRY_CODES.map((code) => {
    const meta = TARGET_COUNTRIES.find((c) => c.code === code)!;
    const base = table ? table[code] ?? 20 : 40; // no genre picked yet → flat-ish baseline
    const isHomeMarket = !!homeCountryCode && homeCountryCode === code;
    const score = Math.min(100, base + (isHomeMarket ? 8 : 0));
    return { ...meta, score, isHomeMarket };
  }).sort((a, b) => b.score - a.score);
}

export function scoreLabel(score: number): { label: string; tone: 'strong' | 'good' | 'moderate' | 'light' } {
  if (score >= 75) return { label: 'Strong fit', tone: 'strong' };
  if (score >= 50) return { label: 'Good fit', tone: 'good' };
  if (score >= 30) return { label: 'Moderate fit', tone: 'moderate' };
  return { label: 'Light fit', tone: 'light' };
}
