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
  /**
   * Task 30b — Korapay `channels` values valid for this country, per
   * Task 30a's sourced research (see handover.md). `undefined`/absent
   * is a real, intentional state, not "not loaded yet": it means no
   * confirmed Korapay channel coverage exists for this country, so
   * checkout should not send a `channels`/`default_channel` field at
   * all and let Korapay apply its own default selection. Only 6 of
   * the 25 target countries have a real value here — see
   * referenceData.ts's mapping of migration 012's columns.
   */
  korapayChannels?: string[];
  /** Task 30b — which of `korapayChannels` to pre-select on Korapay's
   * checkout UI. A UX preference, not a Korapay requirement — see
   * migration 012's own header comment for why `card` was chosen for
   * Nigeria specifically. */
  korapayDefaultChannel?: string;
}

// Task 45 Part 4 (stage 2, handover.md) — the hardcoded TARGET_COUNTRIES
// array that used to live here is deleted. These 25 countries now live
// as seed data in supabase_migration_010_static_data_tables.sql's
// `countries` table (server-side reads via referenceDataCache.ts,
// client-side via useReferenceData()). The one non-obvious call site
// this deletion affects: src/lib/currency/countryCurrency.ts's own
// dev-time drift guard used to import TARGET_COUNTRIES directly to
// check its COUNTRY_CURRENCY map stayed in sync — that guard is now a
// function callers pass a countries list into (see
// checkCountryCurrencyDrift() in that file), called once from
// promote/page.tsx once the store's data is available.

// Task 45 Part 4 (stage 2) — the hardcoded GENRE_COUNTRY_AFFINITY
// table that used to live here is deleted; same reasoning and same
// replacement (migration 010's `genre_country_affinity` table,
// reshaped into this exact nested form by fetchReferenceData()) as
// TARGET_COUNTRIES above.

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
