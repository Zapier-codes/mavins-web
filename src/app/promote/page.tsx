'use client';

import { useState, useCallback, useEffect, useMemo, memo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { createCampaign, getArtistCampaigns } from '@/services/campaign/campaign.service';
import { getPublicSeedStats } from '@/services/stats/publicStats.service';
import { detectUserGeo } from '@/services/geo/ipGeolocation.service';
import { convertUsdCentsTo, convertUsdCentsToMinorUnits, formatCurrency } from '@/services/currency/currency.service';
import { calculatePricing, formatCents, formatNumber, DURATION_SLOTS } from '@/lib/campaign/pricing';
import { getRecommendedGeographies, scoreLabel, type GeoRecommendation } from '@/lib/campaign/geoAffinity';
import { cn } from '@/lib/utils/cn';
import { 
  Rocket, Link2, TrendingUp, Clock, DollarSign, 
  ShieldCheck, Zap, ChevronRight, Play, PauseCircle,
  BarChart3, Globe, Music, CheckCircle2, Sparkles, MapPin, Wand2
} from 'lucide-react';

// Heavy (recharts-backed) section — deferred so it never blocks the initial
// paint of the form above it, and never gets bundled/hydrated until the
// user actually scrolls near it. This alone removes the single biggest
// contributor to "the promote page feels slow" on first load.
const PublicAnalyticsShowcase = dynamic(
  () => import('@/components/promote/PublicAnalyticsShowcase').then((m) => m.PublicAnalyticsShowcase),
  {
    ssr: false,
    loading: () => (
      <div className="space-y-3" aria-hidden>
        <div className="h-6 w-48 rounded-lg shimmer" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-xl shimmer" />
          ))}
        </div>
        <div className="h-56 rounded-2xl shimmer" />
      </div>
    ),
  }
);

const GENRES = [
  'Afrobeats', 'Amapiano', 'Hip-Hop', 'R&B', 'Pop', 
  'Electronic', 'Reggae', 'Gospel', 'Highlife', 'Jazz',
  'Rock', 'Afro-fusion', 'Drill', 'Dancehall'
];

const TIERS = [
  { min: 1000, max: 10000, label: 'Starter', color: 'from-emerald-500 to-teal-500' },
  { min: 10001, max: 50000, label: 'Growth', color: 'from-blue-500 to-cyan-500' },
  { min: 50001, max: 100000, label: 'Scale', color: 'from-violet-500 to-purple-500' },
  { min: 100001, max: 500000, label: 'Pro', color: 'from-amber-500 to-orange-500' },
  { min: 500001, max: 1000000, label: 'Enterprise', color: 'from-rose-500 to-pink-500' },
  { min: 1000001, max: 5000000, label: 'Legend', color: 'from-red-500 to-rose-600' },
];

const PENDING_CAMPAIGN_KEY = 'mavins_pending_campaign';

// Pure, stateless helpers — hoisted out of the component so their identity
// never changes across renders, which is what lets the memoized children
// below actually skip re-rendering while the view-count slider is dragged.
function getStageColor(stage: string) {
  switch (stage) {
    case 'planting': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
    case 'germination': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
    case 'root_system': return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
    case 'branching': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
    case 'full_bloom': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
    case 'completed': return 'text-[var(--subtle-foreground)] bg-[var(--subtle-foreground)]/10 border-[var(--subtle-foreground)]/20';
    default: return 'text-[var(--subtle-foreground)] bg-[var(--subtle-foreground)]/10 border-[var(--subtle-foreground)]/20';
  }
}

function getStageLabel(stage: string) {
  const labels: Record<string, string> = {
    planting: 'Planting',
    germination: 'Germination',
    root_system: 'Root System',
    branching: 'Branching',
    full_bloom: 'Full Bloom',
    completed: 'Completed',
  };
  return labels[stage] || stage;
}

// ── Memoized subsections ──────────────────────────────────────────────
// Each of these only re-renders when the specific props it cares about
// change, instead of on every keystroke/slider-tick in the parent form.

