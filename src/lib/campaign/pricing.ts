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
 *
 * Task 45 Part 4 (stage 2) — PRICING_TIERS/DURATION_SLOTS themselves
 * are DELETED as of this session. All three real call sites now pass
 * `PricingReferenceData` sourced elsewhere: `create/route.ts` and
 * `initialize-campaign/route.ts` read it server-side via
 * `referenceDataCache.ts` (Part 3); `promote/page.tsx` reads it
 * client-side via `useReferenceData()` (Part 2, wired in Part 4 stage
 * 1). `initialize/route.ts` still doesn't call this function at all
 * (a flat wallet top-up amount, price-irrelevant). The seed values
 * these two arrays used to hold now live in
 * `supabase_migration_010_static_data_tables.sql`'s `pricing_tiers`/
 * `duration_slots` tables instead — this file is genuinely arithmetic
 * only now, no longer also the data source.
 */


export interface PricingTier {
  minViews: number;
  maxViews: number;
  pricePer1K: number; // in cents
  label: string;
  description: string;
}

// Realistic playlist push pricing (per 1,000 views/streams):
// $0.80-$3.50 per 1K depending on volume. Task 45 Part 4 (stage 2) —
// the hardcoded PRICING_TIERS array that used to live here is
// deleted; these values now live as seed data in
// supabase_migration_010_static_data_tables.sql's `pricing_tiers`
// table (server-side reads via referenceDataCache.ts, client-side via
// useReferenceData()) — see this file's header comment.

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

// Task 45 Part 4 (stage 2) — the hardcoded DURATION_SLOTS array that
// used to live here is deleted; same reasoning and same replacement
// (migration 010's `duration_slots` table) as PRICING_TIERS above.

// Task 45 Part 1 — mirrors migration 010's `pricing_tiers`/
// `duration_slots` table shapes exactly, so a later Supabase read
// (Part 2/3) maps onto this with no reshaping logic needed.
//
// Task 46b-b — `campaignFeePercent` added. Per this whole file's
// "one engine, multiple data sources" design (see the header comment
// above), the fee percent joins `tiers`/`durationSlots` as just
// another field on the SAME already-fetched reference-data object,
// not a second, separate fetch calculatePricing() has to make itself
// -- calculatePricing() stays fully synchronous and pure (Part 1's
// own explicit design goal), and every existing caller (promote/
// page.tsx's useMemo, create/route.ts, initialize-campaign/route.ts)
// already passes this object in, so none of them need a second change
// beyond whatever already threads referenceData through -- which,
// per Task 45 Part 2/3, all three already do via useReferenceData()/
// getServerReferenceData().
export interface PricingReferenceData {
  tiers: PricingTier[];
  durationSlots: DurationSlot[];
  campaignFeePercent: number;
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

// Task 46b-b — PLATFORM_FEE_PERCENT (the hardcoded constant this
// comment used to sit above) is DELETED. The campaign fee percent now
// comes from `platform_fee_settings` (migration 014, Task 46b-a) via
// `PricingReferenceData.campaignFeePercent` (see that field's own doc
// comment above) -- read once per `fetchReferenceData()` call
// (referenceData.ts), same as tiers/durationSlots, not queried
// separately here.
//
// PRESERVING THE HISTORY THIS COMMENT USED TO CARRY, since the
// specific accident it was warning against (a session editing the
// wrong hardcoded number) can no longer literally happen once there's
// no constant left to edit -- but the underlying lesson fully carries
// over to the new risk this task (46b) explicitly exists to guard
// against instead: this fee rate has already flip-flopped twice in
// this file's own history purely from miscommunication between
// sessions (10 -> wrongly "corrected" to 15, citing a stale
// confirmation -> re-confirmed back to 10, twice). Confirmed, current,
// as of the bootstrap row this session's migration seeded: **10%
// campaign / 5% deposit.** Task 46b's own intro paragraph names
// exactly why making this admin-editable (which is what 46b as a
// whole is for) raises this same stakes further, not lower them --
// see that task's own "treat it that way" framing, and 46b-d's
// planned type-to-confirm UI, which exists specifically to make an
// accidental edit here as hard to do by mistake as an accidental
// comment-edit already was.

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
// Task 45 Part 5 — narrated version of that same proof, plus how to
// add a new *data* row (a tier, country, genre, etc. — a pure
// Supabase change, zero code touched), lives in this directory's
// CONTRIBUTING.md. Read that first if you're extending either the
// data or the arithmetic; this file's own comments stay focused on
// what the code does, not why the shape is what it is.
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

// Step 4/6 -- platform fee (our margin). Task 46b-b: reads the
// admin-editable rate off referenceData now, not a module constant.
const platformFeeStep: PricingStep = (ctx) => {
  const platformFeesCents = Math.round(ctx.subtotalCents! * (ctx.referenceData.campaignFeePercent / 100));
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
    platformFeePercent: ctx.referenceData.campaignFeePercent,
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
