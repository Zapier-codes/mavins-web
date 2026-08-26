'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/lib/supabase/client';
import { formatCompactNumber } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { getFallbackLeaderboard } from '@/services/leaderboard/leaderboardFallback.service';
import { Trophy, TrendingUp, Crown, Medal, Award } from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  artist_name: string;
  total_streams: number;
  total_campaigns: number;
  avatar_url?: string;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [filter, setFilter] = useState<'all' | 'week' | 'month'>('all');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadLeaderboard();
  }, [filter]);

  async function loadLeaderboard() {
    setIsLoading(true);
    // get_leaderboard is a SECURITY DEFINER RPC granted to the `anon` role, so
    // it works for signed-out visitors. The fallback below intentionally does
    // NOT join the `users` table directly — that table's RLS policy only
    // allows reading your own row, so a client-side join would silently
    // return no artist names for anonymous visitors.
    const { data, error } = await supabase
      .rpc('get_leaderboard', { p_limit: 50 })
      .catch(() => {
        // Fallback if the RPC is unavailable for some reason
        return supabase
          .from('track_campaigns')
          .select('artist_id, total_streams')
          .eq('is_active', true)
          .order('total_streams', { ascending: false })
          .limit(50);
      });

    const rows = Array.isArray(data) ? data : [];

    if (!error && rows.length > 0) {
      const formatted = rows.map((d: any, i: number) => ({
        rank: i + 1,
        artist_name: d.artist_name || d.artist?.artist_name || 'Unknown Artist',
        total_streams: d.total_streams || 0,
        total_campaigns: d.total_campaigns || 1,
        avatar_url: d.avatar_url || d.artist?.avatar_url,
      }));
      setEntries(formatted);
    } else {
      // DB unreachable / RLS blocked / genuinely empty on a fresh env — show
      // a rotating, clearly-fictional ranking rather than "No entries yet."
      setEntries(getFallbackLeaderboard());
    }
    setIsLoading(false);
  }

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
        </div>

        {/* Filters */}
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

        {/* Top 3 Podium */}
        {entries.length >= 3 && (
          <div className="flex items-end justify-center gap-3 pt-4">
            {[entries[1], entries[0], entries[2]].map((entry, i) => {
              if (!entry) return null;
              const heights = ['h-28', 'h-36', 'h-24'];
              const positions = ['order-1', 'order-2', 'order-3'];
              const colors = ['from-gray-300/20 to-gray-300/5', 'from-amber-400/20 to-amber-400/5', 'from-amber-600/20 to-amber-600/5'];
              return (
                <div key={entry.rank} className={cn('flex flex-col items-center', positions[i])}>
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center text-sm font-bold shadow-lg shadow-[var(--accent)]/20 mb-2">
                    {entry.artist_name.charAt(0)}
                  </div>
                  <div className={cn(
                    'w-20 rounded-t-2xl bg-gradient-to-t flex items-end justify-center pb-2',
                    heights[i], colors[i]
                  )}>
                    <span className="text-lg font-bold">{entry.rank}</span>
                  </div>
                  <p className="text-xs font-medium mt-1 truncate max-w-[80px]">{entry.artist_name}</p>
                  <p className="text-[10px] text-[var(--subtle-foreground)]">{formatCompactNumber(entry.total_streams)}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* List */}
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
            entries.slice(3).map((entry) => (
              <div 
                key={entry.rank} 
                className={cn(
                  'flex items-center gap-4 p-4 rounded-xl border transition-all',
                  getRankStyle(entry.rank)
                )}
              >
                <div className="w-8 flex justify-center">
                  {getRankIcon(entry.rank)}
                </div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center text-sm font-bold flex-shrink-0 shadow-lg shadow-[var(--accent)]/20">
                  {entry.artist_name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{entry.artist_name}</p>
                  <p className="text-xs text-[var(--subtle-foreground)]">{entry.total_campaigns} campaigns</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-sm">{formatCompactNumber(entry.total_streams)}</p>
                  <p className="text-xs text-[var(--subtle-foreground)]">streams</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
