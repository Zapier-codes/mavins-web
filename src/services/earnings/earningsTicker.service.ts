// src/services/earnings/earningsTicker.service.ts
/**
 * Public earnings ticker for the landing-page marquee ("Pharrell just earned
 * $200 from YouTube views"). Same posture as publicStats.service.ts: only
 * ever exposes a first name + platform + amount (never emails, ids, or
 * anything sensitive), queries best-effort against `wallet_ledger` joined to
 * `users` from the seed network, and falls back to a curated snapshot so the
 * marquee never renders empty on a fresh env or when RLS blocks anon reads.
 *
 * Task 53: Fallback names now come from the draft asset manifest
 * (src/lib/assets/manifest.ts) rather than hardcoded fictional names.
 * These are draft placeholders — not real people.
 */

import { createClient } from '@/lib/supabase/client';
import { ARTIST_IMAGES } from '@/lib/assets/manifest';

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

/** Build fallback items from draft artist assets.
 *  Shuffled on every call so repeat visitors see variety. */
function buildFallbackItems(): EarningTickerItem[] {
  const shuffled = [...ARTIST_IMAGES].sort(() => Math.random() - 0.5);
  const platforms: TickerPlatform[] = ['youtube', 'spotify', 'tiktok', 'instagram', 'soundcloud'];
  const amounts = [20000, 8400, 15250, 4300, 32000, 6100, 11800, 9200, 27500, 5600, 14300, 7900];

  return shuffled.slice(0, 12).map((artist, i) => ({
    id: `f-${artist.id}`,
    name: artist.name.split(/\s+/)[0], // first name only
    amountCents: amounts[i % amounts.length],
    platform: platforms[i % platforms.length],
    createdAt: new Date().toISOString(),
  }));
}

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
      return { items: buildFallbackItems(), isLive: false };
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
    return { items: buildFallbackItems(), isLive: false };
  }
}
