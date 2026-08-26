'use client';

import { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { createCampaign, getArtistCampaigns } from '@/services/campaign/campaign.service';
import { getPublicSeedStats } from '@/services/stats/publicStats.service';
import { detectUserGeo } from '@/services/geo/ipGeolocation.service';
import { calculatePricing, formatCents, formatNumber, DURATION_SLOTS } from '@/lib/campaign/pricing';
import { getRecommendedGeographies, scoreLabel } from '@/lib/campaign/geoAffinity';
import { cn } from '@/lib/utils/cn';
import { 
  Rocket, Link2, TrendingUp, Clock, DollarSign, 
  ShieldCheck, Zap, ChevronRight, Play, PauseCircle,
  BarChart3, Globe, Music, CheckCircle2, Sparkles, MapPin, Wand2
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

// Country → currency mapping for ipapi.co conversion
const COUNTRY_CURRENCY: Record<string, { code: string; symbol: string; rate: number }> = {
  NG: { code: 'NGN', symbol: '₦', rate: 1 },
  US: { code: 'USD', symbol: '$', rate: 0.00065 },
  GB: { code: 'GBP', symbol: '£', rate: 0.00051 },
  GH: { code: 'GHS', symbol: 'GH₵', rate: 0.0098 },
  KE: { code: 'KES', symbol: 'KSh', rate: 0.084 },
  ZA: { code: 'ZAR', symbol: 'R', rate: 0.012 },
  CA: { code: 'CAD', symbol: 'C$', rate: 0.00088 },
  AU: { code: 'AUD', symbol: 'A$', rate: 0.00098 },
  EU: { code: 'EUR', symbol: '€', rate: 0.00060 },
  IN: { code: 'INR', symbol: '₹', rate: 0.054 },
  PK: { code: 'PKR', symbol: '₨', rate: 0.18 },
  BD: { code: 'BDT', symbol: '৳', rate: 0.072 },
  ID: { code: 'IDR', symbol: 'Rp', rate: 10.2 },
  PH: { code: 'PHP', symbol: '₱', rate: 0.038 },
  MY: { code: 'MYR', symbol: 'RM', rate: 0.0030 },
  SG: { code: 'SGD', symbol: 'S$', rate: 0.00087 },
  AE: { code: 'AED', symbol: 'د.إ', rate: 0.0024 },
  SA: { code: 'SAR', symbol: '﷼', rate: 0.0024 },
  TR: { code: 'TRY', symbol: '₺', rate: 0.021 },
  BR: { code: 'BRL', symbol: 'R$', rate: 0.0033 },
  MX: { code: 'MXN', symbol: 'Mex$', rate: 0.011 },
};

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

const GenreChips = memo(function GenreChips({ selectedGenre, onSelect }: { selectedGenre: string; onSelect: (genre: string) => void }) {
  return (
    <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 gap-2">
      {GENRES.map((genre) => (
        <button key={genre} type="button" onClick={() => onSelect(genre)} className={cn(
          'w-full px-2 py-1.5 rounded-full text-xs font-medium text-center truncate transition-all active:scale-95',
          selectedGenre === genre ? 'bg-[#1db954] text-black shadow-lg shadow-[#1db954]/20' : 'chip-card text-[var(--muted-foreground)]'
        )}>{genre}</button>
      ))}
    </div>
  );
});

const GeoTargetingSection = memo(function GeoTargetingSection({ genre, homeCountryCode, selectedCodes, onToggle }: {
  genre: string; homeCountryCode: string | null; selectedCodes: string[]; onToggle: (code: string) => void;
}) {
  const ranked = useMemo(() => getRecommendedGeographies(genre || null, homeCountryCode), [genre, homeCountryCode]);
  const topCodes = useMemo(() => new Set(ranked.slice(0, 3).map((r) => r.code)), [ranked]);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-[var(--muted-foreground)]">Target Geography</label>
        {genre ? <span className="flex items-center gap-1 text-[10px] text-[var(--subtle-foreground)]"><Wand2 className="w-3 h-3" />Ranked for {genre}</span>
          : <span className="text-[10px] text-[var(--subtle-foreground)]">Pick a genre for tailored picks</span>}
      </div>
      <div className="grid grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 gap-2">
        {ranked.map((rec) => {
          const isSelected = selectedCodes.includes(rec.code);
          const isTop = topCodes.has(rec.code);
          const fit = scoreLabel(rec.score);
          return (
            <button key={rec.code} type="button" onClick={() => onToggle(rec.code)} className={cn(
              'relative text-left px-2.5 py-2 rounded-xl border transition-all active:scale-95',
              isSelected ? 'bg-[#1db954]/10 border-[#1db954]/40 text-[#1db954]' : 'chip-card border-white/5 text-[var(--muted-foreground)]'
            )}>
              {isTop && <span className="absolute -top-1.5 -right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold uppercase bg-[#1db954] text-black shadow">Top</span>}
              <div className="flex items-center gap-1.5"><span aria-hidden>{rec.flag}</span><span className="text-xs font-semibold truncate">{rec.country}</span></div>
              <div className="flex items-center gap-1 mt-1">
                <span className={cn('text-[9px] font-medium', fit.tone === 'strong' && 'text-[#1db954]', fit.tone === 'good' && 'text-[#3d91f4]', fit.tone === 'moderate' && 'text-amber-400', fit.tone === 'light' && 'text-[var(--subtle-foreground)]')}>{fit.label}</span>
                {rec.isHomeMarket && <span className="flex items-center gap-0.5 text-[9px] text-[var(--subtle-foreground)]"><MapPin className="w-2.5 h-2.5" />You</span>}
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--subtle-foreground)]">{selectedCodes.length > 0 ? `Targeting ${selectedCodes.length} ${selectedCodes.length === 1 ? 'market' : 'markets'}.` : 'No markets selected — views distributed network-wide.'}</p>
    </div>
  );
});

const DurationSlotsGrid = memo(function DurationSlotsGrid({ selectedSlotId }: { selectedSlotId: string }) {
  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Campaign Duration</span>
        <span className="text-xs text-[var(--subtle-foreground)]">Auto-calculated</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
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

const PricingBreakdown = memo(function PricingBreakdown({ pricing, topGeo, targetedGeo, localCurrency }: {
  pricing: ReturnType<typeof calculatePricing>;
  topGeo: { country: string; flag: string } | null;
  targetedGeo: { country: string; flag: string } | null;
  localCurrency: { code: string; symbol: string; rate: number } | null;
}) {
  const geo = targetedGeo || topGeo;
  const hourlyRate = Math.round(pricing.dailyDripRate / 24);
  const localTotal = localCurrency ? Math.round(pricing.totalCostCents * localCurrency.rate) : null;

  return (
    <div className="glass-card rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Pricing Breakdown</span>
        {pricing.savingsPercent > 0 && <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#1db954]/10 text-[#1db954] border border-[#1db954]/20">Save {pricing.savingsPercent}%</span>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Subtotal</p><p className="text-sm font-semibold">{formatCents(pricing.subtotalCents)}</p></div>
        <div className="space-y-1"><p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Platform Fee</p><p className="text-sm font-semibold">{formatCents(pricing.platformFeesCents)}</p></div>
        <div className="space-y-1"><p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Est. Hourly Pace</p><p className="text-sm font-semibold flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-[#1db954]" />{formatNumber(hourlyRate)}/hr</p></div>
        <div className="space-y-1"><p className="text-[10px] text-[var(--subtle-foreground)] uppercase tracking-wider">Primary Market</p><p className="text-sm font-semibold flex items-center gap-1"><Globe className="w-3.5 h-3.5 text-[#3d91f4]" />{geo ? `${geo.flag} ${geo.country}` : 'Network-wide'}</p></div>
      </div>
      <div className="pt-2 border-t border-[var(--glass-border)] flex items-center justify-between">
        <span className="text-sm font-medium text-[var(--muted-foreground)]">Total</span>
        <div className="text-right">
          <span className="text-xl font-bold">{formatCents(pricing.totalCostCents)}</span>
          {localCurrency && localTotal !== null && (
            <p className="text-xs text-[var(--subtle-foreground)] mt-0.5">≈ {localCurrency.symbol}{localTotal.toLocaleString()} {localCurrency.code}</p>
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
      <div className="flex items-center justify-between text-[11px] text-[var(--subtle-foreground)]">
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
  const [localCurrency, setLocalCurrency] = useState<{ code: string; symbol: string; rate: number } | null>(null);

  // Slider ref for CSS-only fill updates (no React re-render on drag)
  const sliderRef = useRef<HTMLInputElement>(null);
  const sliderDisplayRef = useRef<HTMLSpanElement>(null);

  // Detect local currency ONCE on mount (not on every render)
  useEffect(() => {
    let cancelled = false;
    detectUserGeo().then((geo) => {
      if (cancelled || !geo) return;
      const currency = COUNTRY_CURRENCY[geo.countryCode];
      if (currency) setLocalCurrency(currency);
      setHomeCountryCode(geo.countryCode);
    });
    return () => { cancelled = true; };
  }, []);

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

  // ── CRITICAL FIX: Slider uses ref-based CSS updates, NOT React state, during drag ──
  // This prevents the entire page from re-rendering (and glitching/black-screening) on every drag tick
  const handleSliderInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    // Update CSS custom property for gold fill gradient — DOM only, no React re-render
    if (sliderRef.current) {
      const percent = ((val - 1000) / (500000 - 1000)) * 100;
      sliderRef.current.style.setProperty('--value-percent', `${percent}%`);
    }
    // Update display number — DOM only, no React re-render
    if (sliderDisplayRef.current) {
      sliderDisplayRef.current.textContent = formatNumber(val);
    }
  }, []);

  // Only update React state when user releases the slider (onChange fires on release)
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setViewCount(val);
  }, []);

  const handleGenreSelect = useCallback((genre: string) => { setSelectedGenre(genre); }, []);

  const handleToggleCountry = useCallback((code: string) => {
    setTargetCountries((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  }, []);

  const geographicTier = useMemo(() => {
    const n = targetCountries.length;
    if (n === 0) return 'local';
    if (n <= 2) return 'regional';
    if (n <= 5) return 'national';
    return 'global';
  }, [targetCountries]);

  const goFundWallet = useCallback((reason: string) => {
    const amountNaira = Math.ceil(pricing.totalCostCents / 100);
    try {
      sessionStorage.setItem(PENDING_CAMPAIGN_KEY, JSON.stringify({
        sourceUrl: sourceUrl.trim(), viewCount, selectedGenre, targetCountries,
      }));
    } catch {}
    router.push(`/fund-wallet?amount=${amountNaira}&redirect=${encodeURIComponent('/promote')}&reason=${reason}`);
  }, [pricing.totalCostCents, sourceUrl, viewCount, selectedGenre, targetCountries, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceUrl.trim()) { alert('Please enter a YouTube URL'); return; }
    if (!isAuthenticated || !user?.id) { goFundWallet('launch_campaign'); return; }

    setIsSubmitting(true);
    const result = await createCampaign({
      sourceUrl: sourceUrl.trim(), viewCount, artistId: user.id,
      genre: selectedGenre || undefined, geographicTier, targetCountries,
    });
    setIsSubmitting(false);

    if (result.success) {
      setShowSuccess(true); setSourceUrl(''); setSelectedGenre(''); setTargetCountries([]);
      const updated = await getArtistCampaigns(user.id);
      setCampaigns(updated);
      setTimeout(() => setShowSuccess(false), 4000);
    } else if (/insufficient/i.test(result.error || '')) {
      goFundWallet('insufficient_funds');
    } else {
      alert(result.error || 'Failed to create campaign');
    }
  };

  const sliderPercent = ((viewCount - 1000) / (500000 - 1000)) * 100;

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] scroll-smooth-mobile">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="ambient-blob absolute -top-24 -right-24 w-[280px] h-[280px] sm:-top-40 sm:-right-40 sm:w-[500px] sm:h-[500px] bg-[#1db954]/4 rounded-full blur-2xl sm:blur-3xl animate-ambient will-change-transform" />
        <div className="ambient-blob absolute -bottom-24 -left-24 w-[280px] h-[280px] sm:-bottom-40 sm:-left-40 sm:w-[500px] sm:h-[500px] bg-[#3d91f4]/4 rounded-full blur-2xl sm:blur-3xl animate-ambient-slow will-change-transform" />
        <div className="ambient-blob hidden sm:block absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#a855f7]/3 rounded-full blur-3xl animate-ambient-fast will-change-transform" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Promote Your Track</h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">Paste your YouTube link. We handle the rest.</p>
        </div>

        {showSuccess && (
          <div className="fixed top-20 right-4 left-4 sm:left-auto z-50 glass-strong border-[#1db954]/30 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 slide-in-from-right">
            <CheckCircle2 className="w-5 h-5 text-[#1db954] flex-shrink-0" />
            <span className="font-semibold text-sm">Campaign created successfully!</span>
          </div>
        )}

        <div className="glass-strong rounded-2xl overflow-hidden gpu-layer">
          <div className={cn('px-5 py-2.5 text-xs font-bold uppercase tracking-wider bg-gradient-to-r', currentTier.color, 'text-white shadow-lg')}>
            <div className="flex items-center gap-2"><Sparkles className="w-3.5 h-3.5 flex-shrink-0" /><span className="truncate">{currentTier.label} Tier</span></div>
          </div>

          <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6">
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--muted-foreground)]">YouTube URL</label>
              <div className="relative">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--subtle-foreground)]" />
                <input type="url" inputMode="url" placeholder="https://youtube.com/watch?v=..." value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} className="w-full pl-11 pr-4 py-3.5 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]" required />
              </div>
              {sourceUrl.trim() && !selectedGenre && <p className="text-[11px] text-[var(--subtle-foreground)] mt-1.5">Pick your genre below and we'll rank the best-fit markets for this track.</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--muted-foreground)]">Genre</label>
              <GenreChips selectedGenre={selectedGenre} onSelect={handleGenreSelect} />
            </div>

            <GeoTargetingSection genre={selectedGenre} homeCountryCode={homeCountryCode} selectedCodes={targetCountries} onToggle={handleToggleCountry} />

            {/* ── FUTURISTIC GOLD SLIDER — CSS-only fill, no React re-render on drag ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-[var(--muted-foreground)]">Target Views</label>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#1db954]" />
                  {/* ref-based display — updated via DOM, not React state */}
                  <span ref={sliderDisplayRef} className="text-xl font-bold tabular-nums">{formatNumber(viewCount)}</span>
                </div>
              </div>

              <div className="relative py-3 px-1" style={{ touchAction: 'pan-y' }}>
                <input
                  ref={sliderRef}
                  type="range"
                  min="1000"
                  max="500000"
                  step="1000"
                  value={viewCount}
                  onInput={handleSliderInput}
                  onChange={handleSliderChange}
                  className="w-full"
                  style={{ '--value-percent': `${sliderPercent}%` } as React.CSSProperties}
                />
              </div>

              <div className="flex justify-between text-xs text-[var(--subtle-foreground)]">
                <span>1K</span>
                <span>100K</span>
                <span>250K</span>
                <span>500K</span>
              </div>
            </div>

            <DurationSlotsGrid selectedSlotId={pricing.durationSlot.id} />
            <p className="text-xs text-[var(--subtle-foreground)] -mt-3 text-center">Based on {formatNumber(pricing.dailyDripRate)} views/day drip rate</p>

            <PricingBreakdown pricing={pricing} topGeo={topGeo} targetedGeo={topTargetedGeo} localCurrency={localCurrency} />

            <button type="submit" disabled={isSubmitting} className="w-full py-3.5 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20 gpu-layer">
              {isSubmitting ? <><div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />Creating campaign...</>
                : <><Rocket className="w-5 h-5" /><span className="truncate">Launch Campaign — {formatCents(pricing.totalCostCents)}</span></>}
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
