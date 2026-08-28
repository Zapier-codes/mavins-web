'use client';

import { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { createCampaign, getArtistCampaigns } from '@/services/campaign/campaign.service';
import { getPublicSeedStats } from '@/services/stats/publicStats.service';
import { useGeo } from '@/components/providers/GeoProvider';
import { calculatePricing, formatCents, formatNumber, DURATION_SLOTS } from '@/lib/campaign/pricing';
import { getRecommendedGeographies, getGeoTargetingPool, scoreLabel, TARGET_COUNTRIES } from '@/lib/campaign/geoAffinity';
import { getKorapayDccCurrency } from '@/lib/currency/korapayDccCurrency';
import { COUNTRY_CURRENCY } from '@/lib/currency/countryCurrency';
import { initializeCheckout } from '@/lib/payments/checkout';
import { getWalletBalanceCents } from '@/lib/payments/wallet';
import { cn } from '@/lib/utils/cn';
import {
  Rocket, Link2, TrendingUp, Globe, DollarSign,
  ShieldCheck, Zap, ChevronRight, Play, PauseCircle,
  BarChart3, Music, CheckCircle2, Sparkles, MapPin, Wand2, Map
} from 'lucide-react';

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
const MAX_COUNTRIES_FREE = 3;

// Country → currency mapping moved to src/lib/currency/countryCurrency.ts
// (Task 29) — kept 1:1 with TARGET_COUNTRIES there instead of drifting
// as a separate local list.

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
    planting: 'Planting', germination: 'Germination', root_system: 'Root System',
    branching: 'Branching', full_bloom: 'Full Bloom', completed: 'Completed',
  };
  return labels[stage] || stage;
}

// ── Memoized subsections ──────────────────────────────────────────────

