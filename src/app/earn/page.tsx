'use client';

/**
 * /earn — Task 66 Part a, sub-part ii, further split into ii-a/ii-b
 * per this project's own mandatory task-splitting rule (sub-part ii
 * itself covers steps 3+7 of Task 66's "Implementation Tasks" list —
 * the page itself, and wiring it to real campaign data — and hadn't
 * been split at all yet). This is **ii-a: the page shell + balance
 * display**, using sub-part i's two already-built routes
 * (`/api/listener/token`, `/api/listener/balance`). Sub-part ii-b was
 * further split into ii-b-i/ii-b-ii per this project's own mandatory
 * task-splitting rule: **ii-b-i (real campaign data on the task
 * board) is now built, this session** — `ii-b-ii` (the actual
 * `reward=true` deep-link handoff to Velune) is still NOT built; each
 * card below is marked "coming soon" rather than wired to a broken
 * link.
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
import { Loader2, Sparkles, RefreshCw, Play, Music2 } from 'lucide-react';

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

interface ListenerCampaign {
  campaignId: string;
  trackTitle: string;
  artistName: string;
  coverUrl: string | null;
  sourceUrl: string;
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
  // Task 66 sub-part ii-b-i — independent of the balance load above:
  // the task board doesn't need a device token to display (it's
  // public campaign metadata, same trust level as the home banner),
  // so a failure loading balance shouldn't also blank out the task
  // board, and vice versa.
  const [campaigns, setCampaigns] = useState<ListenerCampaign[] | null>(null);
  const [campaignsError, setCampaignsError] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setCampaignsError(null);
    try {
      const res = await fetch('/api/listener/campaigns');
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to load songs');
      }
      setCampaigns(json.campaigns);
    } catch (err: any) {
      setCampaignsError(err?.message || 'Failed to load songs');
      setCampaigns([]);
    }
  }, []);

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
    loadCampaigns();
  }, [loadBalance, loadCampaigns]);

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

        {/* Task board — Task 66 sub-part ii-b-i: real campaign data.
            Each card is deliberately NOT a working link yet — sub-part
            ii-b-ii (the reward=true deep-link handoff to Velune) isn't
            built, so wiring a tap target here would either go nowhere
            or misrepresent this as functional. "Coming soon" is the
            honest state until that part exists. */}
        <div className="glass-card rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-4">
            Songs available to earn from
          </h2>
          {campaigns === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--muted-foreground)]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading songs…
            </div>
          ) : campaignsError ? (
            <div className="text-center py-4">
              <p className="text-sm text-rose-400 mb-3">{campaignsError}</p>
              <button
                onClick={loadCampaigns}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-card text-xs font-medium hover:brightness-110 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try again
              </button>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-8 text-sm text-[var(--subtle-foreground)]">
              Nothing to show yet — check back soon.
            </div>
          ) : (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <div
                  key={c.campaignId}
                  className="flex items-center gap-3 p-3 rounded-xl bg-[var(--foreground)]/5 border border-[var(--foreground)]/5"
                >
                  <div className="w-11 h-11 rounded-lg bg-[var(--foreground)]/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {c.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coverUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="w-5 h-5 text-[var(--subtle-foreground)]" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.trackTitle}</p>
                    <p className="text-xs text-[var(--subtle-foreground)] truncate">{c.artistName}</p>
                  </div>
                  <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-[var(--subtle-foreground)] px-2.5 py-1 rounded-full border border-[var(--foreground)]/10">
                    <Play className="w-3 h-3" /> Coming soon
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
