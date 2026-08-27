# Handover — mavins-web

Running task list from the product owner's requests. Each session should:
1. Read this file first.
2. Pick the next `[ ]` unchecked task, in order, unless told otherwise.
3. Implement it, verify with `npx tsc --noEmit` (and `npm run build` if
   feasible), commit, and generate a `git am`-compatible patch.
4. Check the box, add a one-line "Done in commit `<hash>`" note, and
   commit the updated handover.md itself.
5. Leave later tasks alone — one task per session unless explicitly
   asked to batch multiple.

Do not delete completed entries — the history is useful context for
later tasks that build on earlier ones.

---

## Task 0 — URGENT: main branch currently fails `npx tsc --noEmit` [x]

**Done in commit `3b24fe7`.** All 7 errors fixed: removed the
duplicate `platformFeePercent` field in `pricing.ts` and added a
`PricingResult` type alias; added the missing `getArtistDashboard`
export to `campaign.service.ts` (backed by the `get_artist_dashboard`
RPC, with a safe empty fallback); fixed both payment routes to import
`createAdminClient` from `@/lib/supabase/admin` instead of the
nonexistent `serviceClient` module; replaced the nonexistent
`createUserFromPayment` call in the verify route with the current
`resolveOrCreateGuestAccount` + `creditWalletTopUp` pair from
`guestCheckout.ts`. `npx tsc --noEmit` is clean.

**Left for a future session, discovered while fixing this:**
`creditWalletTopUp()` checks `wallet_ledger.amount_cents` /
`.description` for idempotency, but the inline wallet-crediting code
in both `verify/[reference]/route.ts` and `webhook/route.ts` writes
to `wallet_ledger` using a single `changeset` JSONB column instead.
Two different `wallet_ledger` row shapes are in use across the
codebase — worth reconciling before it causes a silent double-credit
or a runtime column-not-found error, but not fixed here since it's
outside a type-error-only task and the wrong guess could break
working behavior.

---

## Task 1 — Leaderboard shows real seeded users [x]

**Ask:** Use names from the `users` table (already populated with
seeded users) on the leaderboard; keep the fictional placeholder list
as a true fallback only (empty DB / RPC failure), not the default.

**Root cause found:** `get_leaderboard()` (Postgres function) did an
`INNER JOIN` on `track_campaigns` requiring `is_active = true`. Any
seeded/real user without a currently-active campaign was silently
excluded from the result set entirely, so the RPC returned 0 rows and
the app's fallback (`getFallbackLeaderboard()`) kicked in — even
though `users` was fully populated with real names.

**Fix applied:** Rewrote `get_leaderboard()` to start from `users`
and `LEFT JOIN track_campaigns`, summing streams across *all*
campaigns (not just active ones) and falling back through
`artist_name -> display_name -> email local-part` for display. See:
- `supabase_migration_003_leaderboard_real_users.sql` (new, matches
  the `_002_guest_checkout.sql` convention)
- `supabase_schema.sql` — master schema kept in sync
- **Already applied directly to production** via Supabase SQL Editor
  by the product owner (confirmed success) — the migration file is
  for version history / reprovisioning, not a pending action.

No app-code changes were needed — `src/app/leaderboard/page.tsx`
already correctly prefers the RPC result and only falls back to
`getFallbackLeaderboard()` on error/empty (see its `loadLeaderboard`
callback). This was a pure database-function bug.

**Status:** Done, verified applied to prod DB by product owner.

---

## Task 2 — Promote page responsiveness (mobile-first pass) [x]

**Done in commit `8e146ba`.** Scoped to sections not already owned by
a later dedicated task: page container padding/spacing, the campaign
form wrapper padding, `DurationSlotsGrid` (2 cols below 475px instead
of cramming 5 slots into 3), `PricingBreakdown`'s stat grid (1 col
below 475px instead of 2 tight columns), and `CampaignCard`'s status
row (wrap-safe instead of a rigid `justify-between`). Verified via
`npx tsc --noEmit` — clean.

**Deliberately left alone:** `GenreChips` / `GeoTargetingSection`
(Task 4 owns the "categories aligned not scattered" + black-screen
issue in that specific section) and `RangeSlider` (Task 6 owns the
slider revert). Fixing those here would step on tasks that already
have their own dedicated diagnosis below.

