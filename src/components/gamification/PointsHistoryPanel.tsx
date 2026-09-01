'use client';

// src/components/gamification/PointsHistoryPanel.tsx
//
// Task 48-d Part 4a — the first UI surface anywhere in this repo for
// points_history. Deliberately minimal/compact (matches Part 1/5a's
// own "self-contained, real value, not over-built" bar) — a fuller
// experience (pagination past the default 20, filtering by type, a
// dedicated page) is explicitly left to Part 4b, not attempted here.
import { Sparkles, Loader2 } from 'lucide-react';
import { usePointsHistory } from '@/hooks/gamification/usePointsHistory';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function PointsHistoryPanel({ userId }: { userId: string | undefined }) {
  const { history, isLoading, error } = usePointsHistory(userId, 20);

  if (!userId) return null;

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="w-4 h-4 text-[#1db954]" />
        <h3 className="font-bold text-sm">Points History</h3>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6 text-[var(--subtle-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      {!isLoading && error && (
        <p className="text-xs text-[var(--subtle-foreground)]">
          Couldn't load your points history right now.
        </p>
      )}

      {!isLoading && !error && history.length === 0 && (
        <p className="text-xs text-[var(--subtle-foreground)]">
          No points earned yet — completing tasks and hitting streak milestones will show up here.
        </p>
      )}

      {!isLoading && !error && history.length > 0 && (
        <ul className="space-y-2.5">
          {history.map((entry, i) => (
            <li key={entry.id || i} className="flex items-center justify-between gap-3 text-sm">
              <div className="min-w-0">
                <p className="truncate">{entry.description || entry.type}</p>
                <p className="text-[10px] text-[var(--subtle-foreground)]">{relativeTime(entry.created_at)}</p>
              </div>
              <span className="flex-shrink-0 text-[#1db954] font-semibold tabular-nums">
                +{Number(entry.amount || 0).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