const GenreChips = memo(function GenreChips({ selectedGenre, onSelect }: {
  selectedGenre: string; onSelect: (genre: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {GENRES.map((genre) => (
        <button key={genre} type="button" onClick={() => onSelect(genre)} className={cn(
          'px-3 py-1.5 rounded-full text-xs font-medium text-center whitespace-nowrap transition-all active:scale-95',
          selectedGenre === genre ? 'bg-[#1db954] text-black shadow-lg shadow-[#1db954]/20' : 'chip-card text-[var(--muted-foreground)]'
        )}>{genre}</button>
      ))}
    </div>
  );
});

const GeoTargetingSection = memo(function GeoTargetingSection({
  genre, homeCountryCode, selectedCodes, onToggle, isAdmin,
}: {
  genre: string; homeCountryCode: string | null; selectedCodes: string[];
  onToggle: (code: string) => void; isAdmin: boolean;
}) {
  // Shown pool is 8-of-25, genre-weighted-random — re-shuffles whenever
  // genre (or home market) changes, so the artist never sees a fixed,
  // static set of countries every time they land here.
  const shown = useMemo(() => getGeoTargetingPool(genre || null, homeCountryCode), [genre, homeCountryCode]);
  const topCodes = useMemo(() => new Set(shown.slice(0, 3).map((r) => r.code)), [shown]);
  const atLimit = !isAdmin && selectedCodes.length >= MAX_COUNTRIES_FREE;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--muted-foreground)]">Target Geography</label>
        {genre ? <span className="flex items-center gap-1 text-[10px] text-[var(--subtle-foreground)]"><Wand2 className="w-3 h-3" />Ranked for {genre}</span>
          : <span className="text-[10px] text-[var(--subtle-foreground)]">Pick a genre for tailored picks</span>}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {shown.map((rec) => {
          const isSelected = selectedCodes.includes(rec.code);
          const isTop = topCodes.has(rec.code);
          const fit = scoreLabel(rec.score);
          const disabled = !isSelected && atLimit;
          return (
            <button
              key={rec.code}
              type="button"
              onClick={() => !disabled && onToggle(rec.code)}
              disabled={disabled}
              className={cn(
                'relative text-left px-2.5 py-2 rounded-xl border transition-all active:scale-95',
                'flex-grow-0 flex-shrink-0 basis-[calc(50%-0.25rem)] xs:basis-[calc(25%-0.375rem)] sm:basis-[calc(20%-0.4rem)]',
                isSelected ? 'bg-[#1db954]/10 border-[#1db954]/40 text-[#1db954]' : 'chip-card border-white/5 text-[var(--muted-foreground)]',
                disabled && 'opacity-40 cursor-not-allowed'
              )}
            >
              {isTop && <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase bg-[#1db954] text-black shadow z-10">Top</span>}
              <div className="flex items-center gap-1.5"><span aria-hidden className="text-base">{rec.flag}</span><span className="text-xs font-semibold truncate">{rec.country}</span></div>
              <div className="flex items-center gap-1 mt-1">
                <span className={cn('text-[9px] font-medium', fit.tone === 'strong' && 'text-[#1db954]', fit.tone === 'good' && 'text-[#3d91f4]', fit.tone === 'moderate' && 'text-amber-400', fit.tone === 'light' && 'text-[var(--subtle-foreground)]')}>{fit.label}</span>
                {rec.isHomeMarket && <span className="flex items-center gap-0.5 text-[9px] text-[var(--subtle-foreground)]"><MapPin className="w-2.5 h-2.5" />You</span>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--subtle-foreground)]">
        {selectedCodes.length > 0
          ? `Targeting ${selectedCodes.length} ${selectedCodes.length === 1 ? 'market' : 'markets'}.${!isAdmin ? ` Max ${MAX_COUNTRIES_FREE} for free accounts.` : ''}`
          : 'No markets selected — views distributed network-wide.'}
      </p>
    </div>
  );
});

const DurationSlotsGrid = memo(function DurationSlotsGrid({ selectedSlotId }: { selectedSlotId: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted-foreground)]">
          <Map className="w-3.5 h-3.5" />
          Campaign Duration
        </span>
        <span className="text-xs text-[var(--subtle-foreground)]">Auto-calculated</span>
      </div>
      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-5 gap-1.5 xs:gap-2">
        {DURATION_SLOTS.map((slot) => (
          <div key={slot.id} className={cn('text-center p-2.5 rounded-xl border transition-all',
            selectedSlotId === slot.id ? 'bg-[#1db954]/10 border-[#1db954]/30 text-[#1db954]' : 'chip-card border-white/5 text-[var(--subtle-foreground)]'
          )}>
            <p className="text-xs font-bold">{slot.label}</p>
            <p className="text-[10px] mt-0.5">{slot.days}d</p>
          </div>
        ))}
      </div>
    </div>
  );
});

// Replaces the old "Based on X views/day drip rate" caption — instead of a
// generic delivery-rate figure, shows the actual flags of the countries the
// user targeted (or a network-wide globe when nothing's selected yet), as
// an overlapping stack so it reads as one cohesive "your reach" chip rather
// than a wall of separate flag icons.
const SelectedCountriesStack = memo(function SelectedCountriesStack({ codes }: { codes: string[] }) {
  const picked = codes
    .map((code) => TARGET_COUNTRIES.find((c) => c.code === code))
    .filter((c): c is NonNullable<typeof c> => !!c);

  if (picked.length === 0) {
    return (
      <p className="-mt-3 flex items-center justify-center gap-1.5 text-xs text-[var(--subtle-foreground)]">
        <span aria-hidden>🌍</span>
        <span>No markets selected — views distributed network-wide</span>
      </p>
    );
  }

  const MAX_VISIBLE = 5; // admins can select more than 3; keep the stack readable
  const visible = picked.slice(0, MAX_VISIBLE);
  const overflow = picked.length - visible.length;

  return (
    <div className="-mt-3 flex items-center justify-center gap-2">
      <div className="flex -space-x-2.5">
        {visible.map((c, i) => (
          <span
            key={c.code}
            title={c.country}
            className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--background)] border-2 border-[var(--glass-border)] text-sm shadow-sm"
            style={{ zIndex: visible.length - i }}
          >
            {c.flag}
          </span>
        ))}
        {overflow > 0 && (
          <span
            className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--background)] border-2 border-[var(--glass-border)] text-[10px] font-bold text-[var(--subtle-foreground)]"
            style={{ zIndex: 0 }}
          >
            +{overflow}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--subtle-foreground)]">
        Targeting {picked.length === 1 ? picked[0].country : `${picked.length} markets`}
      </p>
    </div>
  );
});

