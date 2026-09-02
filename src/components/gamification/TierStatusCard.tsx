'use client';

// src/components/gamification/TierStatusCard.tsx
//
// Task 48-d Part 5b — the first UI surface anywhere in this repo for
// current tier standing. 5a already makes promotion happen and
// notifies on a real change; this is what lets a user see where they
// stand right now, matching Part 4a/PointsHistoryPanel's own
// "compact, self-contained" bar rather than a bigger dedicated page.
import { Loader2 } from 'lucide-react';
import { useTierStatus } from '@/hooks/gamification/useTierStatus';

export function TierStatusCard({ userId }: { userId: string | undefined }) {
  const { tierDetails, nextTier, currentPoints, isMaxTier, isLoading, error } = useTierStatus(userId);

  if (!userId) return null;

  return (
    <div className="glass-card rounded-2xl p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-base leading-none">{tierDetails?.icon || '🟢'}</span>
        <h3 className="font-bold text-sm">Your Tier</h3>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-6 text-[var(--subtle-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}

      {!isLoading && error && (
        <p className="text-xs text-[var(--subtle-foreground)]">
          Couldn't load your tier status right now.
        </p>
      )}

      {!isLoading && !error && tierDetails && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <div>
              <p className="font-bold text-lg">{tierDetails.icon} {tierDetails.label}</p>
              <p className="text-xs text-[var(--subtle-foreground)]">{tierDetails.name} · {tierDetails.multiplier}x points multiplier</p>
            </div>
            <p className="text-sm font-semibold tabular-nums text-[#1db954]">
              {currentPoints.toLocaleString()} pts
            </p>
          </div>

          {isMaxTier ? (
            <p className="text-xs text-[var(--subtle-foreground)]">
              You've reached the highest tier — {tierDetails.multiplier}x points on everything you earn.
            </p>
          ) : nextTier ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-[var(--subtle-foreground)]">
                <span>
                  {nextTier.pointsNeeded.toLocaleString()} points to {nextTier.icon} {nextTier.label} ({nextTier.multiplier}x)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className="h-full bg-[#1db954] rounded-full transition-[width]"
                  style={{
                    width: `${Math.min(
                      100,
                      Math.max(
                        0,
                        ((tierDetails.maxPoints > tierDetails.minPoints
                          ? currentPoints - tierDetails.minPoints
                          : 0) /
                          Math.max(1, tierDetails.maxPoints - tierDetails.minPoints + 1)) *
                          100
                      )
                    )}%`,
                  }}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
