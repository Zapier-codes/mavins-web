'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { formatCompactNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import {
  getFallbackLeaderboard,
  shuffleLeaderboard,
  mergeRealData,
  type LeaderboardEntry,
  type LeaderboardSong,
} from '@/services/leaderboard/leaderboardFallback.service';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import {
  Trophy, TrendingUp, TrendingDown, Crown, Medal, Award,
  Activity, Music, BarChart3, Zap, ArrowUpRight, ArrowDownRight, Minus,
  Flame, Megaphone, ChevronDown, ChevronUp, Play, X
} from 'lucide-react';

const REFRESH_MS = 3_600_000; // 1 hour — leaderboard order only updates on this cadence once real data has loaded
const SHUFFLE_MS = 12_000;
const BG_CHECK_MS = 15_000; // fast poll only while waiting for the *first* real data to arrive

interface RankDelta {
  delta: number;
  flash: 'up' | 'down' | 'none';
}

const AVATAR_GRADIENTS = [
  'bg-gradient-to-br from-rose-400 to-orange-400',
  'bg-gradient-to-br from-emerald-400 to-teal-400',
  'bg-gradient-to-br from-blue-400 to-indigo-400',
  'bg-gradient-to-br from-violet-400 to-purple-400',
  'bg-gradient-to-br from-amber-400 to-yellow-400',
  'bg-gradient-to-br from-cyan-400 to-sky-400',
  'bg-gradient-to-br from-pink-400 to-rose-400',
  'bg-gradient-to-br from-lime-400 to-green-400',
];

function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n.charAt(0)).join('').slice(0, 2).toUpperCase();
}

function getSongStatusIcon(status: LeaderboardSong['status']) {
  if (status === 'trending') return <Flame className="w-3.5 h-3.5 text-orange-400" />;
  if (status === 'promoted') return <Megaphone className="w-3.5 h-3.5 text-[#1db954]" />;
  return <Play className="w-3.5 h-3.5 text-[var(--subtle-foreground)]" />;
}

function getSongStatusLabel(status: LeaderboardSong['status']) {
  if (status === 'trending') return '🔥 Trending';
  if (status === 'promoted') return 'Promoted';
  return 'Steady';
}