const PricingBreakdown = memo(function PricingBreakdown({
  pricing, topGeo, targetedGeo, targetedCountries, localCurrency,
}: {
  pricing: ReturnType<typeof calculatePricing>;
  topGeo: { country: string; flag: string } | null;
  targetedGeo: { country: string; flag: string } | null;
  targetedCountries: string[];
  localCurrency: { code: string; symbol: string; rate: number } | null;
}) {
  const hourlyRate = Math.round(pricing.dailyDripRate / 24);
  // Task 31: the primary total (formatCents, below) is always rendered
  // in USD -- this app's own base currency as of Task 26. For a
  // USD-default user (localCurrency.code === 'USD', e.g. US-based
  // artists per COUNTRY_CURRENCY's `US` entry), showing "≈ $32 USD"
  // right under a total that's already "$32.00" is a redundant
  // same-currency conversion, not a helpful localization hint -- so
  // skip computing/rendering it in that case rather than showing an
  // identical number twice.
  const showLocalEstimate = !!localCurrency && localCurrency.code !== 'USD';
  const localTotal = showLocalEstimate ? Math.round(pricing.totalCostCents * localCurrency!.rate) : null;

  // Build the reach line: flags for every country the user actually picked,
  // falling back to the single auto-recommended top market when nothing's
  // selected yet. Names are shown for 1–2 picks (reads naturally); beyond
  // that it's flags-only so the line doesn't wrap awkwardly on mobile.
  const selectedGeos = targetedCountries
    .map((code) => TARGET_COUNTRIES.find((c) => c.code === code))
    .filter((c): c is { code: string; country: string; flag: string } => !!c);

  const reachLabel = selectedGeos.length > 0
    ? (selectedGeos.length <= 2
        ? selectedGeos.map((g) => g.country).join(', ')
        : `${selectedGeos.length} markets`)
    : (topGeo?.country || targetedGeo?.country || 'Global network');

  const reachFlags = selectedGeos.length > 0
    ? selectedGeos.map((g) => g.flag).join(' ')
    : (topGeo?.flag || targetedGeo?.flag || '🌍');

  const reachSubtext = selectedGeos.length > 0 ? 'Targeted' : 'Auto-selected';

  return (
    <div className="relative glass-card rounded-xl p-4 space-y-3 overflow-hidden">
      {/* Solar flare — a soft radial accent burst anchored top-right, using
          the active theme's accent color (blue in light mode, gold in dark) */}
      <div
        className="absolute -top-16 -right-16 w-40 h-40 rounded-full pointer-events-none opacity-60 animate-ambient-slow"
        style={{
          background: 'radial-gradient(circle, rgba(var(--accent-rgb), 0.35) 0%, rgba(var(--accent-rgb), 0.12) 45%, transparent 70%)',
        }}
        aria-hidden
      />
      <div
        className="absolute -top-8 -right-8 w-16 h-16 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(var(--accent-rgb), 0.5) 0%, transparent 75%)',
          filter: 'blur(6px)',
        }}
        aria-hidden
      />

      <div className="relative flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Pricing Breakdown</span>
        {pricing.savingsPercent > 0 && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1db954]/10 text-[#1db954] border border-[#1db954]/20">Save {pricing.savingsPercent}%</span>}
      </div>
      <div className="relative grid grid-cols-1 xs:grid-cols-2 gap-3">
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--subtle-foreground)] mb-1">Subtotal</p>
          <p className="text-lg font-bold">{formatCents(pricing.subtotalCents)}</p>
        </div>
        <div className="p-3 rounded-xl bg-white/5 border border-white/5">
          <p className="text-[10px] uppercase tracking-wider text-[var(--subtle-foreground)] mb-1">Platform Fee</p>
          <p className="text-lg font-bold">{pricing.platformFeePercent}%</p>
        </div>
      </div>

      {/* Combined reach statement — how fast, and where, replacing the old
          separate "Delivery Rate" / "Primary Market" stat pair. Leads with
          virality (the hourly pace) rather than a sterile cost figure. */}
      <div className="relative p-3 rounded-xl bg-[var(--accent)]/[0.06] border border-[var(--accent)]/20">
        <p className="text-[10px] uppercase tracking-wider text-[var(--subtle-foreground)] mb-1">Estimated Reach</p>
        <p className="text-sm font-bold flex items-center gap-1.5 flex-wrap">
          <span>~{formatNumber(hourlyRate)}/hr</span>
          <span className="text-[var(--subtle-foreground)] font-normal">to</span>
          <span aria-hidden className="text-base leading-none">{reachFlags}</span>
          <span className="truncate">{reachLabel}</span>
        </p>
        <p className="text-[10px] text-[var(--subtle-foreground)] mt-0.5">
          {formatNumber(pricing.dailyDripRate)}/day · {reachSubtext}
        </p>
      </div>

      <div className="relative pt-3 border-t border-white/5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Total</span>
          <div className="text-right">
            <p className="text-2xl font-bold text-[#1db954]">{formatCents(pricing.totalCostCents)}</p>
            {showLocalEstimate && localTotal !== null && (
              <p className="text-xs text-[var(--subtle-foreground)]">≈ {localCurrency!.symbol}{localTotal.toLocaleString()} {localCurrency!.code}</p>
            )}
          </div>
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
          <p className="text-[11px] text-[var(--subtle-foreground)] mt-0.5">{new Date(campaign.created_at).toLocaleDateString()}</p>
        </div>
        <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border flex-shrink-0', getStageColor(campaign.current_stage))}>
          {getStageLabel(campaign.current_stage)}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-[#1db954] to-[#3d91f4] transition-all duration-700"
          style={{ width: `${Math.min(100, campaign.total_budget_cents > 0 ? (campaign.spent_cents / campaign.total_budget_cents) * 100 : 0)}%` }} />
      </div>
      <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--subtle-foreground)]">
        <div className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /><span>{formatNumber(campaign.total_streams)} streams</span></div>
        <div className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" /><span className="capitalize">{campaign.geographic_tier}</span></div>
        {campaign.is_paused ? <div className="flex items-center gap-1 text-amber-400"><PauseCircle className="w-3.5 h-3.5" /><span>Paused</span></div>
          : campaign.is_active ? <div className="flex items-center gap-1 text-[#1db954]"><Zap className="w-3.5 h-3.5" /><span>Active</span></div>
          : <div className="flex items-center gap-1 text-[var(--subtle-foreground)]"><Play className="w-3.5 h-3.5" /><span>Completed</span></div>}
      </div>
    </div>
  );
});

