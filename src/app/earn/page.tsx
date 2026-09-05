'use client';

/**
 * /earn — Task 66 Part a, sub-part ii, further split into ii-a/ii-b
 * per this project's own mandatory task-splitting rule (sub-part ii
 * itself covers steps 3+7 of Task 66's "Implementation Tasks" list —
 * the page itself, and wiring it to real campaign data — and hadn't
 * been split at all yet). This is **ii-a: the page shell + balance
 * display**, using sub-part i's two already-built routes
 * (`/api/listener/token`, `/api/listener/balance`). **ii-b (step 7 —
 * wiring the task board to real reward-eligible campaigns, and the
 * actual `reward=true` handoff to Velune) is deliberately NOT built
 * here** — the task board below is an honest empty state, not mock
 * data standing in for it.
 *
 * Identity model, exactly as Task 66's own "Core Decision Summary"
 * specifies: fully anonymous, device-ID only, no login, no Supabase
 * Auth. The device ID is generated once with the Web Crypto API
 * (`crypto.randomUUID()` — the same primitive already used elsewhere
 * in this codebase for reference generation, confirmed via grep
 * rather than reaching for a new uuid dependency) and persisted in
 * `localStorage` (not `sessionStorage` — this identity needs to
 * survive across browser sessions/days, the same way a real listener
 * would expect their earned balance to still be there tomorrow).
 *
 * A real, deliberately unresolved discrepancy, flagged rather than
 * silently picked one way: Task 66's own "Core Decision Summary" says
 * the reward model is "Points (like Sweatcoin), not cash" — but the
 * actual schema/API this page calls names the field `earningsCents`
 * (`listener_earnings.earnings_cents`), a cents-denominated shape.
 * This page displays the raw value divided by 100, labeled "points"
 * throughout and never prefixed with a currency symbol — the most
 * honest reading available without guessing which framing eventually
 * wins, not a resolution of that discrepancy itself.
 */

import { useEffect, useState, useCallback } from 'react';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';

const DEVICE_ID_KEY = 'mavins_listener_device_id';

interface BalanceResponse {
  success: boolean;
  currentCycle: {
    earningsCents: number;
    status: string;
    qualifyingPlays: number;
  } | null;
  lifetimeEarningsCents: number;
  error?: string;
}

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

function formatPoints(cents: number): string {
  // Deliberately not formatCents() (src/lib/campaign/pricing.ts) --
  // that formatter prefixes a "$", which would misrepresent this as
  // real currency and contradict Task 66's own "points, not cash"
  // framing. See this file's own header comment for the full
  // reasoning behind not resolving that discrepancy here.
  return (cents / 100).toFixed(2);
}

export default function EarnPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<BalanceResponse | null>(null);

  const loadBalance = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceId = getOrCreateDeviceId();

      const tokenRes = await fetch('/api/listener/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenRes.ok || !tokenJson.success) {
        throw new Error(tokenJson.error || 'Failed to authenticate this device');
      }

      const balanceRes = await fetch(`/api/listener/balance?token=${encodeURIComponent(tokenJson.token)}`);
      const balanceJson: BalanceResponse = await balanceRes.json();
      if (!balanceRes.ok || !balanceJson.success) {
        throw new Error(balanceJson.error || 'Failed to load balance');
      }
      setBalance(balanceJson);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong loading your balance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalance();
  }, [loadBalance]);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] px-4 py-10">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[var(--accent)]/5 rounded-full blur-3xl animate-ambient" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient-slow" />
      </div>

      <div className="relative max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/20 mb-4">
            <Sparkles className="w-7 h-7 text-[var(--background)]" />
          </div>
          <h1 className="text-2xl font-bold">Listen &amp; Earn</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">
            Pick a song below, listen for 60 seconds, earn points.
          </p>
        </div>

        {/* Balance card */}
        <div className="glass-card rounded-2xl p-6 mb-6">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading your balance…
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <p className="text-sm text-rose-400 mb-3">{error}</p>
              <button
                onClick={loadBalance}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-medium hover:brightness-110 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-[var(--subtle-foreground)] mb-1">Lifetime points</p>
                <p className="text-2xl font-bold text-[var(--accent)]">
                  {formatPoints(balance?.lifetimeEarningsCents ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[var(--subtle-foreground)] mb-1">This cycle</p>
                {balance?.currentCycle ? (
                  <>
                    <p className="text-2xl font-bold">
                      {formatPoints(balance.currentCycle.earningsCents)}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                      {balance.currentCycle.qualifyingPlays} qualifying {balance.currentCycle.qualifyingPlays === 1 ? 'play' : 'plays'} · {balance.currentCycle.status}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    No plays recorded yet
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Task board — honest empty state. Wiring this to real
            reward-eligible campaigns (Task 66's own step 7) and the
            reward=true handoff to Velune is sub-part ii-b, not built
            here — see this file's own header comment. */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-4">
            Songs available to earn from
          </h2>
          <div className="text-center py-8 text-sm text-[var(--subtle-foreground)]">
            Nothing to show yet — check back soon.
          </div>
        </div>
      </div>
    </div>
  );
}
