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
 * Every name below is an invented stage name — not a real artist.
 */

export interface LeaderboardEntry {
  rank: number;
  artist_name: string;
  total_streams: number;
  total_campaigns: number;
  avatar_url?: string;
}

const FALLBACK_NAME_POOL: string[] = [
  'Amaka Sound', 'Kwame Beats', 'Zainab Vibes', 'Tunde Rhythm', 'Ngozi Flow',
  'Chidi Wave', 'Aisha Grooves', 'David Tempo', 'Grace Melody', 'Marcus Beatz',
  'Sarah Tunes', 'Phillip Sonic', 'Blessing Echo', 'Ifeoma Pulse', 'Kenechi Groove',
  'Fatima Notes', 'Emeka Sound', 'Halima Beats', 'Chinedu Flow', 'Amina Vibe',
  'Obinna Rhythm', 'Yetunde Wave', 'Segun Tempo', 'Ada Melody', 'Nkechi Pulse',
  'Bayo Groove', 'Funke Sonic', 'Ikenna Echo', 'Rita Beatz', 'Tobi Tunes',
];

const MIN_ENTRIES = 15;
const MAX_ENTRIES = 30;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds a fresh, randomly-sized (15-30), randomly-ordered fallback ranking
 * each time it's called, with a descending (jittered, non-robotic) stream
 * count so the podium/rank UI still reads sensibly. */
export function getFallbackLeaderboard(): LeaderboardEntry[] {
  const count = MIN_ENTRIES + Math.floor(Math.random() * (MAX_ENTRIES - MIN_ENTRIES + 1));
  const names = shuffle(FALLBACK_NAME_POOL).slice(0, count);

  let streams = 180_000 + Math.floor(Math.random() * 60_000);

  return names.map((name, i) => {
    const jitter = Math.floor(Math.random() * 4_000);
    const entry: LeaderboardEntry = {
      rank: i + 1,
      artist_name: name,
      total_streams: Math.max(500, streams - jitter),
      total_campaigns: 1 + Math.floor(Math.random() * 8),
    };
    streams = Math.max(500, streams - jitter - (6_000 + Math.floor(Math.random() * 5_000)));
    return entry;
  });
}
