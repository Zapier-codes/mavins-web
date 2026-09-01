// src/hooks/gamification/useTierStatus.ts
//
// Task 48-d Part 5b (handover.md) — a dedicated tier-status display.
// 5a (AuthProvider.tsx's useTierCheckOnLogin) already makes tier
// promotion actually *happen* on login, fire-and-forget, discarding
// the response — its own notification/migration_cards inserts cover
// "a promotion just happened." This hook is the separate, real piece
// 5a's own note left open: letting a user see their *current*
// standing (tier, points to next tier, multiplier) at a glance
// without waiting for the next promotion.
//
// Deliberately its own fetch, not a shared value read out of
// AuthProvider's internal ref-guarded hook — POST /api/gamification/
// tier/check is idempotent and cheap (5a's own reasoning for why
// firing it more than once is safe), and a fresh call here guarantees
// this hook shows accurate standing at the moment the user is
// actually looking at it, rather than depending on whatever
// AuthProvider happened to fire at login time and threw away.
import { useState, useEffect } from 'react';

export interface TierDetails {
  name: string;
  label: string;
  icon: string;
  multiplier: number;
  minPoints: number;
  maxPoints: number;
}

export interface NextTierInfo {
  name: string;
  label: string;
  icon: string;
  pointsNeeded: number;
  multiplier: number;
}

interface UseTierStatusResult {
  tierDetails: TierDetails | null;
  nextTier: NextTierInfo | null;
  currentPoints: number;
  isMaxTier: boolean;
  isLoading: boolean;
  error: string | null;
}

export function useTierStatus(userId: string | undefined): UseTierStatusResult {
  const [tierDetails, setTierDetails] = useState<TierDetails | null>(null);
  const [nextTier, setNextTier] = useState<NextTierInfo | null>(null);
  const [currentPoints, setCurrentPoints] = useState(0);
  const [isMaxTier, setIsMaxTier] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setTierDetails(null);
      setNextTier(null);
      setCurrentPoints(0);
      setIsMaxTier(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(null);

    fetch('/api/gamification/tier/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (!data.success) {
          setError(data.error || 'Failed to load tier status');
          return;
        }
        setTierDetails(data.tierDetails ?? null);
        setNextTier(data.nextTier ?? null);
        setCurrentPoints(Number(data.currentPoints) || 0);
        setIsMaxTier(!!data.isMaxTier);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || 'Failed to load tier status');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  return { tierDetails, nextTier, currentPoints, isMaxTier, isLoading, error };
}
