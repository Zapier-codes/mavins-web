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

## Task 2 — Promote page responsiveness (mobile-first pass) [ ]

**Ask:** "Adjust the responsiveness of the promote page."

No specific breakpoints/elements were named — this needs a fresh
pass across `src/app/promote/page.tsx` at common mobile widths
(360px, 390px, 428px) and tablet (768px). Cross-reference with Task 4
below since they're likely the same underlying layout issues.

**Where to start:** `src/app/promote/page.tsx` is currently ~500+
lines, single file, several `memo()`-wrapped subsections
(`GenreChips`, `GeoTargetingSection`, `DurationSlotsGrid`,
`PricingBreakdown`, `CampaignCard`). Check each subsection's grid/flex
classes at narrow widths.

---

## Task 3 — Bar chart: animated fill-up progression [ ]

**Ask:** "The bar chart should be animated fill up progression."

**Not yet located precisely which chart this refers to** — candidates:
- `src/components/analytics/*` (check for a bar-chart component)
- `PublicAnalyticsShowcase` (dynamically imported in promote/page.tsx)
- Admin dashboard analytics (from commit `c901233`, "full admin
  dashboard")

**Next session should:** `grep -rn "recharts\|BarChart" src` to find
every bar chart instance, confirm which one the product owner means
(likely the most visible one — public stats on promote page or
analytics page), then add an entrance animation where bars grow from
0 to their final height/width on mount (recharts supports this via
`isAnimationActive` + `animationDuration` props on `<Bar>`, or a
manual CSS `@keyframes` grow-in if it's a custom SVG/div bar, not
recharts).

---

## Task 4 — Promote page first section: mobile CSS overlap + black
screen + category alignment [ ]

**Ask:** "The first side of the promote page the CSS is overlapping
in mobile view there is some black screen and UI layout needs to be
changed to accommodate the fields and the alignment of the categories
should be aligned not scattered."

**Likely same root cause family as Task 6 (slider black-screen)** —
worth checking whether the black screen here is the same
backdrop-filter/GPU-layer recompositing issue, or a genuine layout
overlap (z-index / absolute positioning collision) in the URL input +
genre chips + geo targeting section.

**"Categories... aligned not scattered"** most likely refers to
`GenreChips` (the genre pill grid) and/or `GeoTargetingSection` (the
country cards) — check their grid classes:
`grid-cols-3 xs:grid-cols-4 sm:grid-cols-5` for genres — this may not
divide evenly for the current genre count (14 genres), leaving a
ragged/scattered-looking last row. Consider `justify-items-stretch`
or switching to a flex-wrap layout with consistent gap instead of a
fixed-column grid if the raggedness is the complaint.

---

## Task 5 — Pricing card redesign: hourly estimate by geography,
remove cost-per-view, polish + "solar flare" luxury effect [ ]

**Ask (paraphrased):** Stop showing "cost per view" — users care
about virality/reach, not a raw per-view number. Instead show an
hourly estimate of views based on the geography the campaign is
targeting (so the user understands *where* and *how fast* their song
is reaching, not a sterile cost figure). Make the card visually more
polished/luxury, adding a "solar flare" visual accent.

**Current state:** `PricingBreakdown` (in `promote/page.tsx`) already
computes `hourlyRate = Math.round(pricing.dailyDripRate / 24)` and
displays it as "Est. Hourly Pace" / "Delivery Rate" — so the hourly
estimate already exists. What's outstanding:
- Confirm there's no remaining "cost per view" / "per 1K views" rate
  displayed anywhere on this card or nearby (check
  `src/lib/campaign/pricing.ts` for any `pricePer1K`-style display
  still surfaced in the UI — the pricing math can keep using
  cost-per-1K internally, it just shouldn't be shown to the user).
- The "solar flare" ask is purely visual — needs a new CSS effect
  (radial gradient burst / animated glow) added to the card,
  consistent with the existing gold (`#d4af37`) luxury theme already
  used on the slider (see globals.css `.slider-gold`).
- Tie the hourly estimate more explicitly to the *selected* geography
  (currently shows "Primary Market" as a separate stat — consider
  merging into one combined "reach" statement, e.g. "~4,200/hr to
  🇳🇬 Nigeria, 🇬🇭 Ghana").

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
