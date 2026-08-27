# Handover — mavins-web

Running task list from the product owner's requests. Each session should:
1. Read this file first.
2. Pick the next `[ ]` unchecked task, in order, unless told otherwise.
3. Implement it, verify with `npx tsc --noEmit`, commit, and generate a
   `git am`-compatible patch.
4. Check the box, add a one-line "Done in commit `<hash>`" note, and
   commit the updated handover.md itself.
5. Leave later tasks alone — one task per session unless explicitly
   asked to batch multiple.

Do not delete completed entries — the history is useful context for
later tasks that build on earlier ones.

**Known sandbox limitation — do not waste a session on this:**
`npm run build` fails in this sandbox on `next/font` trying to fetch
Inter and Playfair Display from `fonts.googleapis.com` — the sandbox
has no network access to that domain. This is environmental, not a
code bug (confirmed present since Task 8, re-confirmed every session
since). `npx tsc --noEmit` is the real verification gate; don't run
`npm run build` expecting it to pass here, and don't treat its failure
as a regression to chase. A real build only needs to be checked
somewhere with live network access (CI, local machine, deploy target).

**Patch output — always exactly one `.patch` file per session, never
two:** a session normally produces two commits (the task fix, then the
handover.md update) — keep them as two separate commits, but bundle
them into a **single** patch file for delivery, using `--stdout`
instead of the default one-file-per-commit behavior:

```
git format-patch -2 --stdout > /path/to/output/000X-task<N>-combined.patch
```

(`-2` covers the two commits from this session — adjust the count if a
session produces more.) A multi-commit mbox file like this applies
fine with `git am`, in commit order, from one file.

To apply it — including from Termux on mobile, where downloaded files
typically land under shared storage after `termux-setup-storage`:

```
git am ~/storage/downloads/000X-task<N>-combined.patch
```

(Adjust the filename to match what was actually generated; run from
inside the repo's working directory.)

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
re-render, no effect on cards [x]

**Done in commit `38d6dd0`.** Followed the diagnosis below exactly:
reverted to the `b76d0e9` ref + CSS-custom-property approach, applied
natively in `promote/page.tsx` (not as a separate component this
time — that's what regressed last time). Deleted
`RangeSlider.tsx` (confirmed zero other importers first). Re-added
`.slider-gold` to `globals.css` (didn't exist anywhere on `main` —
gold styling had been silently lost when `RangeSlider` replaced the
native-track-gradient approach with its own div-based fill). Added
the missing `touch-action: none` on the base `input[type="range"]`
rule per step 4 below — confirmed it was in fact absent. Verified via
`npx tsc --noEmit` — clean. Not verified: actual drag behavior on a
real iOS Safari device (same sandbox limitation as Tasks 2/3 — no
headless browser/device access here).

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

## Task 7 — Platform fee: show percentage only, not a dollar figure [x]

**Done in commit `cf9aada`.** The label already showed the percent
(`Platform Fee ({pricing.platformFeePercent}%)`), but the value line
underneath was still `formatCents(pricing.platformFeesCents)` — the
percent was right, the displayed value wasn't. Swapped the value line
to `{pricing.platformFeePercent}%` and simplified the label back to
just "Platform Fee" (repeating the percent in both places was
redundant once the value line shows it). `platformFeesCents` itself
is untouched and still feeds into `totalCostCents` — only this
display line changed. Verified via `npx tsc --noEmit` — clean.

---

## Task 8 — Remove "drip" copy, show selected country flags instead [x]

**Ask:** Remove the "text drip..." and use the selected country flags
instead. **Product owner clarified in a follow-up message:** this
refers to the caption on the **promote page** (not the "We Drip"
landing-page step, which is a different, deliberately-designed
animated component left untouched) — specifically the "Based on X
views/day drip rate"-style caption directly under the duration grid.
Their exact instruction: "just stack the 3 countries the user chose
there."

**Done in commit `743ac73`.** Found the literal line: `<p>Based on
{formatNumber(pricing.dailyDripRate)} views/day delivery rate</p>`,
directly below `<DurationSlotsGrid />` in `promote/page.tsx` (the
copy had already drifted from "drip rate" to "delivery rate" in an
earlier commit, but it's the same caption the product owner means —
confirmed by position, not exact wording).

Replaced it with a new `SelectedCountriesStack` component: renders
the flags of whichever countries are in `targetCountries` as an
overlapping avatar-style stack (`-space-x-2.5`, layered `zIndex`),
looked up via `TARGET_COUNTRIES` (already imported in this file).
Capped the *visible* stack at 5 with a "+N" overflow badge — Task 10
lets admins select unlimited countries, and an unbounded flag wall
would look broken for that case, though the 3-country cap for regular
users means they'll almost always see the literal 3 flags requested.
Falls back to a "🌍 network-wide" message when nothing's selected
yet (same empty-state condition the old caption never actually
handled). Verified via `npx tsc --noEmit` — clean. `npm run build`
still fails in this sandbox on a pre-existing, unrelated issue (no
network access to Google Fonts for `next/font` — not caused by this
change).

---

## Task 9 — Time icon → world map icon [x]

**Done in commit `9e1a0bc`.** The premise in this task's original note
turned out to be slightly off once actually checked: `Clock` (and
`Timer`/`Hourglass`/`AlarmClock`/`Watch`) were **already completely
absent** from `promote/page.tsx` — not present-but-wrong, just gone,
presumably removed in an earlier commit without a replacement. So
"Campaign Duration" was rendering with no icon at all. Added
`lucide-react`'s `Map` icon (the literal folded-map glyph — closer to
"world map" than `Globe`/`Globe2`, which are already used elsewhere
on this page for actual geo-targeting content and would've been a
confusing reuse right next to the real geography section) directly
next to the label. Verified via `npx tsc --noEmit` — clean.

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

## Task 11 — Admin launch button shows no price [ ] (data confirmed
correct — still need to know if the button itself now behaves right)

