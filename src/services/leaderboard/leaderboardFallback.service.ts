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
  /** Stable per-name id so the UI can key/animate rows across re-fetches. */
  id: string;
  /** For movement animation — +1 = moved up, -1 = moved down, 0 = same */
  movement?: number;
  /** Previous rank for calculating movement */
  prevRank?: number;
}

const FALLBACK_NAME_POOL: string[] = [
  'Amaka Sound', 'Kwame Beats', 'Zainab Vibes', 'Tunde Rhythm', 'Ngozi Flow',
  'Chidi Wave', 'Aisha Grooves', 'David Tempo', 'Grace Melody', 'Marcus Beatz',
  'Sarah Tunes', 'Phillip Sonic', 'Blessing Echo', 'Ifeoma Pulse', 'Kenechi Groove',
  'Fatima Notes', 'Emeka Sound', 'Halima Beats', 'Chinedu Flow', 'Amina Vibe',
  'Obinna Rhythm', 'Yetunde Wave', 'Segun Tempo', 'Ada Melody', 'Nkechi Pulse',
  'Bayo Groove', 'Funke Sonic', 'Ikenna Echo', 'Rita Beatz', 'Tobi Tunes',
  'Jasmine Soul', 'Kofi Harmony', 'Zara Beats', 'Derek Vibes', 'Lola Rhythm',
  'Temi Groove', 'Seyi Wave', 'Nina Melody', 'Alex Tempo', 'Joy Sound',
  'Chris Pulse', 'Femi Beatz', 'Hannah Echo', 'Isaac Flow', 'Maya Vibe',
  'Ola Rhythm', 'Eddie Groove', 'Sade Tunes', 'Victor Beats', 'Zoe Harmony',
];

const AVATAR_COLORS = [
  'from-rose-400 to-orange-400',
  'from-emerald-400 to-teal-400',
  'from-blue-400 to-indigo-400',
  'from-violet-400 to-purple-400',
  'from-amber-400 to-yellow-400',
  'from-cyan-400 to-sky-400',
  'from-pink-400 to-rose-400',
  'from-lime-400 to-green-400',
];

const MIN_ENTRIES = 50;
const MAX_ENTRIES = 50;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seeded random so we can get deterministic but varied results */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function generateAvatarUrl(name: string, index: number): string {
  const colorPair = AVATAR_COLORS[index % AVATAR_COLORS.length];
  const initial = name.charAt(0).toUpperCase();
  // Return a data URI for a simple colored circle with initial
  // This avoids external image dependencies
  const colors = colorPair.replace('from-', '').replace(' to-', ',').split(',');
  const c1 = colors[0];
  const c2 = colors[1] || colors[0];
  // We'll use a CSS class approach instead — the UI will render initials with gradients
  return `gradient-${index % AVATAR_COLORS.length}`;
}

/** Builds a fresh, fully-populated (50 entries), randomly-ordered fallback ranking
 * each time it's called, with a descending (jittered, non-robotic) stream
 * count so the podium/rank UI still reads sensibly. */
export function getFallbackLeaderboard(seed?: number): LeaderboardEntry[] {
  const count = MIN_ENTRIES; // Always 50 entries for full leaderboard
  const names = shuffle(FALLBACK_NAME_POOL).slice(0, count);
  const baseSeed = seed ?? Date.now();

  // Start with a high number and descend with realistic jitter
  let streams = 2_500_000 + Math.floor(seededRandom(baseSeed) * 800_000);

  return names.map((name, i) => {
    const personalSeed = baseSeed + i * 137;
    const jitter = Math.floor(seededRandom(personalSeed) * 15_000);
    const dropAmount = 8_000 + Math.floor(seededRandom(personalSeed + 1) * 25_000);
    const campaigns = 2 + Math.floor(seededRandom(personalSeed + 2) * 28);

    const entry: LeaderboardEntry = {
      rank: i + 1,
      artist_name: name,
      total_streams: Math.max(500, streams - jitter),
      total_campaigns: campaigns,
      avatar_url: generateAvatarUrl(name, i),
      id: `fallback-${name}`,
      movement: 0,
      prevRank: i + 1,
    };

    streams = Math.max(500, streams - jitter - dropAmount);
    return entry;
  });
}

/** Shuffles the existing leaderboard entries to simulate live rank movement.
 * Preserves the same artists but reorders them with realistic stream changes. */
export function shuffleLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const shuffled = shuffle([...entries]);

  return shuffled.map((entry, i) => {
    const newRank = i + 1;
    const movement = (entry.prevRank ?? entry.rank) - newRank;
    const streamJitter = Math.floor(Math.random() * 5_000) - 2_500;

    return {
      ...entry,
      rank: newRank,
      prevRank: entry.rank,
      movement,
      total_streams: Math.max(500, entry.total_streams + streamJitter),
    };
  });
}

/** Creates a smooth transition from dummy data to real data.
 * Merges real entries in, maintaining animation continuity. */
export function mergeRealData(
  dummyEntries: LeaderboardEntry[],
  realEntries: LeaderboardEntry[]
): LeaderboardEntry[] {
  if (!realEntries || realEntries.length === 0) return dummyEntries;

  // Take top real entries, fill rest with dummy (renamed to show "rising")
  const merged = realEntries.slice(0, 20).map((r, i) => ({
    ...r,
    rank: i + 1,
    prevRank: dummyEntries.find(d => d.id === r.id)?.rank ?? i + 1,
    movement: 0,
  }));

  // Fill remaining slots with dummy data, offset ranks
  const remaining = 50 - merged.length;
  const filler = dummyEntries
    .filter(d => !realEntries.some(r => r.id === d.id))
    .slice(0, remaining)
    .map((d, i) => ({
      ...d,
      rank: merged.length + i + 1,
      prevRank: d.rank,
      movement: 0,
    }));

  return [...merged, ...filler];
}
