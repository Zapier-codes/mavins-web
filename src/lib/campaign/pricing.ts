// src/lib/campaign/pricing.ts
/**
 * Playlist Push Pricing Engine
 * 
 * Industry-standard pricing for music promotion across platforms.
 * Views are delivered via drip feed over calculated duration.
 * User pays only for delivered views. Shortfall = refund.
 */

export interface PricingTier {
  minViews: number;
  maxViews: number;
  pricePer1K: number; // in cents
  label: string;
  description: string;
}

// Realistic playlist push pricing (per 1,000 views/streams)
// Based on industry averages: $0.80-$3.50 per 1K depending on volume
export const PRICING_TIERS: PricingTier[] = [
  { minViews: 1000, maxViews: 10000, pricePer1K: 350, label: 'Starter', description: 'Entry-level push' },
  { minViews: 10001, maxViews: 50000, pricePer1K: 280, label: 'Growth', description: 'Building momentum' },
  { minViews: 50001, maxViews: 100000, pricePer1K: 220, label: 'Scale', description: 'Serious traction' },
  { minViews: 100001, maxViews: 500000, pricePer1K: 180, label: 'Pro', description: 'Chart contender' },
  { minViews: 500001, maxViews: 1000000, pricePer1K: 150, label: 'Enterprise', description: 'Viral potential' },
  { minViews: 1000001, maxViews: 10000000, pricePer1K: 120, label: 'Legend', description: 'Global domination' },
];

/**
 * Duration slots are FIXED. The user cannot choose weeks directly.
 * The system auto-assigns the shortest slot that can accommodate
 * the requested views at the max daily drip rate.
 */
export interface DurationSlot {
  id: string;
  label: string;
  weeks: number;
  days: number;
  maxDailyDrip: number;
  maxViews: number;
  description: string;
  badge: string;
}

export const DURATION_SLOTS: DurationSlot[] = [
  { id: '1w', label: '1 Week', weeks: 1, days: 7, maxDailyDrip: 1500, maxViews: 10500, description: 'Fast burst campaign', badge: 'Quick' },
  { id: '2w', label: '2 Weeks', weeks: 2, days: 14, maxDailyDrip: 1500, maxViews: 21000, description: 'Steady growth curve', badge: 'Standard' },
  { id: '4w', label: '1 Month', weeks: 4, days: 28, maxDailyDrip: 1500, maxViews: 42000, description: 'Natural organic feel', badge: 'Popular' },
  { id: '16w', label: '4 Months', weeks: 16, days: 112, maxDailyDrip: 1500, maxViews: 168000, description: 'Sustained long-term push', badge: 'Serious' },
  { id: '32w', label: '8 Months', weeks: 32, days: 224, maxDailyDrip: 1500, maxViews: 336000, description: 'Maximum reach campaign', badge: 'Legend' },
];

export interface CampaignPricing {
  platformFeePercent: number;
  viewCount: number;
  durationSlot: DurationSlot;
  totalCostCents: number;
  costPerViewCents: number;
  dailyDripRate: number;
  tierLabel: string;
  savingsPercent: number;
  platformFeesCents: number;
  subtotalCents: number;
}

/**
 * Alias for CampaignPricing — some call sites (e.g.
 * campaign.service.ts) import this name specifically.
 * Kept as a type alias rather than renaming CampaignPricing itself
 * to avoid touching every other existing call site.
 */
export type PricingResult = CampaignPricing;

const PLATFORM_FEE_PERCENT = 15; // 15% platform fee

export function calculatePricing(viewCount: number): CampaignPricing {
  const clampedViews = Math.max(1000, Math.min(viewCount, 5000000));

  // Find pricing tier
  const tier = PRICING_TIERS.find(t => clampedViews >= t.minViews && clampedViews <= t.maxViews) 
    || PRICING_TIERS[PRICING_TIERS.length - 1];

  // Base cost (what we pay Fresh Connect)
  const costPerView = tier.pricePer1K / 1000;
  const subtotalCents = Math.round(clampedViews * costPerView);

  // Platform fee (our margin)
  const platformFeesCents = Math.round(subtotalCents * (PLATFORM_FEE_PERCENT / 100));
  const totalCostCents = subtotalCents + platformFeesCents;

  // Calculate required days at max drip rate
  const requiredDays = Math.ceil(clampedViews / 1500); // 1500 max daily drip

  // Find the shortest duration slot that fits
  const durationSlot = DURATION_SLOTS.find(slot => slot.days >= requiredDays) 
    || DURATION_SLOTS[DURATION_SLOTS.length - 1];

  // Actual daily drip (spread evenly)
  const dailyDripRate = Math.round(clampedViews / durationSlot.days);

  // Calculate savings vs starter tier
  const baseRate = PRICING_TIERS[0].pricePer1K / 1000;
  const baseCost = clampedViews * baseRate;
  const savingsPercent = Math.round(((baseCost - subtotalCents) / baseCost) * 100);

  return {
    viewCount: clampedViews,
    durationSlot,
    totalCostCents,
    costPerViewCents: Math.round((totalCostCents / clampedViews) * 100) / 100,
    dailyDripRate,
    tierLabel: tier.label,
    savingsPercent: Math.max(0, savingsPercent),
    platformFeesCents,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    subtotalCents,
  };
}

/**
 * Calculate refund amount if delivered views are less than target.
 * Refund = (shortfall views) x (cost per view)
 */
export function calculateRefund(targetViews: number, deliveredViews: number, totalCostCents: number): number {
  if (deliveredViews >= targetViews) return 0;
  const shortfall = targetViews - deliveredViews;
  const costPerView = totalCostCents / targetViews;
  return Math.round(shortfall * costPerView);
}

/**
 * Calculate actual charge after delivery.
 * Charge = (delivered views / target views) x total cost
 * Never more than total cost. Refund = difference.
 */
export function calculateActualCharge(targetViews: number, deliveredViews: number, totalCostCents: number): number {
  const ratio = Math.min(deliveredViews / targetViews, 1);
  return Math.round(totalCostCents * ratio);
}

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString('en-US');
}

export function formatCompactNumber(num: number): string {
  return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(num);
}

export function getDurationLabel(days: number): string {
  if (days < 7) return `${days} days`;
  if (days === 7) return '1 week';
  if (days < 30) return `${Math.round(days / 7)} weeks`;
  if (days === 30) return '1 month';
  if (days < 365) return `${Math.round(days / 30)} months`;
  return `${Math.round(days / 365)} years`;
}