**Update this session:** product owner ran the exact query this task
asked for — `SELECT email, role FROM users WHERE email = '<their
email>'` — and it came back with `role = 'admin'` set correctly. So
the "may be a data issue" hypothesis is now ruled out: the DB side is
right, and the code (`isAdmin()` checking `user.role === 'admin'`,
button text branching on it, backend skipping wallet deduction) was
already re-confirmed correct earlier this same session against a
fresh `origin/main` pull.

**Still not fully closeable without one more answer:** with the data
now confirmed correct, does the "Launch Campaign" button actually
show no price for this account when logged in? If yes, this task is
done — check the box. If it *still* shows a price despite `role =
'admin'` being set, that's no longer a data-issue question — it
would mean something between session/auth state and this specific
render is off (e.g. a stale cached session not yet reflecting the
DB row, `AuthProvider`'s merge step not picking up `role` for some
reason, or a client caching an old profile). Whoever picks this up
next: confirm the live button behavior first, and only dig into
those code paths if the answer is "still showing a price."

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

**Update this session:** the SQL result received this session
(`role = 'admin'` confirmed) answers Task 11's diagnostic query, not
this one — it's a different table/question entirely (`users.role`
vs. the live `pg_proc` catalog). Still genuinely blocked on this
task specifically; nothing new to act on yet.

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

**Update, found during Task 13 (unrelated ask, but touched the same
neighborhood):** a full `information_schema.columns` dump of `users`,
`wallet_ledger`, and `track_campaigns` against the live DB confirmed
`get_wallet_balance` genuinely doesn't exist live either (0 rows for
`proname ILIKE '%wallet%'`), and surfaced several other real,
confirmed schema-mismatch bugs (see Task 13) — but nothing named or
resembling `get_wallet_id` turned up anywhere in that dump. Still
blocked on the same two asks above; this wasn't it.

---

## Task 13 — RPC: auto-credit wallet balance when a deposit webhook
is received [x]

**Ask:** Create an RPC function that updates the user's wallet
balance automatically when the payment webhook fires for a deposit,
and wire the codebase to use it correctly.

**Done in commit `7432cef`.** Given a third-party "audit" document
first, which turned out to contradict this repo's own
`supabase_schema.sql` on where the balance actually lives (audit:
sum `wallet_ledger`; reality, confirmed by reading the actual
webhook/verify route code: `users.wallet` jsonb is what's read and
displayed everywhere). Rather than implement either document
verbatim, got an `information_schema.columns` dump of the live
`users`/`wallet_ledger`/`track_campaigns` tables and wrote the fix
against that ground truth instead. See the full back-and-forth in
this session's chat history for the specific contradictions found in
both documents — worth reading before trusting *any* handed-in audit
or schema doc at face value again, this repo's live DB has now
diverged from a tracked schema file, a third-party audit, AND (until
this fix) its own application code, three separate times.

**migration 004** (`supabase_migration_004_credit_wallet_deposit.sql`):
`credit_wallet_deposit(p_user_id, p_amount_cents, p_reference,
p_source, p_currency)`. Atomic (single `UPDATE` row-locks the
`users` row for the transaction — no more lost-update race between
the webhook and `/verify` landing for the same payment within
milliseconds of each other) and idempotent (partial unique index on
`wallet_ledger(user_id, metadata->>'reference')` — a duplicate
webhook delivery becomes a no-op, not a double credit).
`SECURITY DEFINER`, execute revoked from `anon`/`authenticated`,
granted only to `service_role`.

Rewired all three places that were each hand-rolling their own
version of this: `webhook/route.ts`, `verify/[reference]/route.ts`,
and `guestCheckout.ts`'s `creditWalletTopUp()`. That last one was
**actually broken in production** — it queried/inserted
`amount_cents`/`type`/`description` columns that don't exist on the
live `wallet_ledger` table at all (confirmed via the schema dump;
live columns are `id`/`user_id`/`changeset`/`metadata`/
`create_time`/`update_time` only) — every guest wallet top-up was
erroring before this fix.