function getSongStatusClass(status: LeaderboardSong['status']) {
  if (status === 'trending') return 'bg-orange-400/10 text-orange-400 border-orange-400/20';
  if (status === 'promoted') return 'bg-[#1db954]/10 text-[#1db954] border-[#1db954]/20';
  return 'bg-white/5 text-[var(--subtle-foreground)] border-white/10';
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankDeltas, setRankDeltas] = useState<Map<string, RankDelta>>(new Map());
  const shuffleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bgCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const loadRealData = useCallback(async (silent = false) => {
    try {
      const { data, error } = await supabase
        .rpc('get_leaderboard', { p_limit: 20 })
        .catch(() => {
          return supabase
            .from('track_campaigns')
            .select('artist_id, total_streams')
            .eq('is_active', true)
            .order('total_streams', { ascending: false })
            .limit(20);
        });

      const rows = Array.isArray(data) ? data : [];
      if (!error && rows.length > 0) {
        const formatted: LeaderboardEntry[] = rows.map((d: any, i: number) => ({
          rank: i + 1,
          artist_name: d.artist_name || d.artist?.artist_name || 'Unknown Artist',
          total_streams: d.total_streams || 0,
          total_campaigns: d.total_campaigns || 1,
          avatar_url: d.avatar_url || d.artist?.avatar_url,
          id: d.artist_id || d.artist_name || `row-${i}`,
          movement: 0,
          prevRank: prevRanksRef.current.get(d.artist_id || d.artist_name || `row-${i}`) ?? i + 1,
          songs: d.songs || [],
        }));

        const deltas = new Map<string, RankDelta>();
        formatted.forEach((entry) => {
          const prev = prevRanksRef.current.get(entry.id);
          if (prev !== undefined && prev !== entry.rank) {
            const delta = prev - entry.rank;
            deltas.set(entry.id, { delta, flash: delta > 0 ? 'up' : 'down' });
          }
        });
        prevRanksRef.current = new Map(formatted.map((e) => [e.id, e.rank]));
        setRankDeltas(deltas);

        setEntries((prev) => {
          if (prev.length === 0 || !prev.some(e => e.id.startsWith('fallback-'))) return formatted;
          return mergeRealData(prev, formatted);
        });
        setHasRealData(true);
        setLastUpdated(new Date());
        if (shuffleIntervalRef.current) { clearInterval(shuffleIntervalRef.current); shuffleIntervalRef.current = null; }
        // Stop the fast "is real data in yet?" poll once we actually have
        // real data — from here on, only the hourly refreshIntervalRef
        // should trigger a re-fetch, so the visible ranking holds steady.
        if (bgCheckIntervalRef.current) { clearInterval(bgCheckIntervalRef.current); bgCheckIntervalRef.current = null; }
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const dummy = getFallbackLeaderboard();
    setEntries(dummy);
    prevRanksRef.current = new Map(dummy.map((e) => [e.id, e.rank]));
    setIsLoading(false);

    loadRealData();

    shuffleIntervalRef.current = setInterval(() => {
      setEntries((prev) => {
        if (hasRealData || prev.length === 0) return prev;
        const shuffled = shuffleLeaderboard(prev);
        const deltas = new Map<string, RankDelta>();
        shuffled.forEach((entry) => {
          const prevRank = prevRanksRef.current.get(entry.id);
          if (prevRank !== undefined && prevRank !== entry.rank) {
            const delta = prevRank - entry.rank;
            deltas.set(entry.id, { delta, flash: delta > 0 ? 'up' : 'down' });
          }
        });
        prevRanksRef.current = new Map(shuffled.map((e) => [e.id, e.rank]));
        setRankDeltas(deltas);
        return shuffled;
      });
    }, SHUFFLE_MS);

    bgCheckIntervalRef.current = hasRealData
      ? null
      : setInterval(() => loadRealData(true), BG_CHECK_MS);
    refreshIntervalRef.current = setInterval(() => { if (hasRealData) loadRealData(true); }, REFRESH_MS);

    return () => {
      if (shuffleIntervalRef.current) clearInterval(shuffleIntervalRef.current);
      if (bgCheckIntervalRef.current) clearInterval(bgCheckIntervalRef.current);
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
    };
  }, [loadRealData, hasRealData]);

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-amber-400" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />;
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" />;
    return <span className="text-sm font-bold text-[var(--subtle-foreground)] w-5 text-center">{rank}</span>;
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return 'bg-amber-400/10 border-amber-400/20';
    if (rank === 2) return 'bg-gray-300/10 border-gray-300/20';
    if (rank === 3) return 'bg-amber-600/10 border-amber-600/20';
    return 'glass-card';
  };

  const getMovementIcon = (entry: LeaderboardEntry) => {
    const delta = rankDeltas.get(entry.id);
    if (!delta || delta.delta === 0) return <Minus className="w-3 h-3 text-[var(--subtle-foreground)]" />;
    if (delta.delta > 0) return <ArrowUpRight className="w-3 h-3 text-emerald-400" />;
    return <ArrowDownRight className="w-3 h-3 text-rose-400" />;
  };

  const getMovementClass = (entry: LeaderboardEntry) => {
    const delta = rankDeltas.get(entry.id);
    if (!delta) return '';
    if (delta.flash === 'up') return 'rank-flash-up';
    if (delta.flash === 'down') return 'rank-flash-down';
    return '';
  };

  const topThree = entries.slice(0, 3);
  const totalStreams = entries.reduce((sum, e) => sum + e.total_streams, 0);
  const totalArtists = entries.length;
  const avgCampaigns = entries.length > 0 ? Math.round(entries.reduce((sum, e) => sum + e.total_campaigns, 0) / entries.length) : 0;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] scroll-smooth-mobile">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="ambient-blob absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[var(--accent)]/5 rounded-full blur-3xl animate-ambient will-change-transform" />
        <div className="ambient-blob absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-[var(--emerald)]/5 rounded-full blur-3xl animate-ambient-slow will-change-transform" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        {/* Header */}
        <div className="text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start gap-3">
            <Trophy className="w-7 h-7 text-[var(--accent)]" />
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
          </div>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">Top artists by total streams across all campaigns</p>
          {lastUpdated && (
            <p className="text-[10px] text-[var(--subtle-foreground)] mt-1 flex items-center justify-center sm:justify-start gap-1">
              <Activity className="w-3 h-3" /> Last updated: {lastUpdated.toLocaleTimeString()}
            </p>
          )}
        </div>

        {/* Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: Trophy, label: 'Total Artists', value: totalArtists, color: 'var(--accent)', compact: false },
            { icon: BarChart3, label: 'Total Streams', value: totalStreams, color: '#1db954', compact: true },
            { icon: Music, label: 'Avg Campaigns', value: avgCampaigns, color: '#3d91f4', compact: false },
            { icon: Zap, label: 'Top Streamer', value: topThree[0]?.total_streams ?? 0, color: '#f59e0b', compact: true },
          ].map((stat) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="glass-card rounded-xl p-3.5 sm:p-4 flex flex-col gap-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${stat.color}1a`, color: stat.color }}>
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold tabular-nums animate-metric-pulse">
                  <AnimatedCounter value={stat.value} formatFn={stat.compact ? formatCompactNumber : undefined} duration={1800} />
                </p>
                <p className="text-[11px] text-[var(--subtle-foreground)] leading-tight mt-0.5">{stat.label}</p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'week', 'month'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn('px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 flex-shrink-0', filter === f ? 'bg-[var(--accent)] text-[var(--background)] shadow-lg' : 'chip-card text-[var(--muted-foreground)]')}>
              {f === 'all' ? 'All Time' : f === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>

        {/* Live indicator */}
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#1db954] opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#1db954]" />
          </span>
          <span className="text-xs text-[var(--subtle-foreground)]">{hasRealData ? 'Live rankings' : 'Simulated rankings — connecting to live data...'}</span>
        </div>

        {/* Leaderboard — Duolingo-style smooth vertical sliding */}
        <motion.div layout className="space-y-2">
          <AnimatePresence mode="popLayout">
            {entries.map((entry) => {
              const delta = rankDeltas.get(entry.id);
              const isExpanded = expandedId === entry.id;
              const isMoving = delta && delta.delta !== 0;

              return (
                <motion.div
                  key={entry.id}
                  layout
                  layoutId={entry.id}
                  initial={{ opacity: 0, y: 20, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 400, damping: 30, mass: 0.8 },
                    opacity: { duration: 0.25 },
                    scale: { duration: 0.2 },
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  className={cn(
                    'relative rounded-xl border p-3.5 sm:p-4 cursor-pointer select-none',
                    getRankStyle(entry.rank),
                    getMovementClass(entry),
                    isMoving && 'ring-1 ring-[var(--accent)]/20',
                    'gpu-layer'
                  )}
                >
                  {/* Main row */}
                  <div className="flex items-center gap-3 sm:gap-4">
                    {/* Rank */}
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                      {getRankIcon(entry.rank)}
                    </div>

                    {/* Avatar */}
                    <div className={cn('w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-lg', getAvatarGradient(entry.artist_name))}>
                      {getInitials(entry.artist_name)}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm sm:text-base truncate">{entry.artist_name}</p>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {getMovementIcon(entry)}
                          {delta && delta.delta !== 0 && (
                            <span className={cn('text-[10px] font-bold', delta.delta > 0 ? 'text-emerald-400' : 'text-rose-400')}>
                              {Math.abs(delta.delta)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-[var(--subtle-foreground)] flex items-center gap-1">
                          <Music className="w-3 h-3" />{entry.total_campaigns} campaign{entry.total_campaigns !== 1 ? 's' : ''}
                        </span>
                        <span className="text-xs text-[var(--subtle-foreground)] flex items-center gap-1">
                          <Flame className="w-3 h-3 text-orange-400" />{entry.songs.filter(s => s.status === 'trending').length} trending
                        </span>
                      </div>
                    </div>

                    {/* Streams */}
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm sm:text-base font-bold tabular-nums stream-tick">
                        <AnimatedCounter value={entry.total_streams} formatFn={formatCompactNumber} duration={1200} />
                      </p>
                      <p className="text-[10px] text-[var(--subtle-foreground)]">streams</p>
                    </div>

                    {/* Expand chevron */}
                    <div className="flex-shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-[var(--subtle-foreground)]" /> : <ChevronDown className="w-4 h-4 text-[var(--subtle-foreground)]" />}
                    </div>
                  </div>

                  {/* Expanded songs panel */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: 'easeInOut' }}
                        className="overflow-hidden"
                      >
                        <div className="pt-3 mt-3 border-t border-[var(--glass-border)] space-y-2">
                          <p className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">Promoted Songs</p>
                          {entry.songs.map((song) => (
                            <div key={song.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-white/5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', getSongStatusClass(song.status))}>
                                  {getSongStatusIcon(song.status)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{song.title}</p>
                                  <p className="text-[10px] text-[var(--subtle-foreground)] capitalize">{song.platform} · {getSongStatusLabel(song.status)}</p>
                                </div>
                              </div>
                              <span className="text-xs font-bold tabular-nums flex-shrink-0">{formatCompactNumber(song.streams)}</span>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </motion.div>

        <div className="h-8" />
      </div>
    </div>
  );
}
