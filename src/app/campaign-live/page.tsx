'use client';

/**
 * Task 51 (handover.md) — dedicated "Your Campaign Is Live" page.
 *
 * Replaces promote/page.tsx's old inline `showSuccess` banner (a
 * CampaignSuccessVisualization rendered in place for 4s, then gone —
 * no shareable URL, nothing left after a refresh) for the
 * authenticated create-campaign flow. Reachable at
 * `/campaign-live?id={campaign_id}`; reads that id and fetches the
 * real row via the existing getCampaignById() rather than accepting
 * anything about the campaign from the URL itself.
 *
 * Deliberately does NOT replace the guest direct-pay success banner
 * (`showGuestCampaignSuccess` in promote/page.tsx) — that flow's own
 * comments already flag why a real campaign id isn't reliably
 * available at the point a guest lands back from checkout (the
 * campaign is created asynchronously by the Korapay webhook, which
 * may not have run yet by the time the verify-redirect happens; see
 * Task 36 Part 4's note). Wiring guests into this page too needs that
 * race resolved first — a distinct piece of work, not attempted here
 * to avoid a half-fix that shows this page with no data most of the
 * time. Not signed in and no `id` in the URL both fall through to the
 * same "can't find that campaign" state below rather than a crash.
 */

import { useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  CheckCircle2, Rocket, TrendingUp, Share2, Sparkles,
  Check, UserPlus, ArrowRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/auth/useAuth';
import { useReferenceData } from '@/hooks/campaign/useReferenceData';
import { getCampaignById } from '@/services/campaign/campaign.service';
import { formatCents, formatNumber, getDurationLabel } from '@/lib/campaign/pricing';
import { CampaignSuccessVisualization, type SuccessCountry } from '@/components/campaign/CampaignSuccessVisualization';
import { cn } from '@/lib/utils/cn';

const STAGES: { id: string; label: string }[] = [
  { id: 'planting', label: 'Planting' },
  { id: 'germination', label: 'Germination' },
  { id: 'root_system', label: 'Root System' },
  { id: 'branching', label: 'Branching' },
  { id: 'full_bloom', label: 'Full Bloom' },
  { id: 'completed', label: 'Completed' },
];

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

// Lightweight CSS-only confetti burst — no new dependency for
// something shown once per campaign launch. Reuses the app's
// existing --accent palette plus a couple of warm accents rather than
// introducing a bespoke "celebration" palette. Respects
// prefers-reduced-motion by not rendering at all (a static page is a
// completely reasonable fallback here — this is decoration, not
// information).
const CONFETTI_COLORS = ['#1db954', '#3d91f4', '#f59e0b', '#f43f5e', '#a855f7'];

function ConfettiBurst() {
  const reducedMotion = usePrefersReducedMotion();
  const pieces = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        duration: 1.6 + Math.random() * 0.8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
      })),
    []
  );

  if (reducedMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-10 overflow-hidden" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 w-2 h-3 rounded-sm opacity-0 animate-confetti-fall"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
      <style jsx>{`
        @keyframes confetti-fall {
          0% { opacity: 0; transform: translateY(-10vh) rotate(0deg); }
          10% { opacity: 1; }
          100% { opacity: 0; transform: translateY(110vh) rotate(360deg); }
        }
        .animate-confetti-fall { animation-name: confetti-fall; animation-timing-function: ease-in; animation-fill-mode: forwards; }
      `}</style>
    </div>
  );
}

