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
} from '@/services/leaderboard/leaderboardFallback.service';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import {
  Trophy, TrendingUp, TrendingDown, Crown, Medal, Award,
  Activity, Music, BarChart3, Zap, ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';

// Real leaderboard rows refresh on this cadence so rank/streams stay current
const REFRESH_MS = 30_000;
// Shuffle interval for dummy data — keeps the board alive and moving
const SHUFFLE_MS = 12_000;
// Background DB check interval
const BG_CHECK_MS = 15_000;

interface RankDelta {
  delta: number; // positive = moved up
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
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n.charAt(0))
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isBackgroundChecking, setIsBackgroundChecking] = useState(false);

  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankDeltas, setRankDeltas] = useState<Map<string, RankDelta>>(new Map());
  const shuffleIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const bgCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Load real data from DB (background) ──────────────────────────────
  const loadRealData = useCallback(async (silent = false) => {
    if (!silent) setIsBackgroundChecking(true);

    try {
      const { data, error } = await supabase
        .rpc('get_leaderboard', { p_limit: 50 })
        .catch(() => {
          return supabase
            .from('track_campaigns')
            .select('artist_id, total_streams')
            .eq('is_active', true)
            .order('total_streams', { ascending: false })
            .limit(50);
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
        }));

        // Compute deltas
        const deltas = new Map<string, RankDelta>();
        formatted.forEach((entry) => {
          const prev = prevRanksRef.current.get(entry.id);
          if (prev !== undefined && prev !== entry.rank) {
            const delta = prev - entry.rank;
            deltas.set(entry.id, {
              delta,
              flash: delta > 0 ? 'up' : 'down',
            });
          }
        });
        prevRanksRef.current = new Map(formatted.map((e) => [e.id, e.rank]));
        setRankDeltas(deltas);

        // Seamless merge: if we already have dummy data, merge smoothly
        setEntries((prev) => {
          if (prev.length === 0 || !prev.some(e => e.id.startsWith('fallback-'))) {
            return formatted;
          }
          // Smooth transition: replace fallback entries with real ones where available
          return mergeRealData(prev, formatted);
        });

        setHasRealData(true);
        setLastUpdated(new Date());

        // Stop shuffling once real data arrives
        if (shuffleIntervalRef.current) {
          clearInterval(shuffleIntervalRef.current);
          shuffleIntervalRef.current = null;
        }
      }
    } catch {
      // Silently fail — dummy data is already showing
    } finally {
      if (!silent) setIsBackgroundChecking(false);
    }
  }, []);

  // ── Initialize with dummy data immediately ───────────────────────────
  useEffect(() => {
    // Show dummy data FIRST — never an empty screen
    const dummy = getFallbackLeaderboard();
    setEntries(dummy);
    prevRanksRef.current = new Map(dummy.map((e) => [e.id, e.rank]));
    setIsLoading(false);

    // Start background check for real data
    loadRealData();

    // Shuffle dummy data periodically to create "live" movement
    shuffleIntervalRef.current = setInterval(() => {
      setEntries((prev) => {
        if (hasRealData || prev.length === 0) return prev;
        const shuffled = shuffleLeaderboard(prev);
        // Compute deltas for animation
        const deltas = new Map<string, RankDelta>();
        shuffled.forEach((entry) => {
          const prevRank = prevRanksRef.current.get(entry.id);
          if (prevRank !== undefined && prevRank !== entry.rank) {
            const delta = prevRank - entry.rank;
            deltas.set(entry.id, {
              delta,
              flash: delta > 0 ? 'up' : 'down',
            });
          }
        });
        prevRanksRef.current = new Map(shuffled.map((e) => [e.id, e.rank]));
        setRankDeltas(deltas);
        return shuffled;
      });
    }, SHUFFLE_MS);

    // Background DB polling
    bgCheckIntervalRef.current = setInterval(() => {
      loadRealData(true);
    }, BG_CHECK_MS);

    // Regular refresh once real data is present
    refreshIntervalRef.current = setInterval(() => {
      if (hasRealData) {
        loadRealData(true);
      }
    }, REFRESH_MS);

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
    if (!delta || delta.delta === 0) {
      return <Minus className="w-3 h-3 text-[var(--subtle-foreground)]" />;
    }
    if (delta.delta > 0) {
      return <ArrowUpRight className="w-3 h-3 text-emerald-400" />;
    }
    return <ArrowDownRight className="w-3 h-3 text-rose-400" />;
  };

  const getMovementClass = (entry: LeaderboardEntry) => {
    const delta = rankDeltas.get(entry.id);
    if (!delta) return '';
    if (delta.flash === 'up') return 'rank-flash-up';
    if (delta.flash === 'down') return 'rank-flash-down';
    return '';
  };

  // Top 3 podium stats
  const topThree = entries.slice(0, 3);
  const totalStreams = entries.reduce((sum, e) => sum + e.total_streams, 0);
  const totalArtists = entries.length;
  const avgCampaigns = entries.length > 0
    ? Math.round(entries.reduce((sum, e) => sum + e.total_campaigns, 0) / entries.length)
    : 0;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] scroll-smooth-mobile">
      {/* Ambient background — reduced on mobile */}
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
          <p className="text-[var(--muted-foreground)] text-sm mt-1">
            Top artists by total streams across all campaigns
          </p>
          {lastUpdated && (
            <p className="text-[10px] text-[var(--subtle-foreground)] mt-1 flex items-center justify-center sm:justify-start gap-1">
              <Activity className="w-3 h-3" />
              Last updated: {lastUpdated.toLocaleTimeString()}
              {isBackgroundChecking && <span className="text-[var(--accent)] animate-pulse">· Checking...</span>}
            </p>
          )}
        </div>

        {/* Metrics Cards — Animated counters */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            {
              icon: Trophy,
              label: 'Total Artists',
              value: totalArtists,
              color: 'var(--accent)',
              compact: false,
            },
            {
              icon: BarChart3,
              label: 'Total Streams',
              value: totalStreams,
              color: '#1db954',
              compact: true,
            },
            {
              icon: Music,
              label: 'Avg Campaigns',
              value: avgCampaigns,
              color: '#3d91f4',
              compact: false,
            },
            {
              icon: Zap,
              label: 'Top Streamer',
              value: topThree[0]?.total_streams ?? 0,
              color: '#f59e0b',
              compact: true,
            },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              className="glass-card rounded-xl p-3.5 sm:p-4 flex flex-col gap-2"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${stat.color}1a`, color: stat.color }}
              >
                <stat.icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-lg sm:text-xl font-bold tabular-nums animate-metric-pulse">
                  <AnimatedCounter
                    value={stat.value}
                    formatFn={stat.compact ? formatCompactNumber : undefined}
                    duration={1800}
                  />
                </p>
                <p className="text-[11px] text-[var(--subtle-foreground)] leading-tight mt-0.5">
                  {stat.label}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(['all', 'week', 'month'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all active:scale-95 flex-shrink-0',
                filter === f
                  ? 'bg-[var(--accent)] text-[var(--background)] shadow-lg'
                  : 'chip-card text-[var(--muted-foreground)]'
              )}
            >
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
          <span className="text-xs text-[var(--subtle-foreground)]">
            {hasRealData ? 'Live rankings' : 'Simulated rankings — connecting to live data...'}
          </span>
        </div>

        {/* Leaderboard List */}
        <div className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {entries.map((entry, index) => {
              const delta = rankDeltas.get(entry.id);
              const isMoving = delta && delta.delta !== 0;

              return (
                <motion.div
                  key={entry.id}
                  layout
                  layoutId={entry.id}
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 350, damping: 30 },
                    opacity: { duration: 0.25 },
                    scale: { duration: 0.2 },
                  }}
                  className={cn(
                    'relative rounded-xl border p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4',
                    getRankStyle(entry.rank),
                    getMovementClass(entry),
                    isMoving && 'ring-1 ring-[var(--accent)]/20',
                    'gpu-layer'
                  )}
                  style={{
                    animationDelay: `${index * 30}ms`,
                  }}
                >
                  {/* Rank */}
                  <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                    {getRankIcon(entry.rank)}
                  </div>

                  {/* Avatar */}
                  <div
                    className={cn(
                      'w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 shadow-lg',
                      getAvatarGradient(entry.artist_name)
                    )}
                  >
                    {getInitials(entry.artist_name)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm sm:text-base truncate">
                        {entry.artist_name}
                      </p>
                      {/* Movement indicator */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {getMovementIcon(entry)}
                        {delta && delta.delta !== 0 && (
                          <span className={cn(
                            'text-[10px] font-bold',
                            delta.delta > 0 ? 'text-emerald-400' : 'text-rose-400'
                          )}>
                            {Math.abs(delta.delta)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[var(--subtle-foreground)] flex items-center gap-1">
                        <Music className="w-3 h-3" />
                        {entry.total_campaigns} campaign{entry.total_campaigns !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Streams — animated counter */}
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm sm:text-base font-bold tabular-nums stream-tick">
                      <AnimatedCounter
                        value={entry.total_streams}
                        formatFn={formatCompactNumber}
                        duration={1200}
                      />
                    </p>
                    <p className="text-[10px] text-[var(--subtle-foreground)]">streams</p>
                  </div>

                  {/* Trend sparkline bar */}
                  <div className="hidden sm:flex flex-col items-end gap-1 w-16 flex-shrink-0">
                    <div className="w-full h-1.5 rounded-full bg-white/5 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[var(--accent-light)]"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (entry.total_streams / (entries[0]?.total_streams || 1)) * 100)}%` }}
                        transition={{ duration: 1, delay: index * 0.03, ease: 'easeOut' }}
                      />
                    </div>
                    <span className="text-[9px] text-[var(--subtle-foreground)]">
                      {Math.round((entry.total_streams / (entries[0]?.total_streams || 1)) * 100)}%
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Bottom spacer for mobile nav */}
        <div className="h-8" />
      </div>
    </div>
  );
}
