// src/lib/gamification/tiers.ts
//
// Single source of truth for the tier ladder — extracted from
// tier/check/route.ts's own previously-local TIERS constant. Same
// "one place, not N duplicated copies that can drift" principle this
// project has already applied to pricing (Task 44/45) and platform
// fees (Task 40) — a second, silently-different copy of tier
// boundaries would be exactly that kind of drift risk, just for
// points instead of money.
//
// Industry-standard reading of what a tier "multiplier" is for
// (confirmed nowhere in this repo's own docs, since nothing applied
// it anywhere before this file — this is a judgment call, not a
// rediscovered spec): loyalty/rewards tiers universally scale points
// or rewards *earned from qualifying activity* by tier (airline miles,
// credit-card rewards, etc. all work this way) — never something
// applied retroactively to a stored balance. Wired into the two real
// points-awarding paths (tasks/claim, streak/update) as of this
// change; see each route's own comment for exactly where.
export const TIERS = [
  { name: 'T4', minPoints: 0, maxPoints: 499, multiplier: 1.0, label: 'Listener', icon: '🟢' },
  { name: 'T3', minPoints: 500, maxPoints: 1999, multiplier: 1.5, label: 'Contributor', icon: '🟡' },
  { name: 'T2', minPoints: 2000, maxPoints: 9999, multiplier: 2.0, label: 'Creator', icon: '🟠' },
  { name: 'T1', minPoints: 10000, maxPoints: 999999, multiplier: 3.0, label: 'Curator', icon: '🔴' },
] as const;

export type Tier = (typeof TIERS)[number];

// Falls back to T4 (multiplier 1.0, i.e. no scaling) only for a
// points value below every band's minPoints (shouldn't happen, T4
// itself starts at 0, but a negative/NaN input must never multiply by
// `undefined`). For points ABOVE every band's maxPoints — genuinely
// reachable, since nothing caps `users.points` and T1's own maxPoints
// (999999) is a soft top-of-table value, not a hard ceiling — this
// must return T1 (the highest tier), not silently fall through to T4.
// Picks the highest-minPoints tier the value still qualifies for,
// rather than requiring an exact min<=x<=max match, specifically so a
// value past the last band's max doesn't miss every band's range
// check and hit the T4 fallback by accident — confirmed this was a
// real bug in an earlier draft of this function via a standalone
// test (999999999 points incorrectly resolved to T4/1.0x instead of
// T1/3.0x) before this fix.
export function getTierForPoints(points: number): Tier {
  const points_ = Number.isFinite(points) ? points : 0;
  let match: Tier = TIERS[0];
  for (const t of TIERS) {
    if (points_ >= t.minPoints) match = t;
  }
  return match;
}
