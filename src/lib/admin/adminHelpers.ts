// src/lib/admin/adminHelpers.ts
//
// Task 46d (handover.md): extracted from the old single admin/page.tsx
// monolith (745 lines, one component, one activeTab state switching
// between ten sections) as part of splitting it into real routes
// (/admin/countries, /admin/pricing, /admin/fees, etc., each its own
// page). Everything below was previously module-scope constants or
// small helper functions inside that one file's component body —
// moved here verbatim (not rewritten) so every new route page can
// import the exact same types/columns/mappers instead of each
// reimplementing or copy-pasting its own slightly-different version.
//
// Deliberately NOT including refreshAfterWrite() or the individual
// loadX() functions (loadPricingTiers, loadCountries, etc.) — those
// stay page-local. In the old monolith they were one giant component's
// closures over shared state; in the split architecture each page only
// owns its own table's state, so "refresh after write" is now just
// "call this page's own loader again," a one-line, page-specific thing
// not worth abstracting into a shared function with a table-name
// switch statement the way the monolith needed to.

import type { AdminCrudColumn } from '@/components/admin/AdminCrudTable';

export interface AdminStats {
  totalUsers: number;
  totalCampaigns: number;
  activeCampaigns: number;
  totalStreams: number;
  totalRevenueCents: number;
  totalWalletBalanceCents: number;
}

// Task 46a (handover.md) — raw table shape (snake_case, matching
// migration 010 exactly). Kept distinct from PricingTier/DurationSlot
// in pricing.ts, which deliberately drop id/color/sort_order since
// calculatePricing() never needed them. This admin UI needs those
// fields back (id for PATCH/DELETE, sort_order to actually control
// display order).
export interface PricingTierRow {
  id: string;
  min_views: number;
  max_views: number;
  price_per_1k_cents: number;
  label: string;
  description: string;
  color: string | null;
  sort_order: number;
}

export interface DurationSlotRow {
  id: string;
  label: string;
  weeks: number;
  days: number;
  max_daily_drip: number;
  max_views: number;
  description: string;
  badge: string;
  sort_order: number;
}

export const PRICING_TIER_COLUMNS: AdminCrudColumn<PricingTierRow>[] = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'min_views', label: 'Min Views', type: 'number' },
  { key: 'max_views', label: 'Max Views', type: 'number' },
  { key: 'price_per_1k_cents', label: '¢ / 1K', type: 'number' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'description', label: 'Description', type: 'text' },
];

export const DURATION_SLOT_COLUMNS: AdminCrudColumn<DurationSlotRow>[] = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'weeks', label: 'Weeks', type: 'number' },
  { key: 'days', label: 'Days', type: 'number' },
  { key: 'max_daily_drip', label: 'Max Daily Drip', type: 'number' },
  { key: 'max_views', label: 'Max Views', type: 'number' },
  { key: 'badge', label: 'Badge', type: 'text' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'description', label: 'Description', type: 'text' },
];

// Task 46a Part B-i — countries/genres.
export interface CountryRow {
  code: string;
  country: string;
  flag: string;
  sort_order: number;
  korapay_channels: string[] | null;
  korapay_default_channel: string | null;
}

export interface GenreRow {
  id: string;
  label: string;
  sort_order: number;
}

export const COUNTRY_COLUMNS: AdminCrudColumn<CountryRow>[] = [
  { key: 'code', label: 'Code', type: 'text' },
  { key: 'country', label: 'Country', type: 'text' },
  { key: 'flag', label: 'Flag', type: 'text' },
  { key: 'sort_order', label: 'Order', type: 'number' },
  { key: 'korapay_channels', label: 'Korapay Channels', type: 'text-array' },
  { key: 'korapay_default_channel', label: 'Korapay Default', type: 'text' },
];

export const GENRE_COLUMNS: AdminCrudColumn<GenreRow>[] = [
  { key: 'id', label: 'ID', type: 'text' },
  { key: 'label', label: 'Label', type: 'text' },
  { key: 'sort_order', label: 'Order', type: 'number' },
];

export const CASCADE_DELETE_WARNING = 'Delete? This also removes every genre-country affinity row for it.';

export async function callAdminRoute(
  path: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body: Record<string, any>
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const res = await fetch(path, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      return { success: false, error: json?.error || `Request failed (${res.status})` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Request failed' };
  }
}

// Row-to-body mappers: this page's snake_case raw-row field names
// (matching the DB columns directly, so AdminCrudTable's generic
// `keyof T` columns work without a separate display-shape type) to
// the camelCase body keys each admin route's own fromBody() expects —
// see each route's own header comment for its exact field list.
export function tierRowToBody(row: Record<string, any>) {
  return {
    id: row.id,
    minViews: row.min_views,
    maxViews: row.max_views,
    pricePer1KCents: row.price_per_1k_cents,
    label: row.label,
    description: row.description,
    color: row.color,
    sortOrder: row.sort_order,
  };
}

export function slotRowToBody(row: Record<string, any>) {
  return {
    id: row.id,
    label: row.label,
    weeks: row.weeks,
    days: row.days,
    maxDailyDrip: row.max_daily_drip,
    maxViews: row.max_views,
    description: row.description,
    badge: row.badge,
    sortOrder: row.sort_order,
  };
}

export function countryRowToBody(row: Record<string, any>) {
  return {
    code: row.code,
    country: row.country,
    flag: row.flag,
    sortOrder: row.sort_order,
    korapayChannels: row.korapay_channels,
    korapayDefaultChannel: row.korapay_default_channel,
  };
}

export function genreRowToBody(row: Record<string, any>) {
  return {
    id: row.id,
    label: row.label,
    sortOrder: row.sort_order,
  };
}
