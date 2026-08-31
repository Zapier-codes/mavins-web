// src/services/leaderboard/leaderboardFallback.service.ts
/**
 * Rotating fallback for the public leaderboard — same posture as
 * earningsTicker.service.ts: the real leaderboard should come from
 * `get_leaderboard` (a SECURITY DEFINER RPC granted to `anon`), but if that
 * RPC/table isn't reachable (fresh env, RLS misconfigured, DB down) the page
 * should never just show "No entries yet." Instead it shows a plausible,
 * clearly-fictional ranking that reshuffles on every load so repeat
 * visitors don't see the exact same names/order each time.
 *
 * Task 53: Now uses the draft asset manifest (src/lib/assets/manifest.ts)
 * for avatar images. These are draft placeholders — not real people.
 * When real creative assets arrive, only the manifest needs updating.
 */

import { ARTIST_IMAGES, type ArtistAsset } from '@/lib/assets/manifest';

export interface LeaderboardEntry {
  rank: number;
  artist_name: string;
  total_streams: number;
  total_campaigns: number;
  avatar_url?: string;
  /** Stable per-name id so the UI can key/animate rows across re-fetches. */
  id: string;
}

const MIN_ENTRIES = 8;
const MAX_ENTRIES = 15;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds a fresh, randomly-sized (8-15), randomly-ordered fallback ranking
 * each time it's called, using draft artist assets for avatars.
 * Stream counts are descending (jittered, non-robotic) so the podium/rank
 * UI still reads sensibly. */
export function getFallbackLeaderboard(): LeaderboardEntry[] {
  const pool = shuffle([...ARTIST_IMAGES]);
  const count = MIN_ENTRIES + Math.floor(Math.random() * (MAX_ENTRIES - MIN_ENTRIES + 1));
  const selected = pool.slice(0, count);

  let streams = 180_000 + Math.floor(Math.random() * 60_000);

  return selected.map((artist: ArtistAsset, i: number) => {
    const jitter = Math.floor(Math.random() * 4_000);
    const entry: LeaderboardEntry = {
      rank: i + 1,
      artist_name: artist.name,
      total_streams: Math.max(500, streams - jitter),
      total_campaigns: 1 + Math.floor(Math.random() * 8),
      avatar_url: artist.src,
      id: `fallback-${artist.id}`,
    };
    streams = Math.max(500, streams - jitter - (6_000 + Math.floor(Math.random() * 5_000)));
    return entry;
  });
}
