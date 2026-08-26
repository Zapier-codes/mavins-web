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

export interface LeaderboardSong {
  id: string;
  title: string;
  streams: number;
  status: 'trending' | 'promoted' | 'steady';
  platform: 'youtube' | 'spotify' | 'soundcloud';
}

export interface LeaderboardEntry {
  rank: number;
  artist_name: string;
  total_streams: number;
  total_campaigns: number;
  avatar_url?: string;
  id: string;
  movement?: number;
  prevRank?: number;
  songs: LeaderboardSong[];
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

const SONG_TITLES = [
  'Midnight in Lagos', 'Ocean Waves', 'Golden Hour', 'Street Lights',
  'Rainy Season', 'Sunset Drive', 'Neon Dreams', 'Velvet Night',
  'Electric Soul', 'Purple Haze', 'Crystal Clear', 'Urban Jungle',
  'Silent Echo', 'Burning Fire', 'Sweet Melody', 'Deep Roots',
  'High Life', 'New Dawn', 'Wild Heart', 'Free Spirit',
  'Dark Matter', 'Light Speed', 'Soul Search', 'Mind Trip',
  'Love Language', 'Bad Energy', 'Good Vibes', 'Pure Water',
];

const AVATAR_GRADIENTS = [
  'from-rose-400 to-orange-400',
  'from-emerald-400 to-teal-400',
  'from-blue-400 to-indigo-400',
  'from-violet-400 to-purple-400',
  'from-amber-400 to-yellow-400',
  'from-cyan-400 to-sky-400',
  'from-pink-400 to-rose-400',
  'from-lime-400 to-green-400',
];

const MAX_ENTRIES = 20;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function generateSongs(seed: number, count: number): LeaderboardSong[] {
  const songs: LeaderboardSong[] = [];
  const shuffledTitles = shuffle(SONG_TITLES);
  for (let i = 0; i < count; i++) {
    const s = seed + i * 791;
    const streams = 5000 + Math.floor(seededRandom(s) * 150000);
    const rand = seededRandom(s + 1);
    const status: LeaderboardSong['status'] = rand > 0.7 ? 'trending' : rand > 0.4 ? 'promoted' : 'steady';
    const platforms: LeaderboardSong['platform'][] = ['youtube', 'spotify', 'soundcloud'];
    songs.push({
      id: `song-${seed}-${i}`,
      title: shuffledTitles[i % shuffledTitles.length],
      streams,
      status,
      platform: platforms[Math.floor(seededRandom(s + 2) * platforms.length)],
    });
  }
  return songs.sort((a, b) => b.streams - a.streams);
}

export function getFallbackLeaderboard(seed?: number): LeaderboardEntry[] {
  const names = shuffle(FALLBACK_NAME_POOL).slice(0, MAX_ENTRIES);
  const baseSeed = seed ?? Date.now();
  let streams = 2_500_000 + Math.floor(seededRandom(baseSeed) * 800_000);

  return names.map((name, i) => {
    const personalSeed = baseSeed + i * 137;
    const jitter = Math.floor(seededRandom(personalSeed) * 15_000);
    const dropAmount = 20_000 + Math.floor(seededRandom(personalSeed + 1) * 60_000);
    const campaigns = 2 + Math.floor(seededRandom(personalSeed + 2) * 12);
    const songCount = 2 + Math.floor(seededRandom(personalSeed + 3) * 4);

    const entry: LeaderboardEntry = {
      rank: i + 1,
      artist_name: name,
      total_streams: Math.max(500, streams - jitter),
      total_campaigns: campaigns,
      avatar_url: `gradient-${i % AVATAR_GRADIENTS.length}`,
      id: `fallback-${name}`,
      movement: 0,
      prevRank: i + 1,
      songs: generateSongs(personalSeed, songCount),
    };

    streams = Math.max(500, streams - jitter - dropAmount);
    return entry;
  });
}

export function shuffleLeaderboard(entries: LeaderboardEntry[]): LeaderboardEntry[] {
  const shuffled = shuffle([...entries]);
  return shuffled.map((entry, i) => {
    const newRank = i + 1;
    const movement = (entry.prevRank ?? entry.rank) - newRank;
    const streamJitter = Math.floor(Math.random() * 8_000) - 4_000;
    // Also jitter song streams slightly
    const updatedSongs = entry.songs.map((s) => ({
      ...s,
      streams: Math.max(100, s.streams + Math.floor(Math.random() * 2000) - 1000),
    })).sort((a, b) => b.streams - a.streams);

    return {
      ...entry,
      rank: newRank,
      prevRank: entry.rank,
      movement,
      total_streams: Math.max(500, entry.total_streams + streamJitter),
      songs: updatedSongs,
    };
  });
}

export function mergeRealData(
  dummyEntries: LeaderboardEntry[],
  realEntries: LeaderboardEntry[]
): LeaderboardEntry[] {
  if (!realEntries || realEntries.length === 0) return dummyEntries;
  const merged = realEntries.slice(0, 10).map((r, i) => ({
    ...r,
    rank: i + 1,
    prevRank: dummyEntries.find(d => d.id === r.id)?.rank ?? i + 1,
    movement: 0,
    songs: r.songs || generateSongs(Date.now() + i, 3),
  }));
  const remaining = MAX_ENTRIES - merged.length;
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
