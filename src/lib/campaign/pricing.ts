// src/lib/campaign/pricing.ts
/**
 * Playlist Push Pricing Engine
 * 
 * Industry-standard pricing for music promotion across platforms.
 * Views are delivered via drip feed over calculated duration.
 * User pays only for delivered views. Shortfall = refund.
 *
 * Task 45 Part 1 (handover.md) — refactored into a pure,
 * data-parameterized pipeline. `calculatePricing()` no longer reads
 * PRICING_TIERS/DURATION_SLOTS as module globals; it takes a
 * `PricingReferenceData` argument instead. This is the prerequisite
 * for the same calculation logic being callable from three different
 * contexts later (server route, Edge Function, client store) against
 * whichever copy of the reference data each one has — one engine,
 * multiple data sources, not three implementations that can drift.
 * PRICING_TIERS/DURATION_SLOTS themselves are UNCHANGED and still
 * exported here (Part 4 is what deletes them, once Parts 2/3 give
 * every call site something else to pass instead) — every existing
 * call site in this session's own grep
 * (initialize-campaign/route.ts, create/route.ts, promote/page.tsx;
 * campaign.service.ts imports calculatePricing but was found this
 * session to never actually call it — a stale import, not a real call
 * site, left as-is) now passes `{ tiers: PRICING_TIERS, durationSlots:
 * DURATION_SLOTS }` explicitly at the call site instead of the
 * function reading them as globals. Zero behavior change — verified
 * via a throwaway script (this project's own convention: write it,
 * run it, delete it, don't commit it) comparing every tier-boundary
 * view count's full output, byte-for-byte, against the pre-refactor
 * function.
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

// Task 45 Part 1 — mirrors migration 010's `pricing_tiers`/
// `duration_slots` table shapes exactly, so a later Supabase read
// (Part 2/3) maps onto this with no reshaping logic needed.
export interface PricingReferenceData {
  tiers: PricingTier[];
  durationSlots: DurationSlot[];
}

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

const PLATFORM_FEE_PERCENT = 10; // 10% platform fee on campaigns (NOT 15 — see
// handover.md Task 35's "second correction" note: an earlier session
// wrongly "corrected" this from 10 back up to 15, citing a product-owner
// confirmation that turned out to be stale/incorrect. The product owner
// re-confirmed directly, a second time, that 10% campaign / 5% deposit
// (15% only when summed across both, never one flat rate) is correct.
// Don't change this back to 15 without a fresh, explicit product-owner
// confirmation referencing this exact comment.

// ==================================================
// Task 45 Part 1 — the modifier-pipeline extension point.
// ==================================================
// This is what actually answers "modular... fits right in without
// affecting the code," not just the data-parameterization above.
// calculatePricing()'s five sequential concerns (clamp -> tier lookup
// -> subtotal -> platform fee -> duration/drip assignment -> savings)
// each become their own named, pure step function. calculatePricing()
// itself becomes a thin runner that folds PRICING_PIPELINE over an
// initial context -- no arithmetic lives in calculatePricing() itself
// anymore. Adding a genuinely new kind of rule later (a loyalty
// discount, a first-campaign promo, a country-specific surcharge --
// none of these exist today, this is about the shape being ready for
// whenever one does) means writing one new step function and inserting
// it into PRICING_PIPELINE, without touching any existing step. See
// the worked example (EXAMPLE_firstTimeDiscountStep, below the
// pipeline definition, deliberately NOT wired into PRICING_PIPELINE)
// for proof this actually holds, not just an assertion.
//
// Fields are typed optional on PricingContext (except the two inputs
// every step can already rely on) because each step only fills in
// what it's responsible for -- by the time the full pipeline has run,
// every field is guaranteed populated, and the non-null assertions
// live in exactly one place (calculatePricing()'s own return
// statement, assembling the public CampaignPricing shape) rather than
// scattered through every step.
interface PricingContext {
  referenceData: PricingReferenceData;
  requestedViewCount: number;
  clampedViews?: number;
  tier?: PricingTier;
  costPerView?: number;
  subtotalCents?: number;
  platformFeesCents?: number;
  totalCostCents?: number;
  requiredDays?: number;
  durationSlot?: DurationSlot;
  dailyDripRate?: number;
  savingsPercent?: number;
}

type PricingStep = (ctx: PricingContext) => PricingContext;

// Step 1/6 -- clamp the requested view count.
// Preserves the exact existing clamp found this session, deliberately
// NOT fixed here: Math.min(viewCount, 5000000) means the seeded
// "Legend" tier (max_views: 10000000 in migration 010, copied verbatim
// from PRICING_TIERS' own array) is unreachable today -- a real,
// previously-undocumented-until-this-session inconsistency. Carried
// through faithfully so Part 4 (which deletes the array this quirk
// lives in today) doesn't accidentally silently fix it as an unasked
// drive-by change.
const clampViewsStep: PricingStep = (ctx) => ({
  ...ctx,
  clampedViews: Math.max(1000, Math.min(ctx.requestedViewCount, 5000000)),
});

// Step 2/6 -- find the matching pricing tier.
const tierLookupStep: PricingStep = (ctx) => {
  const clampedViews = ctx.clampedViews!;
  const tier =
    ctx.referenceData.tiers.find((t) => clampedViews >= t.minViews && clampedViews <= t.maxViews) ||
    ctx.referenceData.tiers[ctx.referenceData.tiers.length - 1];
  return { ...ctx, tier };
};

// Step 3/6 -- base cost (what we pay Fresh Connect).
const subtotalStep: PricingStep = (ctx) => {
  const costPerView = ctx.tier!.pricePer1K / 1000;
  const subtotalCents = Math.round(ctx.clampedViews! * costPerView);
  return { ...ctx, costPerView, subtotalCents };
};

// Step 4/6 -- platform fee (our margin).
const platformFeeStep: PricingStep = (ctx) => {
  const platformFeesCents = Math.round(ctx.subtotalCents! * (PLATFORM_FEE_PERCENT / 100));
  const totalCostCents = ctx.subtotalCents! + platformFeesCents;
  return { ...ctx, platformFeesCents, totalCostCents };
};

// Step 5/6 -- required days at max drip rate, and the shortest
// duration slot that fits.
const durationAssignmentStep: PricingStep = (ctx) => {
  const requiredDays = Math.ceil(ctx.clampedViews! / 1500); // 1500 max daily drip
  const durationSlot =
    ctx.referenceData.durationSlots.find((slot) => slot.days >= requiredDays) ||
    ctx.referenceData.durationSlots[ctx.referenceData.durationSlots.length - 1];
  const dailyDripRate = Math.round(ctx.clampedViews! / durationSlot.days);
  return { ...ctx, requiredDays, durationSlot, dailyDripRate };
};

// Step 6/6 -- savings vs the starter tier.
const savingsStep: PricingStep = (ctx) => {
  const baseRate = ctx.referenceData.tiers[0].pricePer1K / 1000;
  const baseCost = ctx.clampedViews! * baseRate;
  const savingsPercent = Math.max(0, Math.round(((baseCost - ctx.subtotalCents!) / baseCost) * 100));
  return { ...ctx, savingsPercent };
};

const PRICING_PIPELINE: PricingStep[] = [
  clampViewsStep,
  tierLookupStep,
  subtotalStep,
  platformFeeStep,
  durationAssignmentStep,
  savingsStep,
];

// ------------------------------------------------------------------
// Worked example proving the pipeline shape is genuinely modular --
// per Task 45 Part 1's own requirement: "this needs at least one
// worked-through example while designing it... confirm it can be
// added as a single new step with zero edits to the other [steps],
// before considering Part 1 actually done." Hypothetical only, NOT
// wired into PRICING_PIPELINE and NOT a real discount -- exists solely
// to demonstrate the shape. Notice it needs zero edits to
// clampViewsStep/tierLookupStep/subtotalStep/platformFeeStep/
// durationAssignmentStep/savingsStep above to slot in (it would go
// between subtotalStep and platformFeeStep, discounting the subtotal
// before the platform fee is computed on top of it) -- the actual
// demonstration that "fits right in without affecting the code" is
// real, not aspirational. Delete this comment/function together if a
// real first-time-buyer discount is ever built for real -- at that
// point this stops being a hypothetical and should become the real
// step, tested and wired into PRICING_PIPELINE properly.
const EXAMPLE_firstTimeDiscountStep: PricingStep = (ctx) => {
  const FIRST_TIME_DISCOUNT_PERCENT = 10;
  const discountedSubtotal = Math.round(ctx.subtotalCents! * (1 - FIRST_TIME_DISCOUNT_PERCENT / 100));
  return { ...ctx, subtotalCents: discountedSubtotal };
};
void EXAMPLE_firstTimeDiscountStep; // referenced only to avoid an unused-var lint error on this illustrative, deliberately-unwired example

export function calculatePricing(viewCount: number, referenceData: PricingReferenceData): CampaignPricing {
  const initialContext: PricingContext = { referenceData, requestedViewCount: viewCount };
  const ctx = PRICING_PIPELINE.reduce((c, step) => step(c), initialContext);

  return {
    viewCount: ctx.clampedViews!,
    durationSlot: ctx.durationSlot!,
    totalCostCents: ctx.totalCostCents!,
    costPerViewCents: Math.round((ctx.totalCostCents! / ctx.clampedViews!) * 100) / 100,
    dailyDripRate: ctx.dailyDripRate!,
    tierLabel: ctx.tier!.label,
    savingsPercent: ctx.savingsPercent!,
    platformFeesCents: ctx.platformFeesCents!,
    platformFeePercent: PLATFORM_FEE_PERCENT,
    subtotalCents: ctx.subtotalCents!,
  };
}

/**
 * Calculate refund amount if delivered views are less than target.
 * Refund = (shortfall views) x (cost per view)
 *
 * Task 45 Part 1 -- unlike calculatePricing(), this function never
 * imported PRICING_TIERS/DURATION_SLOTS in the first place (it only
 * takes already-computed numeric params), so there is no reference
 * data to parameterize here -- left unchanged.
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
 *
 * Task 45 Part 1 -- same as calculateRefund() above, unchanged: no
 * reference-data dependency existed here to parameterize.
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