const HOW_IT_WORKS = [
  { step: 1, title: 'Paste URL', desc: 'Drop your YouTube link', icon: Link2 },
  { step: 2, title: 'Set Target', desc: 'Slide to choose views', icon: TrendingUp },
  { step: 3, title: 'We Deliver', desc: 'Organic delivery over time', icon: Globe },
  { step: 4, title: 'Track Growth', desc: 'Real-time analytics', icon: BarChart3 },
];

export default function PromotePage() {
  const { user, isAuthenticated, isAdmin } = useAuth();
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
  const [localCurrency, setLocalCurrency] = useState<{ code: string; symbol: string; rate: number } | null>(null);

  // Local currency, derived from the app-wide geo context (fetched once
  // at app initialization by GeoProvider — see providers.tsx) rather
  // than a page-local detectUserGeo() call.
  const { geo } = useGeo();
  useEffect(() => {
    if (!geo) return;
    const currency = COUNTRY_CURRENCY[geo.countryCode];
    if (currency) setLocalCurrency(currency);
    setHomeCountryCode(geo.countryCode);
  }, [geo]);

  // Korapay Dynamic Currency Conversion hint for the direct-to-checkout
  // path below (Task 28) — same lookup fund-wallet/page.tsx uses, kept
  // here too since an authenticated user with insufficient/zero
  // balance now goes straight to checkout from this page without ever
  // visiting fund-wallet. Purely a checkout-display hint; never used
  // to convert the USD amount itself. `null` means "no DCC, charge in
  // USD" — correct for a US-based payer or while geo hasn't resolved.
  const dccCurrency = useMemo(() => getKorapayDccCurrency(geo?.countryCode), [geo]);

  useEffect(() => {
    let cancelled = false;
    getPublicSeedStats().then((stats) => {
      if (cancelled) return;
      const top = stats.demographics[0];
      if (top) setTopGeo({ country: top.country, flag: top.flag });
    });
    return () => { cancelled = true; };
  }, []);

  const pricing = useMemo(() => calculatePricing(viewCount), [viewCount]);
  const currentTier = useMemo(() => TIERS.find(t => viewCount >= t.min && viewCount <= t.max) || TIERS[0], [viewCount]);

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

  // Slider owns its own DOM state during drag (CSS custom property +
  // a ref'd text node) so dragging never re-renders the page — that
  // re-render was the actual cause of the "shakes / black screen while
  // dragging" bug, not the backdrop-filter blur itself. React state
  // (and therefore `pricing`, and every card driven by it) only
  // updates once, on release. See handover.md Task 6 for the full
  // diagnosis of the regression this reverts.
  const sliderRef = useRef<HTMLInputElement>(null);
  const sliderDisplayRef = useRef<HTMLSpanElement>(null);
  const sliderMin = 1000;
  const sliderMax = 500000;

  const handleSliderInput = useCallback((e: React.FormEvent<HTMLInputElement>) => {
    const val = Number((e.target as HTMLInputElement).value);
    const percent = ((val - sliderMin) / (sliderMax - sliderMin)) * 100;
    // DOM-only — no React state, no re-render, no effect on any card.
    sliderRef.current?.style.setProperty('--value-percent', `${percent}%`);
    if (sliderDisplayRef.current) sliderDisplayRef.current.textContent = formatNumber(val);
  }, []);

  // Only fires once, on release — this is the sole place viewCount
  // (and therefore pricing/the cards below) actually updates.
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setViewCount(Number(e.target.value));
  }, []);

  // Keep the ref-driven fill + display in sync whenever viewCount changes
  // from something other than dragging itself (mount, or restoring a
  // pending campaign draft after a guest funds their wallet and comes
  // back to this page).
  useEffect(() => {
    const percent = ((viewCount - sliderMin) / (sliderMax - sliderMin)) * 100;
    sliderRef.current?.style.setProperty('--value-percent', `${percent}%`);
    if (sliderDisplayRef.current) sliderDisplayRef.current.textContent = formatNumber(viewCount);
  }, [viewCount]);

  const handleGenreSelect = useCallback((genre: string) => { setSelectedGenre(genre); }, []);

  const handleToggleCountry = useCallback((code: string) => {
    setTargetCountries((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (!isAdmin && prev.length >= MAX_COUNTRIES_FREE) return prev;
      return [...prev, code];
    });
  }, [isAdmin]);

  const geographicTier = useMemo(() => {
    const n = targetCountries.length;
    if (n === 0) return 'local';
    if (n <= 2) return 'regional';
    if (n <= 5) return 'national';
    return 'global';
  }, [targetCountries]);

  const stashPendingCampaign = useCallback(() => {
    try {
      sessionStorage.setItem(PENDING_CAMPAIGN_KEY, JSON.stringify({
        sourceUrl: sourceUrl.trim(), viewCount, selectedGenre, targetCountries,
      }));
    } catch {}
  }, [sourceUrl, viewCount, selectedGenre, targetCountries]);

  // Guests only — a genuine guest has no account yet and needs to
  // supply an email so we know where to send the receipt/create the
  // account after payment. Still routes through the fund-wallet page's
  // form for that reason. Never used for an authenticated user — see
  // goStraightToCheckout below.
  const goFundWalletGuest = useCallback((reason: string) => {
    // totalCostCents is USD cents; this is USD dollars, NOT naira --
    // was misleadingly named `amountNaira` (it was always just cents/100
    // regardless of currency). Renamed rather than left to cause the
    // same confusion this caused in fund-wallet/page.tsx this session.
    const amountUsd = Math.ceil(pricing.totalCostCents / 100);
    stashPendingCampaign();
    router.push(`/fund-wallet?amount=${amountUsd}&redirect=${encodeURIComponent('/promote')}&reason=${reason}`);
  }, [pricing.totalCostCents, stashPendingCampaign, router]);

  // Authenticated users only (Task 28) — their email is already known
  // from the session, so there's nothing for them to fill in on the
  // fund-wallet page. Skips that page/form entirely and calls checkout
  // initialization directly. Used both for a zero-balance user
  // (functionally "new" for payment purposes, even if their account
  // itself isn't brand new — see the wallet-balance check in
  // handleSubmit below) and for a returning user whose createCampaign
  // attempt came back insufficient.
  const goStraightToCheckout = useCallback(async (reason: string) => {
    const amountUsd = Math.ceil(pricing.totalCostCents / 100);
    stashPendingCampaign();
    setIsSubmitting(true);
    const error = await initializeCheckout({
      amountUsd,
      redirectTo: '/promote',
      dccCurrency,
    });
    if (error) {
      // Only reached on failure — success navigates the browser away
      // inside initializeCheckout.
      setIsSubmitting(false);
      alert(error);
    }
  }, [pricing.totalCostCents, stashPendingCampaign, dccCurrency]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim()) { alert('Please enter a YouTube URL'); return; }

    // Guests genuinely have no account/wallet — collect email via the
    // fund-wallet form so we know where to send the receipt.
    if (!isAuthenticated || !user?.id) {
      await goFundWalletGuest('launch_campaign');
      return;
    }

    // An authenticated user with a wallet balance of exactly 0 has
    // provably never funded anything -- functionally "new" for payment
    // purposes, whether or not their account itself is old. Attempting
    // createCampaign here would just fail (and, per this session's
    // correction, that failure path isn't reliable for a zero/no-wallet
    // account either) -- skip straight to checkout instead of running
    // that doomed attempt first. A *returning* user with a real (if
    // insufficient) balance keeps going through createCampaign below,
    // since they may well already have enough.
    if (getWalletBalanceCents(user) === 0) {
      await goStraightToCheckout('new_authenticated_user');
      return;
    }

    setIsSubmitting(true);
    const result = await createCampaign({
      sourceUrl: sourceUrl.trim(), viewCount, artistId: user.id,
      genre: selectedGenre || undefined, geographicTier, targetCountries,
    }, isAdmin);
    setIsSubmitting(false);

    if (result.success) {
      setShowSuccess(true); setSourceUrl(''); setSelectedGenre(''); setTargetCountries([]);
      const updated = await getArtistCampaigns(user.id);
      setCampaigns(updated);
      setTimeout(() => setShowSuccess(false), 4000);
    } else if (/insufficient/i.test(result.error || '')) {
      await goStraightToCheckout('insufficient_funds');
    } else {
      alert(result.error || 'Failed to create campaign');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] scroll-smooth-mobile">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[10%] w-[50vw] h-[50vw] rounded-full bg-[#1db954]/5 blur-[120px] animate-ambient" />
        <div className="absolute top-[40%] -left-[10%] w-[40vw] h-[40vw] rounded-full bg-[#3d91f4]/5 blur-[100px] animate-ambient-slow" />
      </div>

      <div className="relative max-w-2xl mx-auto px-3 xs:px-4 py-5 xs:py-6 sm:py-10 space-y-6 xs:space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Promote Your Track</h1>
          <p className="text-sm text-[var(--muted-foreground)] max-w-md mx-auto">Paste a YouTube link, set your target, and let the seed network deliver organic streams.</p>
        </div>

        {showSuccess && (
          <div className="glass-strong rounded-xl p-4 flex items-center gap-3 border border-[#1db954]/30 bg-[#1db954]/5">
            <CheckCircle2 className="w-5 h-5 text-[#1db954] flex-shrink-0" />
            <div>
              <p className="font-semibold text-sm">Campaign Launched!</p>
              <p className="text-xs text-[var(--subtle-foreground)]">Your track is now in the seed network.</p>
            </div>
          </div>
        )}

        <div className="glass-strong rounded-2xl p-4 xs:p-5 sm:p-6 space-y-5 gpu-layer">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#1db954]/10 border border-[#1db954]/20 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-[#1db954]" />
              </div>
              <div>
                <h2 className="font-bold text-sm">New Campaign</h2>
                <p className="text-[11px] text-[var(--subtle-foreground)]">{currentTier.label} Tier</p>
              </div>
            </div>
            <span className={cn('text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border bg-gradient-to-r text-white', currentTier.color)}>
              {currentTier.label}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--muted-foreground)]">YouTube URL</label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--subtle-foreground)]" />
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm placeholder:text-[var(--subtle-foreground)] focus:border-[#1db954]/50 focus:ring-1 focus:ring-[#1db954]/20 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium mb-2 text-[var(--muted-foreground)]">Genre</label>
              <GenreChips selectedGenre={selectedGenre} onSelect={handleGenreSelect} />
            </div>

            <GeoTargetingSection
              genre={selectedGenre}
              homeCountryCode={homeCountryCode}
              selectedCodes={targetCountries}
              onToggle={handleToggleCountry}
              isAdmin={isAdmin}
            />

            {/* Target Views slider — native input, DOM-only updates while
                dragging (see handleSliderInput above). Isolated onto its
                own stacking context so drag interactions never force the
                surrounding glass cards to recomposite. */}
            <div style={{ isolation: 'isolate', contain: 'layout paint style' }}>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-[var(--muted-foreground)]">Target Views</label>
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#d4af37]/10 border border-[#d4af37]/25">
                  <TrendingUp className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span ref={sliderDisplayRef} className="text-lg font-bold tabular-nums text-[#f4e4bc]">
                    {formatNumber(viewCount)}
                  </span>
                </div>
              </div>
              <input
                ref={sliderRef}
                type="range"
                min={sliderMin}
                max={sliderMax}
                step={1000}
                value={viewCount}
                onInput={handleSliderInput}
                onChange={handleSliderChange}
                className="w-full slider-gold"
                style={{ '--value-percent': `${((viewCount - sliderMin) / (sliderMax - sliderMin)) * 100}%` } as React.CSSProperties}
                aria-label="Target views"
              />
              <div className="flex justify-between text-[10px] font-medium uppercase tracking-wider text-[var(--subtle-foreground)] mt-2">
                <span>1K</span>
                <span>100K</span>
                <span>250K</span>
                <span>500K</span>
              </div>
            </div>

            <DurationSlotsGrid selectedSlotId={pricing.durationSlot.id} />
            <SelectedCountriesStack codes={targetCountries} />

            <PricingBreakdown pricing={pricing} topGeo={topGeo} targetedGeo={topTargetedGeo} targetedCountries={targetCountries} localCurrency={localCurrency} />

            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20 gpu-layer">
              {isSubmitting ? <><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Creating campaign...</>
                : <><Rocket className="w-5 h-5" /><span className="truncate">{isAdmin ? 'Launch Campaign' : `Launch Campaign — ${formatCents(pricing.totalCostCents)}`}</span></>}
            </button>
          </form>
        </div>

        {campaigns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold">Your Campaigns</h2>
            <div className="space-y-3">
              {campaigns.map((campaign) => <CampaignCard key={campaign.id} campaign={campaign} />)}
            </div>
          </div>
        )}

        <PublicAnalyticsShowcase />

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