const GenreChips = memo(function GenreChips({
  selectedGenre,
  onSelect,
}: {
  selectedGenre: string;
  onSelect: (genre: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-2">
      {GENRES.map((genre) => (
        <button
          key={genre}
          type="button"
          onClick={() => onSelect(genre)}
          className={cn(
            'w-full px-2 py-1.5 rounded-full text-xs font-medium text-center truncate transition-all active:scale-95',
            selectedGenre === genre
              ? 'bg-[#1db954] text-black shadow-lg shadow-[#1db954]/20'
              : 'chip-card text-[var(--muted-foreground)]'
          )}
        >
          {genre}
        </button>
      ))}
    </div>
  );
});

const GeoTargetingSection = memo(function GeoTargetingSection({
  genre,
  homeCountryCode,
  selectedCodes,
  onToggle,
}: {
  genre: string;
  homeCountryCode: string | null;
  selectedCodes: string[];
  onToggle: (code: string) => void;
}) {
  const ranked = useMemo(
    () => getRecommendedGeographies(genre || null, homeCountryCode),
    [genre, homeCountryCode]
  );
  const topCodes = useMemo(() => new Set(ranked.slice(0, 3).map((r) => r.code)), [ranked]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--muted-foreground)]">Target Geography</label>
        {genre ? (
          <span className="flex items-center gap-1 text-[10px] text-[var(--subtle-foreground)]">
            <Wand2 className="w-3 h-3" />
            Ranked for {genre}
          </span>
        ) : (
          <span className="text-[10px] text-[var(--subtle-foreground)]">Pick a genre for tailored picks</span>
        )}
      </div>

      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
        {ranked.map((rec) => {
          const isSelected = selectedCodes.includes(rec.code);
          const isTop = topCodes.has(rec.code);
          const fit = scoreLabel(rec.score);
          return (
            <button
              key={rec.code}
              type="button"
              onClick={() => onToggle(rec.code)}
              className={cn(
                'relative text-left px-2.5 py-2 rounded-xl border transition-all active:scale-95',
                isSelected
                  ? 'bg-[#1db954]/10 border-[#1db954]/40 text-[#1db954]'
                  : 'chip-card border-white/5 text-[var(--muted-foreground)]'
              )}
            >
              {isTop && (
                <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase bg-[#1db954] text-black shadow">
                  Top
                </span>
              )}
              <div className="flex items-center gap-1.5">
                <span aria-hidden>{rec.flag}</span>
                <span className="text-xs font-semibold truncate">{rec.country}</span>
              </div>
              <div className="flex items-center gap-1 mt-1">
                <span
                  className={cn(
                    'text-[9px] font-medium',
                    fit.tone === 'strong' && 'text-[#1db954]',
                    fit.tone === 'good' && 'text-[#3d91f4]',
                    fit.tone === 'moderate' && 'text-amber-400',
                    fit.tone === 'light' && 'text-[var(--subtle-foreground)]'
                  )}
                >
                  {fit.label}
                </span>
                {rec.isHomeMarket && (
                  <span className="flex items-center gap-0.5 text-[9px] text-[var(--subtle-foreground)]">
                    <MapPin className="w-2.5 h-2.5" /> You
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--subtle-foreground)]">
        {selectedCodes.length > 0
          ? `Targeting ${selectedCodes.length} ${selectedCodes.length === 1 ? 'market' : 'markets'}. Leave empty to distribute across the whole network.`
          : 'No markets selected — views will be distributed network-wide. Tap countries above to target specific markets.'}
      </p>
    </div>
  );
});


const DurationSlotsGrid = memo(function DurationSlotsGrid({
  selectedSlotId,
}: {
  selectedSlotId: string;
}) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Campaign Duration</span>
        <span className="text-xs text-[var(--subtle-foreground)]">Auto-calculated</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        {DURATION_SLOTS.map((slot) => {
          const isSelected = selectedSlotId === slot.id;
          return (
            <div
              key={slot.id}
              className={cn(
                'text-center p-2.5 rounded-xl border transition-all',
                isSelected
                  ? 'bg-[#1db954]/10 border-[#1db954]/30 text-[#1db954]'
                  : 'chip-card border-white/5 text-[var(--subtle-foreground)]'
              )}
            >
              <p className="text-xs font-bold">{slot.label}</p>
              <p className="text-[10px] mt-0.5">{slot.days}d</p>
            </div>
          );
        })}
      </div>
    </div>
  );
});

const PricingBreakdown = memo(function PricingBreakdown({
  pricing,
  topGeo,
  targetedGeo,
  localAmountDisplay,
}: {
  pricing: ReturnType<typeof calculatePricing>;
  topGeo: { country: string; flag: string } | null;
  targetedGeo: { country: string; flag: string } | null;
  localAmountDisplay: string | null;
}) {
  // Artists care about how fast and how widely a campaign is moving, not a
  // raw per-1K rate — so instead of "cost per view" this surfaces an hourly
  // pace and where that pace is landing geographically. If the artist hasn't
  // picked geo targets yet, it shows the network-wide top market.
  const geo = targetedGeo || topGeo;
  const hourlyRate = Math.round(pricing.dailyDripRate / 24);

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Pricing Breakdown</span>
        {pricing.savingsPercent > 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1db954]/10 text-[#1db954] border border-[#1db954]/20">
            Save {pricing.savingsPercent}%
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Subtotal</p>
          <p className="text-sm font-semibold">{formatCents(pricing.subtotalCents)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Platform Fee ({pricing.platformFeesCents / (pricing.subtotalCents / 100)}%)</p>
          <p className="text-sm font-semibold">{formatCents(pricing.platformFeesCents)}</p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Est. Hourly Pace</p>
          <p className="text-sm font-semibold flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-[#1db954]" />
            {formatNumber(hourlyRate)}/hr
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Primary Market</p>
          <p className="text-sm font-semibold flex items-center gap-1">
            <Globe className="w-3.5 h-3.5 text-[#3d91f4]" />
            {geo ? `${geo.flag} ${geo.country}` : 'Network-wide'}
          </p>
        </div>
      </div>

      <div className="pt-2 border-t border-[var(--glass-border)] flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Total</span>
        <div className="text-right">
          <span className="text-xl font-bold">{formatCents(pricing.totalCostCents)}</span>
          {localAmountDisplay && (
            <p className="text-xs text-[var(--subtle-foreground)] mt-0.5">
              ≈ {localAmountDisplay} — you'll pay the NGN equivalent at checkout
            </p>
          )}
        </div>
      </div>
    </div>
  );
});

const CampaignCard = memo(function CampaignCard({ campaign }: { campaign: any }) {
  return (
    <div className="glass-card rounded-xl p-4 space-y-2.5 gpu-layer">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-sm truncate">{campaign.resolved_song_id || 'Campaign'}</p>
          <p className="text-[11px] text-[var(--subtle-foreground)] mt-0.5">
            {new Date(campaign.created_at).toLocaleDateString()}
          </p>
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border flex-shrink-0', getStageColor(campaign.current_stage))}>
          {getStageLabel(campaign.current_stage)}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#1db954] to-[#3d91f4] transition-all duration-700"
          style={{
            width: `${Math.min(100, campaign.total_budget_cents > 0 ? (campaign.spent_cents / campaign.total_budget_cents) * 100 : 0)}%`,
          }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--subtle-foreground)]">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3.5 h-3.5" />
          <span>{formatNumber(campaign.total_streams)} streams</span>
        </div>
        <div className="flex items-center gap-1">
          <Globe className="w-3.5 h-3.5" />
          <span className="capitalize">{campaign.geographic_tier}</span>
        </div>
        {campaign.is_paused ? (
          <div className="flex items-center gap-1 text-amber-400">
            <PauseCircle className="w-3.5 h-3.5" />
            <span>Paused</span>
          </div>
        ) : campaign.is_active ? (
          <div className="flex items-center gap-1 text-[#1db954]">
            <Zap className="w-3.5 h-3.5" />
            <span>Active</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[var(--subtle-foreground)]">
            <Play className="w-3.5 h-3.5" />
            <span>Completed</span>
          </div>
        )}
      </div>
    </div>
  );
});

const HOW_IT_WORKS = [
  { step: 1, title: 'Paste URL', desc: 'Drop your YouTube link', icon: Link2 },
  { step: 2, title: 'Set Target', desc: 'Slide to choose views', icon: TrendingUp },
  { step: 3, title: 'We Drip', desc: 'Organic delivery over time', icon: Clock },
  { step: 4, title: 'Track Growth', desc: 'Real-time analytics', icon: BarChart3 },
];

export default function PromotePage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();
  const [viewCount, setViewCount] = useState(5000);
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [topGeo, setTopGeo] = useState<{ country: string; flag: string } | null>(null);
  const [homeCountryCode, setHomeCountryCode] = useState<string | null>(null);
  const [targetCountries, setTargetCountries] = useState<string[]>([]);
  const [localCurrencyCode, setLocalCurrencyCode] = useState<string | null>(null);
  const [localAmountDisplay, setLocalAmountDisplay] = useState<string | null>(null);

  // Lightweight, cached (60s) lookup of where the seed network's reach is
  // concentrated right now, so the pricing card can show the artist where
  // their hourly views are actually landing instead of a flat unit cost.
  useEffect(() => {
    let cancelled = false;
    getPublicSeedStats().then((stats) => {
      if (cancelled) return;
      const top = stats.demographics[0];
      if (top) setTopGeo({ country: top.country, flag: top.flag });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Best-effort IP geolocation (ipapi.co) so geo-targeting recommendations
  // can be nudged toward the artist's own likely home audience, and so we
  // know which local currency to show them a converted price estimate in.
  // Silently no-ops if it fails — targeting/pricing still work off USD/NGN.
  useEffect(() => {
    let cancelled = false;
    detectUserGeo().then((geo) => {
      if (cancelled || !geo) return;
      setHomeCountryCode(geo.countryCode);
      if (geo.currencyCode) setLocalCurrencyCode(geo.currencyCode);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Recomputed only when viewCount actually changes, not on every render
  // (form field typing, campaigns refresh, etc. no longer re-run the
  // pricing engine).
  const pricing = useMemo(() => calculatePricing(viewCount), [viewCount]);
  // Live USD -> local-currency conversion for display only. Recomputes
  // whenever the price or detected currency changes; NGN is the artist's
  // own currency (formatCents already shows USD, ngn breakdown is in
  // PricingBreakdown), so we skip showing a redundant "≈" line for it.
  useEffect(() => {
    if (!localCurrencyCode || localCurrencyCode === 'USD') {
      setLocalAmountDisplay(null);
      return;
    }
    let cancelled = false;
    convertUsdCentsTo(pricing.totalCostCents, localCurrencyCode).then((amount) => {
      if (!cancelled) setLocalAmountDisplay(formatCurrency(amount, localCurrencyCode));
    });
    return () => {
      cancelled = true;
    };
  }, [pricing.totalCostCents, localCurrencyCode]);

  const currentTier = useMemo(
    () => TIERS.find(t => viewCount >= t.min && viewCount <= t.max) || TIERS[0],
    [viewCount]
  );

  // The artist's own #1 ranked target market (by genre-affinity score),
  // shown on the pricing card instead of the network-wide top country
  // once they've actually picked geo targets.
  const topTargetedGeo = useMemo(() => {
    if (targetCountries.length === 0) return null;
    const ranked = getRecommendedGeographies(selectedGenre || null, homeCountryCode);
    const best = ranked.find((r) => targetCountries.includes(r.code));
    return best ? { country: best.country, flag: best.flag } : null;
  }, [targetCountries, selectedGenre, homeCountryCode]);

  useEffect(() => {
    if (!user?.id) return;
    getArtistCampaigns(user.id).then(setCampaigns);
  }, [user?.id]);

  // A guest who got sent to /fund-wallet from here (insufficient funds,
  // or no account yet) lands back on this page once payment + account
  // creation finish. Restore whatever they'd already filled in so they
  // don't have to redo it.
  useEffect(() => {
    if (!isAuthenticated) return;
    try {
      const saved = sessionStorage.getItem(PENDING_CAMPAIGN_KEY);
      if (!saved) return;
      const draft = JSON.parse(saved);
      if (draft.sourceUrl) setSourceUrl(draft.sourceUrl);
      if (draft.viewCount) setViewCount(draft.viewCount);
      if (draft.selectedGenre) setSelectedGenre(draft.selectedGenre);
      if (Array.isArray(draft.targetCountries)) setTargetCountries(draft.targetCountries);
      sessionStorage.removeItem(PENDING_CAMPAIGN_KEY);
    } catch {}
  }, [isAuthenticated]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setViewCount(Number(e.target.value));
  }, []);

  const handleGenreSelect = useCallback((genre: string) => {
    setSelectedGenre(genre);
  }, []);

  const handleToggleCountry = useCallback((code: string) => {
    setTargetCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  }, []);

  // Maps the number of explicitly targeted markets onto the schema's fixed
  // geographic_tier enum (local/regional/national/global). No selection at
  // all keeps the previous default behavior (network-wide distribution).
  const geographicTier = useMemo(() => {
    const n = targetCountries.length;
    if (n === 0) return 'local';
    if (n <= 2) return 'regional';
    if (n <= 5) return 'national';
    return 'global';
  }, [targetCountries]);

  const goFundWallet = useCallback(async (reason: string) => {
    // The amount is always what the pricing engine computed for the
    // campaign they're trying to launch, converted from USD to the
    // wallet's own NGN denomination via a live exchange rate — NOT the
    // USD-cents number reinterpreted as naira (that was the old bug: a
    // $35 campaign was quietly only charging ~₦35).
    const amountNaira = Math.ceil(await convertUsdCentsTo(pricing.totalCostCents, 'NGN'));
    try {
      sessionStorage.setItem(PENDING_CAMPAIGN_KEY, JSON.stringify({
        sourceUrl: sourceUrl.trim(),
        viewCount,
        selectedGenre,
        targetCountries,
      }));
    } catch {}
    router.push(
      `/fund-wallet?amount=${amountNaira}&redirect=${encodeURIComponent('/promote')}&reason=${reason}`
    );
  }, [pricing.totalCostCents, sourceUrl, viewCount, selectedGenre, targetCountries, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim()) {
      alert('Please enter a YouTube URL');
      return;
    }

    // Guests always hit insufficient funds (a new account starts at
    // ₦0), so send them straight to funding rather than a dead-end
    // "please sign in" alert -- the account gets created for them the
    // moment their payment confirms.
    if (!isAuthenticated || !user?.id) {
      await goFundWallet('launch_campaign');
      return;
    }

    setIsSubmitting(true);
    const result = await createCampaign({
      sourceUrl: sourceUrl.trim(),
      viewCount,
      artistId: user.id,
      genre: selectedGenre || undefined,
      geographicTier,
      targetCountries,
    });
    setIsSubmitting(false);

    if (result.success) {
      setShowSuccess(true);
      setSourceUrl('');
      setSelectedGenre('');
      setTargetCountries([]);
      const updated = await getArtistCampaigns(user.id);
      setCampaigns(updated);
      setTimeout(() => setShowSuccess(false), 4000);
    } else if (/insufficient/i.test(result.error || '')) {
      await goFundWallet('insufficient_funds');
    } else {
      alert(result.error || 'Failed to create campaign');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] scroll-smooth-mobile">
      {/* Ambient background blobs — smaller + fewer on mobile, where GPU
          budget for blurred, animated layers is much tighter. */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="ambient-blob absolute -top-24 -right-24 w-[280px] h-[280px] sm:-top-40 sm:-right-40 sm:w-[500px] sm:h-[500px] bg-[#1db954]/4 rounded-full blur-2xl sm:blur-3xl animate-ambient will-change-transform" />
        <div className="ambient-blob absolute -bottom-24 -left-24 w-[280px] h-[280px] sm:-bottom-40 sm:-left-40 sm:w-[500px] sm:h-[500px] bg-[#3d91f4]/4 rounded-full blur-2xl sm:blur-3xl animate-ambient-slow will-change-transform" />
        <div className="ambient-blob hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#a855f7]/3 rounded-full blur-3xl animate-ambient-fast will-change-transform" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Promote Your Track</h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">Paste your YouTube link. We handle the rest.</p>
        </div>

        {/* Success toast */}
        {showSuccess && (
          <div className="fixed top-20 right-4 left-4 sm:left-auto z-50 glass-strong border-[#1db954]/30 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 slide-in-from-right">
            <CheckCircle2 className="w-5 h-5 text-[#1db954] flex-shrink-0" />
            <span className="font-semibold text-sm">Campaign created successfully!</span>
          </div>
        )}

        {/* Main Form Card — Glass */}
        <div className="glass-strong rounded-2xl overflow-hidden gpu-layer">
          {/* Tier badge */}
          <div className={cn(
            'px-5 py-2.5 text-xs font-bold uppercase tracking-wider',
            'bg-gradient-to-r', currentTier.color,
            'text-white shadow-lg'
          )}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">{currentTier.label} Tier</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
            {/* YouTube URL */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--muted-foreground)]">YouTube URL</label>
              <div className="relative">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--subtle-foreground)]" />
                <input
                  type="url"
                  inputMode="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                  required
                />
              </div>
              {sourceUrl.trim() && !selectedGenre && (
                <p className="text-[11px] text-[var(--subtle-foreground)] mt-1.5">
                  Pick your genre below and we'll rank the best-fit markets for this track.
                </p>
              )}
            </div>

            {/* Genre */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--muted-foreground)]">Genre</label>
              <GenreChips selectedGenre={selectedGenre} onSelect={handleGenreSelect} />
            </div>

            {/* Geo Targeting */}
            <GeoTargetingSection
              genre={selectedGenre}
              homeCountryCode={homeCountryCode}
              selectedCodes={targetCountries}
              onToggle={handleToggleCountry}
            />

            {/* View Count Slider — gilded, futuristic styling; isolated onto
                its own stacking context so drag interactions never force
                the surrounding backdrop-filter glass card to recomposite
                (the old cause of the iOS black-flash-while-dragging bug). */}
            <div className="glass-card rounded-xl p-4" style={{ isolation: 'isolate', contain: 'layout paint style' }}>
              <div className="flex items-center justify-between mb-4">
                <label className="text-sm font-medium text-[var(--muted-foreground)]">Target Views</label>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/25">
                  <TrendingUp className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span className="text-lg font-bold tabular-nums text-[#f4e4bc]">{formatNumber(viewCount)}</span>
                </div>
              </div>
              <input
                type="range"
                min="1000"
                max="500000"
                step="1000"
                value={viewCount}
                onChange={handleSliderChange}
                className="w-full slider-gold"
                style={{ '--value-percent': `${((viewCount - 1000) / (500000 - 1000)) * 100}%` } as React.CSSProperties}
                aria-label="Target views"
              />
              <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--subtle-foreground)] mt-2">
                <span>1K</span>
                <span>100K</span>
                <span>250K</span>
                <span>500K</span>
              </div>
            </div>

            {/* Duration Slot Display (auto-calculated, not selectable) */}
            <DurationSlotsGrid selectedSlotId={pricing.durationSlot.id} />
            <p className="text-xs text-[var(--subtle-foreground)] -mt-3 text-center">
              Based on {formatNumber(pricing.dailyDripRate)} views/day drip rate
            </p>

            {/* Pricing Breakdown — Glass */}
            <PricingBreakdown pricing={pricing} topGeo={topGeo} targetedGeo={topTargetedGeo} localAmountDisplay={localAmountDisplay} />

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20 gpu-layer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Creating campaign...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  <span className="truncate">Launch Campaign — {formatCents(pricing.totalCostCents)}</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Active Campaigns */}
        {campaigns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Your Campaigns</h2>
            <div className="space-y-3">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.id} campaign={campaign} />
              ))}
            </div>
          </div>
        )}

        {/* Live, public seed-network analytics — social proof for both
            guests and signed-in artists, always visible. */}
        <PublicAnalyticsShowcase />

        {/* How it works — Glass */}
        <div className="glass-strong rounded-2xl p-5 sm:p-6 gpu-layer">
          <h3 className="font-bold mb-4">How It Works</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {HOW_IT_WORKS.map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-10 h-10 mx-auto rounded-xl bg-[#1db954]/10 border border-[#1db954]/20 text-[#1db954] flex items-center justify-center mb-2">
                  <item.icon className="w-5 h-5" />
                </div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-[var(--subtle-foreground)] mt-0.5">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