**Not verified:** actual pixel-width rendering at 360/390/428/768px —
this sandbox has no headless browser/screenshot tooling. Worth a
quick manual check in Chrome DevTools' device toolbar, particularly
the duration-slot and pricing-grid reflow at 360px, before considering
this fully closed.

---

## Task 3 — Bar chart: animated fill-up progression [x] (verify)

**Ask:** "The bar chart should be animated fill up progression."

**Located:** `src/components/promote/PublicAnalyticsShowcase.tsx` (the
"Where Growth Is Happening" platform-distribution chart) is the
**only** real recharts `<BarChart>`/`<Bar>` in the entire codebase —
confirmed via `grep -rn "recharts\|BarChart" src` across every
candidate file (admin dashboard, analytics page, earnings page, home
page, promote page). Analytics page (`src/app/analytics/page.tsx`)
only uses `AreaChart`/`PieChart`, no `BarChart`. Earnings page's
"Campaign Performance" section has a `BarChart3` lucide *icon* next to
a plain card list — not an actual chart.

**Already implemented, no code change needed:** the `<Bar>` element
already has `isAnimationActive`, `animationDuration={1200}`, and
`animationEasing="ease-out"` (present since the file's original
commit `e52bb7c`, well before this task was logged) — this is
recharts' standard entrance animation, which grows each bar from 0 to
its final height on mount. `recharts` is on `^2.12.0`, a modern
version with full, reliable support for this. The adjacent
"Demographics" section also already has an independent CSS width
fill-up animation (0% → final %, staggered per row via
`transitionDelay`) for its horizontal bars.

