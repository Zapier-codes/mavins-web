// src/hooks/gamification/usePointsHistory.ts
//
// Task 48-d Part 4a (handover.md) — wires GET /api/gamification/
// points/history into the app. Unlike Part 1 (streak/update, a POST
// with real side effects that needed a fire-once-per-user-id ref
// guard) this is a plain read with no idempotency concern of its own
// — refetching on every userId change is safe and simply reflects
// whatever's current, no guard needed.
//
// The underlying `points_history` table is itself untracked — no
// migration file or schema.sql entry defines it anywhere in this repo
// (confirmed via grep before writing this, same check Part 1/2/3 each
// ran for their own tables). The fields referenced below
// (user_id, amount, type, description, created_at) are not guessed —
// they're exactly what src/app/api/gamification/tasks/claim/route.ts
// already inserts into this same table in real, live code, so this
// hook only reads fields something in this repo is actually known to
// write. If the live table has additional columns this repo doesn't
// know about, they're simply ignored here, not a correctness risk.
import { useState, useEffect, useCallback } from 'react';

export interface PointsHistoryEntry {
  id?: string;
  user_id: string;
  amount: number;
  type: string;
  description: string;
  created_at: string;
}

interface UsePointsHistoryResult {
  history: PointsHistoryEntry[];
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function usePointsHistory(userId: string | undefined, limit = 20): UsePointsHistoryResult {
  const [history, setHistory] = useState<PointsHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refetchTick, setRefetchTick] = useState(0);

  const refetch = useCallback(() => setRefetchTick((t) => t + 1), []);

  useEffect(() => {
    if (!userId) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch(`/api/gamification/points/history?userId=${encodeURIComponent(userId)}&limit=${limit}`)
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setError(data.error || 'Failed to load points history');
          setHistory([]);
          return;
        }
        setHistory(Array.isArray(data.history) ? data.history : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load points history');
        setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId, limit, refetchTick]);

  return { history, isLoading, error, refetch };
}
