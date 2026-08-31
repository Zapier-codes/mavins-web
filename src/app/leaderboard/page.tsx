'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { formatCompactNumber, formatCents } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { getFallbackLeaderboard } from '@/services/leaderboard/leaderboardFallback.service';
import { AnimatedCounter } from '@/components/ui/AnimatedCounter';
import { 
  Trophy, TrendingUp, TrendingDown, Crown, Medal, Award,
  Music, DollarSign, Headphones, ChevronDown, ChevronUp
} from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  artist_name: string;
  total_streams: number;
  total_campaigns: number;
  avatar_url?: string;
  coverart?: string;
  estimated_revenue_cents: number;
  listen_earn_cents: number;
  songs_per_day: number;
  id: string;
}

const REFRESH_MS = 45_000;

function CoverImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className={`bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center text-sm font-bold ${className}`}>
        {alt.charAt(0)}
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`object-cover ${className}`}
      onError={() => setError(true)}
      loading="lazy"
    />
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());
  const [isFallback, setIsFallback] = useState(false);

  const loadLeaderboard = useCallback(async (isBackgroundRefresh = false) => {
    if (!isBackgroundRefresh) setIsLoading(true);
    setIsFallback(false);

    const { data, error } = await supabase.rpc('get_leaderboard', { p_limit: 50 });

    if (error) {
      console.error('Leaderboard RPC error:', error);
      setEntries(getFallbackLeaderboard());
      setIsFallback(true);
      setIsLoading(false);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      setEntries(getFallbackLeaderboard());
      setIsFallback(true);
      setIsLoading(false);
      return;
    }

    const formatted = rows.map((d: any, i: number) => ({
      rank: i + 1,
      artist_name: d.artist_name || 'Unknown Artist',
      total_streams: Number(d.total_streams) || 0,
      total_campaigns: Number(d.total_campaigns) || 0,
      avatar_url: d.avatar_url,
      coverart: d.coverart || d.avatar_url,
      estimated_revenue_cents: Number(d.estimated_revenue_cents) || 0,
      listen_earn_cents: Number(d.listen_earn_cents) || 0,
      songs_per_day: Number(d.songs_per_day) || 5,
      id: d.artist_id || `row-${i}`,
    }));

    const deltas = new Map<string, number>();
    formatted.forEach((entry) => {
      const prev = prevRanksRef.current.get(entry.id);
      if (prev !== undefined && prev !== entry.rank) {
        deltas.set(entry.id, prev - entry.rank);
      }
    });
    prevRanksRef.current = new Map(formatted.map((e) => [e.id, e.rank]));
    setRankDeltas(deltas);

    setEntries(formatted);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    loadLeaderboard();
    const interval = setInterval(() => loadLeaderboard(true), REFRESH_MS);
    return () => clearInterval(interval);
  }, [filter, loadLeaderboard]);

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

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-[500px] h-[500px] bg-[var(--accent)]/5 rounded-full blur-3xl animate-ambient" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-[var(--emerald)]/5 rounded-full blur-3xl animate-ambient-slow" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Leaderboard</h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">Top artists by total streams</p>
          {isFallback && (
            <span className="inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20">
              Sample data
            </span>
          )}
        </div>

        <div className="flex items-center justify-center gap-2">
          {(['all', 'week', 'month'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-4 py-2 rounded-xl text-xs font-medium transition-all',
                filter === f
                  ? 'bg-[var(--accent)] text-[var(--background)]'
                  : 'glass-card text-[var(--muted-foreground)]'
              )}
            >
              {f === 'all' ? 'All Time' : f === 'week' ? 'This Week' : 'This Month'}
            </button>
          ))}
        </div>

        {entries.length >= 3 && (
          <div className="flex items-end justify-center gap-3 pt-4">
            <AnimatePresence>
              {[entries[1], entries[0], entries[2]].map((entry, i) => {
                if (!entry) return null;
                const heights = ['h-28', 'h-36', 'h-24'];
                const positions = ['order-1', 'order-2', 'order-3'];
                const colors = ['from-gray-300/20 to-gray-300/5', 'from-amber-400/20 to-amber-400/5', 'from-amber-600/20 to-amber-600/5'];
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    layoutId={`podium-${entry.id}`}
                    transition={{ type: 'spring', stiffness: 260, damping: 26 }}
                    className={cn('flex flex-col items-center', positions[i])}
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden border-2 border-[var(--accent)]/30 shadow-lg shadow-[var(--accent)]/20 mb-2">
                      <CoverImage src={entry.coverart} alt={entry.artist_name} className="w-full h-full" />
                    </div>
                    <div className={cn(
                      'w-20 rounded-t-2xl bg-gradient-to-t flex items-end justify-center pb-2',
                      heights[i], colors[i]
                    )}>
                      <span className="text-lg font-bold">{entry.rank}</span>
                    </div>
                    <p className="text-xs font-medium mt-1 truncate max-w-[80px]">{entry.artist_name}</p>
                    <p className="text-[10px] text-[var(--subtle-foreground)] tabular-nums">
                      <AnimatedCounter value={entry.total_streams} formatFn={formatCompactNumber} duration={1000} />
                    </p>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        <div className="space-y-2">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-4 h-16 shimmer" />
            ))
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-[var(--subtle-foreground)]">
              <Trophy className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No entries yet</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {entries.slice(3).map((entry) => {
                const delta = rankDeltas.get(entry.id) || 0;
                const isExpanded = expandedId === entry.id;
                return (
                  <motion.div
                    key={entry.id}
                    layout
                    layoutId={`row-${entry.id}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className={cn(
                      'rounded-xl border cursor-pointer',
                      getRankStyle(entry.rank)
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-center gap-4 p-4">
                      <div className="w-8 flex flex-col items-center justify-center">
                        {getRankIcon(entry.rank)}
                        {delta !== 0 && (
                          <span className={cn(
                            'flex items-center text-[9px] font-bold mt-0.5',
                            delta > 0 ? 'text-[#1db954]' : 'text-rose-400'
                          )}>
                            {delta > 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                          </span>
                        )}
                      </div>
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-[var(--border)] flex-shrink-0 shadow-lg shadow-black/10">
                        <CoverImage src={entry.coverart} alt={entry.artist_name} className="w-full h-full" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{entry.artist_name}</p>
                        <p className="text-xs text-[var(--subtle-foreground)]">{entry.total_campaigns} campaigns</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-sm tabular-nums">
                          <AnimatedCounter value={entry.total_streams} formatFn={formatCompactNumber} duration={900} />
                        </p>
                        <p className="text-xs text-[var(--subtle-foreground)]">streams</p>
                      </div>
                      <div className="text-[var(--muted-foreground)]">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 grid grid-cols-2 gap-3 border-t border-[var(--border)]/50">
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--accent)]/5">
                          <Music className="w-4 h-4 text-[var(--accent)]" />
                          <div>
                            <p className="text-[10px] text-[var(--muted-foreground)]">Est. Revenue</p>
                            <p className="text-xs font-bold">{formatCents(entry.estimated_revenue_cents)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--emerald)]/5">
                          <Headphones className="w-4 h-4 text-[var(--emerald)]" />
                          <div>
                            <p className="text-[10px] text-[var(--muted-foreground)]">Listen & Earn</p>
                            <p className="text-xs font-bold">{formatCents(entry.listen_earn_cents)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-400/5">
                          <DollarSign className="w-4 h-4 text-amber-400" />
                          <div>
                            <p className="text-[10px] text-[var(--muted-foreground)]">Songs / Day</p>
                            <p className="text-xs font-bold">{entry.songs_per_day}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-rose-400/5">
                          <TrendingUp className="w-4 h-4 text-rose-400" />
                          <div>
                            <p className="text-[10px] text-[var(--muted-foreground)]">Campaigns</p>
                            <p className="text-xs font-bold">{entry.total_campaigns}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