**Not verified:** actual visual playback in a browser — this sandbox
has no headless browser/screenshot tooling (same limitation noted in
Task 2). If the product owner still isn't seeing bars grow on load,
likely culprits to check next, in order: (1) are they looking at a
stale cached build (see the earlier Chrome caching issue in this
project's history) rather than a fresh deploy; (2) is the chart
scrolled into view fast enough that the `IntersectionObserver`
(`rootMargin: '200px'`) + async `getPublicSeedStats()` fetch both
resolve before they're looking, making the animation finish before
they notice it; (3) confirm which page/chart they mean if it's
genuinely a different one than this — no other candidate exists in
the current codebase, so if it's not this one, it needs to be built
from scratch, not fixed.

---

## Task 4 — Promote page first section: mobile CSS overlap + black
screen + category alignment [x]

**Ask:** "The first side of the promote page the CSS is overlapping
in mobile view there is some black screen and UI layout needs to be
changed to accommodate the fields and the alignment of the categories
should be aligned not scattered."

**Root cause found for the black screen — a real bug, not GPU-blur
architecture (that theory from Task 6 didn't hold up here):**
`className="gpu-layer"` and `className="scroll-smooth-mobile"` are
used 5 times across `promote/page.tsx` (the New Campaign card, the
submit button, the "Estimated reach" card) — but neither class was
ever actually defined anywhere in `globals.css`, `tailwind.config.ts`,
or any plugin/safelist. Someone added these class names expecting
them to promote the glassy, backdrop-filter-heavy cards to their own
GPU compositing layer (the standard fix for the black-flash-near-
backdrop-filter bug Task 6 diagnosed on the slider), but the CSS rule
was never written — so it was a silent no-op the whole time, and the
black screen kept happening. **Fixed:** defined both classes in
`globals.css` — `.gpu-layer` (`translateZ(0)` + `will-change:
transform` + `backface-visibility: hidden`) and
`.scroll-smooth-mobile` (`-webkit-overflow-scrolling: touch` +
`overscroll-behavior-y: contain`).

**"Categories... aligned not scattered" — confirmed and fixed:**
`GenreChips` used a `grid-cols-3 xs:grid-cols-4 sm:grid-cols-5` grid
for 14 genres — 14 doesn't divide evenly by 3, 4, or 5 at *any* of
those breakpoints, so every screen size showed a ragged, short
trailing row. Switched to `flex flex-wrap gap-2` so chips flow and
align naturally regardless of count — this is the standard pattern
for a tag/chip selector for exactly this reason.

`GeoTargetingSection`'s country-card grid had the same problem one
breakpoint over: `grid-cols-2 xs:grid-cols-3 sm:grid-cols-4` against
20 countries (`getRecommendedGeographies` returns the full
`TARGET_COUNTRIES` list, unsliced) — 20 isn't divisible by 3, so the
`xs` breakpoint alone had a ragged 2-item trailing row (2 and 4
already divided evenly). Kept this one as a grid (variable-width flex
items would look inconsistent for these card-style entries with a
flag+name+score, unlike simple text pills) and changed the ragged
breakpoint to `grid-cols-2 xs:grid-cols-4 sm:grid-cols-5` — 20 divides
evenly into 10/5/4 rows at all three now.

**Overlap found and fixed:** the "Top" badge on ranked country cards
was positioned with a negative overhang (`-top-1.5 -right-1.5`,
overhanging outside the card's own box into the grid gap). With only
an 8px (`gap-2`) gutter between cards, two adjacent top-ranked
countries' badges could visually collide on the narrow 2-column
mobile layout. Pulled the badge inside the card's own bounds
(`top-1 right-1`, plus `z-10`) so it can never overlap a neighboring
card regardless of grid position.

**Not fully investigated — "UI layout needs to be changed to
accommodate the fields" is vague and may mean something beyond the
above:** if the product owner still sees layout problems after this,
the 20-entry country grid (unsliced, so it always renders all 20
cards) is a plausible next suspect — that's a lot of vertical space
for a compact campaign form, and slicing to top N with a "show more"
toggle might be the actual ask, not a pure CSS fix. Flag this back to
them before guessing further.

---

## Task 5 — Pricing card redesign: hourly estimate by geography,
remove cost-per-view, polish + "solar flare" luxury effect [x]

**Ask (paraphrased):** Stop showing "cost per view" — users care
about virality/reach, not a raw per-view number. Instead show an
hourly estimate of views based on the geography the campaign is
targeting (so the user understands *where* and *how fast* their song
is reaching, not a sterile cost figure). Make the card visually more
polished/luxury, adding a "solar flare" visual accent.

**Confirmed before touching anything:** no "cost per view" / "per 1K
views" figure was ever actually rendered anywhere in the UI —
`grep -n "pricePer1K\|costPerView\|per view" src/app/promote/page.tsx
src/lib/campaign/pricing.ts` shows those only exist inside the pricing
*math* (`pricing.ts`), never displayed. Nothing to remove there.

**What changed in `PricingBreakdown`:**
- Merged the old separate "Delivery Rate" (day/hr numbers) and
  "Primary Market" (single country) stat blocks into one combined
  "Estimated Reach" statement: `~4,200/hr to 🇳🇬 🇬🇭 Nigeria, Ghana`
  style copy — leads with the hourly pace, ties it directly to where
  it's going.
- Previously this only ever showed one country (`topTargetedGeo`, the
  single best-ranked pick among the user's selection). Now it shows
  **every** country the user actually targeted — added a
  `targetedCountries: string[]` prop (passes `targetCountries`
  straight through) and maps all of them to flags/names via
  `TARGET_COUNTRIES`. Falls back to the single auto-recommended
  market when nothing's selected yet. Shows full names for 1–2 picks,
  switches to "N markets" beyond that so the line doesn't wrap
  awkwardly on mobile.
- Added the "solar flare": two layered radial-gradient circles
  (`position: absolute`, top-right corner, `pointer-events-none`,
  `aria-hidden`) using `rgba(var(--accent-rgb), ...)` — so it's
  blue in light mode and gold in dark mode automatically, consistent
  with the theming work done earlier in this project rather than a
  hardcoded color (the handover's original note pointed at a
  `.slider-gold` class from an older commit that no longer exists —
  used the current `--accent-rgb` theme variable instead, which is
  the modern equivalent). Outer glow uses the existing
  `animate-ambient-slow` keyframe already in `globals.css` for a
  slow, subtle pulse rather than a static graphic.

**Also fixed in the same pass:** my own mistake from Task 4 — see the
correction entry directly below this one.

---

## Correction to Task 4 — geo-grid was based on the wrong country count [x]

While implementing Task 5, discovered Task 4's `GeoTargetingSection`
grid fix (`grid-cols-2 xs:grid-cols-4 sm:grid-cols-5`) was reasoned
from `COUNTRY_CURRENCY`'s 20 entries — a separate, unrelated
currency-conversion table also in this file — instead of
`TARGET_COUNTRIES`, which is what that grid actually renders and has
**14** entries. 14 isn't evenly divisible by 4 or 5 either, so the
original raggedness wasn't actually fixed by that patch.

14 isn't evenly divisible by any reasonable column count (only 2 or
7), so no grid-column combination fixes this cleanly. The plan was
`flex flex-wrap justify-center` with fixed-width items
(`basis-[calc(...)]` reproducing the same 2/3/4-column widths a grid
would give), so an incomplete last row centers itself instead of
trailing off with dead space on one side.

**Correction: this entry was written up as done but the actual code
change never got committed** — `GeoTargetingSection` was still
rendering `grid-cols-2 xs:grid-cols-4 sm:grid-cols-5` as of `ea97cd8`
(confirmed by the product owner hitting the same ragged layout again
and flagging "the list is 14 not 20, and target country not target
currency"). **Actually applied now, in commit `4bdd941`:** the
`flex flex-wrap justify-center` + `basis-[calc(50%-0.25rem)]
xs:basis-[calc(25%-0.375rem)] sm:basis-[calc(20%-0.4rem)]` swap
described above. Verified via `npx tsc --noEmit` — clean.

**Lesson for future sessions:** don't trust a handover entry's
"done" claim over the actual file contents — diff/grep the real code
before building on top of a described-but-unverified fix. This file
is a log of intent and reasoning, not a guarantee the described diff
landed.

---

## Task 6 — Slider: revert to previous commit's design, zero
re-render, no effect on cards [ ]

**This is the highest-value diagnostic already done — read before
touching anything.**

**Ask:** Revert the slider to the design from the *previous* commit,
not the latest one (the latest commit changed the slider's UI and the
product owner doesn't like the new look). Additionally: dragging the
slider must never re-render the page/cards — it should purely select
an amount, with zero visual effect on the pricing cards until release.
Currently (as of commit `b400709`) it still shakes and shows a black
screen while dragging, which shouldn't happen.

**Root cause, confirmed via `git diff b76d0e9 b400709 -- src/app/promote/page.tsx`:**

Commit `b76d0e9` had a **working, ref-based, zero-re-render slider**
directly inline in `promote/page.tsx`:
- A native `<input type="range">` with a ref (`sliderRef`).
- `onInput` (fires continuously during drag) updated a CSS custom
  property (`--value-percent`) directly via
  `sliderRef.current.style.setProperty(...)` — DOM-only, no React
  state, no re-render.
- A separate `sliderDisplayRef` `<span>` had its `textContent`
  updated directly via ref during drag — again DOM-only.
- `onChange` (fires once, on release) was the *only* thing that
  called `setViewCount(val)`, which is what actually updates
  `pricing` (via `useMemo`) and re-renders the cards.
- The gold gradient fill was driven by the `--value-percent` CSS var
  feeding a `linear-gradient()` on the native
  `::-webkit-slider-runnable-track` pseudo-element (in `globals.css`,
  `.slider-gold` class) — a small, contained repaint area.

Commit `b400709` **replaced this with a new component**,
`src/components/ui/RangeSlider.tsx`. That component is *also*
ref-based in intent (updates a `fillRef` div's `width` and a
`valueRef` span's `textContent` via refs during `onInput`, only
calling `onChange` on release/pointerup) — so it isn't naively
re-rendering on every tick either. **But it introduced a likely
regression**: it animates `fillRef.current.style.width` on every
single pointer-move event. `width` is a layout-triggering CSS
property (forces reflow), unlike `transform: scaleX()` or a CSS
custom-property-driven gradient (compositor-only, no reflow). Doing
this at touch-move event rates (60–120Hz) **inside a
`backdrop-filter: blur(34px)` ancestor** (`.glass-strong`, which wraps
the entire form) is a well-known trigger for exactly the symptoms
reported: forced layout thrashing + iOS Safari's
recompositing-near-backdrop-filter black-flash bug.

**Recommended fix for next session:**
1. Revert `promote/page.tsx`'s slider section to the `b76d0e9`
   ref + CSS-custom-property approach (`git show
   b76d0e9:src/app/promote/page.tsx` to pull the old block — search
   for `sliderRef`, `sliderDisplayRef`, `handleSliderInput`,
   `handleSliderChange`, `sliderPercent` in that revision).
2. Either delete `src/components/ui/RangeSlider.tsx` (if nothing else
   uses it — check with
   `grep -rln "RangeSlider" src --include="*.tsx"` first) or keep it
   unused/for future use elsewhere, product owner's call.
3. Re-apply the `.slider-gold` CSS gold styling (from commit
   `920e1ec`, still likely present in `globals.css` — verify it
   wasn't removed) onto the reverted native input, since the visual
   design should stay gold/futuristic even though the *architecture*
   reverts to the ref-based approach.
4. Confirm `touch-action: none` is still present on the base
   `input[type="range"]` rule in `globals.css` (added in `920e1ec` to
   fix "whole page moves while dragging" — verify a later commit
   didn't quietly change it back to `pan-y` or remove it, since
   `RangeSlider.tsx`'s wrapper div currently uses
   `style={{ touchAction: 'pan-y' }}`, which is more permissive and
   could reintroduce the scroll-conflict bug).
5. Test specifically on an actual iOS Safari device/simulator if at
   all possible — this class of bug does not reproduce in desktop
   Chrome dev tools device emulation.

---

## Task 7 — Platform fee: show percentage only, not a dollar figure [ ]

**Ask:** The platform fee line on the pricing card should show as a
percentage, not a computed dollar amount.

**Current state:** `PricingBreakdown` shows
`Platform Fee ({pricing.platformFeePercent}%)` as a *label*, but
still shows `{formatCents(pricing.platformFeesCents)}` as the actual
displayed value underneath. `pricing.platformFeePercent` already
exists on the pricing object (`src/lib/campaign/pricing.ts`) — this
is a pure UI change: swap the displayed value to
`` `${pricing.platformFeePercent}%` `` instead of
`formatCents(pricing.platformFeesCents)`, keep the cents-based
`platformFeesCents` for the actual `totalCostCents` math (it must
still be included in the total charged — only the *display* changes).

---

## Task 8 — Remove "drip" copy, show selected country flags instead [ ]

**Ask:** Remove the "text drip..." (referring to the "We Drip" /
"Organic delivery over time" step 3 label in the `HOW_IT_WORKS` array
in `promote/page.tsx`) and use the selected country flags instead.

**Current state:** `HOW_IT_WORKS` step 3 already got renamed from
"We Drip" to "We Deliver" with a `Globe` icon in commit `b400709` —
partially addresses this. What's still outstanding: displaying the
*actual selected country flags* somewhere prominent (product owner's
intent seems to be: instead of generic "delivery" copy, show the
literal flags of the countries the user picked in
`GeoTargetingSection`, so the visual itself communicates reach).
Consider rendering the `targetCountries` flags as a small inline
strip near the slider or on the pricing card (ties into Task 5's
"reach" language too — could be one combined change).

---

## Task 9 — Time icon → world map icon [ ]

**Ask:** Change "the icon for time" to a world map icon.

**Likely refers to:** the `Clock` icon import in `promote/page.tsx`
(imported from `lucide-react`). Note: commit `b400709` already
removed `Clock` from the `HOW_IT_WORKS` step 3 icon (replaced with
`Globe`, see Task 8) — but check if `Clock` is still imported/used
elsewhere on the page (e.g. duration/tier displays) and swap those
remaining instances to a world-map-style icon. `lucide-react` doesn't
have a literal "world map" icon by that exact name — closest options
are `Globe`, `Globe2`, or `Map` — pick whichever renders best at the
icon size used.

---

## Task 10 — Country selection cap: 3 for users, unlimited for admin [x] (verify)

**Ask:** Regular users can select max 3 target countries; admin can
select unlimited.

**Already implemented in commit `b400709`:**
`MAX_COUNTRIES_FREE = 3` constant, `GeoTargetingSection` takes an
`isAdmin` prop and disables additional selection past the cap for
non-admins (`atLimit = !isAdmin && selectedCodes.length >=
MAX_COUNTRIES_FREE`), and `handleToggleCountry` enforces the same cap
when adding a country. **This task appears done** — next session
should just verify by testing as both a regular user and an admin
account, not re-implement.

---

## Task 11 — Admin launch button shows no price [ ] (verify — likely
already done, may be a data/role issue not a code issue)

**Ask:** When an admin launches a campaign, the "Launch Campaign"
button shouldn't show a price (admins launch for free).

**Already implemented in commit `b400709`:**
- Button text: `{isAdmin ? 'Launch Campaign' : \`Launch Campaign — ${formatCents(pricing.totalCostCents)}\`}`
- Backend: `createCampaign()` in
  `src/services/campaign/campaign.service.ts` takes an `isAdmin`
  param and skips all wallet-balance checking/deduction when true.

**If the product owner is still seeing a price as a logged-in admin,
this is very likely a data issue, not a code bug.** `isAdmin()` (in
`src/components/providers/AuthProvider.tsx`) checks:
```
user.role === 'admin'  OR  user.email === 'bossblingzs@gmail.com'
```
`user` is the *merged* `auth.users` session + `public.users` profile
row (fetched and spread together in `AuthProvider`'s `getSession()`),
so `user.role` does reflect the DB column correctly if it's set.

**Next session should ask the product owner (or check directly):**
1. Which email are they testing with?
2. Does that user's row in `public.users` actually have
   `role = 'admin'` set? (`SELECT email, role FROM users WHERE email
   = '<their email>';`)
3. If neither matches, that's the actual fix needed (a data update,
   not a code change) — or confirm whether `bossblingzs@gmail.com`
   is genuinely their intended admin account.

---

## Task 12 — Fix "cannot locate function get_wallet_id" error [ ] BLOCKED — needs more info

**Ask:** An error "cannot locate function get_wallet_id" is still
showing somewhere in the app; fix it.

**Investigated, could not locate the source:**
- `grep -rn "get_wallet_id" .` across the entire repo (app code +
  all three `.sql` files) returns **zero matches**.
- The only wallet-related Postgres function that exists is
  `get_wallet_balance(p_user_id UUID)` in `supabase_schema.sql` — a
  different name entirely, not a typo variant of `get_wallet_id`.
- App-side wallet balance reads go through
  `getWalletBalanceCents()` in
  `src/services/campaign/campaign.service.ts`, which reads
  `users.wallet` JSONB directly (`select('wallet')`) — **no RPC call
  at all**, so this specific function can't be the source of a
  Postgres "function does not exist" error.

**Conclusion:** This error is very likely coming from something that
exists only in the *live* Supabase database and isn't in this repo —
e.g. a trigger, a check constraint, a default expression, or a
leftover function created directly via the Supabase SQL Editor/Table
Editor UI at some point, referencing a function name that either was
never created or was dropped by a later change.

**Next session (or the product owner directly) needs to supply one
of:**
1. The exact action that triggers the error (e.g. "happens when I
   click X button" or "happens on page Y") plus the full error text/
   stack trace if visible in browser devtools or a Vercel function
   log.
2. Or, run this directly in the Supabase SQL Editor and paste the
   result:
   ```sql
   SELECT proname, pg_get_functiondef(oid)
   FROM pg_proc
   WHERE proname ILIKE '%wallet%';
   ```
   This will show every wallet-related function that actually exists
   in the live DB, including any not tracked in this repo's `.sql`
   files, which should reveal what's calling the missing
   `get_wallet_id`.

Cannot proceed further on this one without either of the above — no
amount of repo searching will find something that only exists in the
live database and was never committed.

---

## Notes for whoever picks up Task 2 next

- Full task list source: product owner's message combining ~12
  distinct asks in one go. This file exists specifically so each one
  gets a focused session instead of a rushed, everything-at-once
  patch.
- Always `git fetch origin && git reset --hard origin/main` before
  starting a session — multiple sessions/tools have been committing
  directly, so the remote is the source of truth, not any local
  cache.
- Always run `npx tsc --noEmit` before committing — this repo has
  caught several real bugs (missing exports, wrong RPC arg shapes,
  wrong currency var names) purely through the type checker across
  past sessions.