**migration 005** (`supabase_migration_005_guest_account_columns.sql`):
found while fixing the above — `resolveOrCreateGuestAccount()` reads/
writes `users.profile_completed` and `users.is_guest_created`, and
`complete-profile/page.tsx` depends on `profile_completed` too —
neither column exists live. Added both (additive, `NOT NULL DEFAULT
FALSE`, safe on a table with existing rows). Also fixed in the same
function: the `INSERT` was missing `users.username`, which is
`NOT NULL` with no default on the live table — every brand-new guest
signup was failing at account creation, before ever reaching wallet
crediting at all. Derived from the new auth user's own UUID so it's
unique without a collision-retry loop.

**Deliberately not touched:** `campaign.service.ts`'s `updateWallet()`
(the campaign-spend/debit side) has the same non-atomic
read-modify-write pattern as the three deposit call sites did, but
that's a different code path from "credit on deposit webhook," which
is what was actually asked this session. Flagged here rather than
silently expanded into — worth its own task if the product owner
wants the debit side made atomic too.

**Action required before this does anything live:** both `.sql`
files need to be run in the Supabase SQL Editor (004 then 005, order
doesn't actually matter between them) — the RPC call sites will
throw "function does not exist" until migration 004 is applied, same
situation as Task 12's `get_wallet_balance`/`get_wallet_id` mystery.

Verified via `npx tsc --noEmit` — clean. Not verified: an actual live
Korapay webhook delivery against the migrated DB (no sandbox network
access to Supabase from this environment) — recommend a real
end-to-end test payment after applying both migrations.

---

## Task 14 — Admin dashboard: fix wrong hardcoded email + client-side
RLS blocking real data [x]

**Ask:** Product owner forwarded a third-party document diagnosing
"admin panel not working" as (1) a hardcoded admin email mismatch and
(2) environment variables not being injected at build time, with a
prescribed fix for both plus a suggested RLS workaround.

**Same caution as Task 13 — verify before trusting a handed-in
document, this repo's third strike on that:**

1. **Hardcoded email mismatch — real, but currently inert.**
   `src/app/admin/page.tsx` did check `user?.email !== 'admin@mavins.app'`
   (wrong — the real admin is `bossblingzs@gmail.com`, per
   `ADMIN_CONFIG` in `AuthProvider.tsx`), **but** the `router.push('/')`
   that would act on that check was commented out. So this exact bug
   wasn't actually blocking anyone — the page had no working gate at
   all, which is its own problem (see #3).

2. **Env vars not injected / hardcoded fallbacks — false.** Checked
   `src/lib/supabase/client.ts` and `src/lib/supabase/admin.ts`
   directly: both already read `process.env.NEXT_PUBLIC_SUPABASE_URL`
   / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
   correctly, no hardcoded real values anywhere. The document's
   suggested "correct" `client.ts` would have actually been a
   **regression** — it creates the Supabase client at module scope
   with a non-null assertion (`process.env.X!`), which breaks Next.js
   static generation (this file has an explicit comment already
   warning against exactly that, for exactly that reason). Not
   applied.

3. **Client-side admin queries hitting RLS — real, and the actual
   likely cause of a sparse-looking dashboard.** `admin/page.tsx`
   queried `users` / `track_campaigns` / `wallet_ledger` directly with
   the regular anon-key client. `users` and `wallet_ledger`'s RLS
   policies are `auth.uid() = id` / `auth.uid() = user_id` — own-row
   only. An admin loading this page client-side would only ever see
   their *own* single row in each table, not the full picture — which
   would look like "the admin page is broken/empty" without actually
   erroring.

**Fixed:**
- New `src/app/api/admin/dashboard/route.ts` — verifies the caller's
  own session server-side (`createServerSupabaseClient()` +
  `auth.getUser()`, then reads that user's own `role` — permitted by
  the "own row" RLS policy regardless of what it's being checked for),
  requires `isAdmin()` to be true, **then and only then** uses
  `createAdminClient()` (service-role, bypasses RLS) to fetch all
  three tables and return them as JSON. Deliberately **not** the
  document's example route, which had zero auth check — copying that
  verbatim would let any authenticated user curl this endpoint and
  dump every user's data and the full wallet ledger via the
  service-role key.
- New `src/lib/auth/isAdmin.ts` — extracted `isAdmin()` /
  `ADMIN_CONFIG` out of `AuthProvider.tsx` into a plain module with no
  `'use client'` directive and no React import, so the new
  server-only API route can use the exact same single source of
  truth without pulling a client-boundary module into server code
  (a real risk if imported directly — Next.js doesn't reliably treat
  a `'use client'` file's plain function exports as safe to import
  into a route handler). `AuthProvider.tsx` now re-exports both from
  there; no other importer needed to change.
- `admin/page.tsx`: replaced the wrong, inert hardcoded email check
  with a real, working gate using `isAdmin` from `useAuth()` (waits
  for `authLoading` to resolve first, so a real admin doesn't get
  bounced on every hard refresh), and switched `loadData()` to fetch
  from the new API route instead of querying the three tables
  directly. Added a visible error banner (`loadError` state) so a
  403/500 from the route surfaces to the admin instead of failing
  silently.

**Deliberately not touched — flagged instead:** `togglePause()` on
this same page still writes directly with the client-side anon-key
`supabase` client. `track_campaigns`'s RLS policy is `"Campaigns
updatable by owner" USING (auth.uid() = artist_id)` — the identical
underlying issue, but on the write side. An admin pausing *another*
artist's campaign would have the `UPDATE` silently affect 0 rows
under RLS (Supabase doesn't surface this as an error), so it would
look like it worked and quietly not persist. Worth its own task —
likely needs a second API route (`POST /api/admin/campaigns/:id/pause`)
using the same auth-check-then-service-role pattern as the new
dashboard route, rather than expanding this fix further.

Verified via `npx tsc --noEmit` — clean. Not verified: an actual live
login as the real admin account and a real `/admin` page load (no
browser/live Supabase network access in this sandbox, same limitation
noted on every prior task that needed one) — recommend a real
end-to-end check after deploying this.

---

## Task 15 — Admin campaign launch throws RLS error; header wallet
balance always shows $0.00 [x] (verify)

**Ask:** Product owner, logged in as the confirmed admin account
(role = 'admin' per Task 11's query), tried to launch a campaign and
got a browser alert: `new row violates row-level security policy for
table "track_campaigns"`. Screenshot also showed the header wallet
badge reading $0.00 despite the DB having real funds — "if admin is
facing this error imagine a normal user['s] error."

**Done in commit `0e4529f`.**

**Part 1 — RLS error on campaign creation:**
`createCampaign()` in `campaign.service.ts` inserted into
`track_campaigns` directly from the browser's anon-key client, relying
on `auth.uid() = artist_id` passing `track_campaigns`'s `WITH CHECK`
insert policy. Could not determine the exact live-DB reason this was
failing for a confirmed-admin account (no sandbox network access to
the live Supabase project to inspect it directly — same limitation as
every RLS-adjacent task before this one, e.g. Task 12, Task 14).
Rather than guess at the live specifics blind, applied the same fix
already proven for the structurally identical read-side problem in
Task 14 (admin dashboard hitting RLS on `users`/`wallet_ledger`): moved
the write server-side.

New `src/app/api/campaigns/create/route.ts` — verifies the caller's
own session (`auth.getUser()`), re-derives `isAdmin` server-side via
the same `isAdmin()` used everywhere else (so a stale/forged
client-side admin flag can't skip the wallet check), then does the
wallet balance check/deduction and the `track_campaigns` insert with
`createAdminClient()` (service-role, bypasses RLS entirely).
`artist_id` is always the verified session's own id now — never a
client-supplied value, closing off a spoofing angle the old code had
too. If the insert fails after a non-admin's wallet was already
debited, the debit is refunded rather than left charged with nothing
created. `campaign.service.ts`'s `createCampaign()` is now a thin
`fetch()` wrapper around this route, same exported signature, so
`promote/page.tsx` needed no changes.

**Part 2 — wallet balance always $0.00 in the header:**
Root cause was much simpler than it looked: `Header.tsx`'s balance
line is `${(points / 100).toFixed(2)}` where `points` is a prop
**defaulting to 0** — and `LayoutContent.tsx`, the only place `<Header>`
is ever rendered, never passed a `points` prop at all. So the header
showed $0.00 unconditionally for every user regardless of actual
wallet state — not a data-fetch bug, the value was simply never wired
up. Added a `walletBalanceCents()` helper in `LayoutContent.tsx`
reading `user.wallet.balance` (the same `users.wallet` JSONB shape
`campaign.service.ts` already reads/writes) off the already-available
merged `user` object from `AuthProvider`, and passed it as `points`.

**Note if this still shows $0.00 after deploying:** that would now
point specifically at `AuthProvider`'s profile join
(`users` row fetched by `.eq('id', session.user.id)`) not finding a
matching row for this account — worth a direct check of whether this
admin's `public.users.id` actually equals their `auth.users` id, since
a mismatch there would silently null out `user.wallet` (and would
also explain a stale/absent `auth.uid()` context feeding into the RLS
error in Part 1, if it turns out this account's public profile row was
seeded independently of a real Supabase Auth signup).

Verified via `npx tsc --noEmit` — clean. `npm run build` still fails
in this sandbox on the same pre-existing, unrelated Google Fonts
network issue noted since Task 8. **Not verified:** an actual live
campaign launch and wallet-balance render against the live DB (no
sandbox network access to Supabase) — recommend a real end-to-end
check after deploying, and if the RLS error somehow still occurs after
this change, that means something more specific is happening live that
this fix doesn't cover (please paste the exact new error text).

---

## Task 16 — RLS on `track_campaigns` still owner-only; admin actions
silently no-op instead of erroring [x] SQL run against the live DB,
root cause fully diagnosed (see resolution note below)

**Ask:** Product owner reported the admin account can log in but is
still blocked by `track_campaigns` row-level security in places Task
14/15's server-side routes don't cover yet (e.g. `togglePause()` on
`admin/page.tsx`, flagged but deliberately not touched in Task 14).
Root cause: `"Campaigns updatable by owner"` / `"Campaigns insertable
by owner"` policies only ever check `auth.uid() = artist_id` — there
is no admin bypass at the database level at all, so *any* direct
client-side write to another artist's campaign row affects 0 rows
under RLS and fails silently (no thrown error), which reads as "it
worked" when it didn't.

Also confirmed while writing this: `public.users` in
`supabase_schema.sql` has **no `role` column** in this repo's schema
file, even though `isAdmin()` (`src/lib/auth/isAdmin.ts`) reads
`user.role` as its first check and Task 11/14 both refer to a live
`role = 'admin'` value. That means the live DB's `users` table has
drifted from `supabase_schema.sql` (a column was added directly in
the Supabase dashboard/SQL editor at some point and never committed
back into the schema file) — worth reconciling separately so the next
person isn't confused by the same mismatch.

**SQL to run in the Supabase SQL editor** (idempotent — safe even if
`role` already exists live):

```sql
-- 1. Make sure `role` exists and defaults sensibly (no-op if already there)
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'artist';

-- 2. Make sure the known admin account is actually flagged admin in the data
UPDATE public.users
SET role = 'admin'
WHERE lower(trim(email)) = 'bossblingzs@gmail.com';

-- 3. SECURITY DEFINER helper — checks role without re-triggering RLS
--    recursion, and works even though `users` itself is locked to
--    "own row only" (this function bypasses that for this one check).
CREATE OR REPLACE FUNCTION public.is_admin(p_uid UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = p_uid AND role = 'admin'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- 4. Replace the owner-only policies with owner-OR-admin versions.
--    DROP + CREATE so this is safe to re-run.
DROP POLICY IF EXISTS "Campaigns updatable by owner" ON public.track_campaigns;
CREATE POLICY "Campaigns updatable by owner or admin"
  ON public.track_campaigns
  FOR UPDATE
  USING (auth.uid() = artist_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = artist_id OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Campaigns insertable by owner" ON public.track_campaigns;
CREATE POLICY "Campaigns insertable by owner or admin"
  ON public.track_campaigns
  FOR INSERT
  WITH CHECK (auth.uid() = artist_id OR public.is_admin(auth.uid()));

-- 5. Admin-only delete wasn't possible at all before (no DELETE policy
--    existed for anyone) — added in case the admin dashboard ever
--    needs to remove a campaign outright.
DROP POLICY IF EXISTS "Campaigns deletable by admin" ON public.track_campaigns;
CREATE POLICY "Campaigns deletable by admin"
  ON public.track_campaigns
  FOR DELETE
  USING (public.is_admin(auth.uid()));
```

**Still to do in a code session after this SQL is run:** wire
`togglePause()` in `admin/page.tsx` to actually use this (it can now
either keep writing client-side and rely on this new bypass, or —
preferably, to stay consistent with Task 14/15's pattern — get its own
`POST /api/admin/campaigns/:id/pause` route using
`createAdminClient()`, since a client-side write still exposes the
service logic to the browser even once RLS stops blocking it). Not
done in this pass — this task is DB-policy only; flagging the
application-side follow-up so it isn't lost.

**RESOLUTION — actual root cause found, this was bigger than an RLS
policy gap:** After the SQL above was run, the admin's `role` column
came back correctly as `'admin'` — but the wallet pill was still
wrong and the RLS symptoms persisted for other reads. Ran:

```sql
SELECT au.id AS auth_id, pu.id AS public_id, (au.id = pu.id) AS ids_match
FROM auth.users au JOIN public.users pu ON pu.email = au.email
WHERE au.email = 'bossblingzs@gmail.com';
```

and got `ids_match = false` — this admin's `public.users.id`
(`34ed29e3-c1f8-47fd-9405-b3bfb65bc035`) and their real
`auth.users.id` (`3b00de5b-6593-4f9f-bbbd-9c11647fc74b`) were two
different UUIDs. Since every RLS policy in this schema is keyed on
`auth.uid() = <owner column>`, and there is **no actual foreign key**
from `public.users.id` to `auth.users.id` enforcing they match, every
own-row query for this account (the `users` row fetch in
`AuthProvider.tsx`, `wallet_ledger`, etc.) had been silently returning
zero rows for its entire session — not because any policy was wrong,
but because the row it needed to match against genuinely didn't
exist under that id. This is the real explanation for the RLS error
in Task 15, the `role`-not-showing-admin symptom (Task 19), and the
wallet pill showing $0 (Task 20) — three reported symptoms, one root
cause.

**Fixed with a one-time data repair**, run in a single transaction:
found every FK constraint in `public.` pointing at `users(id)` via
`pg_constraint`/`pg_attribute`, made each one `DEFERRABLE INITIALLY
DEFERRED` for the transaction, updated `public.users.id` to the real
`auth.users.id`, then updated every dependent table's FK column
(`tracks.artist_id`, `track_campaigns.artist_id`,
`seed_interaction_log.seed_user_id` and
`.triggered_by_real_user_id`, `artist_growth_milestones.artist_id`,
`wallet_ledger.user_id`, `shares.user_id`, plus anything else live
that isn't in this repo's schema files, since the FK list was
discovered dynamically rather than hardcoded) to the same new id, all
before `COMMIT`. Re-ran the `ids_match` check after — now `true`.

**Not done / worth a follow-up task:** no guard currently exists to
stop this happening again for the *next* admin or seeded account.
Deliberately did **not** add a hard
`FOREIGN KEY (id) REFERENCES auth.users(id)` to `public.users` — this
schema intentionally has `user_type IN ('real','seed','ghost')`
accounts that are *not* backed by a real Supabase Auth signup (see
`seed_interaction_log`, `seedEngine.service.ts`), so a blanket FK
would break seeding. A narrower guard (e.g. validating id equality at
admin-account creation time, or a periodic drift-check query) would
be safer — flagging for whoever owns the admin-provisioning flow
rather than guessing at it here.

With this fixed, Task 19 (role badge) and Task 20 (wallet pill) may
turn out to need **no code change at all** for this specific account
— re-verify both against the real admin login now that the id match
is fixed before spending time on the frontend for either.

---

## Task 17 — Complete-profile page exists but isn't wired into the
real flow [x]

**Ask:** `/complete-profile` isn't actually reached as part of
onboarding — it exists as a page but nothing routes a freshly-signed-up
artist into it, so profile completion is effectively dead code right
now. Needs: (a) finding every entry point after signup/login and
confirming whether each one checks for an incomplete profile and
redirects to `/complete-profile?redirect=...` before continuing, (b)
deciding what "incomplete" means (which `users` columns are required —
`artist_name`? `primary_genre`? `country`?), and (c) actually wiring
that check in, since right now a user can go straight from signup to
the rest of the app with a blank profile.

**Done.** Part (b) turned out to already be answered by the codebase:
`complete-profile/page.tsx` already writes a real `profile_completed`
boolean on the `users` row (added in migrations 002 and 005), and
`guestCheckout.ts` already reads it too — there's a single existing
flag, no need to invent new "incomplete" criteria.

Part (a): the only *live* signup/sign-in entry point is
`src/app/login/page.tsx` (grepped for other candidates —
`api/auth/create-user/route.ts` and `api/auth/activate/route.ts` exist
but have zero callers anywhere in `src`, so they're dead code, not a
real second entry point; left untouched). That page had two gaps:
- **Sign-up branch:** inserted the new `users` row, then always
  `router.push('/')` — never routed to `/complete-profile` at all,
  regardless of the fact that a brand-new row's `profile_completed`
  is `false` by definition.
- **Sign-in branch:** just `router.push('/')` unconditionally — an
  existing user who'd skipped profile completion last time was never
  nudged back toward it on a later login either.

**Fixed in `src/app/login/page.tsx`:**
- Sign-up: after the profile row insert succeeds, routes to
  `/complete-profile?redirect=<intendedDestination>` instead of `/`.
  (If there's no active session yet — e.g. email confirmation is
  required — falls back to the prior `/` behavior, since there's no
  one to route into complete-profile until they're actually signed
  in.)
- Sign-in: now fetches the signed-in user's `profile_completed` flag
  right after a successful `signInWithPassword` call; routes to
  `/complete-profile?redirect=...` only if it's still `false`,
  otherwise goes straight to the intended destination as before.
- Added `useSearchParams()` to read an incoming `?redirect=` (the same
  param `middleware.ts` already sets when bouncing an unauthenticated
  user away from `/admin`), and threads it through to
  `/complete-profile` so the user still lands where they were actually
  headed once they finish (or skip) the form — `complete-profile`
  already supported reading `redirect` back out, it just never
  received one before.
- Split the page into a `LoginForm` component wrapped in `<Suspense>`
  in the default export, matching the exact pattern
  `complete-profile/page.tsx` already uses — required because
  `useSearchParams()` opts a page out of static rendering unless it's
  wrapped in a Suspense boundary.

**Deliberately not touched:** `middleware.ts` — its own comment
explains the app is intentionally public/ungated outside `/admin`, so
gating on `profile_completed` belongs at the point where a session is
established (login/signup), not as a blanket middleware redirect that
would also catch already-authenticated users just browsing around.
Also left `api/auth/create-user` and `api/auth/activate` alone since
they're unused — flag for cleanup separately if confirmed dead.

Verified via `npx tsc --noEmit` — clean. `npm run build` fails on the
same pre-existing Google Fonts network issue noted since Task 8, 14,
15 — unrelated to this change. **Not verified:** an actual live
signup/sign-in against the real Supabase project and a real redirect
into `/complete-profile` (no sandbox network access) — recommend a
real end-to-end check after deploying: sign up a fresh test account
and confirm it lands on `/complete-profile`, then sign in as an
existing account with `profile_completed = false` and confirm the
same.

---

## Task 18 — Success banner after completing profile shows for every
artist on every login, not just once [x]

**Ask:** Product owner reports a banner/modal opens for every artist
after they successfully get through `/complete-profile`, and it's
firing more broadly than intended — sounds like it's showing on every
subsequent login rather than a true one-time "profile completed"
moment. Needs a persisted flag (e.g. a `profile_completed_at` or
`has_seen_welcome` column/timestamp on `users`, set once and checked
before rendering the banner) rather than whatever client-side
condition is currently gating it — likely something that re-evaluates
true on every session load instead of only right after the profile
form's own successful submit.

**Investigated first, before touching anything:** grepped the whole
`src` tree for any Toast/Snackbar/Alert/Modal/Dialog/"banner" pattern
tied to onboarding — found nothing. There is no dedicated
banner/modal component for this at all. The actual match for what
product owner is describing is the plain `<h1>Welcome back,
{artistName}</h1>` heading in `src/app/page.tsx`'s authenticated
view — it renders **unconditionally on every visit to `/`**, with no
gating logic whatsoever. Once Task 17 wired every login/signup to
route through `/complete-profile` first, this heading became the very
next thing rendered afterward every single time — which reads exactly
like "a banner opens after completing profile" even though it was
never actually tied to that event; it was just always there.

**Fixed without a schema change** — a DB column felt like more
persistent state than this needs, since the ask is really "show this
once, at the moment it actually happened," not "remember forever
whether this user has ever seen a welcome message":
- `complete-profile/page.tsx`'s **submit** path (not skip — skipping
  isn't "successfully completing" it) now appends `?welcome=1` onto
  the redirect target after a successful save.
- `src/app/page.tsx` now has a real, separate one-time banner
  (dismissible, with a ✕ button) that only renders when it sees
  `welcome=1` in the URL on mount — and immediately strips that param
  via `router.replace('/', { scroll: false })` in the same effect, so
  a refresh, back-button press, or someone re-sharing the URL can't
  replay it. The original "Welcome back" heading is untouched and
  still shows every visit, which is normal/expected persistent UI, not
  the bug — only the new banner above it is one-time.
- Both `page.tsx` and `complete-profile`'s redirect needed
  `useSearchParams()`; `page.tsx` didn't have it before, so it's now
  split into `HomePageContent` wrapped in `<Suspense>` in the default
  export, matching the same pattern already used in `login/page.tsx`
  (Task 17) and `complete-profile/page.tsx`.

Verified via `npx tsc --noEmit` — clean. `npm run build` fails only on
the same pre-existing Google Fonts network issue noted since Task 8.
**Not verified:** an actual live run through signup →
complete-profile → seeing the banner exactly once and not again on a
subsequent login (no sandbox network access to the live Supabase
project) — recommend a real end-to-end check after deploying.

---

## Task 19 — Admin's role always displays as "Artist" in the UI [x]

**Done in commit `b0367f9`.** `Sidebar.tsx`'s user-section role line
was a hardcoded literal string, always showing "Artist" regardless of
the signed-in user's actual role. Now destructures `isAdmin` from
`useAuth()` (backed by `src/lib/auth/isAdmin.ts`, the same source of
truth used server-side) and renders `{isAdmin ? 'Admin' : 'Artist'}`
instead of the fixed string.

**Confirmed while investigating Task 16:** `Sidebar.tsx`'s user-section
role line is a **hardcoded literal string**, not derived from the
actual user at all:

```tsx
<p className="text-xs text-[var(--muted-foreground)]">Artist</p>
```

So this shows "Artist" under every signed-in user's name regardless of
`role`/`isAdmin` — including the real admin account, which is exactly
what product owner saw ("the current admin is logged in but the role
is showing artist").

**Grepped for the same hardcoded pattern elsewhere** (Header.tsx,
MobileNav.tsx, settings page, complete-profile page, admin table
headers) — no other role-display occurrence found. The other `Artist`
hits in the codebase are unrelated: `admin/page.tsx`'s two hits are
table column headers, `page.tsx`'s hit is a `user?.artistName || 'Artist'`
greeting fallback (not a role label), and the `settings`/`complete-profile`
hits are "Artist Name" / "Spotify Artist ID" form field labels.

Verified via `npx tsc --noEmit` — clean. `npm run build` fails only on
the same pre-existing Google Fonts network issue noted since Task 8.
**Not verified:** an actual live login as the real admin account to
visually confirm "Admin" renders (no sandbox network access to the
live Supabase project) — recommend a quick visual check after
deploying.

---

## Task 20 — Header wallet pill doesn't route anywhere; should say
"Wallet" not the earnings label [ ]

**Confirmed while investigating:** the wallet balance pill in
`Header.tsx` (the `$X.XX` chip next to notifications) is a plain
`<div>`, not a `<Link>` or button — it has no `onClick`/`href` at all,
so tapping it does nothing. Also, the nav-level equivalent
(`Sidebar.tsx` / `MobileNav.tsx`) currently points at `/earnings` and
is labeled "Earnings" / "Earn" everywhere, which the product owner
wants renamed to "Wallet" to match the intended framing (see Task 21 —
withdrawals are going away, so "Earnings" no longer fits what that
page does). Needs: (a) wrap the header pill in a `Link href="/earnings"`
(or whatever the route ends up being renamed to, if `/earnings` itself
gets renamed to `/wallet` as part of this), and (b) a pass over
`Sidebar.tsx`, `MobileNav.tsx`, and the page itself to rename the
user-facing label from "Earnings"/"Earn" to "Wallet" consistently.
Coordinate with Task 21 so this isn't done twice.

---

## Task 21 — Remove withdrawal ability entirely (comment out, don't
delete, in case it's needed later) [ ]

**Ask:** No withdrawal functionality should be user-facing at all for
now — not reduced, fully removed from the UI, with the underlying
logic commented out rather than deleted so it can be restored later
without reconstructing it from git history alone. Known surface area
(found via `grep -rli withdraw src`, not yet fully audited):
- `src/app/api/withdrawal/request/route.ts`
- `src/app/api/withdrawal/stats/route.ts`
- `src/app/earnings/page.tsx` — likely has the actual withdraw
  button/form and balance-check UI
- `src/services/notifications/notifications.service.ts` — likely
  fires a withdrawal-related notification somewhere
- `src/app/admin/page.tsx` — may surface withdrawal requests for admin
  review; confirm whether admin-side visibility should also be hidden
  or just the user-facing request flow

Needs a full read of each file above before touching anything — some
of this (e.g. admin visibility into past withdrawals) may be worth
keeping even while new requests are disabled. Comment out rather than
delete per the ask, with a clear `// WITHDRAWALS DISABLED — see Task
21` marker at each spot so it's easy to find and reverse later.

---

## Task 22 — Settings page not fully wired [ ]

**Ask:** `/settings` (`src/app/settings/page.tsx`, 258 lines) has UI
that isn't fully connected to real data/actions yet — exact scope
not specified by product owner beyond "not fully wired." Next session
should open this file, list every field/toggle/button on the page,
and check each one against whether it actually reads from and writes
to Supabase (vs. static/placeholder state), then report back the
specific list of what's disconnected before fixing anything — this
task is too vague to safely fix blind in one pass.

---

## Task 23 — Promote page: shuffle 8-of-25 countries by genre, cap
selection at 3 of the shown 8 [ ]

**Ask:** The country-targeting pool should be the full 25 countries,
but the picker should only ever show 8 at a time, reshuffled based on
the genre the artist selects (presumably weighted toward that genre's
best-fit markets, similar in spirit to the existing affinity table),
and the artist can select at most 3 of *those 8 shown* — not 3 of the
full 25.

**Current state found while investigating:** `TARGET_COUNTRIES` in
`src/lib/campaign/geoAffinity.ts` only has **14** countries defined
right now, not 25 — the pool itself needs 11 more added (with affinity
scores per existing genre in `GENRE_COUNTRY_AFFINITY`) before the
8-of-25 shuffle makes sense. `promote/page.tsx` currently shows the
*entire* pool with no shuffle/subset step at all — `MAX_COUNTRIES_FREE
= 3` (Task 10) already caps selection count correctly, but it caps
selection out of the *full* list shown, not out of a shuffled 8. So
this task is really two parts: (1) grow the pool to 25 countries with
real affinity scores, and (2) add a selection step — likely using
`getRecommendedGeographies(genre, ...)` (already ranks by affinity) to
take the top-weighted candidates and randomly sample/shuffle 8 from
them per genre selection, then feed only those 8 into the existing
`GeoTargetingSection` / `atLimit` logic so the "max 3" cap applies
to the shown 8, not the underlying 25. Needs a decision on whether the
shuffle re-randomizes every time the genre changes, or is stable once
picked for a given session/campaign draft — worth confirming with
product owner before implementing, since "shuffle" could mean either.

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
