# Extending the campaign pricing/reference-data pipeline

This is the guide Task 45 Part 5 (handover.md) asked for: concrete
proof, with a worked example each, that this pipeline is actually
modular — not just described that way. It covers the two ways this
system grows. If you're reading this to make a change, find the
matching section below and follow it exactly; if neither section
covers what you're doing, you're probably outside what this pipeline
was designed to make easy and should read Task 45's own write-up in
`handover.md` before improvising.

## The shape, in one paragraph

Five Supabase tables (`pricing_tiers`, `duration_slots`, `countries`,
`genres`, `genre_country_affinity` — see
`supabase_migration_010_static_data_tables.sql`) are the single source
of truth for every number and label this feature shows or charges.
`src/lib/campaign/referenceData.ts`'s `fetchReferenceData()` is the
one function that reads them, shaped into `PricingReferenceData` +
`GeoReferenceData` (`pricing.ts` / `geoAffinity.ts`). Everything else
— the client store (`useReferenceData.ts`), the server-side cache
(`referenceDataCache.ts`), `promote/page.tsx` — consumes that same
shaped data; nothing downstream of it ever hardcodes a tier, a
country, or a rate. `calculatePricing()` itself is a thin runner that
folds `PRICING_PIPELINE` (`pricing.ts`) — six named, pure step
functions — over an initial context.

## 1. Adding a new *data* row

Example: adding a seventh pricing tier ("Ultra", say, above today's
top tier).

This is purely a Supabase change — **zero application code touched**:

```sql
insert into pricing_tiers (min_views, max_views, price_per_1k_cents, label, description, sort_order)
values (5000001, 10000000, 60, 'Ultra', 'Maximum-scale campaigns', 7);
```

Run as a new migration file (matching the pattern every other
`supabase_migration_0XX_*.sql` in this repo follows) or as a one-off
insert via the Supabase dashboard for a quick test — either way, no
`.ts` file changes. The next time `fetchReferenceData()` runs (next
client store fetch, next 60s server-cache TTL expiry — see
`referenceDataCache.ts`), the new tier is live: it shows up in
`tierLookupStep`'s `.find()`, in the promote page's tier badge and
`PricingBreakdown`, and in server-side `calculatePricing()` calls —
all without a deploy.

The same is true for a new duration slot, country, genre, or
genre/country affinity score — same table-insert-only pattern, same
zero-code-touched property. This should already be true by
construction given Parts 1–4 landed correctly; this section just
writes that down so a future contributor doesn't have to re-derive it
from the code.

**One real caveat worth knowing, not a contradiction of the above:**
`clampViewsStep` in `pricing.ts` hard-clamps view counts to
`Math.min(..., 5000000)`. A tier whose range starts above 5,000,000
(exactly the "Ultra" example above, and the pre-existing seeded
"Legend" tier, which caps at 10,000,000) is *stored* correctly and
*visible* in any UI that lists all tiers, but is **unreachable via the
actual pricing calculation** until that clamp is also raised — a
one-line code change in `clampViewsStep`, deliberately out of scope
here since it's an existing, previously-flagged inconsistency (see
"Task 44 open items" below), not something this guide's own worked
example should silently paper over.

## 2. Adding a new *kind* of arithmetic rule

Example: a genuine first-time-buyer discount (10% off the subtotal).
`pricing.ts` already contains this exact example, written out as
`EXAMPLE_firstTimeDiscountStep` — deliberately **not** wired into
`PRICING_PIPELINE`, kept as a hypothetical so it's always available as
a live, compiling reference. This section is the narrated version of
that same proof.

The one new step function (already in `pricing.ts`, reproduced here):

```ts
const EXAMPLE_firstTimeDiscountStep: PricingStep = (ctx) => {
  const FIRST_TIME_DISCOUNT_PERCENT = 10;
  const discountedSubtotal = Math.round(ctx.subtotalCents! * (1 - FIRST_TIME_DISCOUNT_PERCENT / 100));
  return { ...ctx, subtotalCents: discountedSubtotal };
};
```

The one line to make it real — insert it into the array, between
`subtotalStep` and `platformFeeStep` (so the discount applies to the
subtotal before the platform fee is computed on top of the *already
discounted* amount, not the other way around):

```ts
const PRICING_PIPELINE: PricingStep[] = [
  clampViewsStep,
  tierLookupStep,
  subtotalStep,
  EXAMPLE_firstTimeDiscountStep, // <- the one new line
  platformFeeStep,
  durationAssignmentStep,
  savingsStep,
];
```

**What was NOT touched to add it** — the actual demonstration that
this fits in without affecting the rest of the code, not just an
assertion:
- `clampViewsStep`, `tierLookupStep`, `subtotalStep`,
  `platformFeeStep`, `durationAssignmentStep`, `savingsStep` — all six
  existing steps, unedited.
- `calculatePricing()` itself — still just folds whatever
  `PRICING_PIPELINE` contains; it has no knowledge of how many steps
  there are or what each one does.
- Every call site (`create/route.ts`, `initialize-campaign/route.ts`,
  `promote/page.tsx`) — none of them know or care that a new step
  exists; they call `calculatePricing()` exactly as before.
- `PricingContext`'s shape — the new step only reads/writes
  `subtotalCents`, a field every step downstream of `subtotalStep`
  already expects to exist.

A real (non-hypothetical) new rule — a loyalty discount, a
country-specific surcharge, a seasonal promo — follows this same
pattern: write one pure `PricingStep`, decide where in the sequence it
belongs (before `platformFeeStep` if it should affect the fee base,
after if it shouldn't), add one line to `PRICING_PIPELINE`. If you do
build `EXAMPLE_firstTimeDiscountStep` for real, per its own comment in
`pricing.ts`: rename it (drop the `EXAMPLE_` prefix), wire it into
`PRICING_PIPELINE` for real, and give it real tests — don't leave the
hypothetical and the real version both in the file.

## Task 44 open items — confirmed status, not asserted

Task 44 (the task Task 45 absorbed the remaining scope of) left three
items open. Checking each rather than letting this task's own
done-note quietly imply they were all fixed:

- **Admin-editing UI question** — still open, not resolved by Task 45.
  Task 46 (SPEC ONLY, not started as of this writing) is the direct
  answer to it — see that task's own entry in `handover.md`.
- **The 5M-vs-10M clamp inconsistency** — still open, **not** fixed by
  this guide or by Task 45. Deliberately preserved verbatim through
  Parts 1 and 4 (see `clampViewsStep`'s own comment in `pricing.ts`,
  and the caveat in this guide's §1 above) so it doesn't get silently
  fixed as an unplanned drive-by change. Fixing it for real is a
  one-line change (raise or remove the `5000000` clamp) but needs a
  product-owner call first — it changes what the seeded "Legend" tier
  actually does, which is a pricing decision, not a bug-fix-only
  change.
- **The `TIERS`-vs-`PRICING_TIERS` drift** — **resolved.** Task 45
  Part 4 deleted `promote/page.tsx`'s local `TIERS` array entirely;
  the page now reads tier data from the same `referenceData.tiers`
  everything else uses. There is exactly one tiers source now, not
  two that could drift apart.
