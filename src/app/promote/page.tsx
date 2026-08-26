'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/auth/useAuth';
import { createCampaign, getArtistCampaigns } from '@/services/campaign/campaign.service';
import { calculatePricing, formatCents, formatNumber, DURATION_SLOTS } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { 
  Rocket, Link2, TrendingUp, Clock, DollarSign, 
  ShieldCheck, Zap, ChevronRight, Play, PauseCircle,
  BarChart3, Globe, Music, CheckCircle2, Sparkles
} from 'lucide-react';

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

export default function PromotePage() {
  const { user, isAuthenticated } = useAuth();
  const [viewCount, setViewCount] = useState(5000);
  const [sourceUrl, setSourceUrl] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const pricing = calculatePricing(viewCount);
  const currentTier = TIERS.find(t => viewCount >= t.min && viewCount <= t.max) || TIERS[0];

  useEffect(() => {
    if (!user?.id) return;
    getArtistCampaigns(user.id).then(setCampaigns);
  }, [user?.id]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setViewCount(Number(e.target.value));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAuthenticated || !user?.id) {
      alert('Please sign in to create a campaign');
      return;
    }
    if (!sourceUrl.trim()) {
      alert('Please enter a YouTube URL');
      return;
    }

    setIsSubmitting(true);
    const result = await createCampaign({
      sourceUrl: sourceUrl.trim(),
      viewCount,
      artistId: user.id,
    });
    setIsSubmitting(false);

    if (result.success) {
      setShowSuccess(true);
      setSourceUrl('');
      setSelectedGenre('');
      const updated = await getArtistCampaigns(user.id);
      setCampaigns(updated);
      setTimeout(() => setShowSuccess(false), 4000);
    } else {
      alert(result.error || 'Failed to create campaign');
    }
  };

  const getStageColor = (stage: string) => {
    switch (stage) {
      case 'planting': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'germination': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
      case 'root_system': return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
      case 'branching': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'full_bloom': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      case 'completed': return 'text-[var(--subtle-foreground)] bg-[var(--subtle-foreground)]/10 border-[var(--subtle-foreground)]/20';
      default: return 'text-[var(--subtle-foreground)] bg-[var(--subtle-foreground)]/10 border-[var(--subtle-foreground)]/20';
    }
  };

  const getStageLabel = (stage: string) => {
    const labels: Record<string, string> = {
      planting: 'Planting',
      germination: 'Germination',
      root_system: 'Root System',
      branching: 'Branching',
      full_bloom: 'Full Bloom',
      completed: 'Completed',
    };
    return labels[stage] || stage;
  };

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      {/* Ambient background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-[#1db954]/4 rounded-full blur-3xl animate-ambient" />
        <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-[#3d91f4]/4 rounded-full blur-3xl animate-ambient-slow" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-[#a855f7]/3 rounded-full blur-3xl animate-ambient-fast" />
      </div>

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Promote Your Track</h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">Paste your YouTube link. We handle the rest.</p>
        </div>

        {/* Success toast */}
        {showSuccess && (
          <div className="fixed top-20 right-4 z-50 glass-strong border-[#1db954]/30 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-2 animate-in slide-in-from-right">
            <CheckCircle2 className="w-5 h-5 text-[#1db954]" />
            <span className="font-semibold text-sm">Campaign created successfully!</span>
          </div>
        )}

        {/* Main Form Card — Glass */}
        <div className="glass-strong rounded-2xl overflow-hidden">
          {/* Tier badge */}
          <div className={cn(
            'px-5 py-2.5 text-xs font-bold uppercase tracking-wider',
            'bg-gradient-to-r', currentTier.color,
            'text-white shadow-lg'
          )}>
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              {currentTier.label} Tier
            </div>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-6">
            {/* YouTube URL */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--muted-foreground)]">YouTube URL</label>
              <div className="relative">
                <Link2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--subtle-foreground)]" />
                <input
                  type="url"
                  placeholder="https://youtube.com/watch?v=..."
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 rounded-xl glass-input text-sm text-white placeholder:text-[var(--subtle-foreground)]"
                  required
                />
              </div>
            </div>

            {/* Genre */}
            <div>
              <label className="block text-sm font-medium mb-2 text-[var(--muted-foreground)]">Genre</label>
              <div className="flex flex-wrap gap-2">
                {GENRES.map((genre) => (
                  <button
                    key={genre}
                    type="button"
                    onClick={() => setSelectedGenre(genre)}
                    className={cn(
                      'px-3.5 py-1.5 rounded-full text-xs font-medium transition-all',
                      selectedGenre === genre
                        ? 'bg-[#1db954] text-black shadow-lg shadow-[#1db954]/20'
                        : 'glass-card text-[var(--muted-foreground)]'
                    )}
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>

            {/* View Count Slider */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-[var(--muted-foreground)]">Target Views</label>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#1db954]" />
                  <span className="text-xl font-bold">{formatNumber(viewCount)}</span>
                </div>
              </div>
              <input
                type="range"
                min="1000"
                max="500000"
                step="1000"
                value={viewCount}
                onChange={handleSliderChange}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-[var(--subtle-foreground)] mt-1.5">
                <span>1K</span>
                <span>100K</span>
                <span>250K</span>
                <span>500K</span>
              </div>
            </div>

            {/* Duration Slot Display (auto-calculated, not selectable) */}
            <div className="glass-card rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-[var(--muted-foreground)]">Campaign Duration</span>
                <span className="text-xs text-[var(--subtle-foreground)]">Auto-calculated</span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {DURATION_SLOTS.map((slot) => {
                  const isSelected = pricing.durationSlot.id === slot.id;
                  return (
                    <div
                      key={slot.id}
                      className={cn(
                        'text-center p-2.5 rounded-xl border transition-all',
                        isSelected
                          ? 'bg-[#1db954]/10 border-[#1db954]/30 text-[#1db954]'
                          : 'glass-card border-white/5 text-[var(--subtle-foreground)]'
                      )}
                    >
                      <p className="text-xs font-bold">{slot.label}</p>
                      <p className="text-[10px] mt-0.5">{slot.days}d</p>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-[var(--subtle-foreground)] mt-2 text-center">
                Based on {formatNumber(pricing.dailyDripRate)} views/day drip rate
              </p>
            </div>

            {/* Pricing Breakdown — Glass */}
            <div className="glass-card rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--muted-foreground)]">Duration</span>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-[#3d91f4]" />
                  <span className="text-sm font-semibold">{pricing.durationSlot.label}</span>
                  <span className="text-xs text-[var(--subtle-foreground)]">({pricing.durationSlot.days} days)</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--muted-foreground)]">Daily Drip</span>
                <span className="text-sm font-semibold">{formatNumber(pricing.dailyDripRate)} views/day</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--muted-foreground)]">Cost per 1K views</span>
                <span className="text-sm font-semibold">{formatCents(Math.round(pricing.subtotalCents / (viewCount / 1000)))}</span>
              </div>
              {pricing.savingsPercent > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--muted-foreground)]">Volume savings</span>
                  <span className="text-sm font-semibold text-[#1db954]">-{pricing.savingsPercent}%</span>
                </div>
              )}
              <div className="h-px bg-white/5" />
              <div className="flex items-center justify-between">
                <span className="text-sm text-[var(--muted-foreground)]">Platform fee (15%)</span>
                <span className="text-sm">{formatCents(pricing.platformFeesCents)}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-base font-bold">Total</span>
                <span className="text-2xl font-bold text-[#1db954]">{formatCents(pricing.totalCostCents)}</span>
              </div>
            </div>

            {/* Refund policy */}
            <div className="flex items-start gap-2 text-xs text-[var(--subtle-foreground)]">
              <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0 text-[#1db954]/50" />
              <p>You only pay for delivered views. If we fall short, the difference is refunded to your wallet automatically.</p>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3.5 rounded-xl bg-[#1db954] text-black font-semibold hover:bg-[#1ed760] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-[#1db954]/20"
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  Creating campaign...
                </>
              ) : (
                <>
                  <Rocket className="w-5 h-5" />
                  Launch Campaign — {formatCents(pricing.totalCostCents)}
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
                <div 
                  key={campaign.id} 
                  className="glass-card rounded-xl p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl glass-card flex items-center justify-center flex-shrink-0">
                        <Music className="w-5 h-5 text-[var(--subtle-foreground)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{campaign.source_url}</p>
                        <p className="text-xs text-[var(--subtle-foreground)]">
                          {formatNumber(campaign.total_streams)} streams · {formatCents(campaign.spent_cents)} spent
                        </p>
                      </div>
                    </div>
                    <span className={cn(
                      'px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 border',
                      getStageColor(campaign.current_stage)
                    )}>
                      {getStageLabel(campaign.current_stage)}
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-[var(--subtle-foreground)]">Budget used</span>
                      <span className="text-[var(--muted-foreground)]">
                        {formatCents(campaign.spent_cents)} / {formatCents(campaign.total_budget_cents)}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-[#1db954] to-[#3d91f4] rounded-full transition-all"
                        style={{ width: `${Math.min((campaign.spent_cents / campaign.total_budget_cents) * 100, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 mt-3 text-xs text-[var(--subtle-foreground)]">
                    <div className="flex items-center gap-1">
                      <BarChart3 className="w-3.5 h-3.5" />
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
              ))}
            </div>
          </div>
        )}

        {/* How it works — Glass */}
        <div className="glass-strong rounded-2xl p-5 sm:p-6">
          <h3 className="font-bold mb-4">How It Works</h3>
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { step: 1, title: 'Paste URL', desc: 'Drop your YouTube link', icon: Link2 },
              { step: 2, title: 'Set Target', desc: 'Slide to choose views', icon: TrendingUp },
              { step: 3, title: 'We Drip', desc: 'Organic delivery over time', icon: Clock },
              { step: 4, title: 'Track Growth', desc: 'Real-time analytics', icon: BarChart3 },
            ].map((item) => (
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
