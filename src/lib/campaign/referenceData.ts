// src/lib/campaign/referenceData.ts
//
// Task 45 Part 2 (handover.md) — fetches the five reference tables
// migration 010 created (pricing_tiers, duration_slots, countries,
// genres, genre_country_affinity) and shapes them into
// PricingReferenceData/GeoReferenceData (Part 1's own interfaces,
// pricing.ts/geoAffinity.ts) plus a `genres` list neither of those
// interfaces already covers (promote/page.tsx's own local `GENRES`
// array — id-only strings today — is what Part 4 will eventually
// replace with this).
//
// Deliberately a plain async function, not a hook — Part 2's own
// client store (useReferenceData.ts) wraps this for TanStack Query;
// Part 3's server-side routes will call this same function directly
// (via the admin/service-role client, not the browser one) rather than
// duplicating the fetch+shape logic a second time. One function, two
// callers, matching this whole task's "one engine, multiple data
// sources" framing from Part 1's own header comment in pricing.ts.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PricingReferenceData, PricingTier, DurationSlot } from './pricing';
import type { GeoReferenceData, TargetCountry } from './geoAffinity';

export interface GenreOption {
  id: string;
  label: string;
}

export type AllReferenceData = PricingReferenceData & GeoReferenceData & {
  genres: GenreOption[];
};

// Table/column names match migration 010 exactly — see
// supabase_migration_010_static_data_tables.sql for the schema this
// reads against.
export async function fetchReferenceData(client: SupabaseClient): Promise<AllReferenceData> {
  const [tiersRes, slotsRes, countriesRes, genresRes, affinityRes] = await Promise.all([
    client.from('pricing_tiers').select('id, min_views, max_views, price_per_1k_cents, label, description').order('sort_order'),
    client.from('duration_slots').select('id, label, weeks, days, max_daily_drip, max_views, description, badge').order('sort_order'),
    client.from('countries').select('code, country, flag').order('sort_order'),
    client.from('genres').select('id, label').order('sort_order'),
    client.from('genre_country_affinity').select('genre_id, country_code, score'),
  ]);

  for (const [name, res] of [
    ['pricing_tiers', tiersRes], ['duration_slots', slotsRes], ['countries', countriesRes],
    ['genres', genresRes], ['genre_country_affinity', affinityRes],
  ] as const) {
    if (res.error) {
      throw new Error(`fetchReferenceData: ${name} read failed — ${res.error.message}`);
    }
  }

  const tiers: PricingTier[] = (tiersRes.data ?? []).map((r) => ({
    minViews: r.min_views,
    maxViews: r.max_views,
    pricePer1K: r.price_per_1k_cents,
    label: r.label,
    description: r.description,
  }));

  const durationSlots: DurationSlot[] = (slotsRes.data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    weeks: r.weeks,
    days: r.days,
    maxDailyDrip: r.max_daily_drip,
    maxViews: r.max_views,
    description: r.description,
    badge: r.badge,
  }));

  const countries: TargetCountry[] = (countriesRes.data ?? []).map((r) => ({
    code: r.code,
    country: r.country,
    flag: r.flag,
  }));

  const genres: GenreOption[] = (genresRes.data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
  }));

  // genre_country_affinity comes back as flat rows (genre_id,
  // country_code, score) — GeoReferenceData wants the nested
  // Record<genre, Record<country, score>> shape GENRE_COUNTRY_AFFINITY
  // already uses today, so the scoring functions in geoAffinity.ts
  // don't need to change to accept this.
  const genreCountryAffinity: Record<string, Record<string, number>> = {};
  for (const row of affinityRes.data ?? []) {
    (genreCountryAffinity[row.genre_id] ??= {})[row.country_code] = row.score;
  }

  return { tiers, durationSlots, countries, genres, genreCountryAffinity };
}
