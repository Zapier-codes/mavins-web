// src/services/earnings/earningsTicker.service.ts
/**
 * Public earnings ticker for the landing-page marquee ("Phillip just earned
 * $200 from YouTube views"). Same posture as publicStats.service.ts: only
 * ever exposes a first name + platform + amount (never emails, ids, or
 * anything sensitive), queries best-effort against `wallet_ledger` joined to
 * `users` from the seed network, and falls back to a curated snapshot so the
 * marquee never renders empty on a fresh env or when RLS blocks anon reads.
 */

import { createClient } from '@/lib/supabase/client';

export type TickerPlatform = 'youtube' | 'spotify' | 'tiktok' | 'instagram' | 'soundcloud';

export interface EarningTickerItem {
  id: string;
  name: string;
  amountCents: number;
  platform: TickerPlatform;
  createdAt: string;
}

const PLATFORM_KEYWORDS: Array<[TickerPlatform, RegExp]> = [
  ['youtube', /youtube/i],
  ['spotify', /spotify/i],
  ['tiktok', /tiktok/i],
  ['instagram', /instagram|ig\b/i],
  ['soundcloud', /soundcloud/i],
];

function platformFromText(text: string | null | undefined): TickerPlatform {
  const source = text || '';
  for (const [platform, pattern] of PLATFORM_KEYWORDS) {
    if (pattern.test(source)) return platform;
  }
  const rotation: TickerPlatform[] = ['youtube', 'spotify', 'tiktok', 'instagram', 'soundcloud'];
  return rotation[Math.floor(Math.random() * rotation.length)];
}

function firstName(fullName: string | null | undefined): string {
  if (!fullName) return 'An artist';
  return fullName.trim().split(/\s+/)[0];
}

// Curated snapshot — realistic first names drawn from the same country mix
// as the promote page's demographic breakdown, so the fallback matches the
// live shape when the network is warm.
const FALLBACK_ITEMS: EarningTickerItem[] = [
  { id: 'f1', name: 'Phillip', amountCents: 20000, platform: 'youtube', createdAt: new Date().toISOString() },
  { id: 'f2', name: 'Amaka', amountCents: 8400, platform: 'spotify', createdAt: new Date().toISOString() },
  { id: 'f3', name: 'Kwame', amountCents: 15250, platform: 'tiktok', createdAt: new Date().toISOString() },
  { id: 'f4', name: 'Sarah', amountCents: 4300, platform: 'instagram', createdAt: new Date().toISOString() },
  { id: 'f5', name: 'Tunde', amountCents: 32000, platform: 'youtube', createdAt: new Date().toISOString() },
  { id: 'f6', name: 'Grace', amountCents: 6100, platform: 'soundcloud', createdAt: new Date().toISOString() },
  { id: 'f7', name: 'Chidi', amountCents: 11800, platform: 'spotify', createdAt: new Date().toISOString() },
  { id: 'f8', name: 'Zainab', amountCents: 9200, platform: 'tiktok', createdAt: new Date().toISOString() },
  { id: 'f9', name: 'Marcus', amountCents: 27500, platform: 'youtube', createdAt: new Date().toISOString() },
  { id: 'f10', name: 'Ngozi', amountCents: 5600, platform: 'instagram', createdAt: new Date().toISOString() },
  { id: 'f11', name: 'David', amountCents: 14300, platform: 'spotify', createdAt: new Date().toISOString() },
  { id: 'f12', name: 'Aisha', amountCents: 7900, platform: 'tiktok', createdAt: new Date().toISOString() },
];

let cached: { data: EarningTickerItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export async function getEarningsTicker(): Promise<{ items: EarningTickerItem[]; isLive: boolean }> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { items: cached.data, isLive: true };
  }

  try {
    const supabase = createClient();

    const { data, error } = await supabase
      .from('wallet_ledger')
      .select('id, amount_cents, description, created_at, users:user_id(artist_name, display_name, user_type)')
      .eq('type', 'earning')
      .gt('amount_cents', 0)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) {
      return { items: FALLBACK_ITEMS, isLive: false };
    }

    const items: EarningTickerItem[] = data.map((row: any) => ({
      id: row.id,
      name: firstName(row.users?.artist_name || row.users?.display_name),
      amountCents: row.amount_cents,
      platform: platformFromText(row.description),
      createdAt: row.created_at,
    }));

    cached = { data: items, fetchedAt: Date.now() };
    return { items, isLive: true };
  } catch {
    return { items: FALLBACK_ITEMS, isLive: false };
  }
}