function StageTimeline({ currentStage }: { currentStage: string }) {
  const currentIndex = Math.max(0, STAGES.findIndex((s) => s.id === currentStage));

  return (
    <div className="flex items-center">
      {STAGES.map((stage, i) => {
        const done = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={stage.id} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1.5 min-w-[52px]">
              <div
                className={cn(
                  'w-3 h-3 rounded-full border-2 flex-shrink-0 transition-colors',
                  done && 'bg-[#1db954] border-[#1db954]',
                  active && 'bg-[#1db954]/20 border-[#1db954] ring-4 ring-[#1db954]/15',
                  !done && !active && 'bg-transparent border-[var(--border)]'
                )}
              />
              <span
                className={cn(
                  'text-[9px] font-medium text-center leading-tight',
                  active ? 'text-[var(--foreground)]' : 'text-[var(--subtle-foreground)]'
                )}
              >
                {stage.label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className={cn('h-0.5 flex-1 -mt-4 transition-colors', done ? 'bg-[#1db954]' : 'bg-[var(--border)]')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[var(--border)] last:border-0">
      <span className="text-xs text-[var(--subtle-foreground)]">{label}</span>
      <span className="text-sm font-semibold text-right">{value}</span>
    </div>
  );
}

function CampaignLiveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, user } = useAuth();
  const { data: referenceData } = useReferenceData();

  const campaignId = searchParams.get('id');
  const [campaign, setCampaign] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!campaignId) { setIsLoading(false); return; }
    let cancelled = false;
    getCampaignById(campaignId).then((data) => {
      if (cancelled) return;
      setCampaign(data);
      setIsLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  const targetCountries: SuccessCountry[] = useMemo(() => {
    if (!campaign?.target_countries?.length || !referenceData) return [];
    return referenceData.countries.filter((c) => campaign.target_countries.includes(c.code));
  }, [campaign, referenceData]);

  // Owner-only: a guest who happens to open someone else's shared
  // link still sees the campaign summary (that's the point of a
  // shareable URL), but the "your own dashboard" CTAs only make sense
  // for the artist who actually owns it.
  const isOwner = isAuthenticated && !!user?.id && user.id === campaign?.artist_id;

  const handleShare = async () => {
    const url = `${window.location.origin}/campaign-live?id=${campaignId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (older browsers, non-HTTPS
      // dev contexts) — fail quietly rather than crash the button,
      // the URL is still visible in the address bar either way.
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#1db954] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="glass-strong rounded-2xl p-6 text-center max-w-sm space-y-3">
          <p className="font-semibold">Campaign not found</p>
          <p className="text-sm text-[var(--subtle-foreground)]">
            This link may be invalid, or the campaign may have been removed.
          </p>
          <button
            onClick={() => router.push('/promote')}
            className="mt-2 px-4 py-2 rounded-xl bg-[#1db954] text-white text-sm font-semibold"
          >
            Start a Campaign
          </button>
        </div>
      </div>
    );
  }

  const remainingCents = Math.max(0, (campaign.total_budget_cents || 0) - (campaign.spent_cents || 0));

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] scroll-smooth-mobile">
      <ConfettiBurst />
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-[#1db954]/5 blur-[120px] animate-ambient" />
        <div className="absolute top-[40%] -left-[10%] w-[40vw] h-[40vw] rounded-full bg-[#3d91f4]/5 blur-[100px] animate-ambient-slow" />
      </div>

      <div className="relative max-w-2xl mx-auto px-3 xs:px-4 py-8 xs:py-10 space-y-6">
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#1db954]/10 border border-[#1db954]/30 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-[#1db954]" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Your Campaign Is Live!</h1>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Your track is now in the seed network — growth starts now.
            </p>
          </div>
        </div>

        <CampaignSuccessVisualization
          title="Delivering to the seed network"
          subtitle={targetCountries.length > 0 ? `Targeting ${targetCountries.length} ${targetCountries.length === 1 ? 'country' : 'countries'}` : 'Local delivery'}
          targetCountries={targetCountries}
        />

        {/* Growth-stage timeline */}
        <div className="glass-strong rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[#1db954]" />
            <h2 className="font-bold text-sm">Growth Stage</h2>
          </div>
          <StageTimeline currentStage={campaign.current_stage || 'planting'} />
        </div>

        {/* Campaign summary */}
        <div className="glass-strong rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Rocket className="w-4 h-4 text-[#1db954]" />
            <h2 className="font-bold text-sm">Campaign Summary</h2>
          </div>
          <div className="mt-3">
            <SummaryRow
              label="Song"
              value={
                <a
                  href={campaign.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#1db954] hover:underline truncate max-w-[200px] inline-block align-bottom"
                >
                  View link
                </a>
              }
            />
            {campaign.target_view_count != null && (
              <SummaryRow label="Target Views" value={formatNumber(campaign.target_view_count)} />
            )}
            <SummaryRow
              label="Countries"
              value={
                targetCountries.length > 0
                  ? targetCountries.map((c) => c.flag).join(' ')
                  : 'Local'
              }
            />
            {campaign.estimated_duration_days != null && (
              <SummaryRow label="Estimated Duration" value={getDurationLabel(campaign.estimated_duration_days)} />
            )}
            {/* total_budget_cents is the delivery-funding amount only
                (platform fee excluded — see create/route.ts's own
                comment on that column) — labeled precisely rather than
                as a generic "Total Cost" that would overstate what
                this specific number represents for a paying user, and
                understate it for an admin (who paid $0 either way). */}
            <SummaryRow
              label={campaign.total_budget_cents > 0 ? 'Delivery Budget' : 'Cost'}
              value={campaign.total_budget_cents > 0 ? formatCents(campaign.total_budget_cents) : 'Free (Admin)'}
            />
            {campaign.total_budget_cents > 0 && (
              <SummaryRow label="Remaining" value={formatCents(remainingCents)} />
            )}
          </div>
        </div>

        {/* CTAs */}
        <div className="grid grid-cols-1 xs:grid-cols-3 gap-2.5">
          <button
            onClick={() => router.push('/analytics')}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl bg-[#1db954] text-white text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <TrendingUp className="w-4 h-4" /> Track Progress
          </button>
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl glass-card border border-[var(--border)] text-sm font-semibold hover:bg-[var(--accent)]/5 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-[#1db954]" /> : <Share2 className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Share Campaign'}
          </button>
          <button
            onClick={() => router.push('/promote')}
            className="flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl glass-card border border-[var(--border)] text-sm font-semibold hover:bg-[var(--accent)]/5 transition-colors"
          >
            <Rocket className="w-4 h-4" /> Start Another
          </button>
        </div>

        {/* Guest conversion CTA — only shown when the current session
            isn't the campaign's own owner in an authenticated state,
            i.e. exactly the "placed a campaign without an account"
            moment this task calls the real conversion opportunity. */}
        {!isOwner && (
          <div className="glass-strong rounded-2xl p-5 border border-[#3d91f4]/30 bg-[#3d91f4]/5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[#3d91f4]/15 flex items-center justify-center flex-shrink-0">
              <UserPlus className="w-5 h-5 text-[#3d91f4]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Create your account</p>
              <p className="text-xs text-[var(--subtle-foreground)]">
                Save this campaign, track every stage, and launch your next one faster.
              </p>
            </div>
            <Link
              href="/login"
              className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#3d91f4] text-white text-xs font-semibold flex-shrink-0"
            >
              Sign Up <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-[var(--subtle-foreground)] pt-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-[#1db954]" />
          <span>Bookmark this page — it's your campaign's permanent link.</span>
        </div>
      </div>
    </div>
  );
}

export default function CampaignLivePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#1db954] border-t-transparent animate-spin" />
      </div>
    }>
      <CampaignLiveContent />
    </Suspense>
  );
}
