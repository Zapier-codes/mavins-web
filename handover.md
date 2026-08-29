# Handover — mavins-web

> **▶ START HERE — read this box only, then go straight to work. Skip
> everything else below unless you get stuck.**
>
> **This session (2026-08-29) — Task 37 closed out, verification-only,
> no code changes.** Last session flagged that Task 37's "trigger-point"
> bullet might now be unblocked by Task 36's completion — verified this
> for real by reading the current code, not assumed: `korapay-webhook/
> index.ts`'s Task 36 Part 2 work (`createDirectCampaign()`'s branch)
> already calls `resolveOrCreateGuestUserId(supabase,
> session.customer_email)` at the moment a guest's first campaign
> payment succeeds — exactly this task's own ask, built as an emergent
> consequence of Task 36 rather than needing new code here. Confirmed
> `createDirectCampaign()` never touches any wallet RPC (satisfies the
> "wallet starts at zero" bullet) and that both guest-account-creation
> paths (deposit-first via `guestCheckout.ts`, campaign-first via this
> Edge Function) look up by email first, so a guest never ends up with
> two accounts. Task 37's box is now `[x]`. Also fixed one stale
> checkbox found along the way: Task 33 Part 2d ("deploy + end-to-end
> verification") was still `[ ]` despite this file's own earlier
> "Next task" history already confirming it deployed and went live —
> same class of drift Task 44's top-level box had before last session,
> fixed the same way. `npx tsc --noEmit` stays clean (unchanged
> baseline).
>
> **Next task, checked this session, not just carried forward:**
> **Task 33 Part 3 done** — new
> `src/components/campaign/CampaignSuccessVisualization.tsx` (shared
> user/admin success screen, animated hub-to-target-country
> visualization), wired into both of `promote/page.tsx`'s success
> moments. **Task 33's top-level box is now `[x]`** — all three parts
> (1/1b, 2/2a/2b/2c/2d, 3) are done. **Task 32 also closed out this
> session** — it was blocked on Task 33 existing, which it now does;
> verified with code (not assumed) that `initialize-payment`'s Edge
> Function always forwards a caller-supplied reference to B-Pay-
> backend's `POST /api/pay`, and left a recommendation (not an
> implementation — that code lives in a different repo, not cloned
> here) for B-Pay-backend's own session to turn its `generateReference()`
> fallback into a bug-signal log line rather than a silent default. See
> Task 32's own done-note for the full write-up.
>
> **Task 35 and Task 40 are now both closed, this session** — a new
> `platform_revenue` ledger table (migration 011) was built and wired
> into all three fee-taking call sites, closing the one shared item
> that had kept both checked open. See Task 35's own "Closed, this
> session" note for the full write-up. **Migration 011
> (`platform_revenue`) is NOT yet applied to the live DB** — same
> `supabase db push` hand-off as every prior migration.
>
> **Correction, this session — Task 30 was never actually cross-repo
> blocked; that assessment was stale and unverified.** Cloned
> `https://github.com/Zapier-codes/B-Pay-backend` directly (it hadn't
> been available in the sandbox that first flagged this as blocked) and
> read its `handover.md` for real. Two things it revealed: (1) Task 30
> only ever needed Korapay's own internal channel routing
> (mobile-money/bank-transfer/card), not B-Pay-backend's Task 10
> (which is about *provider* selection across four different payment
> providers — a different axis entirely, irrelevant here since this
> app only ever uses Korapay), and (2) the forwarding half of that
> channel routing is already built and verified on B-Pay-backend's
> side. **Net effect: Task 30 is genuinely startable now, not blocked.**
> Also found and documented (see Task 30's own "Correction, later
> session" note) a real cross-repo documentation bug: B-Pay-backend's
> file confidently claims a `korapayChannels.ts` already exists on this
> side — it does not, never has, no trace anywhere in this repo's git
> history. **Only one genuinely blocked/gated top-level task remains
> unchecked in this file: Task 46** (SPEC ONLY, its own embedded open
> questions: capability-key taxonomy, root-vs-4-total headcount) — a
> session picking that up should check with the product owner on those
> two specific questions first, rather than defaulting to file order.
>
> **Fee rate flip-flopped twice — read this before touching any fee
> code:** original code/Task 35 text: 10% campaign. A session then
> "corrected" it to 15% (Task 40), citing a product-owner confirmation.
> **The product owner has now directly re-confirmed, a second time,
> that 10% is correct — not 15%.** `PLATFORM_FEE_PERCENT` in
> `src/lib/campaign/pricing.ts` is back to `10` as of this session, with
> an inline comment pointing here. **Confirmed, current: 10% on
> campaigns, 5% on deposits — two separate rates, only summing to 15%
> when added together, never one flat 15%.** See Task 35's "Second
> correction" note and Task 40's added note (both near their own task
> headers below) for the full paper trail — do not change this constant
> again without a fresh confirmation that explicitly references this
> exact box.
>
> **Also this session — cancellation/partial-delivery refunds now
> correctly exclude the platform's cut.** Product owner confirmed
> directly: the platform keeps its 10% fee on a cancelled or
> partially-delivered campaign, only the 90% subtotal is refundable.
> Fixed `api/campaigns/create/route.ts`'s `total_budget_cents` (was
> wrongly set to the fee-inclusive total, which meant
> `api/webhooks/freshconnect/route.ts`'s refund math was refunding the
> fee too) — see Task 35's "Campaign-side audit + fix" note for detail.
> This closes Task 40's "campaign side" audit item. **Flagged but NOT
> fixed:** `api/campaigns/add-funds/route.ts` applies no fee at all to
> top-ups on an existing campaign — needs its own product-owner call,
> see that same note.
>
> **Checked Tasks 36/37 this session (traced the actual code, not just
> the "hold" note) — both confirmed genuinely blocked on Task 33 Part
> 2, not startable in any partial form:** `api/campaigns/create/route.ts`
> requires an authenticated session unconditionally, so a guest cannot
> reach campaign creation at all today; the existing guest-payment
> infrastructure (`payments/initialize`) is wired for wallet top-ups
> only, with no concept of "pay for this specific campaign" anywhere in
> it. Building Task 36's direct-pay flow means extending exactly the
> webhook-confirmation logic Part 2 owns — don't build a speculative
> version ahead of that. One genuine, standalone finding did come out
> of Task 37's audit though: its "wallet initialized" worry is **not**
> a bug — `resolveOrCreateGuestAccount`'s omitted `wallet` column
> safely defaults to `{}` (table-level `NOT NULL DEFAULT '{}'`) and
> every reader already treats that as a 0 balance. See Task 37's own
> note for detail — nothing to build there.
>
> **Task 41 (B-Pay-backend gateway) and Task 42 (this repo's signature
> swap) are both code-complete AND now confirmed deployed/live — the
> full webhook chain works end to end.** Both of Task 42's
> prerequisites were confirmed done by the product owner (env vars set
> on B-Pay-backend's Render dashboard, Korapay's own dashboard webhook
> URL re-pointed at that Render service), `korapay-webhook/index.ts`
> verifies the gateway's `X-Gateway-Signature` instead of Korapay's own
> (see Task 42's own note below for implementation detail and the
> byte-for-byte verification actually run, not just eyeballed), and as
> of this session **the product owner has confirmed the two required
> deploy commands (`supabase secrets set` +
> `supabase functions deploy korapay-webhook`) were run successfully.**
> The manual-deploy regression window this box used to warn about is
> closed — see Task 42's own entry for the confirmation note and a
> reminder of what to re-check if this ever regresses (a future
> `git push` to that function without a matching redeploy).
>
> **Next task: no longer a hold — the product owner has confirmed ALL
> pending deployments succeeded (2026-08-28, this session).** Both of
> the previously-outstanding deploy steps are now live:
> - `supabase functions deploy korapay-webhook --project-ref
>   atojskxrxfsbpeefigtm` — covers Task 33 Part 2b (deposit crediting),
>   Part 2c (`metadata.type` crediting gate), and Part 2 of Task 36
>   (direct-pay campaign creation) in one deploy, since none of those
>   shipped separately. **Task 33 Part 2d (deploy + end-to-end
>   verification) is therefore done** — the full webhook chain (Korapay
>   → B-Pay-backend gateway → this function → wallet credit /
>   direct-pay campaign creation) is live end to end, not just
>   code-complete.
> - `supabase db push` — migration 008 (`credit_wallet_refund`, Task 34)
>   is now applied to the live DB, joining migrations 004/005/007
>   confirmed earlier. All eight tracked migrations in this repo are
>   now live.
>
> No further "not yet deployed"/"awaiting deploy feedback" caveats
> apply anywhere below in this file as of this confirmation — treat any
> such wording found further down (there's a lot of it, accumulated
> across sessions) as historical, not current. **Migration 010 (Task
> 44 Part 1's five reference tables) is also confirmed live** — product
> owner confirmed directly. **Actual next unblocked work: Task 45 Part 4**
> (frontend wiring — delete the old static arrays; highest-risk part,
> done last on purpose — see that part's own entry). Task 35's two
> remaining open items (where the platform's cut gets recorded;
> whether `add-funds` should carry the fee too) are still open but
> both explicitly need a product-owner call, not something to guess at
> — pick those up only if the product owner raises them, don't treat
> them as the default next task over Part 4. Task 36 is fully done
> (Parts 1–4 all complete, see below). No task in this file is
> currently on hold.
>
> **New this session — Task 46 added (SPEC ONLY, not started): full
> admin control unit.** Product owner request, written up in full
> detail as its own task below rather than started blind, split into
> 5 parts (46a–46e) — reference-data CRUD, platform-fee arithmetic
> control, live-campaign admin overrides, the actual dashboard UI, and
> an audit trail. This directly resolves Task 44's long-open
> "admin-editing UI question." **Not inserted ahead of Task 45 Part 4
> above as the default next task** — Part 4 was already in progress
> and lower-risk; Task 46 also has several embedded product questions
> (see its own "possibly missed" section) that need answers before
> 46b/46c specifically should be started. Whichever gets picked up
> next is the product owner's call, not assumed by this note.
>
> **This session — Task 45 Part 3 done.** Both real server call sites
> (`create/route.ts`, `initialize-campaign/route.ts`) now read
> reference data via a new server-side TTL cache
> (`referenceDataCache.ts`, wrapping Part 2's shared
> `fetchReferenceData()`) instead of the hardcoded arrays.
> `initialize/route.ts` confirmed correctly out of scope (no pricing
> calls at all). Verified structurally (throwaway script, deleted
> after) that neither route reads any price/total/amount-shaped field
> from the client body at all — see Part 3's own note for the full
> writeup. `npx tsc --noEmit` passes clean. **Next: Part 4** — depends
> on Parts 1–3 all being verified, which they now are.
>
> **This session — Task 45 Part 2 done (2026-08-28).** New
> `src/lib/campaign/referenceData.ts` (plain fetch+shape function, not
> a hook — reused by Part 3 server-side) and
> `src/hooks/campaign/useReferenceData.ts` (TanStack Query, decided
> over Zustand for this data specifically — see that part's own note
> for why) + a Supabase Realtime subscription on all five migration-010
> tables that invalidates the query cache on any change. Wired in at
> the true app root (`layout.tsx`, via a new `QueryProvider` client
> component) — **not** `src/app/providers.tsx`, which turned out to be
> entirely dead code (zero importers anywhere) despite looking like the
> obvious place; flagged, not deleted. `npx tsc --noEmit` passes clean;
> `npx eslint` cannot run in this sandbox at all (pre-existing broken
> config, unrelated to this session). The live-Realtime-resync behavior
> itself still needs a human with real Supabase dashboard access to
> confirm — see Part 2's own "Verify" note for the two specific
> behaviors to check. **Next: Part 3.**
>
> **This session — Task 45 Part 1 done (2026-08-28).**
> `pricing.ts`/`geoAffinity.ts` refactored into data-parameterized pure
> functions + a `PricingStep` modifier-pipeline for `calculatePricing()`
> (six named steps, folded via `PRICING_PIPELINE.reduce(...)`) —
> `getRecommendedGeographies()` audited fresh and confirmed it does
> NOT need the same pipeline treatment (one arithmetic concern, not
> several). All four real call sites updated
> (`initialize-campaign/route.ts`, `create/route.ts`, three call sites
> in `promote/page.tsx`); `campaign.service.ts`'s `calculatePricing`
> import turned out to be stale/unused, not a real fifth call site.
> **Verified for real, not just eyeballed:** `npx tsc --noEmit` clean,
> plus a throwaway byte-for-byte comparison script (121 checks, 0
> failures) proving identical output before/after, plus a concrete
> worked-example proof that the pipeline's modularity claim holds.
> Sandbox/script deleted after, nothing extra committed. **Next: Part
> 2** (client-side store — TanStack Query vs. Zustand decision, per
> that part's own recommendation section) — depends on Part 1's
> data-parameterized functions existing, which they now do. See Task
> 45's own Part 1 entry, far below, for the full write-up.
>
> **This session — Task 45 added: SPEC ONLY, per explicit instruction,
> nothing implemented (superseded by the Part 1 implementation above,
> this note kept for the original ask's full context).** Direct
> product-owner request: the promote page's slider must never query
> Supabase during interaction (a client-side store — Zustand and/or
> TanStack Query, a real decision Task 45 Part 2 makes explicitly
> rather than assuming — fetches
> reference data once at init and resyncs only when the underlying
> Supabase data actually changes, not on a timer); separately, the
> pricing/geo arithmetic itself should be modular enough that a new
> rule "fits right in without affecting the code." Reconciles cleanly
> with the earlier "server-side pricing" ask from the same session:
> the client store/slider is a *display-only* preview, the server
> always independently recomputes the actual charge and never trusts a
> client-supplied total — Task 45 Part 3 makes this split explicit.
> Five parts: (1) extract the calculation logic into pure,
> data-parameterized functions + a modifier-pipeline extension point,
> (2) the client store itself + the resync-on-change mechanism
> (Realtime recommended, a version-check fallback documented), (3)
> server-side authoritative recomputation, (4) delete the old
> hardcoded arrays, (5) a contributor guide + concrete proof the
> "modular" goal actually holds. **Supersedes Task 44's own Parts 2-4**
> (Task 44 Part 1 — schema + seed migration — stays done, unchanged,
> and is this task's own prerequisite). See Task 45's own entry, far
> below, for the full write-up — don't start implementing without
> reading it end to end, several of its parts have explicit
> dependencies on the ones before them.
>
> **This session — Task 36 Part 4 done, closing out Task 36
> entirely.** `checkout.ts` gained `initializeCampaignCheckout()`
> (shares its checkout-redirect logic with `initializeCheckout` via a
> new private `redirectToCheckout()` helper rather than duplicating
> it); `promote/page.tsx`'s guest branch now calls it directly instead
> of routing through the wallet top-up flow, with an inline email
> field replacing the one that used to live on the fund-wallet page's
> own form. Landed on `redirectTo: '/promote?campaign_created=1'` for
> the post-confirmation destination. Flagged, not solved: a guest
> returning from a confirmed payment doesn't get signed in
> automatically — the verify route is a pure status redirect and was
> never meant to establish a session, even though the webhook has by
> then already created their account. See Task 36 Part 4's own note
> for the full write-up, the auto-login gap, and one other
> already-flagged, still-open rough edge (verify route's
> failure/pending redirects are hardcoded to `/fund-wallet?...`
> regardless of session type).
>
> **This session — Task 36 Part 3 done.** `create/route.ts`'s bare
> `401` for an unauthenticated caller now carries `code:
> 'GUEST_USE_DIRECT_PAY'` + `redirectTo:
> '/api/payments/initialize-campaign'` instead of a dead-end rejection
> — see Task 36's own Part 3 note for detail. Only Part 4 (frontend
> wiring) remains on Task 36.
>
> **Also this session, while starting Part 4 — found and fixed a live
> bug in the EXISTING guest wallet-topup flow, unrelated to Task 36
> itself but directly in Part 4's path.** `/fund-wallet/verify/page.tsx`
> still called `fetch()` + `.json()` against
> `/api/payments/verify/[reference]`, which Task 33 Part 2a had already
> rewritten to do a plain server-side redirect instead of returning
> JSON — every single payment (success or failure) threw a
> `SyntaxError` on that mismatch, stranding the guest on a broken
> screen even when their payment had already gone through. Fixed
> `checkout.ts` to navigate the browser straight to the verify route
> instead of through that now-deleted intermediate page — see Task 36
> Part 4's own note for the full writeup and what it simplifies about
> the remaining Part 4 scope (no new verify page needed for campaign
> payments either).
>
> **Also this session — a real, separate, cross-repo bug found and
> fixed first, before continuing to 2c: references never actually
> carried the `MAVW-` prefix the gateway (Task 41/42) routes on.**
> `/api/payments/initialize/route.ts` was still generating
> `WLT-<...>`/`GST-<...>`, which matched no entry in
> `webhookGateway.js`'s routing table — every webhook for a
> Mavins-web payment was silently logged "unroutable" and never
> forwarded here at all, regardless of how correct Part 1b/2a/2b's own
> logic was. Fixed to `MAVW-WLT-<...>`/`MAVW-GST-<...>`. See Task 43
> below for the full write-up.
>
> **Task group Tasks 34–40 (wallet crediting/debiting + fee +
> first-timer-vs-returning-user spec) — Tasks 34, 38, 39 now done,
> Task 40 added this session as a pure spec-clarification (product
> owner's own words, no code), three implementation tasks remain: 35,
> 36, 37.** **Task 34 done this session** (commit `150b36a`) — new
> `credit_wallet_refund` RPC (migration 008), two new server-side
> routes (`/api/campaigns/cancel`, `/api/campaigns/add-funds`)
> replacing `campaign.service.ts`'s removed `updateWallet()` direct
> write, and `create/route.ts`'s compensating refund now goes through
> the new RPC too — see Task 34's own done-note below for the full
> list. **`PLATFORM_FEE_PERCENT` is `10` again as of this session — see
> the fee-rate box at the very top of this file for the full
> back-and-forth; don't trust this paragraph's older framing below.**
> Task 40 also
> resolves where the fee math lives**: the Edge Function computes and
> deducts the fee (10% campaign / 5% deposit — see fee-rate box above,
> this paragraph originally said 15/5 before the second correction) and
> hands the RPC an
> already-net number to persist — the RPC never computes anything
> itself. This directly informs Task 35's remaining real work (the 5%
> deposit deduction, which still doesn't exist in code anywhere) and
> is worth reading in full before starting Task 35, 36, or Task 33
> Part 2 above. **Recommended order now: 35 → 36 → 37**, same as
> before minus 34/38/39. **Migration 008 (`credit_wallet_refund`) is
> now confirmed applied to the live DB** (see the deploy-confirmation
> note at the very top of this box) — the "Remote migration versions
> not found" recovery-step command in Task 38's note below is no
> longer needed for this migration specifically, only useful as
> reference if a *future* migration hits the same class of error.
>
> **Update, later session — Task 35's "remaining real work" flagged
> above already exists now.** `korapay-webhook/index.ts` (Task 33 Part
> 2b) computes and deducts the 5% deposit fee itself
> (`DEPOSIT_FEE_RATE = 0.05`, `creditDeposit()`), consistent with Task
> 40's rule — nothing further needed there. **Task 36 (guest direct-pay
> campaigns), Parts 1 and 2 of 4 now done:** Part 1 — new
> `api/payments/initialize-campaign/route.ts`, guest-only campaign-
> payment initiation, symmetric to Task 33 Part 1's wallet-topup
> initiation. **Part 2** — `korapay-webhook/index.ts` now creates the
> `users` row + `track_campaigns` row directly on a confirmed direct-pay
> payment, no wallet touched (see Task 36's own done-note for detail;
> a prior sync issue briefly left this paragraph saying "Part 1 of 4"
> even after Part 2's code had already landed elsewhere in this file —
> fixed here, this is the correct, current status). Parts 3-4
> (`create/route.ts`'s 401 becoming a redirect, frontend wiring) not
> started — see Task 36's own section for the full 4-part breakdown.
> **New rule, applied to both campaign-creation paths: no duplicate
> campaign for the same link, multiple campaigns for different links
> are fine** — see Task 36's own note for the full write-up, including
> a verified finding that an existing DB constraint that looked like it
> should cover this (`one_active_campaign_per_track`) actually never
> fires in practice. **New Task 44 added, spec only, not implemented:**
> migrate the static/hardcoded pricing tiers, duration slots, supported
> countries, genre list, and genre-country affinity table (currently
> split across `pricing.ts`, `geoAffinity.ts`, and two separate arrays
> inside `promote/page.tsx` itself) into real Supabase tables, so the
> promote
> page has no static data driving what it shows or what it charges.
> and 007 are now all confirmed applied to the live DB** (2026-08-28,
> project owner's own terminal log via `supabase db push` from
> `/root/mavins-web` — 004/005 had been sitting unapplied since Task
> 13, 007 is today's new one) — the push needed one recovery step
> (a stale remote migration-history row for Task 33's
> `payment_sessions` migration, whose timestamped file isn't checked
> into git by design; fixed via `supabase migration repair --status
> applied 20260828024711` after recreating that one file from its
> untimestamped source). **Full recovery steps and exact commands are
> in Task 38's own note below** — any future session hitting "Remote
> migration versions not found" for that same timestamp should reuse
> that fix directly, not re-investigate from scratch.
>
> **Full cross-repo status, as of this note (stale wording below this
> line predates several sessions of work — see the deploy-confirmation
> note at the very top of this box for the current, correct status):**
> - **mavins-web** (this repo) — next: **Task 30a** — see the
>   "supersedes every Next task mention above" note near the top of
>   this box, not this stale bullet (Task 36/35/44 it names are all
>   long since resolved).
> - **B-Pay-backend** — next: **Task 9b** (Task 29's
>   reconciled `src/lib/currency/countryCurrency.ts` feeding
>   `getAmountFormat`) — no other unblocked work in that repo's own
>   queue right now, Task 41's gateway build is done. "Korapay
>   only" focus is active (waiting on API keys for the other three
>   providers); everything else Korapay-eligible is done. **Not
>   re-verified this session** — check that repo's own handover.md for
>   anything newer before trusting this line.
> - **Velune** — next: **see `HANDOVER_CAMPAIGN.md` → "8. Not done /
>   open"** in that repo. No numbered task queue there (different
>   convention, established by that repo's own sessions — don't
>   force one). Current real blocker: no live Supabase credentials
>   wired in, so the built feature can't be tested end-to-end yet.
>   **Not re-verified this session.**
>
> **This session (2026-08-29, later) — planning/documentation only, no
> code changes, per explicit instruction. This supersedes every "Next
> task" mention above.** Task 30 split into 5 parts (30a-30e, see that
> task's own entry) — its real remaining scope (Korapay per-country
> channel mapping) needed a storage-approach decision first
> (recommended: extend Task 45's new Supabase-backed reference-data
> pipeline, NOT a new hardcoded file — see 30b's own note for why)
> before any code should start. Also wrote up a recommendation for
> Task 46's two open questions (capability-key taxonomy, root-vs-4-
> total headcount) — **not yet confirmed by the product owner**, see
> Task 46's own "Recommendation for unblocking both" note; don't treat
> it as a settled decision the way the ones above it in that section
> are.
>
> **Next task, unambiguously now: Task 30a** (research Korapay's real
> per-country channel availability — external research, no code) is
> the concrete next step. Task 46's 46a/46b/46c can also start per the
> recommendation above without waiting on the two open questions, but
> the hardcoded admin-password rotation should happen first, standalone
> — see Task 46's own sequencing recommendation.
>
> **This session (2026-08-29, later still) — Task 30a done, research
> only, no code.** Sourced directly from Korapay's own current docs
> (developers.korapay.com) — full write-up, with a sourced table and
> two explicitly-flagged genuine ambiguities (South Africa, Senegal)
> left unmapped rather than guessed, in Task 30a's own entry below.
> 6 of the 25 target countries got a confirmed channel mapping; the
> other 19 (17 with no Korapay coverage at all + 2 flagged ambiguities)
> fall back to Korapay's own default selection.
>
> **Next task, unambiguously now: Task 30b** (extend the Supabase
> `countries` table + `fetchReferenceData` pipeline with the channel
> data 30a just produced — see 30b's own entry for the recommended
> approach, already written up two sessions ago). This supersedes the
> "Next task: Task 30a" paragraph above.
>
> **This session (2026-08-29, later still) — Task 30b done, commit
> `49121b9`.** Migration 012 (`countries.korapay_channels`/
> `korapay_default_channel`) + `fetchReferenceData`/`TargetCountry`
> pipeline plumbing extended to carry it through — full write-up in
> Task 30b's own entry below. **Migration 012 not yet applied to the
> live DB** — same `supabase db push` hand-off as every prior
> migration. `npx tsc --noEmit` stays clean.
>
> **Next task, unambiguously now: Task 30c** (pure `country →
> {channels, default_channel}` selection function, reading the data
> 30b just plumbed through). This supersedes the "Next task: Task 30b"
> paragraph above.
>
> **This session (2026-08-29, later still) — Task 30c done.** New
> `src/lib/currency/korapayChannels.ts`, `getKorapayChannels()` — reads
> the already-fetched `TargetCountry[]` (30b's fields) directly rather
> than a second hardcoded map; verified against 8 concrete cases (a
> throwaway Node script, not just eyeballed) before treating this as
> done — full write-up in Task 30c's own entry below. `npx tsc
> --noEmit` stays clean.
>
> **This session (2026-08-29, later still) — Task 30d + 30e done,
> closing out Task 30 entirely.** Migration 013
> (`payment_sessions.channels`/`default_channel`) +
> `/api/payments/initialize/route.ts` reading Vercel's
> `x-vercel-ip-country` header (never client-supplied) +
> `initialize-payment` Edge Function forwarding both fields to
> B-Pay-backend — full write-up in Task 30d/30e's own entries below,
> including an honest note that `paymentCurrency`/DCC currency did
> **not** get this same server-side-recompute treatment (pre-existing
> gap, not fixed by this task, not a regression either). `npx tsc
> --noEmit` stays clean. **Migrations 012 and 013 both still not yet
> applied to the live DB** — same `supabase db push` hand-off as
> every prior migration.
>
> **Next task: re-check the queue for the next unblocked item —
> Task 30 (all five parts) and Task 44/45 are now the most recently
> closed; Task 46 (admin control unit, spec-only) is the next
> substantial open item, per the pointer two sessions ago.** A future
> session should re-read this box's own history above plus Task 46's
> own entry before picking a starting point, rather than assume this
> note is exhaustive.
>
> **A session does not need to ask permission before cloning another
> repo or switching context between the three** — if a task's real
> subject is a different repo (this file has several, e.g. Task 33
> below), just clone it and go. This project spans three GitHub repos
> total: `Zapier-codes/Mavins-web` (this one, lowercase `mavins-web`
> locally in Termux — **but see "Supabase CLI workflow" below: a
> *separate* clone also exists at `/root/mavins-web` inside a
> `proot-distro` Ubuntu container, used only for Supabase CLI
> commands**), `Zapier-codes/B-Pay-backend` (fork of
> `Phoenix-Boss/B-PAY-backend`), and `Zapier-codes/Velune` (Android app;
> the Mavins-relevant part lives in that repo's `HANDOVER_CAMPAIGN.md`,
> not its `HANDOVER.md`, which is an unrelated EQ/DSP subsystem in the
> same app).
>
> **Every session must update this box before ending** — whatever
> task you just finished or left off at, update "Next task" above (and
> the matching box in whichever other repo's file needs it) so the
> next session, in any of the three repos, can orient in one glance
> instead of reading this whole document. This box existing at all is
> itself the fix for a real problem: multiple past sessions duplicated
> work, and lost track of tasks, because the only way to know what was
> next was reading a 1000+ line file end to end.
>
> **This session (2026-08-29) — Task 46a UI, Part B-i done.**
> `countries` + `genres` admin CRUD tabs, built after pulling latest
> first (per direct instruction — this task's own numbering had
> already shifted underneath Task 46a's own Part A UI commit landing in
> between, a session that itself never updated this box — same class
> of drift the paragraphs above already flagged more than once; found
> it by reading Task 46a's own entry directly rather than trusting this
> box alone, which is exactly why the box says to do that). Split Part
> B (the three tables Part A's session left for later) into B-i
> (`countries` + `genres`) and B-ii (`genre_country_affinity`, the
> composite-key matrix table) per direct instruction, and built only
> B-i — B-ii is explicitly deferred, not attempted. `AdminCrudTable`
> generalized (not duplicated) with an `idKey` prop (`countries` is
> keyed on `code`, not `id`) and a new `'text-array'` column type
> (`countries.korapay_channels`, a real `string[] | null` column) —
> both changes verified backward-compatible with Part A's own two
> existing tabs. `npx tsc --noEmit` clean. See Task 46a's own entry for
> the full write-up, including the one deliberate gap left open (no
> cross-field validation between `korapay_default_channel` and
> `korapay_channels`). **Next: Task 46a Part B-ii**, or re-check the
> queue fresh — Task 46b–e are all still `[ ]` and unstarted.

---

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

**`node_modules` isn't checked in** — run `npm install` once at the
start of a session before `npx tsc --noEmit` will actually work
(otherwise every import resolves as "Cannot find module", which looks
like hundreds of type errors but is really just a missing install).
The sandbox's allowed domains include the npm registry, so this
works fine here.

**Supabase CLI workflow (confirmed working, 2026-08-28 — use this exact
path for any future task needing `supabase db push`, `supabase
functions deploy`, or `supabase secrets set`):** no sandbox session can
do this itself — no Supabase CLI, no project credentials, and (per the
deploy log this was confirmed against) the CLI's function bundler needs
`jsr.io`/`deno.land` network access this sandbox doesn't have either.
This is always a **hand-off to the project owner**, run from their own
device, not something to attempt here. What their environment actually
looks like, confirmed from a real deploy run (Task 33 Part 1):
- The CLI does not run directly in Termux's own Android userland —
  the project owner runs it inside a `proot-distro` Ubuntu container
  (`proot-distro login ubuntu`, then a `root@localhost:~#` prompt).
  Termux itself is only used to get into that container; don't write
  hand-off commands assuming `supabase` is on Termux's own `$PATH`.
- **The repo lives at `/root/mavins-web` *inside* that Ubuntu
  container** — a separate clone from whatever this repo's Termux-side
  location is (the "Unified hand-off command format" section below
  still governs where `git am`/`git push` happen, in Termux, for
  regular code patches). Supabase CLI commands specifically need to run
  from `/root/mavins-web` inside the container, not from Termux's own
  copy — the two are separate working directories on the same device,
  and a patch applied in one doesn't appear in the other without the
  project owner syncing them (e.g. re-cloning or pulling inside the
  container too).
- The project's Supabase project ref is `atojskxrxfsbpeefigtm` — reuse
  this in any future hand-off command rather than a placeholder,
  e.g.:
  ```
  proot-distro login ubuntu
  cd /root/mavins-web
  supabase link --project-ref atojskxrxfsbpeefigtm   # only needed once per container setup; already done as of this note
  supabase db push
  supabase functions deploy <function-name> --project-ref atojskxrxfsbpeefigtm
  supabase secrets set KEY=value --project-ref atojskxrxfsbpeefigtm
  ```
- **Functions deployed so far:** `initialize-payment` (Task 33 Part
  1). **Secrets set so far:** `BPAY_BACKEND_URL`. Any future function
  (e.g. `korapay-webhook`, Part 1b) or secret (e.g.
  `KORAPAY_SECRET_KEY`) needs its own explicit `deploy`/`secrets set`
  call — the CLI does not deploy every function in `supabase/functions/`
  automatically, and secrets already set don't imply a new one is.
- **The `/root/mavins-web` clone inside the container needs to be kept
  in sync separately from Termux's own clone** — `git pull` (or
  `git am` the relevant patch) *inside* the container before deploying
  any function whose source changed since that clone was last updated,
  or the CLI will upload stale code. This bit nothing yet as of this
  note, but is a real, easy-to-hit gap: a session's patch applied only
  in Termux does NOT reach `/root/mavins-web` on its own.
- Migrations specifically need the SQL file placed under
  `supabase/migrations/` with a timestamp-prefixed filename before
  `supabase db push` will pick it up — confirmed working pattern:
  ```
  mkdir -p supabase/migrations
  cp <source-migration-file>.sql "supabase/migrations/$(date +%Y%m%d%H%M%S)_<description>.sql"
  supabase db push
  ```
  (this repo's own migration files, e.g.
  `supabase_migration_006_payment_sessions.sql`, are checked in at the
  repo root as the source of truth — the timestamped copy under
  `supabase/migrations/` is what the CLI actually consumes, generated
  fresh each time rather than checked in itself).
- The CLI install itself (`curl -fsSL
  https://raw.githubusercontent.com/supabase/cli/main/install | bash`)
  and `supabase login` are one-time-per-container steps, already done
  as of this note — a future hand-off only needs the `cd
  /root/mavins-web` + the specific command, not the full install/login
  dance, unless the project owner reports the container itself was
  wiped/recreated.
- **Docker is not running in that container** (`WARNING: Docker is not
  running` appeared in the deploy log) and the deploy/push still
  succeeded anyway — Supabase CLI falls back to remote-only operation
  without it. Don't treat that warning as a failure signal or something
  to fix; it's expected in this environment.

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
typically land under shared storage after `termux-setup-storage` —
use the **"Unified hand-off command format"** section below (this is
now the single source of truth for how every session, in any of the
three repos, must give this command — kept identical across all three
repos' handover files; see that section for the full rules, this is
just the pointer):

```
git am ~/storage/downloads/mavins-web-<description>.patch
git push origin main
```

(This repo's slug for patch filenames is `mavins-web` — see "Unified
hand-off command format" for the exact naming rule and how to chain
this with another repo's commands in one line when a session touches
more than one repo.)

---

## This is a 3-repo project — read before picking a task if you got here via another repo

This project spans **three separate GitHub repos**, each with its own
`handover.md`/task queue/patch log (this file is Mavins-web's own —
not shared with the others). A task in *any* of the three repos' own
queue can point at a different repo by name (e.g. B-Pay-backend's
handover.md has tasks titled "Mavins-web: ..."); when that happens,
the session doing that work must fully switch context — clone/`cd`
into the target repo, read *that* repo's own `handover.md` as source
of truth, and use *that* repo's own commit/patch/hand-off mechanics,
not whichever repo it started in. See B-Pay-backend's own
`handover.md` → "This is a 3-repo project" section for the full
mechanics write-up (kept in one place to avoid drift across three
copies) — this block is just the pointer + this repo's own specifics.

**This repo's own mechanics, for a session that arrives here from
another repo:** confirmed this session (via the GitHub API) that
`Mavins-web` is **not a fork** — unlike B-Pay-backend, which is a fork
of `Phoenix-Boss/B-PAY-backend` and pushes through a fork→PR flow, this
repo has no upstream/PR step. Its process is: commit, `git
format-patch --stdout` (bundled, see above), hand the patch to the
human, they run `git am` **followed by `git push origin main`** (no PR
step — this repo isn't a fork, so a direct push to `main` is the whole
delivery, not just a step toward a PR). **The local clone directory
for this repo is `mavins-web`, lowercase** (see "To apply it" above) —
don't assume it matches the GitHub repo's own `Mavins-web` casing.

### Sibling repos
- **`Mavins-web`** (this repo) —
  `https://github.com/Zapier-codes/Mavins-web` — not a fork; local
  clone directory is `mavins-web` (lowercase) in Termux — regular code
  patches (`git am` / `git push origin main`) happen there. **A
  second, separate clone exists at `/root/mavins-web` inside a
  `proot-distro` Ubuntu container on the same device** — used only for
  Supabase CLI commands (`supabase db push`, `functions deploy`,
  `secrets set`), which don't run correctly in Termux's own userland.
  See "Supabase CLI workflow" near the top of this file for the full
  pattern; don't assume the two clones are in sync with each other.
- **`B-Pay-backend`** — `https://github.com/Zapier-codes/B-Pay-backend`
  — fork of `https://github.com/Phoenix-Boss/B-PAY-backend`; uses a
  fork→PR flow (commit → patch → human `git am` + `git push
  origin main` → auto-joins one open PR against upstream). See that
  repo's own `handover.md` for full detail.
- **`Velune`** — `https://github.com/Zapier-codes/Velune` — campaign
  work tracked in that repo's `HANDOVER_CAMPAIGN.md` (not `HANDOVER.md`,
  an unrelated EQ/DSP subsystem in the same app) — not a fork, direct
  push to `main`, local clone directory `Velune` (matches GitHub
  casing).

---

## Unified hand-off command format — MANDATORY, every session, all three repos

**Kept identical across all three repos' handover files — this repo's
copy, B-Pay-backend's own `handover.md`, and Velune's
`HANDOVER_CAMPAIGN.md` should all read the same here. If you edit this
section, copy the same edit into the other two in the same session**
(same rule this project already applies to the "Sibling repos" block
above).

Whenever a session finishes work — in this repo alone, or this one
plus another — the final message must end with **one single,
copy-pasteable, `&&`-chained command line** covering every repo
touched this session, nothing else. Never separate blocks per repo,
never prose interleaved between repos, never a bare `git am` without
its `git push` right after it:

```
cd ~/<repo-1-local-dir> && git am ~/storage/downloads/<repo-1-slug>-<description>.patch && git push origin main && cd ~/<repo-2-local-dir> && git am ~/storage/downloads/<repo-2-slug>-<description>.patch && git push origin main
```

Extend with more `&& cd ~/<repo> && git am ... && git push ...`
segments for however many repos were actually touched. A single-repo
session still uses this exact shape — just a one-segment chain, not a
different/shorter format.

**Fixed rules:**
1. Patch filenames: always `<repo-slug>-<short-description>.patch`,
   lowercase-hyphenated. Fixed slugs: `mavins-web`, `b-pay-backend`,
   `velune`.
2. `cd` targets use each repo's **real local folder name/casing**,
   which is NOT always the slug or the GitHub name:
   - Mavins-web → `cd ~/mavins-web` (lowercase — GitHub repo is
     capitalized `Zapier-codes/Mavins-web`, the local clone is not)
   - B-Pay-backend → `cd ~/B-PAY-backend` (matches GitHub casing)
   - Velune → `cd ~/Velune` (matches GitHub casing)
3. Every repo segment gets its own `git push origin main` right after
   its own `git am` — never batch every `git am` first and push once
   at the end.
4. All three currently push the same way (`git push origin main`) —
   B-Pay-backend's still auto-joins its open upstream PR on push, no
   extra command. If any repo's push mechanics ever change, update
   this section (in all three files) and that repo's "Sibling repos"
   entry together.
5. Nothing between or after the chain — explanatory prose goes before
   this command block, never interleaved with or appended after it.

See B-Pay-backend's own `handover.md` → "Unified hand-off command
format" for the full original write-up with complete rationale for
each rule — this is the same content, kept in sync.

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

## Task 11 — Admin launch button shows no price [x]

**Resolved.** Product owner confirmed live: the "Launch Campaign"
button now correctly shows no price for the admin account. Data
(`role = 'admin'`) and code (`isAdmin` branching in both the button
text and `createCampaign()`'s wallet-deduction skip) were already
independently confirmed correct in earlier sessions — this closes the
loop with a live behavioral confirmation.

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

## Task 12 — Fix "cannot locate function get_wallet_id" error [x]

**Resolved.** Product owner confirmed this is fixed. This task had
been genuinely blocked in this repo across multiple sessions — an
exhaustive repo-wide grep never turned up `get_wallet_id` anywhere in
app code or the tracked `.sql` files, so whatever it was calling must
have lived only in the live Supabase DB (a stray trigger/function
created outside version control) and was resolved directly there,
outside this repo's commit history. No corresponding code change
exists in this repo for this task, by design — nothing here needed
fixing once the live DB was.

**History, kept for context:** this was blocked across multiple prior
sessions — `grep -rn "get_wallet_id" .` across the entire repo (app
code + all three `.sql` files) always returned zero matches, and a
full `information_schema.columns` / `pg_proc` dump against the live DB
(done during Task 13) confirmed nothing by that name existed there
either at the time. The conclusion each time was that it had to be a
stray trigger/function/constraint created directly via the Supabase
SQL Editor or Table Editor UI, outside of anything tracked here —
which the product owner has now confirmed was the case, resolved
directly on the live DB.

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

**Applied, 2026-08-28** — confirmed via the project owner's own
terminal log, `supabase db push` from `/root/mavins-web` inside the
`proot-distro` Ubuntu container (see "Supabase CLI workflow" near the
top of this file), timestamped as `20260828041716_credit_wallet_deposit.sql`
and `20260828041717_guest_account_columns.sql`. Applied in the same
batch as Task 38's migration 007 below — see that task's own note for
the one recovery step this run needed (a stale remote migration-history
row for Task 33's `payment_sessions` migration, from before this
container's clone was last reset, had to be repaired first). Both
`credit_wallet_deposit` and the `profile_completed`/`is_guest_created`/
`username`-derivation fixes are now live. **Still not end-to-end
tested with a real Korapay webhook delivery** (deploying clean isn't
the same as a live delivery actually working) — that's still open.

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
"Wallet" not the earnings label [x]

**Done in commit `e8c8b44`.** Header.tsx's wallet pill was a plain
`<div>` — wrapped it in a `Link href="/earnings"` (with a hover state
so it visibly reads as tappable). Renamed the user-facing label from
"Earnings"/"Earn" to "Wallet" everywhere it appears alongside that
route: `Sidebar.tsx` nav item, `MobileNav.tsx` tab, the home page
"Quick Actions" tile, and both `<h1>` headings on the earnings page
itself (signed-out and signed-in states).

**Deliberately kept the `/earnings` route path itself unchanged** —
renaming the URL/directory would also mean touching
`middleware.ts`'s route matcher and unrelated internal names
(`earningsTicker.service.ts`, `EarningsMarquee.tsx`, the `campaignEarnings`
state, etc.) that aren't part of this ask and aren't user-facing. Also
left the "Total Earned" stat label and "Track your campaign revenue and
wallet" subtitle alone — those describe the data, not the page/section
identity, so didn't need the same treatment as the page title itself.

Grepped `src` for every remaining `'Earnings'`/`'Earn'` string after
the change — zero user-facing occurrences left.

Verified via `npx tsc --noEmit` — clean (see the updated protocol
above — `npm run build` is a known sandbox-only failure now, not part
of the gate).

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
delete, in case it's needed later) [x]

**Done in commit `4a62796`.** No withdrawal functionality is
user-facing anymore:
- `src/app/earnings/page.tsx` — commented out the withdraw state, the
  `handleWithdraw` handler, the success banner, and the entire
  "Withdraw Funds" form card. Each block marked
  `// WITHDRAWALS DISABLED — see Task 21`. The "Pending"/"Available"
  stat tiles were left alone — they're a read-only derived display of
  existing `wallet_ledger` debits, not a withdrawal action.
- `src/app/api/withdrawal/request/route.ts` — `POST` now
  short-circuits with a `403` "Withdrawals are temporarily disabled."
  response; the full original handler is preserved below it,
  commented out, ready to restore.

**Full audit of the other known surface area, before touching
anything (per the task's own instruction) — none needed a change:**
- `src/app/api/withdrawal/stats/route.ts` — grepped the whole `src`
  tree; nothing calls this endpoint. It's read-only (returns numbers,
  moves no funds), so it's outside the user-facing surface this task
  targets. Left untouched with a comment documenting the finding,
  rather than commenting out working unreferenced code.
- `src/app/admin/page.tsx` — the one `withdrawal` hit is a ledger-row
  badge color for historical entries, not an approval/action UI —
  there's no withdrawal-request admin flow to disable. Kept, since
  the task explicitly flagged admin visibility into past entries as
  possibly worth keeping.
- `src/services/notifications/notifications.service.ts` — the
  `withdrawal_requested` entry in `TYPE_META` is read-back display
  metadata for already-existing notifications, not something that
  fires a new one (that lived in the now-disabled request route).
  Kept so old notifications still render with a proper label instead
  of falling back to generic "system".

Verified via `npx tsc --noEmit` — clean.
**Not verified:** an actual live click-through on `/earnings` to
confirm the form is gone and the page still renders normally (no
sandbox network access to the live Supabase project) — recommend a
quick visual check after deploying.

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

## Task 22 — Settings page not fully wired [x]

**Ask:** `/settings` (`src/app/settings/page.tsx`, 258 lines) has UI
that isn't fully connected to real data/actions yet — exact scope
not specified by product owner beyond "not fully wired." Next session
should open this file, list every field/toggle/button on the page,
and check each one against whether it actually reads from and writes
to Supabase (vs. static/placeholder state), then report back the
specific list of what's disconnected before fixing anything — this
task is too vague to safely fix blind in one pass.

**Report-back audit done this session (reading only, per the task's
own instruction — not fixed, still `[ ]`):**
- **Profile section — actually wired.** `artistName`, `email`,
  `location`, `genre`, `whatsapp`, `instagram`, `twitter`, `tiktok`,
  `spotifyId` all sync from the loaded `user` on mount and
  `handleSave()` does a real `supabase.from('users').update(...)`
  keyed on `user.id`. This part works.
- **Notifications tab — wired, but only as a link.** `href:
  '/notifications'`, so clicking it navigates away; nothing on
  `/settings` itself renders notification prefs. Not necessarily a bug
  (may be intentional — a separate page) but worth confirming that's
  the intended design vs. an inline panel being expected here.
- **Security tab — dead.** `href: null`, `active: false`. Clicking it
  does nothing (`onClick={() => s.href && router.push(s.href)}` is a
  no-op when `href` is `null`). No security UI exists anywhere on this
  page (no password change, no 2FA, nothing).
- **Appearance tab — dead, and the theme toggle is imported but never
  used.** Same `href: null` no-op as Security. `useTheme()` is
  destructured for `mode` and `toggleTheme`, but neither is rendered
  or wired to any control on the page — there's no dark/light switch
  UI here at all despite the hook being pulled in specifically for
  that purpose.
- Not checked yet: whether `/notifications` (the page this tab links
  to) is itself fully wired — out of scope for this file-level audit,
  would need its own look.

**Suggested next step, still unconfirmed with product owner:** the
likely fix is either (a) make Security and Appearance real inline
panels (password/2FA fields; the existing `toggleTheme` control wired
to a visible switch), or (b) if they're meant to be separate pages
like Notifications, give them real `href`s and build those pages —
needs a decision on which before implementing either.

**Decision + fix done in commit `c70d172`.** Product owner picked
option (b), separate pages like Notifications:
- `src/app/security/page.tsx` (new) — change-password form
  (`supabase.auth.updateUser({ password })`) and a sign-out button
  using the existing `useAuth().signOut()`. Gated behind a sign-in
  prompt, same pattern as `/notifications`.
- `src/app/appearance/page.tsx` (new) — a real dark/light theme
  picker, wired to `ThemeProvider`. Not auth-gated (local device
  preference). Required adding `setMode(mode)` to `ThemeProvider`
  alongside the existing `toggleTheme()` so a specific mode can be
  selected directly rather than only flipped — `toggleTheme()`/`mode`
  are unchanged for the two pre-existing consumers (`Header.tsx`, and
  `settings/page.tsx` itself, which no longer touches theme state at
  all now that the tab is just a link).
- `settings/page.tsx` — Security/Appearance tabs now have real
  `href`s instead of `null`; dropped the unused `useTheme()` import
  that was sitting there with no UI ever wired to it.

Verified via `npx tsc --noEmit` — clean. **Not verified:** an actual
`supabase.auth.updateUser()` call against a live Supabase project (no
sandbox network access) — worth a real password-change test after
deploying. This also assumes the Supabase project's auth config
allows changing the password from an active client session without
re-entering the current one (Supabase JS's client-side default) —
worth confirming that's actually how this project is configured.

---

## Task 23 — Promote page: shuffle 8-of-25 countries by genre, cap
selection at 3 of the shown 8 [x]

**Ask:** The country-targeting pool should be the full 25 countries,
but the picker should only ever show 8 at a time, reshuffled based on
the genre the artist selects (presumably weighted toward that genre's
best-fit markets, similar in spirit to the existing affinity table),
and the artist can select at most 3 of *those 8 shown* — not 3 of the
full 25.

**Part 1 done in commit `3d8dd90`.** Grew `TARGET_COUNTRIES` from 14
to 25 by adding: Côte d'Ivoire, Senegal, Tanzania, Uganda, Egypt (West/
East African Afrobeats-adjacent markets), plus Mexico, Spain, Italy,
Australia, Sweden, South Korea (major global/IFPI-tracked streaming
markets not previously covered). Filled in affinity scores for all 11
new countries across all 14 existing genre rows in
`GENRE_COUNTRY_AFFINITY`, following the same conservative hand-tuned
banding as the existing entries (not empirically measured — same
caveat as the rest of this table). Confirmed via grep that no other
file hardcodes an assumption about pool size; `promote/page.tsx` only
ever does `TARGET_COUNTRIES.find(...)` lookups by code.

**Part 2 done in commit `e732766`.** Product owner confirmed the
open question: the shown 8 should re-shuffle every time (not stay
stable for a session), weighted by the selected genre, so the artist
never sees a fixed set. Added `getGeoTargetingPool(genre,
homeCountryCode, poolSize = 8)` to `geoAffinity.ts` — weighted
sampling without replacement (roulette-wheel selection) over
`getRecommendedGeographies()`'s full 25-country ranking, so
higher-affinity markets show up more often but the exact 8 varies
draw to draw. `GeoTargetingSection` in `promote/page.tsx` now renders
this 8-country pool (`shown`) instead of the full 25 (`ranked`), via
a `useMemo` keyed on `[genre, homeCountryCode]` — it reshuffles
whenever the artist picks a different genre. The existing
`MAX_COUNTRIES_FREE = 3` cap (Task 10) needed no change: it already
just counts entries in `selectedCodes` regardless of what's rendered,
so it now naturally caps at 3 of the shown 8.

Verified with a standalone script: 20 draws for the same genre always
returned exactly 8 distinct codes with zero duplicates, and all 25
countries appeared somewhere across those 20 draws. Also verified via
`npx tsc --noEmit` — clean.

**Left alone on purpose:** the second `getRecommendedGeographies()`
call further down `promote/page.tsx` (used to find the best-scoring
match among the artist's *already-selected* countries, for a
pricing-summary display) still scans the full 25 — correct, since a
selection made under one shuffled 8 must still resolve after the
picker reshuffles to a different 8.

**New edge case found, not fixed — needs a product decision:**
selecting a country, then changing genre so the picker reshuffles to
a set that no longer includes it, leaves that code still counted in
`targetCountries` (visible in `SelectedCountriesStack` and the
"Targeting N markets" line) but no longer visible/togglable in the
picker itself, until a later reshuffle happens to bring it back. This
wasn't possible before (all 25 were always shown), so it's newly
introduced by this task's own ask, not a pre-existing bug. Options for
a future session: auto-clear selections that fall outside the newly
shown 8 on genre change, or add a small "also selected (not shown)"
affordance so the artist can still deselect it. Needs the product
owner's preference before picking one.

---

## Task 24 — Korapay "Endpoint not found" error — fully wire the render
backend proxy [x]

**Ask:** Product owner is seeing a Korapay "Endpoint not found" error.
Context given: Korapay requires IP whitelisting, and since this app's
own hosting has no fixed outbound IP, a separate instance was hosted
on Render specifically to get a stable outbound IP to whitelist with
Korapay — that Render instance (`https://b-pay-backend.onrender.com`)
is supposed to be the *only* thing that talks to Korapay directly;
this app should only ever call the Render instance.

**Done in commit `20926bd`.** Confirmed the actual bug by fetching the
Render backend's own root URL — it self-reports its route table:
```
GET https://b-pay-backend.onrender.com/
→ {"name":"B-Pay Backend","version":"1.0.0","status":"running",
   "endpoints":{"health":"/health","pay":"/api/pay",
                "verify":"/api/verify","myIp":"/my-ip"}}
```
`korapay.service.ts` (written when the render-proxy switch happened,
commit `115921c`) was calling `POST /initialize` and `GET /verify/:ref`
— neither of which exist on this backend. Every call 404'd against the
backend's own catch-all handler before ever reaching Korapay — that
404 response is almost certainly the literal source of the "Endpoint
not found" message the product owner is seeing. Fixed to call
`POST /api/pay` and `GET /api/verify`.

**Second, separate bug found in the same area:**
`src/app/api/payments/verify/[reference]/route.ts` (the route the
browser hits landing back from Korapay's checkout page) had **never
been switched over to the proxy at all** — it called
`https://api.korapay.com/merchant/api/v1/charges/:reference` directly
with `KORAPAY_SECRET_KEY`. That's exactly the problem the whole
render-proxy architecture exists to avoid: this route runs on Vercel
(or wherever the Next app is hosted), which has no whitelisted IP, so
Korapay would reject it. Rewired to call `verifyCharge()` from
`korapay.service.ts` (i.e. go through the Render proxy) instead.
`KORAPAY_SECRET_KEY` is now unused anywhere in this Next.js app — that
looks correct given the architecture (the secret key belongs on the
Render backend, which is the only thing whitelisted to use it), but
worth a sanity check with the product owner that nothing else still
expects it set here.

**Third bug, found while fixing the second:** the guest-checkout
branch in that same verify route checked
`existing?.metadata?.guest_checkout`, a flag that is **never set
anywhere** — `/api/payments/initialize` actually stores
`type: 'wallet_topup_guest'` + `guest_email` in `payments.metadata`
for guest checkouts. So even once verification itself worked, a guest
who completed a Korapay payment would never have gotten an account
created / wallet credited via this route. Fixed the check to match
what's actually stored, and added a fallback so the guest's email is
read from that stored `guest_email` if the proxy backend's `/api/verify`
response doesn't include Korapay's `customer.email` field (see next
section — that response shape isn't fully confirmed).

**Also corrected while in the file:** `ChargeStatusResponse`'s
`status` field was typed as `'successful'`, but Korapay's own
published API docs/samples show the real value is `'success'` — kept
both as accepted values defensively. Added the optional `customer`
field Korapay's real charge object includes (used for the guest-email
fallback above).

**Not fully confirmed — flagged clearly in code comments, needs a
live test or the backend's own source to close out:**
- `/api/verify`'s exact request shape. The backend's self-reported
  route list shows it flat, with no `:reference` placeholder — but so
  does `/api/pay`, which definitely needs its params in a POST body,
  not a path segment, so the omission alone doesn't prove `/api/verify`
  takes a query param instead of `/api/verify/<reference>`.
  `verifyCharge()` now tries the path-segment form first and falls
  back to a query param (`?reference=`) on a 404 response, so it
  self-heals against either convention without a live test — but
  confirming the real contract (ideally by reading the Render
  backend's own source, if that's accessible somewhere, or a live
  end-to-end payment) and simplifying to just the one that's actually
  right is worth doing next session.
- Whether `/api/pay`'s response body is a raw pass-through of
  Korapay's own `{status, message, data: {checkout_url, reference,
  ...}}` shape, or something the backend reshapes. Left the existing
  parsing as-is (it already expects Korapay's native shape) since
  that's the most likely design for a thin proxy, but this is an
  assumption, not a confirmed fact.
- Whether `/api/verify`'s response includes Korapay's `customer`
  object — see the `guest_email` fallback above, added specifically to
  not depend on this being true.

**Much bigger, separate finding — do NOT attempt to fix blind, needs
live DB access first:** both this verify route and
`src/app/api/payments/webhook/route.ts` `SELECT` from a `payments`
table (`.from('payments')`) to look up `user_id` before crediting a
wallet. That table does **not appear anywhere in `supabase_schema.sql`**,
and grepping the whole `src` tree turns up **no `INSERT` into
`payments` anywhere in this codebase** — nothing ever writes a row for
either route to find. If that table genuinely doesn't exist live
either, both the verify-on-redirect flow and the webhook flow would
silently no-op on the wallet-crediting step for every authenticated
top-up (the `if (existing?.user_id)` / `if (payment.user_id)` guards
would never pass), on top of whatever this session fixed. Given this
repo's confirmed history of the live DB diverging from
`supabase_schema.sql` (see Tasks 1, 13, 14), it's very possible
`payments` exists live and just isn't tracked in the schema file —
but that needs a live `information_schema.columns` check (same method
Task 13 used) before touching anything, not a guess. If it turns out
to be real, this is likely the single biggest remaining gap in "fully
complete the integration" — worth prioritizing next session, and
worth testing with an actual live payment end-to-end once confirmed,
since none of this (this task included) has been exercised against a
real Korapay transaction from this sandbox.

Verified via `npx tsc --noEmit` — clean. **Not verified:** an actual
live payment end-to-end (initialize → pay on Korapay's checkout →
land back on `/verify` → wallet credited) — no sandbox network access
to Render, Korapay, or Supabase from here. Strongly recommend a real
test transaction after deploying this, specifically checking whether
the path-segment or query-param form of `/api/verify` is the one that
actually responds (server logs or a Render dashboard request log
would show which one 404'd and which one didn't).

---

## Task 25 — URGENT: fund-wallet page rejects a correctly-entered
email with "Email Address is required" [x]

**Ask:** Product owner reported that on `/fund-wallet`, entering an
email and pressing "Continue to payment" fails with `API request
failed: Email Address is required`, even though the email field was
filled in correctly.

**Root cause found:** `initializeCharge()` in
`src/services/payment/korapay.service.ts` was sending the payer's
email/name as flat top-level `email` / `name` fields in the POST body
to the render backend's `/api/pay`. Korapay's own API — confirmed
across their published docs for checkout (both redirect and standard),
mobile money, and pool accounts — always expects these nested under a
`customer: { name, email }` object instead. Since the render backend
is a thin proxy that most likely passes the body through close to
unchanged, the flat `email` field was never being found where the
backend/Korapay looks for it — regardless of what the user typed into
the form, it was never reaching the right key. Neither the React form
(`src/app/fund-wallet/page.tsx`) nor the `/api/payments/initialize`
route needed any changes; both were already correctly forwarding the
user's email down to `initializeCharge()`. The bug was isolated to
this one payload shape.

**Fix applied in commit `2c00401`.** Nested `email`/`name` under a
`customer` object in the request body sent to `/api/pay`.

**Not fully confirmed — same caveat as Task 24:** whether the render
backend re-shapes the body before forwarding to Korapay, or passes it
through as-is. If it reshapes it, this fix assumes the *proxy's own*
field naming matches Korapay's native convention — reasonable for a
thin proxy, but not verified against the backend's own source. Worth
a live top-up test after deploying to confirm the checkout URL now
returns successfully instead of erroring.

Verified via `npx tsc --noEmit` — clean. **Not verified:** an actual
live payment (no sandbox network access to the Render backend or
Korapay from here) — same limitation noted throughout Task 24.

## Task 26 — Korapay top-up amount bug: wrong currency default + no client-side conversion (cross-repo, originated as B-Pay-backend's own Task 16) [x]

**Origin:** B-Pay-backend's handover.md Task 16 ("Clone Mavins-web,
diagnose the Korapay amount bug") — see that repo's own file for the
pointer back to here; this entry is the actual work record, per this
project's cross-repo continuation convention.

**What was found (first pass):** `fund-wallet/page.tsx` multiplied the
USD-dollar amount coming from `promote/page.tsx` (mislabeled
`amountNaira`, actually always USD — `totalCostCents / 100`) by 100
before sending it to `/api/payments/initialize`, while hardcoding
`currency: 'NGN'`. That value flowed unconverted through
`korapay.service.ts` and B-Pay-backend's Korapay provider (confirmed
base-unit behavior, B-Pay-backend Task 7) straight to Korapay, which
treated it as naira. Net effect: a $50 top-up sent `amount: 5000` to
Korapay tagged `currency: NGN` — a currency-code lie on top of a 100x
unit error.

**Project owner correction (this session, mid-fix):** the first pass
above just removed the ×100 and kept `currency: 'NGN'` as the "real"
default — **wrong**. Per the project owner: this app's default/display
currency is **USD**, not NGN, and the app should not do its own
currency math or default to any one country's currency at all. Korapay
has its own **Dynamic Currency Conversion (DCC)** product — confirmed
directly against developers.korapay.com/docs/dynamic-currency-conversion
— where the merchant sends the charge in its own base currency plus a
`payment_currency` (what the payer sees, converted at Korapay's live
rate) and `settlement_currency` (what the merchant is paid in); Korapay
does the conversion, not the app. The existing `ipapi.co`-based geo
detection (`ipGeolocation.service.ts`, previously only used for
targeting-recommendation nudges) is the right signal for
`payment_currency` — no separate integration needed, just a new
consumer of it.

**What was actually implemented this session:**
- `src/lib/currency/korapayDccCurrency.ts` (new) — country code →
  Korapay-DCC-supported currency map, restricted to Korapay's own
  confirmed-supported list (NGN, GHS, KES, ZAR, EGP, TZS, XAF, XOF —
  see B-Pay-backend Task 7). Countries outside this map (including
  US/UK/etc.) correctly get no DCC — direct USD charge.
- `src/services/payment/korapay.service.ts` — `currency` default
  changed `NGN` → `USD`; added optional `paymentCurrency`/
  `settlementCurrency` on `InitializeChargeInput`, forwarded to the
  render backend as `payment_currency`/`settlement_currency` only when
  both are set.
- `src/app/api/payments/initialize/route.ts` — default currency
  `USD`; accepts an optional client-supplied `paymentCurrency` and
  forwards it + a hardcoded `settlementCurrency: 'USD'` through to
  `initializeCharge()`; minimum-amount check changed from the
  NGN-scale `amount < 100` (now meaningless in USD) to a placeholder
  `amount < 1` floor — **explicitly flagged as a placeholder, not a
  considered business minimum**; replace with a real number if the
  project owner wants one.
- `src/app/fund-wallet/page.tsx` — calls `detectUserGeo()` +
  `getKorapayDccCurrency()` on mount, sends the result as
  `paymentCurrency` (omitted entirely if detection fails or the
  country isn't DCC-mapped); sends `amount` as-is in USD, `currency:
  'USD'`; UI label/step/min changed from ₦-scale to $-scale; minimum
  top-up error message updated to match.
- `src/app/promote/page.tsx` — renamed `amountNaira` → `amountUsd`
  (same math, `totalCostCents / 100`) purely to stop the misleading
  name from causing the same confusion again.
- **B-Pay-backend** (separate repo/commit, see that repo's own
  handover.md) — `routes.js` and `providers/korapay.js` updated to
  accept and forward `payment_currency`/`settlement_currency` through
  to Korapay's API; previously these fields would have been silently
  dropped even if this repo sent them, since `routes.js` destructured a
  fixed field whitelist that didn't include them.

**What this does NOT resolve — real, unverifiable-from-code
prerequisite:** Korapay's DCC requires (1) the merchant account to have
Currency Conversion product access, which Kora grants manually
(`request access from [email address in their docs]`), and (2) a
per-currency dashboard toggle — Settings → Settlements → "Allow this
merchant to settle payments in another currency" — enabled for USD
specifically. Neither can be checked or set from this codebase. **If
these aren't enabled on the live Korapay account, DCC requests will
fail** — the code now sends `payment_currency`/`settlement_currency`
correctly, but Korapay may reject them until the account side is
configured. This should be confirmed directly with Korapay (or in
their dashboard) before relying on this in production, and is exactly
the kind of thing B-Pay-backend's own Task 14 (end-to-end manual test
pass, blocked on real sandbox keys) would have caught — flagging the
dependency here since it's now relevant to two repos' queues, not
duplicating a new task for it.

**Not touched, out of scope this session:** the wallet-crediting
webhook (`src/app/api/payments/webhook/route.ts`) already assumed
USD-denominated storage (`p_currency DEFAULT 'USD'` in the RPC,
confirmed by reading `supabase_migration_004_credit_wallet_deposit.sql`
directly) and multiplies Korapay's *returned* amount by 100 for
internal cents storage — this was already correct and needed no
change; the bug was isolated to the outbound initialize call.

Verified via `npx tsc --noEmit` — clean, no errors, across all touched
files (checked twice, before and after the `promote/page.tsx` rename).
`node --check` passing on both touched B-Pay-backend files (that
repo's own verification step). ESLint could not be run in this sandbox
(`ERR_PACKAGE_PATH_NOT_EXPORTED` on `eslint.config.mjs` against the
installed `eslint@8.57.1` under Node 22 — pre-existing sandbox/toolchain
mismatch, unrelated to this change; not something a future session
should try to "fix" without checking whether it reproduces outside
this sandbox first).

---

## Task 27 — GeoProvider: ipapi.co geo-detection at app initialization, global + login-persistent (cross-repo, originated as B-Pay-backend's own Task 25) [x]

**Origin:** B-Pay-backend's handover.md Task 25 ("Mavins-web: ipapi.co
geo-detection at app initialization, global + persistent-through-login,
NOT stored in Supabase") — see that repo's own file for the pointer
back to here; this entry is the actual work record, per this project's
cross-repo continuation convention.

**What was already true before this session, confirmed by reading the
code rather than assuming:** `detectUserGeo()`
(`src/services/geo/ipGeolocation.service.ts`) already did almost
everything the task asked of the underlying *fetch* — module-level
in-memory cache (dedupes concurrent calls across the whole app already,
even before this session's changes), `sessionStorage` (not
`localStorage`), graceful `null` on any failure (ad blockers, rate
limits, offline), and an explicit doc-comment already stating the "no
Supabase, no raw IP persisted" principle. **What was missing was
architectural, not the fetch itself:** it was only ever called ad hoc,
independently, from two page components (`promote/page.tsx`,
`fund-wallet/page.tsx`), each running its own `useEffect` +
`detectUserGeo().then(...)` + local `useState` boilerplate. That means
detection only ever triggered on first visiting one of those two
specific pages — not "at initialization of the webapp... on user visit"
as the task required — and there was no single shared loading state.

**What was implemented:**
- `src/components/providers/GeoProvider.tsx` (new) — a
  `createContext`/`useContext` provider exposing `useGeo() → { geo,
  loading }`, matching `ThemeProvider`/`useTheme()`'s exact existing
  pattern in this codebase (same file structure, same hook-export
  convention) rather than inventing a new one. Fetches via the existing
  `detectUserGeo()` once, in a `useEffect` with an empty dependency
  array, on mount.
- `src/app/providers.tsx` — `GeoProvider` now wraps `AuthProvider`
  (which wraps `ThemeProvider`) as the **outermost** provider in the
  tree — not a sibling nested at the same level, but structurally
  further out than `AuthProvider` entirely. This is what makes "persists
  through login" true as an architectural guarantee rather than an
  incidental behavior: `GeoProvider` never reads `useAuth()` or any
  session state, and sits outside the subtree `AuthProvider` controls,
  so there is no code path — today or after a future refactor inside
  `AuthProvider` — by which a login/logout event could cause it to reset
  or remount.
- `src/app/promote/page.tsx` and `src/app/fund-wallet/page.tsx` — both
  migrated off their own `detectUserGeo()` calls to `useGeo()` from the
  new provider. Behavior preserved exactly: `promote/page.tsx` still
  derives `localCurrency`/`homeCountryCode` the same way, just from the
  shared `geo` value via a `useEffect` keyed on `[geo]` instead of its
  own fetch; `fund-wallet/page.tsx` still computes `dccCurrency` via
  `getKorapayDccCurrency(geo?.countryCode)` the same way, gated on the
  shared `loading` flag (renamed `geoLoading` locally to avoid shadowing)
  so it only runs once detection has actually settled, matching the
  original code's "wait for the promise to resolve, then compute" timing
  exactly (whether that resolution already happened before this
  component mounted, or happens while it's mounted — both cases verified
  to fire the effect correctly, since React always runs a `useEffect` at
  least once after mount regardless of whether its dependencies
  "changed" from a prior render).
- Confirmed via `grep` that no other file in `src/` calls
  `detectUserGeo()` directly anymore — `currency.service.ts`'s only
  reference to it is a doc-comment, not a call — so there is now exactly
  one fetch path into this data for the whole app, satisfying the "no
  other part of the codebase makes its own separate call" check the
  originating task specifically flagged as a risk.

**Deliberately not changed:** `ipGeolocation.service.ts` itself —
already correct as described above, no reason to touch a working,
already-industry-standard implementation (sessionStorage over
localStorage, module-level dedupe, graceful-null contract every caller
already respects). Did not add a manual currency-override UI or touch
Task 26's DCC currency logic — `getKorapayDccCurrency` is unchanged,
only *how* `fund-wallet/page.tsx` obtains the `geo` it feeds into that
function changed.

**Not verified — no way to check this from a sandbox:** actual
first-visit timing in a real browser (does the fetch genuinely fire
before/independent of any auth hydration in production, not just "the
code has no dependency that would prevent it") — this sandbox has no
browser. If a future session or the product owner notices the fetch
still isn't firing until a specific page is visited, the first thing to
check is whether `src/app/layout.tsx` actually renders `<Providers>`
unconditionally at the true root (expected, but not directly re-verified
this session beyond confirming `providers.tsx`'s own export shape).

Verified via `npx tsc --noEmit` — clean, no errors, across all three
touched files plus the new one. `node --check`-equivalent for this repo
is `tsc`, no separate check needed. ESLint could not be run in this
sandbox (pre-existing `ERR_PACKAGE_PATH_NOT_EXPORTED` toolchain mismatch,
noted already in Task 26 — not re-attempted, not something to "fix" as
a side effect of this task).

---

## Task 28 — Skip fund-wallet/email step for already-authenticated users [x]

**Done in commit `a5cfd52`.** Migrated from B-Pay-backend's own
`handover.md` (that repo's Task 17) — that repo's copy is now
historical only.

**Corrected mid-session, per explicit product-owner clarification —
the original framing above ("branch on auth state") was slightly
wrong:** the axis that actually matters isn't authenticated-vs-guest,
it's whether the account has ever held funds at all. A brand-new
authenticated user has a wallet balance of exactly 0 (covers both "no
wallet row yet" and "wallet exists but empty") — provably has nothing,
so there's no point attempting `createCampaign` and parsing its error
string; go straight to checkout. A *returning* user with a real (if
possibly insufficient) balance keeps the original attempt-then-catch-
insufficient-funds flow, since they may already have enough.

Implementation: `getWalletBalanceCents(user)` (new, `src/lib/payments/
wallet.ts` — reads the already-loaded `user.wallet`, zero extra
fetch, deduped out of `LayoutContent.tsx`'s private copy of the same
logic) checked in `promote/page.tsx`'s `handleSubmit` **before**
attempting campaign creation for an authenticated user. Balance `=== 0`
→ `goStraightToCheckout()` (new — calls the extracted
`initializeCheckout()` helper in `src/lib/payments/checkout.ts`
directly, no `/fund-wallet` page visit at all). Balance `> 0` →
attempt `createCampaign` as before; an insufficient-funds error now
also routes to `goStraightToCheckout()` instead of the old
`/fund-wallet` page redirect. Guests (no session) are unaffected —
they still go through `goFundWalletGuest()` → the `/fund-wallet` page,
since a genuine guest has no known email to skip collecting.

`fund-wallet/page.tsx` itself now calls the same shared
`initializeCheckout()` helper instead of duplicating the fetch/
URL-validation/redirect logic inline — pure dedup, guest-facing
behavior unchanged. Verified via `npx tsc --noEmit` → clean.

---

## Task 29 — Reconcile `TARGET_COUNTRIES` vs `COUNTRY_CURRENCY` into one source of truth [x]

**Migrated from B-Pay-backend's own `handover.md` (that repo's Task
18) — that repo's copy is now historical only; this is the real,
active copy.**

**Done in commit `81aa036`.** New `src/lib/currency/countryCurrency.ts`
is keyed 1:1 with `TARGET_COUNTRIES` (the authoritative list) and
nothing else — `promote/page.tsx`'s separate 20-entry `COUNTRY_CURRENCY`
(9 codes never targeting-relevant, 13 missing entirely) is gone,
replaced with an import. Includes a dev-time console.warn that fires
if a future `TARGET_COUNTRIES` addition doesn't get a matching
currency entry, so this can't silently drift again. Verified
programmatically: all 25 codes present on both sides, zero gap.

Cross-checked against Korapay's real DCC-supported currency set
(`korapayDccCurrency.ts`) as required — **the real gap, flagged, not
papered over: only 8 of the 25 target countries (NG, GH, KE, ZA, EG,
TZ, CI, SN) can actually be charged in local currency via Korapay DCC
today.** The other 17 (US, GB, FR, DE, IN, BR, JM, CA, AE, NL, UG, MX,
ES, IT, AU, SE, KR) show an informational currency estimate on the
pricing card but are still charged in NGN/USD at checkout — closing
that gap needs either Korapay adding DCC support for more currencies,
or a second payment provider for those markets. This is exactly what
Task 30 below needs to route around. New `isKorapayDccEligible()`
helper exported for that.

---

## Task 30 — Route currency + payment method by geo [x]

**Migrated from B-Pay-backend's own `handover.md` (that repo's Task
19) — that repo's copy is now historical only; this is the real,
active copy.** Use `useGeo()` (Task 27's `GeoProvider`) to determine
the user's country, then: for countries where Korapay supports
mobile-money/bank-transfer (per B-Pay-backend's confirmed findings —
check that repo's current state, it may have grown), route the
checkout amount + currency + preferred method accordingly; for
countries where Korapay has no local rails, fall back to USD.
**Blocked on Task 29 above** (needs the reconciled currency list) and
on B-Pay-backend's own Task 10 (provider routing) being further along
than its current Korapay-only partial pass — check both before
starting.

**Audit, this session — checked whether any part of this was already
built and just never recorded here, per the product owner's own
request. Answer: partially yes, but not fully, and it wasn't
unrecorded — it was recorded under Task 29 instead, which makes this
task's own note read more open than the current reality.**
- **The currency half is done.** Task 29's `korapayDccCurrency.ts`
  (see that task's own "Done" note) already maps a `useGeo()`-detected
  country to a Korapay-DCC-supported local currency where one exists,
  and correctly falls back to USD/NGN for the other 17 target
  countries Korapay's DCC doesn't cover — exactly this task's "route
  the checkout amount + currency... accordingly... fall back to USD"
  half. `Task 29`'s unblocking dependency is therefore satisfied and
  has been for a while; this task's own text just never got a
  cross-reference added pointing at where that work actually landed.
- **The payment-*method* half is not built at all** — grepped this
  session for `mobile_money`/`bank_transfer`/`channels`/
  `payment_method` across `src/`: zero real hits (one incidental
  string match in an unrelated code comment, not a payment-method
  concept). No code anywhere selects or passes a preferred payment
  channel/method based on geo — every checkout goes through Korapay's
  default channel selection regardless of country. This part of the
  task is genuinely open, not just unrecorded.
- **Still blocked on B-Pay-backend's own Task 10** for the
  method-routing half specifically — not re-verifiable from this
  sandbox (that repo isn't cloned here; confirmed via a filesystem
  search this session, nothing named B-Pay-backend exists anywhere
  accessible). A session with that repo available needs to check its
  current Task 10 progress before starting this half.

**Correction, later session — the note directly above this one is
wrong, and it was wrong specifically because it was never actually
re-verified against B-Pay-backend's real state (its own repo genuinely
wasn't cloneable in that earlier session's sandbox, so "still blocked"
was carried forward rather than checked). This session cloned
`https://github.com/Zapier-codes/B-Pay-backend` directly and read its
`handover.md` — the real picture is different from what every note
above this one assumed:**

- **B-Pay-backend's Task 10 (multi-provider routing across
  Paystack/Korapay/JuicyWay/Payscribe) is a genuinely different,
  broader concern than what this task actually needs.** Task 10 is
  about *which payment provider* to use for a given currency across
  four different providers — this app only ever uses Korapay as its
  provider, so that whole axis of "provider selection" doesn't apply
  here at all. This task's "payment method" half was never actually
  gated on Task 10 finishing; that dependency was a mistaken
  conflation between two different kinds of routing (provider-level
  vs. Korapay's own internal channel-level), not a real blocker.
- **What this task actually needs — Korapay channel selection
  (mobile money vs. bank transfer vs. card vs. pay-with-bank, within
  Korapay specifically) — has its forwarding half already built and
  verified on B-Pay-backend's side**, added as a companion change under
  that repo's own Task 16 entry: `routes.js`'s `POST /pay` now accepts
  `channels`/`default_channel` fields and forwards them unchanged to
  Korapay's real API call (verified via that repo's own `node --check`
  plus a throwaway test script covering 5 cases: channels+default
  present, channels-only, default-without-channels correctly dropped,
  neither present, and an empty channels array correctly treated as
  absent).
- **Real cross-repo documentation bug found and worth flagging clearly,
  not silently corrected as if it were nothing:** B-Pay-backend's own
  note for that companion change states, in confident past tense,
  *"the actual country→channel routing logic itself lives in
  Mavins-web's `korapayChannels.ts`, not here"* — implying that file
  already existed on this side. **It does not, and never has.**
  Checked exhaustively this session: no such file anywhere in
  `src/`, no trace in this repo's entire git history (`git log --all
  --oneline -- "*korapayChannels*"` returns nothing), no commit
  message ever mentioning it. That note in the other repo was written
  as if a companion piece had already landed here — it never did. Not
  correcting that repo's file directly from here (out of scope for a
  Mavins-web session to edit another repo's handover unprompted), but
  recording the discrepancy here so a future session doesn't read that
  confident-sounding claim in B-Pay-backend's file and go looking for
  a file that was never built.
- **Net effect: this task is NOT cross-repo blocked at all.** The one
  piece of infrastructure it genuinely needed from B-Pay-backend (the
  forwarding plumbing) is done and waiting. The actual remaining work —
  the country→channel mapping itself, plus wiring the checkout-
  initiation call to actually send `channels`/`default_channel` — is
  entirely buildable from this repo alone. **Genuinely blocked → genuinely startable**, once
  a real per-country channel-support source is confirmed (Korapay's
  own docs at developers.korapay.com/docs/checkout-redirect list the
  four valid channel strings — `bank_transfer`, `card`, `pay_with_bank`,
  `mobile_money` — but per-country *availability* of each still needs
  checking against Korapay's actual docs/dashboard, not guessed; South
  Africa/EFT was explicitly flagged by B-Pay-backend's own note as a
  case deliberately left unmapped there rather than guessed at, which
  is the same discipline this task's own mapping needs to follow).

**Split into 5 parts, this session, same one-part-per-session
convention as every other multi-part task in this file:**

### 30a — Research: confirm Korapay's real per-country channel availability [x]

**Done, this session.** Sourced directly from Korapay's own current
docs (developers.korapay.com/docs/accept-payments — the general
Pay-ins overview, which states per-channel country/currency coverage
plainly — cross-checked against developers.korapay.com/docs/
checkout-redirect for the actual `payment_method` values a real
transaction reports, and against Korapay's own support-site articles
for the two channels whose exact scope needed a second source). Not
guessed, not inferred from the channel-string names alone.

**Confirmed channel coverage, by currency (not by country name — see
mapping to this app's 25 target countries below):**
- `card` — Nigeria (NGN) only.
- `bank_transfer` — Nigeria (NGN) only.
- `pay_with_bank` — Nigeria (NGN) only. **Do not confuse with South
  Africa's "EFT"** (see flagged ambiguity below) — Korapay's own docs
  list these as two separately-named things, "Pay with Bank: Nigeria
  (NGN)" and "EFTs: South Africa (ZAR)," even though `pay_with_bank`
  is the only EFT-like string in the checkout API's own documented
  four-value channel/`payment_method` enum.
- `mobile_money` — Kenya (KES), Ghana (GHS), Cameroon (XAF), Ivory
  Coast (XOF), Egypt (EGP), Tanzania (TZS). **Discrepancy worth
  flagging, not silently resolved:** the `checkout-redirect` page's own
  webhook example comments `payment_method` as "can be bank_transfer,
  card, pay_with_bank" — three values, `mobile_money` **not listed** —
  while separate, dedicated docs pages (`mobile-money-checkouts`,
  `mobile-money-apis`) clearly describe mobile money as a real,
  working option *within* Checkout. Most likely just an incomplete
  code-comment on one example rather than mobile money being
  unavailable through Checkout Redirect specifically, but flagging
  the direct contradiction rather than quietly picking one source
  over the other — worth a quick support@korapay.com confirmation
  before 30d ships, not a hard blocker on 30b/30c.

**Mapped to this app's 25 target countries (migration 010's
`countries` table, `code` column) — 6 confirmed, 2 explicitly left
unmapped as genuine ambiguities (not guessed), 17 have no Korapay
channel coverage at all today:**

| Code | Country | Currency | Channels |
|---|---|---|---|
| NG | Nigeria | NGN | `card`, `bank_transfer`, `pay_with_bank` |
| GH | Ghana | GHS | `mobile_money` |
| KE | Kenya | KES | `mobile_money` |
| CI | Côte d'Ivoire | XOF | `mobile_money` |
| TZ | Tanzania | TZS | `mobile_money` |
| EG | Egypt | EGP | `mobile_money` |
| ZA | South Africa | ZAR | **unmapped** — see flag below |
| SN | Senegal | XOF | **unmapped** — see flag below |
| US, GB, FR, DE, IN, BR, JM, CA, AE, NL, UG, MX, ES, IT, AU, SE, KR | (17 countries) | various | none — no Korapay channel coverage found for any of these currencies; falls back to Korapay's own default selection, same fallback philosophy `korapayDccCurrency.ts` already uses for its own DCC-ineligible countries |

**The two deliberately-unmapped flags, same discipline B-Pay-backend's
own note already established for this exact South Africa case —
noting rather than guessing:**
- **ZA (South Africa):** Korapay's docs describe "EFTs: South Africa
  (ZAR)" as its own named channel, separately from "Pay with Bank:
  Nigeria (NGN)" — but the checkout API's actual four-value channel
  enum has no `eft` string, only `pay_with_bank`. Whether South
  Africa's EFT is actually selected via the `pay_with_bank` channel
  string, a country-inferred value with no explicit string at all, or
  isn't exposed through this same Checkout Redirect API at all, isn't
  confirmable from the docs found this session. Left unmapped.
- **SN (Senegal):** shares the XOF currency with Côte d'Ivoire (both
  are in the WAEMU/UEMOA currency union), and Korapay's mobile-money
  coverage is stated by currency (XOF), which would suggest Senegal
  should work identically to Côte d'Ivoire — but Korapay's own docs
  only ever literally name "Ivory Coast (XOF)," never Senegal
  specifically. Currency-sharing is a reasonable inference, not a
  confirmation of country-level product availability (Korapay could
  easily support the currency broadly but gate mobile-money telco
  integrations per-country, e.g. only having onboarded Ivorian mobile
  network operators). Left unmapped rather than assumed identical.

Both flags, plus the `mobile_money`-in-checkout-redirect discrepancy
above, are good candidates for a single support@korapay.com email
before 30d ships (three concrete, specific questions, not a vague
"what do you support" ask) — not required to unblock 30b/30c, which
only need the 6 confirmed rows above to proceed.

### 30b — Storage: extend the Supabase-backed reference-data pipeline, not a new hardcoded file [x]
**Done, this session, commit `49121b9`.** Migration 012 adds
`korapay_channels`/`korapay_default_channel` to the `countries` table,
populated per 30a's findings: NG gets all three NGN channels, GH/KE/
CI/TZ/EG get `mobile_money`, the other 19 rows (17 with no coverage +
ZA/SN's flagged ambiguities) stay `NULL` — a real "no confirmed
coverage" state, not "not filled in yet." `TargetCountry`
(`geoAffinity.ts`) gets two new optional fields; `fetchReferenceData`
(`referenceData.ts` — the one function both Task 45 Part 2's client
store and Part 3's server-side cache already share) now selects and
maps them, converting SQL `NULL` to `undefined` so
`country.korapayChannels?.length` behaves the way the field's own doc
comment promises. Confirmed `checkCountryCurrencyDrift()` only reads
`.code`, unaffected by the new fields. `npx tsc --noEmit` passes
clean. **Migration 012 not yet applied to the live DB** — same
`supabase db push` hand-off as every prior migration.

### 30c — Pure selection logic: country → { channels, default_channel } [x]

**Done this session (2026-08-29).** New
`src/lib/currency/korapayChannels.ts`, `getKorapayChannels(countries,
countryCode)` — deliberately reads from the already-fetched
`TargetCountry[]` (Task 30b's `korapayChannels`/`korapayDefaultChannel`
fields, populated via `referenceData.ts`/`useReferenceData()`) rather
than a second hardcoded map the way `korapayDccCurrency.ts` does —
that file predates the Supabase-backed reference-data pipeline (Task
45); this one is built after it and uses it directly, not a second
static source of the same kind of per-country data Task 44/45 exist
to centralize. Returns `null` for any unmapped country (Task 30a's 17
always-uncovered rows, or ZA/SN's two deliberately-left-ambiguous
flags) — documented as the *expected*, non-error result, with the
fallback behavior (don't send `channels`/`default_channel` at all)
being 30d's job, not this function's.

This is also, finally, the actual `korapayChannels.ts` file
B-Pay-backend's own handover.md claimed already existed here (see this
task's own "real cross-repo documentation bug" note above) — that
claim is no longer false.

**Verified with concrete cases, not just eyeballed:** a throwaway
Node script (8 cases — confirmed-mapped country with a default
channel, case-insensitive country-code input, confirmed-mapped
country with no default set, an explicitly-unmapped flag country
(ZA), a country with zero Korapay coverage, an unknown/absent country
code, and both `null`/`undefined` input) — all 8 passed against the
exact logic now in the real file. `npx tsc --noEmit` also passes
clean.

**Next: 30d** — wire this into the actual checkout call, with the
"must independently recompute server-side, never trust the client for
a charged/routing parameter" requirement this task's own text already
specifies.

### 30d — Wire into checkout, with server-side revalidation [x]

**Done this session (2026-08-29).** Implemented as fully
server-side-only, not client-computed-then-forwarded: `checkout.ts`
needed **zero changes** — see the reasoning inline in
`/api/payments/initialize/route.ts`'s own updated doc comment for why
that's the correct reading of this task's "must independently
recompute... rather than trusting whatever the client sends"
requirement, not a deviation from it. Concretely:

- **New migration 013** (`payment_sessions.channels` JSONB,
  `payment_sessions.default_channel` TEXT) — mirrors how
  `payment_currency`/`settlement_currency` (migration 006) already
  carry per-session DCC data, with an explicit, honest note in the
  migration's own header that those two columns, unlike these new
  ones, are currently just persisted from whatever the client claims —
  a pre-existing gap this task doesn't silently imply it also fixed.
- **`/api/payments/initialize/route.ts`** reads Vercel's
  `x-vercel-ip-country` request header (never a client-supplied
  field), loads reference data via the already-shared
  `fetchReferenceData()`, and calls Task 30c's `getKorapayChannels()`
  — writing `channels`/`default_channel` into both the authenticated
  and guest `sessionRow` branches when a selection comes back
  non-null. A reference-data fetch failure logs and falls through
  with no channel restriction (Korapay's own default) rather than
  blocking checkout over a UX-preference field.
- **`initialize-payment` Edge Function** forwards `session.channels`/
  `session.default_channel` to B-Pay-backend's `POST /api/pay`
  alongside `payment_currency`/`settlement_currency`, reading them
  back from the row (never from its own invoke-time input) — same
  "re-read from the row" posture this function already has for every
  other field.
- **Scope, deliberately narrow:** only
  `/api/payments/initialize/route.ts` (wallet top-up) — this task's
  own text names that route specifically, not
  `/api/payments/initialize-campaign/route.ts` (Task 36's direct-pay
  route). The same treatment there is a reasonable, small follow-up if
  wanted, not silently included here.

Verified: `npx tsc --noEmit` clean. `x-vercel-ip-country` degrades to
`null` in local dev/non-Vercel hosting exactly the way
`getKorapayChannels()` already documents (falls back to no channel
restriction) — same "must tolerate null" posture every other
geo-detection path in this app already has, not a new failure mode
introduced here.

**Not verified: a real request through Vercel's edge network** (this
sandbox has no way to simulate that header genuinely) — worth a quick
check once deployed that a Nigerian test IP actually produces
`channels: ["card","bank_transfer","pay_with_bank"]` on the resulting
`payment_sessions` row, not just that the code compiles.

### 30e — Verification + close-out [x]

**Done this session (2026-08-29), alongside 30d — genuinely
continuous work, not a separate sitting.**

- `npx tsc --noEmit` passes clean (checked after 30c, again after
  30d's own changes — both confirmed separately, not just once at the
  end).
- **No regression in the existing DCC-currency flow, confirmed by
  reading the code, not assumed:** `korapayDccCurrency.ts` and every
  `paymentCurrency`/`payment_currency` reference across
  `/api/payments/initialize/route.ts` and the `initialize-payment`
  Edge Function are byte-for-byte unchanged by 30b/30c/30d — grepped
  both files for those exact strings this session and confirmed the
  count matches what existed before 30d's edits.
- **Migration hand-off, same convention as every prior migration in
  this file:** migration 013 (`payment_sessions.channels`/
  `default_channel`) is written and committed but **not yet applied to
  the live DB** — needs the same `supabase db push` / dashboard
  SQL-editor step every migration since 010 has needed. Joins
  migration 012 (30b, also still pending its own apply, per that
  task's own note) in the queue of not-yet-applied migrations this
  session didn't have credentials to run.
- This task's own header box above is now `[x]` — all five parts
  (30a research, 30b storage, 30c pure selection logic, 30d wiring,
  30e this close-out) confirmed done, not just committed.

**Real, honest gap surfaced during 30d and worth repeating here since
it's the kind of thing a close-out note shouldn't quietly bury:**
`paymentCurrency`/DCC currency does **not** actually have the
server-side-recompute treatment this task's own text asked for and
30d just built for *channel* specifically — it's still fully
client-trusted, unchanged, exactly as it was before this session. That
was true before Task 30 started and remains true after it — not a
regression 30b/c/d introduced, but not something this task fixed
either, despite superficially being "the same kind of problem." A
future session wanting DCC currency to get the same treatment channel
just got should treat that as its own new task, not assume Task 30
already covered it.

---

## Task 31 — No redundant "≈ local currency" display for USD-default users [x]

**Migrated from B-Pay-backend's own `handover.md` (that repo's Task
20) — that repo's copy is now historical only; this is the real,
active copy.** If the detected/selected currency is USD, don't show a
converted "local" amount anywhere (the app's own internal base
currency is already USD as of Task 26 — nothing to convert *from* for
these users). Audit wherever a "≈ local currency" display exists
(e.g. `promote/page.tsx`'s `localCurrency`, now sourced from
`useGeo()` per Task 27) and make sure it's conditionally skipped for
USD, not showing a redundant "≈ $X USD" next to the primary total.

**Done in commit `5617244`.** Grepped the whole `src/` tree for
`COUNTRY_CURRENCY`/`localCurrency`/`localTotal` first to confirm scope
— `promote/page.tsx`'s `PricingBreakdown` component is the **only**
place this display pattern exists in the codebase, so no other file
needed touching. Confirmed the actual bug before fixing: the primary
total there always renders via `formatCents()` (hardcoded `$`, this
app's base currency since Task 26), and `COUNTRY_CURRENCY`'s own `US`
entry (`{ code: 'USD', symbol: '$', rate: 0.00065 }`, from Task 29) is
exactly what a US-based artist's `localCurrency` resolves to via
`useGeo()` — so the old unconditional render showed the identical
dollar figure twice (e.g. "$32.00" then "≈ $32 USD" right under it).
Added `showLocalEstimate = !!localCurrency && localCurrency.code !==
'USD'`, gating both the `localTotal` computation and the rendered line
on it — non-USD users see the exact same estimate as before, USD-
default users see nothing extra. Verified: `npx tsc --noEmit` passes
clean. Not yet visually spot-checked in a running dev server (no
network access to fonts.googleapis.com in this sandbox breaks `npm run
dev`'s full render the same way it breaks `npm run build`, per this
file's own "Known sandbox limitation" note) — worth a quick visual
check from wherever this deploys, but the logic itself is
straightforward enough (a boolean gate on an existing conditional) that
this isn't blocking.

---

## Task 32 — Confirm the real caller of B-Pay-backend: audit direct-call vs. edge-function architecture [x]

**Migrated from B-Pay-backend's own `handover.md` (that repo's Task
23) — that repo's copy is now historical only; this is the real,
active copy. Dependency direction corrected during migration — see
note below.** B-Pay-backend's "Project owner decisions → Decision 1"
says the intended architecture is: this app generates and owns the
payment `reference` client-side, writes it to Supabase, and a
**Supabase Edge Function** — not this app directly — calls
B-Pay-backend's `POST /api/pay`, and also owns webhook reconciliation.

**As of Task 26/27 (this session's own direct confirmation, not
inherited from B-Pay-backend's notes): that intended architecture is
NOT what's implemented.** `src/services/payment/korapay.service.ts`
calls `RENDER_BACKEND_URL` (i.e. B-Pay-backend) **directly** from this
Next.js app's own API route (`src/app/api/payments/initialize/route.ts`)
— there is no Supabase Edge Function in this repo, and no evidence one
exists anywhere in the project as of this note. **Corrected dependency
direction:** B-Pay-backend's Task 23 (as originally written) assumed
the edge function already existed and just needed auditing — it
doesn't exist yet, so that audit can't happen until Task 33 below
(which builds it) is done. This task, migrated, is really "build the
edge function," not "audit it" — see Task 33, which now owns that
work; this task's remaining scope is narrower: once Task 33 exists,
confirm `POST /api/pay` still works correctly when the caller always
supplies its own `reference` (the common case going forward), and
decide whether B-Pay-backend's `generateReference()` own-reference
fallback should stay as a defensive default or become a bug-signal log
line. **Blocked on Task 33.**

**Done, this session — Task 33 now complete, so both remaining
questions are answerable.**
- **"Confirm `POST /api/pay` still works correctly when the caller
  always supplies its own reference" — verified, with code, not
  assumed:** `supabase/functions/initialize-payment/index.ts` requires
  a non-empty `reference` on its own inbound request (`if (!reference)
  return 400`), uses it to look up the exact `payment_sessions` row,
  and forwards that same `session.reference` in the `POST /api/pay`
  payload — there is no code path in this repo where B-Pay-backend
  gets called without a caller-supplied reference. The "common case
  going forward" this task asked about is, from mavins-web's side,
  now the *only* case.
- **"Decide whether B-Pay-backend's `generateReference()` own-
  reference fallback should stay as a defensive default or become a
  bug-signal log line" — recommendation, not an implementation (that
  fallback lives in B-Pay-backend's own repo, not cloned into this
  sandbox, so it can't be edited from here):** given the finding
  above, that fallback is now confirmed dead code for every call this
  app makes. If it's ever actually reached, that means either (a) some
  other caller besides this app is hitting `POST /api/pay` without a
  reference (worth knowing, not silently accepting), or (b) something
  broke in this app's own reference-generation path and the request
  that reached B-Pay-backend already lost its reference somewhere
  along the way (also worth knowing loudly, not silently patched over
  by generating a substitute). **Recommendation: it should become a
  bug-signal log line, not stay as a silent defensive default.**
  Flagging this for a B-Pay-backend-repo session to actually implement
  — same cross-repo handoff pattern this file already uses for Tasks
  30/41/42.

---

## Task 33 — Wallet-crediting + first-time-vs-returning-user logic + Supabase Edge Function [x]

**Migrated from B-Pay-backend's own `handover.md` (that repo's Task
24) — that repo's copy is now historical only; this is the real,
active copy.** Three parts, per the product owner's decisions recorded
in B-Pay-backend's `handover.md` ("Project owner decisions" section,
Decisions 1–3) — split further if any one part is bigger than one
session, same one-task-per-session rule as the rest of this file:

1. **Client-side reference generation + Supabase write, and the
   Supabase Edge Function that calls B-Pay-backend's `POST /api/pay`
   with that reference.** This app should stop calling B-Pay-backend
   directly once this exists (see Task 32 above — confirmed this
   session that it currently does call it directly). This part
   unblocks Task 32.

   **Done in commit `37e1eea`.** New `public.payment_sessions` table
   (`supabase_migration_006_payment_sessions.sql`) and
   `supabase/functions/initialize-payment` Edge Function (Deno) — full
   write-up in that commit's message and both files' own header
   comments. `src/app/api/payments/initialize/route.ts` now writes the
   reference to Supabase and invokes the Edge Function instead of
   calling `korapay.service.ts` directly. **Explicit scope decision
   this session, confirmed with the project owner:** webhooks and
   verification stay on B-Pay-backend for now — this Edge Function
   only handles the *initiate* half of Decision 1, not the *receive
   the webhook, write the result back* half. That's a real,
   intentional gap against Decision 1's fuller original vision, not an
   oversight — a future session should either close it (port
   B-Pay-backend's webhook verification into this Edge Function too,
   and re-point each provider's webhook URL at it) or get the project
   owner to confirm keeping webhooks on B-Pay-backend permanently and
   update Decision 1's own text to match. Also fixed, found while
   rewiring this: the old authenticated-flow `wallet_ledger` "mark
   pending" insert was using columns (`amount_cents`, `type`,
   `description`) that migration 004 already found don't exist on the
   live table — removed as dead/broken code, `payment_sessions` now
   covers that job anyway.

   **Deployed and pushed successfully, 2026-08-28 — confirmed via the
   project owner's own terminal log, no errors.** Ran from a
   `proot-distro` Ubuntu container (see "Supabase CLI workflow" near
   the top of this file for the full, reusable pattern — including why
   `/root/mavins-web` inside that container, not Termux's own copy, is
   where these commands actually ran):
   ```
   proot-distro login ubuntu
   cd /root/mavins-web
   supabase login                      # one-time; already done
   supabase link --project-ref atojskxrxfsbpeefigtm
   supabase db push
   supabase functions deploy initialize-payment --project-ref atojskxrxfsbpeefigtm
   supabase secrets set BPAY_BACKEND_URL=https://b-pay-backend.onrender.com --project-ref atojskxrxfsbpeefigtm
   ```
   Confirmed from the log: `supabase link` reported "Remote database is
   up to date"; the function upload reported "Deployed Functions on
   project atojskxrxfsbpeefigtm: initialize-payment"; the secret set
   finished clean; the migration (copied into
   `supabase/migrations/20260828024711_payment_sessions.sql` before
   `supabase db push`, per the timestamped-copy pattern in "Supabase CLI
   workflow") applied with "Finished supabase db push." Docker was not
   running in that container and the deploy succeeded anyway — expected,
   not a problem (see that same section). **Not yet end-to-end tested
   with a real payment** (deploying clean isn't the same as a live
   `initialize-payment` invocation actually working against a real
   Korapay checkout) — that's still open, and would be a good first
   check whenever Part 2/3 work below touches this flow.

   **1b. Webhook receipt — the gap flagged above, now closed
   (2026-08-28, this session).** Per the project owner's explicit
   direction (confirmed in chat): the Edge Function should fully own
   webhook receipt too, not just payment initiation — closing this
   gap rather than confirming "keep webhooks on B-Pay-backend
   permanently" (the other option this file's own note offered).
   New function: **`supabase/functions/korapay-webhook/index.ts`**.
   Verifies Korapay's `x-korapay-signature` header (HMAC-SHA256 of
   `body.data` only, hex-encoded) using the exact same algorithm as
   B-Pay-backend's own `providers/korapay.js#verifyWebhookSignature`
   (Task 4 in that repo) — ported to Deno's `node:crypto` import
   rather than reimplemented from scratch, and re-verified against
   Node directly before porting (4 cases: valid signature accepted,
   wrong signature rejected, missing signature rejected, tampered
   body rejected — all four matched expectation; this sandbox has no
   Deno runtime to test the actual `.ts` file itself, same limitation
   Part 1 already hit). On a verified `charge.success` or
   `charge.failed` event, looks up the matching `payment_sessions` row
   by `reference` and updates `status` accordingly (idempotent — a
   row already at `success`/`failed` is left alone on a duplicate
   delivery) plus stores the raw payload in `provider_response`. Other
   Korapay event types (`transfer.*`, `refund.*` — real events per
   B-Pay-backend's Task 4 findings) have no corresponding
   `payment_sessions` row to update, so they're acknowledged and
   logged only, matching B-Pay-backend's own webhook route's existing
   posture for the same events. **Deliberately does NOT call any
   wallet-crediting logic** — that's Part 2 below, kept as a separate
   concern/commit on purpose.
   **New secret needed, not yet set as of this note:**
   ```
   supabase secrets set KORAPAY_SECRET_KEY=<same value B-Pay-backend uses> --project-ref atojskxrxfsbpeefigtm
   ```
   (see "Supabase CLI workflow" near the top of this file for the full
   deploy pattern — same `proot-distro` + `/root/mavins-web` path Part
   1's deploy used). **Also requires a manual step outside any
   session's reach: re-pointing Korapay's dashboard webhook URL** from
   wherever it currently points (B-Pay-backend's
   `/api/webhooks/korapay`) to this new function's URL
   (`https://atojskxrxfsbpeefigtm.supabase.co/functions/v1/korapay-webhook`,
   standard Supabase Edge Function URL shape — confirm exact path
   against the dashboard's own function listing after deploy).
   **B-Pay-backend's own webhook route is deliberately left in place,
   not deleted** — it becomes unused once the dashboard URL is
   repointed, but keeping it costs nothing and preserves a fallback/
   audit path if the repoint is delayed or needs to be reverted;
   flagged here rather than silently removed so a future session
   doesn't wonder why "dead" code is still there.
   **Deploy + dashboard repoint not done yet as of this note** — same
   hold pattern as Part 1: a future session should check back here for
   what the project owner reports before assuming this function is
   live.

   **Superseded, this session — do NOT repoint Korapay's dashboard at
   this function directly, see Task 41.** The Edge Function itself is
   confirmed deployed (project owner, this session). But the plan of
   pointing Korapay's one account-wide webhook URL straight at it only
   ever worked because this was assumed to be the only app needing
   Korapay webhooks. The product owner is now building multiple other
   multi-tenant apps that will also need Korapay webhooks, and Korapay
   allows exactly one URL account-wide — so a shared gateway has to
   sit in front of every app's own receiver, this one included. Task
   41 owns designing/building that gateway. Once it exists, the
   remaining repoint step here changes from "point Korapay at this
   function's URL" to "point Korapay at the gateway; the gateway
   forwards to this function." **`KORAPAY_SECRET_KEY` still needs
   setting per this note's own earlier instruction regardless** — the
   gateway question doesn't block that — but the actual dashboard URL
   change should target the gateway, not this function, once Task 41
   lands. See Task 41 for full detail, including what changes in this
   function's own signature-verification once that repoint happens.

2. **Wallet-balance computation on confirmed webhook** — full amount
   minus platform fee, credited **only for returning users doing a
   top-up**; first-time users who pay directly for a campaign should
   see no wallet balance change, ever. **Split into four parts this
   session, per explicit product-owner direction: wallet crediting
   must wait on webhook-confirmed status before ever crediting, and
   every redundant/parallel ("survival") path that could independently
   decide a payment succeeded must be removed — one source of truth
   only. Only Part 2a is done; 2b/2c/2d are still open, in that
   order.**

   **Audit finding that drove this split (2026-08-28):** going in to
   scope Part 2, found the codebase already had **two live, parallel,
   non-webhook crediting paths**, neither of which the original Part 2
   text above had accounted for:
   - `src/app/api/payments/webhook/route.ts` — an old Next.js webhook
     receiver, now fully superseded by
     `supabase/functions/korapay-webhook/index.ts` (Part 1b) and
     unreachable in the current architecture (Korapay's dashboard
     points at the B-Pay-backend gateway, Task 41/42, which forwards to
     the Supabase Edge Function, never to this Next.js route). Read/
     wrote a `payments` table that `src/app/api/payments/initialize/
     route.ts` stopped writing to entirely back in Part 1 — meaning
     every lookup in this route against a payment initiated by the
     current flow would find nothing, silently no-op.
   - `src/app/api/payments/verify/[reference]/route.ts` — the route the
     browser lands on after checkout. This one WAS reachable, and did
     three things this task's "wait on webhook status" rule forbids:
     called Korapay directly (via the B-Pay-backend proxy) to ask
     "did this succeed?" instead of reading the webhook-confirmed
     status; credited the wallet itself based on that direct-call
     answer (`credit_wallet_deposit`, same RPC the webhook route also
     called — so two different code paths could each independently
     decide to credit the same payment, racing each other, protected
     only by the RPC's idempotency key rather than there being one
     decision-maker); and separately resolved/created a guest account
     and called `creditWalletTopUp` for the guest case, a THIRD
     crediting entry point. In practice this route's crediting was
     already silently broken for any payment on the current flow too —
     same root cause, it read the same abandoned `payments` table
     (`existing?.user_id` was always `undefined`, so the credit
     `if` block never fired) — but the direct-provider-call pattern and
     the multiple-crediting-entry-points problem were real regardless
     of whether they currently happened to fire.

   **2a. Single source of truth — remove every non-webhook crediting/
   verification path. [x] Done this session.**
   - **Deleted** `src/app/api/payments/webhook/route.ts` entirely (dead
     table, unreachable route, fully superseded by Part 1b).
   - **Rewrote** `src/app/api/payments/verify/[reference]/route.ts`
     into a pure read: looks up `payment_sessions` (not `payments`) by
     `reference`, and redirects based on `status` alone —
     `'success'` → redirect to the caller's `redirect` param (no
     crediting here, that's 2b's job on the webhook side);
     `'failed'` → error redirect; `'pending'`/`'checkout_created'`
     (webhook hasn't landed yet) → an informational "still confirming"
     redirect, explicitly NOT a live Korapay call to resolve it faster.
     No provider calls, no wallet writes, no guest-account creation
     anywhere in this route anymore.
   - **Deleted** `src/services/payment/korapay.service.ts` entirely —
     confirmed via grep it was already 100% unused elsewhere
     (`initializeCharge`/`initializePayment`, per the file's own prior
     header comment) or about to become unused once the verify-route
     rewrite above landed (`verifyCharge`/`getChargeStatus`). Also
     removes `verifyWebhookSignature`, a stub that **unconditionally
     returned `true`** — a real landmine that could have silently
     accepted a forged webhook if anything had ever called it; nothing
     did, but leaving a live always-true signature check lying around
     unused is exactly the kind of dormant "survival approach" this
     task's own mandate is about removing before it gets wired in by
     accident.
   - **NOT touched, on purpose:** `resolveOrCreateGuestAccount`/
     `creditWalletTopUp` in `src/lib/auth/guestCheckout.ts` — these
     lost their only caller (the old verify route) and are temporarily
     unused project-wide, but they are NOT dead code the way
     `korapay.service.ts` was. They're exactly what 2b needs to call
     from the webhook-triggered path. **Do not delete them** — a future
     session doing a "remove unused code" pass should check this note
     first.
   - **NOT touched, flagged instead:** the `payments` table itself
     still exists in the live database, just unread/unwritten by any
     app code now. Dropping it is a separate, destructive schema
     decision (data retention) — out of scope for this cleanup, a
     future session/product-owner call.
   - Verified: `npx tsc --noEmit` clean. Grepped the whole repo after
     the change for `.from('payments')`, the deleted webhook route's
     path, and `korapay.service` — zero real hits, only a few doc-
     comment mentions of the deleted files left as historical context
     (in `initialize/route.ts` and `supabase/functions/
     initialize-payment/index.ts`), which don't affect behavior.
   - **After 2a, this app credits ZERO deposits, for anyone, under any
     circumstance** — that's intentional, not a regression: it's
     strictly safer than the multiple broken/racing paths it replaces,
     and correct per "wait on webhook status" (nothing should credit
     until 2b exists to do it from the confirmed-webhook side). A
     top-up made right now would show as "confirming" indefinitely from
     the user's perspective until 2b ships.

   **2b. Build the actual webhook-triggered crediting call. [x] Done
   this session (2026-08-28).** Extended
   `supabase/functions/korapay-webhook/index.ts`: on a verified
   `charge.success`, resolves/creates the guest account by
   `customer_email` when `user_id` is null (ported
   `resolveOrCreateGuestAccount`'s lookup-then-create-then-race-recheck
   logic directly into this file as `resolveOrCreateGuestUserId` — not
   a straight import, since the original uses a Next.js path alias and
   a Node-only admin client neither of which exist in Deno; simpler
   here too, since a webhook has no browser to mint a session for),
   computes the net amount per Task 40's rule (`Math.round(grossAmount
   * 0.95 * 100)` — 5% deposit fee, base-currency-unit-to-cents
   conversion done here since `payment_sessions.amount` is base units
   per that migration's own header comment), and calls
   `credit_wallet_deposit` (migration 004) with the net figure. This is
   now the only place in the whole app that calls that RPC — 2a already
   removed every other caller.
   **One deliberate deviation from the literal task wording, worth
   flagging explicitly:** crediting now happens *before*
   `payment_sessions.status` is written to `'success'`, not after. The
   short-circuit just above (`status === 'success' || 'failed'` →
   acknowledge and stop) means once that write lands, this function
   never looks at the row again — so if crediting happened after that
   write and then failed, the row would be permanently stuck at
   `'success'` with no wallet credit and no retry path to fix it,
   silently losing money. Crediting first means a credit failure
   returns a `500` (Korapay retries) with the row still at
   `'pending'`/`'checkout_created'`, so a retry genuinely retries the
   credit — safe by construction, not by hoping nothing fails between
   two separate writes. `credit_wallet_deposit`'s own idempotency
   (migration 004's unique index on `(user_id, reference)`) is what
   makes calling it more than once for the same payment always safe,
   which is what makes this reordering possible without introducing a
   double-credit risk of its own — see the file's own inline comments
   for the full reasoning, left in place rather than only summarized
   here.
   **Verified (no Deno runtime available, same limitation every Edge
   Function task has hit):** the fee/cents math specifically
   (`Math.round(grossAmount * 0.95 * 100)`) against 5 cases in Node —
   $100 → 9500, $50 → 4750, $10.50 → 998 (not 997 or 997.5 — confirms
   the rounding happens after the multiply, not before), $1 → 95,
   $33.33 → 3166 — all five matched hand-calculated expectation.
   `npx tsc --noEmit` clean across the rest of the repo (this file
   itself is outside `tsconfig.json`'s scope, same as every Edge
   Function before it — confirmed via that file's own `exclude` list,
   not an oversight).
   **Still unconditional — see 2c below, not yet built:** every
   successful charge gets credited right now, regardless of
   `metadata.type`. Harmless today (no other session type exists yet),
   not safe to leave once Tasks 36/37 exist.
   **Also added this session, same commit — a `payment_failed`
   notification.** Product owner clarified directly: a successful
   top-up needs no separate notification (the wallet balance itself is
   the signal), but a failed payment does — the user may have already
   left the checkout page by the time the webhook lands, so this is
   their only way to find out something needs retrying. Reuses the
   existing `notifications` table exactly as every other route already
   writes to it (`src/services/notifications/notifications.service.ts`'s
   own header comment lists them) — same `{user_id, type, content:
   {text, ...}, created_at}` shape, no new table/column, plus one new
   `TYPE_META` entry (`payment_failed`) in that same service file so
   the existing `/notifications` page renders it without any page-level
   change. Only inserted when `session.user_id` is already known — a
   guest whose payment failed has no account/notifications page to see
   it on, and creating one solely to deliver a failure notice isn't
   warranted. Insert failure is non-fatal (logged, not a 500/retry) —
   the `payment_sessions` row is already correctly marked `'failed'` by
   that point regardless.
   **Explicitly NOT built, needs a product-owner decision before
   guessing further:** the product owner also asked for a "pending"
   notification. There is no Korapay webhook event for "still
   pending" — Korapay only ever calls this function for
   `charge.success`/`charge.failed`. A payment sitting at
   `'pending'`/`'checkout_created'` (webhook hasn't arrived yet) is
   already visible on the `/verify/[reference]` redirect page as
   "still confirming" (Part 2a), just not as a persistent notification.
   Building a "pending" notification for real would mean a *new*
   mechanism entirely — most likely a scheduled check (Supabase cron /
   `pg_cron`) that flags a session still pending after some timeout —
   which is a meaningfully bigger feature than this session's scope
   and needs its own timeout-length decision, not a guessed value. Left
   unbuilt rather than inventing that threshold; see this file's
   ongoing conversation with the product owner for whenever that's
   clarified.
   **Not yet deployed** — needs `supabase functions deploy
   korapay-webhook --project-ref atojskxrxfsbpeefigtm` from
   `/root/mavins-web` in the `proot-distro` container, same as every
   deploy before it (see "Supabase CLI workflow" near the top of this
   file). No new secret needed — this reuses `SUPABASE_URL`/
   `SUPABASE_SERVICE_ROLE_KEY` (auto-provided) and
   `MAVW_WEBHOOK_FORWARD_SECRET` (already set per Task 42).

   **2c. First-time-vs-returning-user branch. [x] Done this session
   (2026-08-28).** Added a `TOP_UP_TYPES = new Set(['wallet_topup',
   'wallet_topup_guest'])` gate immediately before 2b's crediting call
   in `korapay-webhook/index.ts`: a successful charge whose
   `metadata.type` isn't in that set is logged and acknowledged, but
   never reaches `creditDeposit`/`credit_wallet_deposit` at all.
   Deliberately an allowlist, not a denylist — a future session type
   (Tasks 36/37's direct-campaign-payment type) simply won't match and
   won't credit, by default, without this function needing to change
   again when that type is introduced. `session`'s `select()` extended
   to include `metadata` (wasn't selected before this session).
   Verified via `npx tsc --noEmit` on the rest of the repo (this file
   itself stays outside `tsconfig.json`'s scope, same as every prior
   Edge Function task) — clean.

   **2d. Deploy + end-to-end verification. [x] Done — confirmed by the
   product owner, 2026-08-28 (see this file's own "Next task" history
   near the top: `supabase functions deploy korapay-webhook` and
   `supabase db push` both confirmed run successfully; the full
   webhook chain — Korapay → B-Pay-backend gateway → this function →
   wallet credit / direct-pay campaign creation — is live end to end,
   not just code-complete).** Updating this stale checkbox now (it was
   left `[ ]` after that confirmation landed elsewhere in this file) —
   same class of drift as Task 44's own top-level box had, fixed the
   same way: match the checkbox to what the rest of this file already
   says happened, don't leave it implying open work that isn't.
   Same deploy pattern as Part 1/1b (`supabase db push` if a
   new migration is needed, `supabase functions deploy korapay-webhook
   --project-ref atojskxrxfsbpeefigtm`) — see the "Supabase CLI on
   Termux" section near the top of this file for the full mechanics.
   This sandbox has no Deno runtime, so 2b/2c's Edge Function changes
   can only be verified by careful reading here, same limitation every
   Edge Function task before this one has hit — a real test needs a
   live webhook delivery against a real Korapay sandbox charge, which
   only the project owner can trigger.

3. **[x] Shared user/admin success screen** with an animated
   country-interconnection pipeline visualization (central hub node,
   animated links out to each selected target country) shown on
   confirmed payment. **Done this session** — new
   `src/components/campaign/CampaignSuccessVisualization.tsx`, wired
   into `promote/page.tsx`'s two existing success moments
   (`showSuccess`/`showGuestCampaignSuccess`), replacing their old
   plain-text banners. Follows `HowItWorksAnimated.tsx`'s established
   SVG-animation conventions exactly (local
   `usePrefersReducedMotion`/`useLoopProgress` hooks,
   `pathLength`-normalized strokes, `--accent`/`--accent-light` CSS
   vars, reduced-motion respected). Caps visible nodes at 7 with a
   "+N more" overflow node — deliberately not capped at the free-tier
   `MAX_COUNTRIES_FREE`, since this is explicitly the *shared*
   user/admin screen and an admin's selection isn't capped the same
   way.

   **One real gap, flagged rather than silently worked around:** the
   guest direct-pay success moment
   (`showGuestCampaignSuccess`) has no target-country data available
   to visualize — a guest's browser state is gone by the time they
   return from Korapay's checkout (no session, no stashed form draft,
   by `goDirectPayCampaign`'s own existing design), and the redirect
   URL (`/promote?campaign_created=1`) carries no reference to fetch
   the server-side snapshot by either. Renders with an empty country
   list today (header only, no visualization) rather than guessing —
   a future session completing Task 36 Part 4 properly could close
   this by threading the reference through the redirect and fetching
   `payment_sessions.metadata.campaign` server-side.

---

## Task 34 — Single crediting authority: RPC credits, Edge Function only instructs it [x]

**Ask, from the product owner:** there must be exactly one place that
ever increases a wallet balance. Either the RPC does the crediting or
the Edge Function does — not both, and not any other code path either.
The chosen split is: the Edge Function identifies the payment/user and
tells the RPC *what* to credit; the RPC is the only thing that actually
writes the new balance.

**Audit finding, this session — this is currently violated in at least
three places**, not a clean slate:
- `credit_wallet_deposit` (migration 004, Task 13) is the correct
  RPC-does-the-crediting pattern — atomic, idempotent, `SECURITY
  DEFINER`, correctly the only path called from `webhook/route.ts` and
  `verify/[reference]/route.ts`.
- `korapay-webhook` (Task 33 Part 1b) correctly does **not** credit —
  it only updates `payment_sessions.status` and leaves crediting to
  Part 2, which per Task 33's own note should eventually call the same
  RPC. Consistent with this task's rule; nothing to fix here, just
  confirm Part 2 (when built) calls the RPC rather than writing
  `users.wallet` itself.
- `guestCheckout.ts`'s `creditWalletTopUp()` — flagged in Task 13 as
  the thing that RPC replaced — needs a follow-up check that it now
  actually calls `credit_wallet_deposit` and doesn't still have a
  parallel hand-rolled write path left over anywhere.
- **`campaign.service.ts`'s `updateWallet()` is a second, independent
  crediting/debiting path** that writes `users.wallet` directly
  (non-atomic read-modify-write, no idempotency key) and is called for
  campaign refunds (`cancelCampaign`) and top-up debits
  (`addFundsToCampaign`). Task 13 already flagged this as "deliberately
  not touched" for the debit side; this task extends that finding —
  it's not just non-atomic, it's a *second crediting authority*
  running in parallel with the RPC, which is exactly what this task
  says must not exist. Refunding via `updateWallet(..., unspent, ...)`
  in `cancelCampaign` is a credit, and it doesn't go through
  `credit_wallet_deposit` or any RPC at all.

**Scope:** replace every direct `users.wallet` write in app code
(`campaign.service.ts`'s `updateWallet`, and anything else a fresh grep
turns up) with calls to the RPCs from this task group (this task's
credit RPC for the refund/credit direction, Task 38's new debit RPC for
the spend direction) so `users.wallet` has exactly one writer overall:
Postgres functions, never a Next.js API route or client-side service
function. Confirm via grep for `.update({ wallet:` and `.update({...
wallet` across `src/` that none remain once this is done.

---

**Done, this session (commit `150b36a`).** `campaign.service.ts`'s
`updateWallet()` — the non-atomic direct `users.wallet` write flagged
above as a second, independent crediting authority — is gone. It was
also technically unreachable anyway: both `debit_wallet_balance`
(migration 007) and the new `credit_wallet_refund` (migration 008,
built this session) are locked to `service_role` only, and this file
was calling them from the browser's anon-key client.
- **New migration 008 — `credit_wallet_refund`**, mirroring
  `credit_wallet_deposit`'s atomic/idempotent shape but semantically
  distinct (ledger `type: 'refund'`, not `'deposit'` — reusing
  `credit_wallet_deposit` here would have mislabeled refunds as
  deposits in reporting). This resolves the "add a small symmetric
  refund RPC, or confirm this is an accepted exception" question
  Task 38's own note left open, in favor of the RPC.
- **New `/api/campaigns/cancel/route.ts`** — server-side route for
  `cancelCampaign`'s refund path: verifies session + ownership
  (`artist_id` match or `isAdmin`), calls `credit_wallet_refund` with
  `cancel-{campaignId}` as the idempotency reference, updates
  `track_campaigns`.
- **New `/api/campaigns/add-funds/route.ts`** — server-side route for
  `addFundsToCampaign`'s debit path: verifies session + ownership,
  calls `debit_wallet_balance` (its own atomic check decides
  sufficient-vs-insufficient, not a client pre-check), updates
  `track_campaigns.total_budget_cents`.
- `campaign.service.ts`'s `cancelCampaign()`/`addFundsToCampaign()`
  now `fetch()` those two new routes instead of calling the removed
  `updateWallet()` directly. `addFundsToCampaign` keeps its balance
  read as a fast client-side pre-check only — the RPC's own check is
  authoritative.
- `create/route.ts`'s compensating refund-on-failed-insert (Task 38's
  own flagged exception) now calls `credit_wallet_refund` instead of a
  local direct write, reusing the original debit's reference as the
  refund's idempotency key. Removed the now-unused local
  `getWalletBalanceCents()` helper that write needed.

**Verification per this task's own text:** grepped `src/` for
`.update({ wallet:` and `wallet:` broadly — the only remaining hits
are inside `withdrawal/request/route.ts`'s Task-21-disabled commented
handler, and `api/auth/create-user/route.ts`'s `wallet: { balance: 0 }`
on account **creation** (an INSERT, not a balance-mutating write —
correctly out of scope). Confirmed `guestCheckout.ts`'s
`creditWalletTopUp()` (this task's own flagged follow-up check)
already calls `credit_wallet_deposit` correctly.

Verified via `npx tsc --noEmit` — clean.

**Not verified** (same sandbox limitation as every RPC task before
this one): migration 008 needs the same `supabase db push` hand-off
Task 38's note documents before any of this is live — no live call
against the real Supabase instance has been made yet.

---

## Task 35 — Fee structure: **15%** platform fee on campaigns, 5%
gateway fee on deposits [x]

**Second correction, from the product owner directly, this session
(supersedes the "Correction" note immediately below — don't act on
that one anymore):** the platform fee on campaigns is **10%, not
15%** — Task 40's "15% is correct all along" was itself wrong; this
task's *original* text (further below, unedited) had it right from the
start. `PLATFORM_FEE_PERCENT` in `src/lib/campaign/pricing.ts` has been
changed back to `10` this session, with a comment on that line pointing
future sessions at this note so it doesn't flip a third time without a
fresh, explicit confirmation. **Confirmed rates, as of this note: 10%
on campaigns, 5% on deposits — two separate rates, only summing to 15%
when you add both together, never one flat 15% rate applied to
everything.** Task 40's own fee-arithmetic rule (Edge Function
computes and deducts, RPC never does math) still stands unchanged by
this correction — only the campaign rate's number (15 → 10) is
affected, not where the computation happens.

**Correction (superseded — see "Second correction" above), from the
product owner directly (see Task 40 below for
the full architectural context this came with):** the platform fee on
campaigns is **15%, not 10%** — this task's original text below had it
backwards; `PLATFORM_FEE_PERCENT` already being `15` in
`src/lib/campaign/pricing.ts` was **correct all along**, not a bug to
fix down to 10. Leaving the original ask below unedited per this
file's "don't delete completed entries" convention, but treat the 15%
figure as authoritative — do not change `PLATFORM_FEE_PERCENT` back to
10. The file's own header comment ("industry-standard pricing," no fee
citation) should still be updated to cite this task + the product
owner's confirmation, so a future session doesn't second-guess it
again.

**Also resolved by Task 40:** this task's own open question below
("whether the 5% is deducted before calling the RPC, or the RPC itself
computes it") — the product owner's answer is the Edge Function
deducts it before calling the RPC; the RPC does no arithmetic at all.
See Task 40 for the full rule and its implications for this task's
remaining scope (the actual 5%-deduction code, which still doesn't
exist anywhere and is this task's real remaining work).

**Ask:** two separate, fixed fee rates, not to be confused with each
other:
- **Platform fee: 10%**, charged when a campaign is placed (i.e. on
  the campaign spend/subtotal, whether paid directly by a first-timer
  or drawn from an existing wallet balance).
- **Payment gateway charge: 5%**, charged on deposits only (i.e. on
  the amount going *into* the wallet via Korapay/B-Pay-backend, not on
  campaign placement).

**Audit finding, this session — current code has neither rate
correctly split out:**
- `src/lib/campaign/pricing.ts`'s `PLATFORM_FEE_PERCENT` is currently
  **15**, not 10 — needs updating to match this task, and needs a
  comment explaining where 10% comes from (this task) so a future
  session doesn't quietly revert it back to a guessed "industry
  standard" number the way 15% appears to have been picked (see that
  file's own header comment — "industry-standard pricing," no fee
  citation).
- **No 5% gateway-charge deduction exists anywhere yet** — a full
  grep for gateway/processing-fee logic in `src/services/payment/` and
  the two payment Edge Functions turned up nothing. `credit_wallet_deposit`
  (migration 004) currently credits the wallet for the **full** deposit
  amount it's called with; it needs a decision (see below) on whether
  the 5% is deducted before calling the RPC (i.e. the RPC is called
  with `p_amount_cents = deposit_amount * 0.95`) or the RPC itself
  computes and stores both the gross and net figures. Given Task 34's
  "RPC is the only writer" rule, computing the deduction inside the RPC
  (taking the gross deposit amount and a fee-rate parameter, or a
  hardcoded 5% constant in the migration SQL itself) keeps the fee
  logic in the one place that matters rather than trusting every
  caller to pre-deduct it correctly — recommend that approach, but flag
  to the product owner before committing to it since it changes
  `credit_wallet_deposit`'s function signature/behavior from Task 13's
  original version.
- Decide where the platform's 10%/5% cut itself is recorded (a ledger
  row, a separate `platform_revenue` table, or just implicit in "wallet
  credited for less than was paid") — not specified by the product
  owner yet, worth a one-line confirmation before building reporting on
  top of it.

**Closed, this session — this was the one item left open across both
this task and Task 40 (see that task's own note, which shares this
exact item verbatim).** Went with the dedicated `platform_revenue`
table option this note listed, on the reasoning laid out in the new
migration's own header comment: `wallet_ledger` is scoped to per-user
balance history, so reusing it would make "how much has the platform
earned" only answerable by summing across every user's rows — the same
reason Stripe Connect keeps "application fees" as their own object,
separate from a connected account's balance. New
`supabase_migration_011_platform_revenue.sql` — one row per fee
actually taken (`type: 'campaign_fee' | 'deposit_fee'`, `amount_cents`,
`user_id`, `source_reference`, `metadata`), idempotent via a
`(type, source_reference)` partial unique index (same
catch-`unique_violation`-treat-as-already-recorded pattern as every
other money-adjacent write in this codebase), RLS locked to
`service_role` only — this is platform-internal financial data, not
something exposed to any user via PostgREST.

Wired into all three places a fee is actually taken:
- `api/campaigns/create/route.ts` (authenticated wallet-debit path) —
  writes a `campaign_fee` row after a successful campaign insert, only
  for non-admin creators (admins pay no fee, so nothing to record).
- `korapay-webhook/index.ts`'s `createDirectCampaign()` (guest
  direct-pay path, Task 36 Part 2) — same `campaign_fee` write, using
  the payment `reference` as the idempotency key.
- `korapay-webhook/index.ts`'s `creditDeposit()` — writes a
  `deposit_fee` row, but only when `credited === true` (a genuinely new
  credit, not a duplicate-delivery no-op from `credit_wallet_deposit`'s
  own idempotency) — writing on every call regardless would have
  double-counted revenue that was only actually taken once.

Every write is deliberately non-fatal on failure (logged, not thrown)
— the underlying money movement (the wallet debit/credit, the campaign
creation) had already succeeded by the time the revenue write is
attempted, so a missed `platform_revenue` row is a reporting gap to
fix, never a reason to fail a request/webhook that otherwise succeeded
correctly.

Verified via `npx tsc --noEmit` (Next.js app; `korapay-webhook` is a
Deno Edge Function excluded from that config, no Deno runtime available
in this sandbox to verify directly — same limitation as every prior
`korapay-webhook` change) — clean. Migration 011 not yet applied to
the live DB — same project-owner-only `supabase db push` hand-off as
every prior migration.

**Campaign-side audit + fix, this session (closes the "Campaign side"
item Task 40 flagged as needing a from-scratch check):** confirmed
`total_budget_cents` in `api/campaigns/create/route.ts` was set to
`pricing.totalCostCents` — the **full** amount including the platform
fee, not netted out. Since `api/webhooks/freshconnect/route.ts`
computes refunds (partial-delivery and full-cancellation) directly off
`total_budget_cents`, this meant a cancelled campaign was refunding the
platform's own fee back to the user's wallet. **Asked the product owner
directly: confirmed the platform keeps its 10% cut on
cancellation/partial delivery — only the 90% subtotal is refundable.**
Fixed: `total_budget_cents` now uses `pricing.subtotalCents` (the
pre-fee delivery-funding amount) instead of `pricing.totalCostCents`;
the wallet debit two lines above it is unchanged and still correctly
uses the full `pricing.totalCostCents` (that's what the user actually
pays). No change was needed in the Fresh Connect webhook route itself —
now that `total_budget_cents` is already net of the fee, its existing
refund math is correct without modification. This also incidentally
makes the campaign progress bar (`promote/page.tsx`,
`spent_cents / total_budget_cents`) more accurate, since `spent_cents`
tracks actual Fresh Connect delivery cost, which was always meant to be
measured against the net delivery-funding amount, not the fee-inclusive
total. Verified: `npx tsc --noEmit` passes clean.

**Related gap found, NOT fixed this session (separate concern, flag for
Task 36 or its own task):** `api/campaigns/add-funds/route.ts` (adding
funds to an *existing* campaign) takes a raw client-supplied
`additionalCents` with no `calculatePricing()` call and no fee applied
at all — unclear whether topping up an existing campaign's budget is
meant to also carry the 10% platform fee, or whether it's meant to be a
direct dollar-for-dollar addition (e.g. because the fee was already
charged once at campaign creation and add-funds is just "more of the
same campaign," not a new fee-bearing transaction). Needs a product-
owner call before touching it — don't assume either way.

---

## Task 36 — Direct-pay campaigns for guests/first-timers; wallet-funded campaigns for returning users only [x]

**Split into 4 parts this session, per the one-task-per-session
convention (this task was flagged "not startable in any partial form"
by an earlier session's assessment — that was accurate for building
the whole thing at once, but the dependencies below split cleanly once
Task 33 Part 2b/2c landed code-complete). Parts 1, 2, and 3 done; only
Part 4 (frontend wiring) remains.** A sync
issue between sessions briefly left this section (and the orientation
box above) inconsistent about Part 2's status even after its code had
landed — reconciled as of this note, Part 2 is genuinely done.

1. **[x] Part 1 — guest-only campaign-payment initiation route.**
   Symmetric to Task 33 Part 1's wallet-topup initiation: writes a
   `payment_sessions` row carrying full campaign intent (source URL,
   view count, genre, geographic tier, target countries, and a
   snapshotted `calculatePricing()` breakdown) under
   `metadata.type = 'campaign_direct'`, then starts a Korapay checkout
   for exactly that campaign's cost. Does not touch the webhook or
   actually create any campaign — that's Part 2.
2. **[x] Part 2 — webhook-side campaign creation on confirmed
   payment.** `korapay-webhook/index.ts` needs to recognize
   `metadata.type === 'campaign_direct'` (already explicitly excluded
   from `TOP_UP_TYPES`, so a payment of this type today would succeed
   at Korapay but do nothing further — safe, just incomplete) and, on
   success, create the `users` row (Task 37) + `track_campaigns` row
   directly, reading the snapshotted campaign/pricing data back out of
   `session.metadata.campaign` rather than trusting anything
   client-supplied at webhook time. No wallet touched at all — that's
   this whole task's point.
3. **[x] Part 3 — enforce the two-way rule in `create/route.ts`.**
   That route's unconditional `401` for an unauthenticated caller
   should become a clear redirect/instruction toward Part 1's route
   instead of a bare rejection. (The other direction — a returning
   user must never direct-pay — is already enforced by Part 1 itself,
   for free, since that route rejects any authenticated caller
   outright.)

   **Done this session.** Status stays `401` (still accurate — no
   session), but the response body now carries `code:
   'GUEST_USE_DIRECT_PAY'` and `redirectTo:
   '/api/payments/initialize-campaign'` alongside a clearer `error`
   message, so a caller (Part 4's frontend, once built) has a
   machine-readable signal to branch on instead of parsing free text
   or treating every `401` here as a dead end. Deliberately did not
   touch anything else in this route — the wallet-debit path for an
   authenticated caller is unchanged, and Part 1's own rejection of an
   authenticated caller (the other half of the "two-way rule") already
   existed before this session, nothing to add there. Verified: `npx
   tsc --noEmit` passes clean.
4. **[x] Part 4 — frontend wiring.** `promote/page.tsx`'s "Place
   Campaign" action branches on auth state: logged-in → existing
   `create/route.ts` wallet-debit call, unchanged; guest → Part 1's
   route, redirect to the returned `checkout_url`.

   **Scope note, prior session — found and fixed a real, live bug
   while starting this part, before writing any of Part 4's own code:
   don't build a new `/campaign-payment/verify` page mirroring
   `fund-wallet/verify` — that page has been deleted, and nothing
   should replace it.** Task 33 Part 2a (elsewhere in this file)
   rewrote `/api/payments/verify/[reference]/route.ts` to do a plain
   server-side `NextResponse.redirect(...)` instead of returning JSON
   — but `fund-wallet/verify/page.tsx` was never updated to match, and
   kept doing `fetch(...)` + `res.json()` against that route. `fetch`
   follows redirects by default, so it landed on whichever HTML page
   the route redirected to and threw a `SyntaxError` trying to `.json()`
   it — on every single payment, success or failure. The guest stayed
   stranded on a broken "confirming your payment" screen even when
   their payment (and campaign, per Part 2 above) had already gone
   through correctly server-side. This was a live regression affecting
   the *existing* wallet-topup guest flow, not something specific to
   this task — but Part 4's own instructions were about to have a
   future session copy this exact broken pattern for campaign
   payments, which is what surfaced it.

   **Fixed:** `src/lib/payments/checkout.ts` (the shared
   checkout-initialization helper both the wallet-topup and, once wired,
   campaign-direct-pay flows use) now points Korapay's `redirect_url`
   directly at `/api/payments/verify/[reference]` — a real browser
   navigation straight to the route that already does the right thing
   server-side — instead of at an intermediate page that re-fetches and
   misparses it. Deleted `fund-wallet/verify/page.tsx` and its
   now-pointless `mavins_pending_verify` sessionStorage fallback (that
   fallback existed only to survive `reference` getting stripped from a
   *query string*; it's a URL *path* segment now, immune to that same
   failure mode). Verified: `npx tsc --noEmit` passes clean; grepped for
   every remaining reference to confirm nothing else pointed at the
   deleted page.

   **What this means for the rest of Part 4:** the verify route is
   already metadata-type-agnostic (it only ever reads
   `payment_sessions.status` and redirects to whatever `redirect` query
   param it was given) — it does not need to know or care that a
   session is `campaign_direct` rather than a top-up. **No new verify
   page or route is needed for the campaign-direct-pay flow at all** —
   once `initializeCheckout` (or a call built the same way) is used for
   Part 1's route, the existing fix above already covers it for free.

   **Done, this session.** `src/lib/payments/checkout.ts`: extracted
   the checkout_url-processing logic out of `initializeCheckout` into a
   private `redirectToCheckout()` helper, then added
   `initializeCampaignCheckout()` — same contract, but posts the full
   campaign intent to Part 1's route instead of a bare dollar amount to
   the wallet route, so the two flows share the URL-guard/verify-
   callback logic rather than risk it drifting between them.
   `promote/page.tsx`: replaced `goFundWalletGuest` (routed guests
   through the wallet top-up flow — correct before this task existed,
   wrong per its explicit rule, and now fully unused/removed) with
   `goDirectPayCampaign`, calling the new helper; `handleSubmit`'s
   guest branch validates email inline (this codebase's usual
   `EMAIL_RE` pattern) instead of deferring to the fund-wallet form's
   own field, since there's no fund-wallet page in this flow anymore.
   Added the guest email `<input>` directly on the promote page, and a
   `campaign_created=1` query-param effect + distinct success banner
   for a guest returning from checkout.

   **Landed on `redirectTo: '/promote?campaign_created=1'`** for the
   post-confirmation destination — this task's own earlier note left
   it undecided; picked the same page the guest started on rather than
   a dedicated confirmation page, since there's nothing else useful to
   show them yet (no session to fetch "their" campaign with — see
   next).

   **Real, deliberate scope boundary, flagged rather than solved:** a
   guest returning from a confirmed payment does NOT get signed in
   automatically. Part 2's webhook has, by then, already created their
   `users` row + campaign server-side (Task 37), but
   `/api/payments/verify/[reference]` is a pure status redirect (Task
   33 Part 2a) and was never meant to establish a browser session for
   anyone. The success banner is worded to match reality ("your
   campaign is being set up") rather than implying they're logged in
   or can see it yet. Auto-signing in a freshly-auto-provisioned guest
   is a distinct, non-trivial feature (magic link or similar) — Task
   37's own note doesn't cover it either. Worth its own task if this
   product wants that gap closed.

   **Also still open, not addressed here (already flagged by a prior
   session, still true):** the verify route's own failure/pending
   redirects are hardcoded to `/fund-wallet?error=...`/`?info=...`
   regardless of session type — a guest whose *campaign* payment fails
   or is still confirming lands on the fund-wallet page's error/info
   banner, not `/promote`'s. Cosmetic, not a functional break (the
   route's core status logic is unaffected), but worth a follow-up.

   Verified: `npx tsc --noEmit` clean on the full project (not just the
   touched files). A throwaway script (deleted after use) confirmed
   `initializeCampaignCheckout`'s POST body matches
   `initialize-campaign/route.ts`'s documented shape exactly, with and
   without a `paymentCurrency`/DCC hint. **Not verified:** an actual
   live guest checkout end-to-end (no sandbox network access to
   Supabase/Korapay from this environment) — recommend a real check
   post-deploy: as a logged-out visitor, submit a campaign, confirm
   Korapay's checkout page shows the right amount/currency, and confirm
   the campaign + guest account actually exist afterward.

**Ask, restated precisely:** a **direct campaign** (pay for this one
campaign right now, no wallet involved) is how every guest/first-time
user must place their first campaign — this is what creates their
logged-in account (see Task 37). **No wallet crediting happens for a
direct campaign, ever** — the money goes straight to paying for that
campaign, full stop. Every **subsequent** campaign from that same
(now-registered) user must be funded from wallet balance — they can no
longer direct-pay once they have an account; they must have deposited
into their wallet first.

**Relationship to existing tasks:** this is the "first-time-vs-
returning-user logic" half of Task 33 Part 2, which that task's own
note already flagged as not started and pointed at reconciling the
`payments` vs `payment_sessions` table split first. This task makes
the actual rule explicit and unconditional (no wallet touched at all
for direct/first campaigns, not just "credited differently") — treat
this as the authoritative spec for that half of Task 33 Part 2 rather
than building both in parallel.

**Scope:**
- The campaign-placement flow needs a branch: does this
  user/session already have a `users` row (i.e. are they a returning,
  logged-in user)? If not, route to a direct-payment flow that pays
  B-Pay-backend/Korapay for exactly this campaign's cost and, on
  success, provisions the account (Task 37) — no `credit_wallet_deposit`
  call anywhere in this path. If yes, require sufficient wallet balance
  (via Task 38's new debit RPC) and reject/prompt-to-deposit if
  insufficient — no direct-pay option offered to an existing user.
- `addFundsToCampaign` in `campaign.service.ts` already assumes a
  wallet-balance model (checks `getWalletBalanceCents` before
  deducting) — that's the returning-user shape this task wants;
  `createCampaign` itself currently has no such branch at all and
  needs one added.

**Confirmed genuinely blocked this session, not just assumed —
traced the actual code path rather than trusting the "hold" note at
face value:** `api/campaigns/create/route.ts` requires an authenticated
session unconditionally (`if (!authUser) return 401` before anything
else runs) — a guest literally cannot reach campaign creation today,
direct-pay or otherwise. The existing guest-payment infrastructure
(`api/payments/initialize/route.ts`, which does support guest
`guestEmail`-based checkout with no session) is wired specifically for
**wallet top-ups** — it has no concept of "pay for this specific
campaign" (no `sourceUrl`/`viewCount`/campaign fields anywhere in its
body or in `payment_sessions`), and its confirmation path
(`api/payments/verify/[reference]/route.ts`) always ends in
`creditWalletTopUp`, never "create this campaign directly." Building a
guest direct-pay-for-a-campaign flow means either extending
`payment_sessions`/the webhook-confirmation logic to carry campaign
details and branch on them, or a parallel path — and that confirmation
logic is exactly Task 33 Part 2's territory, which is on hold pending
the project owner's deploy + dashboard-repoint report (see the START
HERE box). Don't build a speculative version of this ahead of that —
Task 40's own note already flagged that Part 2 needs a
`payments`-vs-`payment_sessions` reconciliation first, and guessing at
that shape now risks getting rebuilt once Part 2 actually lands.

**Update, later session — this was accurate at the time, no longer the
full picture:** Task 33 Part 2a/2b/2c have since landed code-complete
(only deploy, 2d, is still outstanding), and `korapay-webhook/index.ts`
now has an explicit `TOP_UP_TYPES` set with its own comment naming
"a future direct-campaign-payment session type, Tasks 36/37" as the
intended extension point — meaning the reconciliation this note
worried about guessing at is now a real, stable target, not a moving
one. That's what unblocked splitting this task into 4 parts (see the
list at the top of this section) and building Part 1 as a **parallel
route** (`api/payments/initialize-campaign/route.ts`) rather than
extending the wallet-topup route in place — avoids exactly the
"speculative version that gets rebuilt" risk this note warned about,
since nothing about the existing wallet-topup flow needed touching at
all.

**Part 2 done (commit `462ed70` on the current tree — originally
`afb5393` in an earlier session; re-landed under a new hash after a
sync issue meant the original commit never reached `origin/main`, see
the note at the top of this section).** New `createDirectCampaign()`
helper in `korapay-webhook/index.ts`, mirroring `create/route.ts`'s
`track_campaigns` insert shape exactly. Wired into the main handler:
`metadata.type === 'campaign_direct'` now creates the `users` row (via
the existing `resolveOrCreateGuestUserId` — the same function the
top-up path already used, so this is also the real answer to Task 37's
own "is account creation tied to the right trigger" question, at least
for this path — see Task 37's own note below) + `track_campaigns` row
directly on a successful payment, reading the campaign/pricing
snapshot back out of `session.metadata.campaign`. No wallet RPC is
called anywhere in this path. Same before-status-write ordering as the
existing `isTopUp` branch (crediting/creation happens before
`payment_sessions.status` flips to `'success'`, so a failure keeps the
row retryable instead of permanently stuck).

**New rule, from the product owner directly, applied to BOTH
campaign-creation paths this same session: a duplicate campaign for
the same link is not allowed, but multiple campaigns for multiple
different links are fine.** Not part of this task's original text —
came up mid-session while building Part 2, applied everywhere
campaigns get created (`create/route.ts` AND this new webhook path),
not scoped narrowly to Task 36.
- **Verified finding:** the schema's existing
  `one_active_campaign_per_track UNIQUE (track_id, is_active)`
  constraint does **not** actually enforce this in practice — neither
  creation path ever sets `track_id` on insert (always `NULL`), and
  Postgres treats every `NULL` as distinct from every other `NULL` in
  a `UNIQUE` constraint, so any number of `NULL`-`track_id` rows
  coexist regardless of `is_active`. The new check added this session
  is genuine new enforcement, not a duplicate of something already
  working — scoped to `source_url` (what's actually populated) rather
  than `track_id` (what the DB constraint checks but nothing sets).
- `create/route.ts` — new check before any wallet debit: reject with
  `400` if the same artist already has an `is_active` campaign for the
  same `source_url`. Checked pre-debit specifically so a rejected
  duplicate never charges the wallet.
- `korapay-webhook/index.ts`'s `createDirectCampaign()` — same check,
  but genuinely can't reject-before-charging here: Korapay payment has
  already succeeded by the time a webhook runs. Deliberately still
  creates the campaign the guest already paid for rather than silently
  dropping it or attempting an out-of-scope gateway refund; logs
  loudly (`duplicate: true`) so there's a concrete signal for a future
  session to build real refund-and-notify handling if this narrow race
  (two concurrent checkout sessions for the same link/email) ever
  actually fires in practice. Flagging this as a known, accepted gap
  rather than something silently swept under — a future session should
  not assume this edge case is fully handled.

**Parts 3 and 4 still not started** — see the list at the top of this
section for their scope. Part 3 (`create/route.ts`'s `401` becoming a
redirect toward Part 1's route) is now genuinely unblocked (Part 2
exists to redirect *to*); Part 4 (frontend wiring) depends on Part 3
existing first.

---

## Task 37 — Auto-provision `users` row + wallet on a guest's first campaign [x]

**Ask:** when a guest places their first (direct-pay, per Task 36)
campaign, that's the moment their account gets created — a `users`
row populated, and a wallet initialized for them — so that on any
later visit, the RPCs know exactly which wallet to credit/debit for
that person going forward.

**Relationship to existing code:** `guestCheckout.ts`'s
`resolveOrCreateGuestAccount()` (touched during Task 13's migration
005) already does roughly this — creates the `users` row with a
derived `username`, `profile_completed`, `is_guest_created` — so this
is likely mostly wired already rather than needing to be built from
scratch. What needs explicit verification against *this* task's exact
wording:
- Does account creation currently happen **only** on first campaign
  placement, or does it also (or instead) happen earlier, e.g. at the
  fund-wallet/email step Task 28 skips for already-authenticated users?
  If it's currently tied to the deposit/fund-wallet flow rather than
  campaign placement specifically, that's a mismatch against this
  task's "first campaign placement is the trigger" requirement and
  needs to move.
- Per Task 34/35, "wallet initialized" should mean `users.wallet` set
  to a zero-balance JSONB shape (`{ balance: 0, currency: ... }`) at
  creation time — confirm `resolveOrCreateGuestAccount()`'s `INSERT`
  actually sets an initial `wallet` value and doesn't leave it `NULL`
  (a `NULL` wallet would make `getWalletBalanceCents`'s existing
  `if (error || !data?.wallet) return 0;` fallback silently paper over
  a missing initialization rather than surfacing it).
- Since Task 36 means this user's first campaign is direct-pay and
  never touches the wallet, the wallet row this task creates starts at
  zero and stays at zero until their first actual deposit — confirm
  nothing accidentally credits campaign-payment proceeds into it at
  creation time.

**Investigated this session — one bullet resolved (not a bug), one
confirmed genuinely blocked on Task 36, not just assumed:**
- **Wallet-initialization bullet: resolved, no fix needed.**
  `resolveOrCreateGuestAccount()`'s `INSERT` doesn't explicitly set
  `wallet` — but migration 004's own header comment confirms the live
  column is `users.wallet jsonb NOT NULL DEFAULT '{}'`, so the omitted
  column becomes `{}`, never `NULL`. Checked all three places that read
  it afterward: `credit_wallet_deposit` (migration 004) uses
  `COALESCE(wallet, '{}'::jsonb)` and
  `COALESCE((wallet->>'balance')::bigint, 0)`; the client-side
  `getWalletBalanceCents` (`src/lib/payments/wallet.ts`) does
  `wallet?.balance || 0`; the server-side one
  (`campaign.service.ts`) does the same. All three treat a
  balance-less `{}` wallet as exactly 0, same as this task wants —
  nothing to change here.
- **Trigger-point bullet: confirmed a real mismatch, but it's coupled
  to Task 36, not independently fixable.** `resolveOrCreateGuestAccount`
  is currently only called from `api/payments/verify/[reference]/route.ts`
  — i.e. account creation is tied to the **deposit/fund-wallet
  confirmation** flow, exactly the "or does it happen earlier" case
  this task's own bullet warned about, not to campaign placement at
  all. But there is currently no code path where a guest pays directly
  for a *specific campaign* (Task 36 doesn't exist yet — see that
  task's own note on why it's blocked) for account creation to move
  to. Moving this trigger only makes sense once Task 36's direct-pay
  flow exists to move it *to* — don't attempt this bullet in isolation.

**Closed out this session (2026-08-29) — Task 36's direct-pay flow now
exists (Parts 1–4 all done, deployed and live, per this file's own
history above), so the "trigger-point bullet" above is no longer
blocked. Verified by reading the current code, not assumed:**
`korapay-webhook/index.ts`'s Task 36 Part 2 work already built exactly
what this task's own ask describes — turned out to be an emergent
consequence of that task, not something needing separate new code
here:
- `createDirectCampaign()`'s branch (`session.metadata.type ===
  'campaign_direct'`) calls `resolveOrCreateGuestUserId(supabase,
  session.customer_email)` (line ~495) — the `users` row is created at
  the moment a guest's payment for their **first campaign** succeeds,
  exactly the trigger this task asked for. `customer_email` is
  populated at session-init time from the checkout form's
  `guestEmail` field (`initialize-campaign/route.ts` line ~152), so
  this isn't relying on a field that might be empty.
- Confirmed by reading `createDirectCampaign()` in full: it never
  calls `credit_wallet_deposit` or any other wallet RPC — the comment
  at line ~247 states this explicitly ("a direct-pay campaign never
  touches credit_wallet_refund or any wallet RPC, matching Task 36's
  rule"). Satisfies this task's third bullet: the wallet row created
  alongside this user starts at zero and nothing at creation time
  credits campaign proceeds into it.
- The wallet-initialization bullet was already resolved above (the
  omitted `wallet` column defaults to `{}` — same reasoning applies
  here too, since `resolveOrCreateGuestUserId`'s own `users` insert
  also omits `wallet` explicitly, same convention as the Next.js-side
  `resolveOrCreateGuestAccount()`).
- **Not a regression of the deposit/fund-wallet trigger** — that path
  (`guestCheckout.ts#resolveOrCreateGuestAccount`, still called from
  `api/payments/verify/[reference]/route.ts`) is untouched and still
  correct for its own case: a guest topping up their wallet directly,
  independent of placing a campaign. Both are now legitimate "first
  account-creating action" triggers for their respective flows, not
  competing definitions of one — this task's original "or does it
  happen earlier" concern was about campaign placement being
  *unreachable* as a trigger at all (before Task 36 existed), not
  about the deposit path being wrong to also create an account.
- Both paths land in the same `users` table and both look up by
  `email` first (`ilike`) before creating, so a guest who deposits
  first and places a campaign later (or vice versa) still gets exactly
  one account, not two — verified by reading both
  `resolveOrCreateGuestAccount()` and `resolveOrCreateGuestUserId()`
  side by side.

No code changes were needed — this is a verification-only close-out,
same shape as Task 45 Part 4 Stage 3. `npx tsc --noEmit` stays clean
(unchanged baseline, nothing edited).

---

## Task 38 — RPC for wallet balance deduction (campaign spend) [x]

**Ask:** just as Task 13 built an RPC for crediting deposits, there
needs to be a matching RPC for **deducting** from a wallet balance —
used when a returning user's campaign is paid for out of their wallet
(Task 36) rather than direct-pay.

**Relationship to existing code:** Task 13 explicitly flagged this gap
itself — *"`campaign.service.ts`'s `updateWallet()` (the
campaign-spend/debit side) has the same non-atomic read-modify-write
pattern as the three deposit call sites did... worth its own task if
the product owner wants the debit side made atomic too."* This is that
task, now confirmed wanted. Build `debit_wallet_balance(p_user_id,
p_amount_cents, p_reference, p_reason)` as a new migration, mirroring
`credit_wallet_deposit`'s shape from migration 004: single row-locking
`UPDATE` on `users` (no lost-update race), reject/error rather than
go negative if `p_amount_cents` exceeds the current balance (insufficient-
balance is a real, expected outcome here — Task 36's returning-user
path needs to handle that error rather than trusting a client-side
pre-check to always be right), `SECURITY DEFINER`, execute revoked from
`anon`/`authenticated`, granted only to `service_role`, and log to
`wallet_ledger` the same way migration 004 does.

**Call sites to migrate onto this RPC once it exists** (see Task 34 —
these are the same direct-write violations flagged there, from the
debit side specifically): `campaign.service.ts`'s `addFundsToCampaign`
debit call and any future returning-user campaign-placement debit
(Task 36) — both should call this RPC instead of `updateWallet()`.

**Done, this session.** `supabase_migration_007_debit_wallet_balance.sql`
— `debit_wallet_balance(p_user_id, p_amount_cents, p_reference,
p_reason DEFAULT 'campaign_spend')`, returning `(debited, new_balance_cents,
error_code)`. Uses `SELECT ... FOR UPDATE` to row-lock before deciding
sufficient-vs-insufficient (rather than migration 004's UPDATE-first
approach), since this function needs to branch on the balance *before*
writing anything — an insufficient-balance call writes nothing at all
and returns `debited = false, error_code = 'insufficient_balance'`, a
normal outcome, not an exception. A genuinely-missing user row still
raises, same as migration 004. Idempotency reuses migration 004's
existing `wallet_ledger_user_reference_unique` partial index rather
than adding a second one — it's keyed on `(user_id, reference)` with
no assumption baked in about credit vs. debit direction. Same
lockdown as migration 004: `SECURITY DEFINER`, revoked from
`anon`/`authenticated`, granted only to `service_role`.

**Call-site migration — only the highest-value one done this session,
not both flagged ones:** `src/app/api/campaigns/create/route.ts` had
its **own separate** local `debitWallet()` helper (not
`campaign.service.ts`'s `updateWallet()` — a third, previously-
unflagged direct-write path found this session) doing the actual
production campaign-placement debit non-atomically with no idempotency
guard. That's now rewired to call `debit_wallet_balance` via a new
`debitWalletForCampaign()` wrapper in the same file — this was the
live, load-bearing debit path, so fixing it here is Task 38's real
deliverable, not just the migration file existing unused.
`campaign.service.ts`'s `addFundsToCampaign` (the other call site this
task's own text named) is **still on the old `updateWallet()` path,
not migrated** — left for Task 34's cleanup pass, since that task
already owns "confirm no direct writes remain" as its explicit scope
and doing it piecemeal across two different sessions risks missing a
third site the way this session's own audit just did.

**Known, flagged gap — not closed this session:** the same route's
compensating refund-on-failed-insert (if the wallet debit succeeds but
the immediately-following `track_campaigns` insert then fails) is
still a narrow local non-atomic write, not routed through any RPC —
neither `debit_wallet_balance` (only ever subtracts) nor
`credit_wallet_deposit` (semantically built for real deposits, wrong
ledger `type` and `p_source` shape for a refund) fits this credit-back
case cleanly. Left as an explicitly-commented exception in the code
itself for Task 34 to resolve (add a small symmetric refund RPC, or
confirm this narrow case is an accepted exception to the single-writer
rule) — not silently expanded into scope here.

Verified via `npx tsc --noEmit` — clean.

**Applied to the live DB, 2026-08-28** — confirmed via the project
owner's own terminal log, `supabase db push` from `/root/mavins-web`
inside the `proot-distro` Ubuntu container, in the same batch as
migrations 004/005 above (both had also been sitting unapplied).
Timestamped as `20260828041718_debit_wallet_balance.sql`.

**One recovery step this run needed, worth documenting for future
sessions using this same container:** `supabase db push` initially
failed with *"Remote migration versions not found in local migrations
directory"* — the remote database's migration-history table still had
a row for Task 33 Part 1's `20260828024711_payment_sessions.sql`, but
that timestamped file itself was never checked into git (per this
file's own documented pattern — only the untimestamped source, e.g.
`supabase_migration_006_payment_sessions.sql`, is tracked), and this
container's clone had since been `git reset --hard`'d, wiping the
container's local copy of that transient file. Fixed by recreating the
exact file that had actually gone live (`cp
supabase_migration_006_payment_sessions.sql
supabase/migrations/20260828024711_payment_sessions.sql`), then
`supabase migration repair --status applied 20260828024711` (not
`--status reverted`, which the CLI's own error message suggests —
`reverted` would have told Supabase that migration never really
happened, which is false; the `payment_sessions` table is live and in
use). **Any future session hitting the same "Remote migration versions
not found" error for this same timestamp should reach for this exact
fix, not a fresh investigation** — it's a structural consequence of
timestamped migration files being deliberately untracked, not a
one-off fluke.

**Still not verified:** no live insufficient-balance/idempotent-retry
test has been run against the real Supabase instance yet (no sandbox
network access, same limitation as every RPC task before this one) —
worth a real test call (e.g. from the Supabase SQL editor or a quick
server-side script) before trusting this in production for a real
campaign placement.

---

## Task 39 — Campaign goes live immediately on placement [x]

**Ask:** once a campaign is successfully placed (payment
confirmed — either direct-pay per Task 36, or wallet-debited per Task
38), it should go live right away, no separate "activate" step or
admin approval gate in between.

**Needs a from-scratch check, not assumed already true:** grep for
`is_active`/`current_stage` defaults on `track_campaigns` insert (the
`/api/campaigns/create` route referenced from `campaign.service.ts`'s
`createCampaign`) to confirm a newly-created row is already written
with whatever status means "live" (e.g. `is_active: true`,
`current_stage` not stuck at some `'pending'`/`'draft'` value) rather
than requiring a separate activation call this task would need to add.
If campaign creation already sets those fields correctly on insert,
this task is a one-line confirmation, not new code — check before
assuming work is needed here.

**Confirmed, this session, while working on Task 38 in the same
file.** `src/app/api/campaigns/create/route.ts`'s `track_campaigns`
insert already sets `is_active: true`, `is_paused: false`, and
`current_stage: 'planting'` (not `'pending'`/`'draft'` or anything
requiring a later transition) directly on the same insert that debits
the wallet — there is no separate activation step anywhere in this
path today. This task turned out to be exactly the one-line
confirmation its own text anticipated as the likely outcome; no code
changed for this task specifically (the file changed this session was
for Task 38's debit rewiring, not this).

---

## Task 40 — Fee arithmetic lives ONLY in the Edge Function; the RPC
never computes, it only persists [x]

**Status, this session — all three items now done.** The deposit-side
5% (Task 33 Part 2b's `creditDeposit()`) and the campaign-side 10%
(`calculatePricing()`, confirmed adding-on-top not skimming-out, closed
under Task 35's "Campaign-side audit + fix" note) were already built
and verified. **The one item that had been shared with Task 35 — where
the platform's fee cut itself gets recorded — is now closed too; see
Task 35's own "Closed, this session" note for the full write-up** (new
`platform_revenue` table, migration 011, wired into all three fee-taking
call sites). Not re-duplicated here since it's the exact same piece of
work closing the exact same shared item for both tasks — no separate
implementation exists per-task.

**Note added this session — Task 40's 15%-campaign figure below has
since been superseded again; see Task 35's "Second correction" note
above for the full detail.** The product owner directly re-confirmed
**10% on campaigns, 5% on deposits** — this task's own "15% if it's a
campaign placement" language two paragraphs below, and its "the
10%-vs-15% ... confirmed by the product owner ... it's 15%" resolution
further down, are both now stale. Everything in this task about
**where** the fee math happens (Edge Function computes and deducts,
RPC only persists, never computes) is still correct and unaffected —
only the specific campaign-side percentage (15 → 10) changed. Left the
rest of this task's text unedited below per this file's "don't delete
completed entries" convention; read every "15%" reference below as
meaning 10% now.

**Ask, from the product owner directly, verbatim intent:** the RPC
does no arithmetic at all — that's the Edge Function's job. For every
user action that moves money (a campaign placement, or a deposit), the
Edge Function is the one place that:
1. Calculates the total amount involved.
2. Deducts the fee — **15% if it's a campaign placement, 5% if it's a
   deposit**.
3. For a deposit: the user sees the balance **after** the 5% is
   already deducted — i.e. the net amount, not the gross amount they
   paid. That net remaining balance is what gets sent to the RPC; the
   RPC's only job is to persist it into the `users` table (via
   `credit_wallet_deposit`, migration 004) — it does not compute the
   5% itself.
4. For a campaign: the 15% is deducted first, and **only the remaining
   85%** is the amount actually used to place/fund the campaign (i.e.
   the 15% never touches the campaign's own budget — it's the
   platform's cut, taken off the top, not a cost inside the campaign
   spend).

**This settles two things Task 35 left as open questions** (see that
task's own correction note above, added at the same time as this
task):
- **The 10%-vs-15% platform fee confusion is resolved: it's 15%,
  confirmed by the product owner in this same message.**
  `PLATFORM_FEE_PERCENT` in `src/lib/campaign/pricing.ts` (currently
  `15`) was already correct and does **not** need to change to 10 —
  Task 35's original "needs updating to match this task" instruction
  was itself wrong and should be disregarded now.
- **Where the 5%/15% math happens is resolved: the Edge Function, not
  the RPC.** Task 35's own note had flagged two options ("the 5% is
  deducted before calling the RPC" vs. "the RPC itself computes and
  stores both the gross and net figures") and tentatively recommended
  the RPC-computes approach. The product owner's direction here is the
  opposite: **Edge-Function-computes is correct, RPC-computes is not**
  — the RPC must stay a pure "write this exact number" primitive, no
  business logic. `credit_wallet_deposit`/`debit_wallet_balance`
  already have this shape today (they take a caller-supplied
  `p_amount_cents` and just apply it) — the fix needed is entirely on
  the calling side (the Edge Function), not the RPC's own signature.

**Scope — none of this is built yet, this is a spec-clarification
task, not an implementation one:**
- **Deposit side (5%):** lives in Task 33 Part 2's wallet-crediting
  logic, which per the orientation box at the top of this file is
  still not built (`korapay-webhook/index.ts`'s own header comment
  confirms: "NOT this function's job... Part 2 is what reads that
  status change and decides whether/how much to credit"). When Part 2
  is built, it must compute `net = gross * 0.95` itself and call
  `credit_wallet_deposit` with the net figure — not the gross deposit
  amount, and not delegate the multiplication to the RPC.
- **Campaign side (15%):** `src/lib/campaign/pricing.ts`'s
  `calculatePricing()` needs a from-scratch check (not assumed) that
  it already nets out the 15% correctly before the amount reaches
  `debit_wallet_balance`/the campaign's own `total_budget_cents` — i.e.
  confirm the flow is "compute total → take 15% off the top → the
  remaining 85% is both what's debited from the wallet AND what
  actually funds/places the campaign," not "debit the full total, then
  separately skim 15% off the campaign's budget after the fact" (those
  two produce the same wallet debit but different campaign budgets,
  and only the first one matches this task's wording — "only the
  remaining is used to place the campaign").
- **Where the platform's cut itself is recorded** is still the same
  open question Task 35 already flagged (a ledger row, a separate
  revenue table, or implicit) — not answered by this clarification
  either, still worth a one-line confirmation before building reporting
  on top of it.

**Also noted by the product owner, this message — related but
explicitly deferred, not part of this task's scope:**
- **An API/token endpoint for placing a campaign already exists** —
  this is `/api/campaigns/create/route.ts` (Task 34/38's own subject
  this session). The product owner's framing suggests this is also
  meant to be reachable as a general integration point (e.g. from
  outside mavins-web itself), not just this app's own frontend — worth
  confirming with the product owner exactly what "API token endpoint"
  means here (an API key/token-authenticated variant of this same
  route? a separate route entirely?) before assuming the existing
  session-cookie-authenticated route already satisfies this framing.
- **Campaigns will eventually also surface in "the music app"** — per
  this file's own orientation box, that's Velune (the Android app,
  `Zapier-codes/Velune`, campaign-relevant docs in that repo's
  `HANDOVER_CAMPAIGN.md`). The product owner explicitly said this
  integration will be addressed later ("we will update that too") —
  not in scope for this task or Task 35, just noted here so a future
  session doesn't assume it's already wired or forget it's coming.

---

## Task 41 — Korapay's one-webhook-URL-per-account limit vs. multiple multi-tenant apps: central webhook gateway [x] (B-Pay-backend side)

**Ask, from the product owner directly:** Korapay's dashboard has
exactly one slot for a webhook URL — pointing it at a second app's
endpoint silently replaces the first, it doesn't add a second
destination. The product owner is building multiple other apps beyond
this one, each multi-tenant in its own right, and all of them will
need to receive Korapay webhook events. Every app registering its own
URL directly isn't possible — need one professional, durable way to
receive Korapay's single webhook stream and correctly route each event
to whichever app actually owns it.

**Directly affects Task 33 Part 1b, this repo — see the note added to
that task's own section, same session.** The plan there was "re-point
Korapay's dashboard webhook URL at this repo's own `korapay-webhook`
Edge Function." That's no longer correct on its own: this repo can't
be the only thing Korapay's one URL points at once other apps exist
too. This task is what that repoint step is now blocked on.

**Recommended architecture — a central webhook gateway in front of
every app's own receiver, not each app registering with Korapay
directly:**

1. **Exactly one endpoint is ever registered in Korapay's dashboard —
   the gateway.** Every app-specific webhook handler (this repo's
   `korapay-webhook` included) becomes an internal-only downstream
   target that Korapay itself never calls directly again.

2. **The gateway verifies Korapay's `x-korapay-signature` exactly
   once.** Downstream apps stop verifying it themselves (they can't —
   Korapay never calls them) and instead trust the gateway's own
   internal forwarding signature (point 4 below). This is also a nice
   simplification: `KORAPAY_SECRET_KEY` only needs to live in one
   place going forward, not copied into every app's own secrets.

3. **Tenant routing, recommended approach — a reference-prefix
   convention, not a database lookup.** Every app prefixes the
   payment references *it* generates with a short, unique app code
   before handing them to Korapay at charge-initialization time — e.g.
   `MAVW-<rest>` for this app, a different 4-letter code per future
   app. The gateway reads `data.reference` off the incoming webhook,
   splits off the prefix, and looks it up in a small static routing
   table (app code → internal forward URL + that app's own internal
   forwarding secret). No shared database between apps required, no
   cross-tenant data exposure, no extra round-trip. **Do not build
   metadata-based routing as the primary mechanism** — Korapay's own
   docs need checking to confirm `metadata` is reliably echoed back on
   every relevant webhook event type before depending on it for
   anything more than a defensive fallback.

4. **Forwarding is signed with a per-app internal secret, never
   Korapay's own secret.** Each app's webhook receiver verifies that
   internal signature instead of a raw Korapay one. This keeps a
   compromised app's secret from being usable to forge events for a
   *different* app, and keeps `KORAPAY_SECRET_KEY` itself confined to
   the gateway alone.

5. **Persist-then-forward, for durability — don't let a downstream
   app's downtime cause a lost event.** The gateway records the
   verified event (raw payload, parsed reference, resolved tenant)
   *before* attempting to forward it, and only returns `200` to
   Korapay once that record is durably written — not once the
   downstream forward succeeds. A lightweight retry (cron or queue)
   redelivers from the gateway's own store if a forward attempt fails,
   rather than depending on Korapay's own retry behavior for
   correctness (that's outside anyone's control here and shouldn't be
   load-bearing).

6. **Idempotency at both hops.** The gateway dedupes on something like
   `(korapay event id, or reference + event type)` so a Korapay retry
   doesn't cause a double-forward; each downstream app's own receiver
   stays idempotent too as defense in depth — `korapay-webhook`
   (Task 33 Part 1b) already has this property (a row already at
   `success`/`failed` is left alone on redelivery), which carries over
   unchanged.

**Where the gateway itself should live — flagging as an explicit,
undecided call for the product owner rather than assuming either
way:**
- **Option A — B-Pay-backend becomes the gateway.** It already holds
  the Korapay credentials, is already a shared (not mavins-web-
  specific) payment backend by name and design, and already has a
  webhook route this could evolve from. Simplest option if
  B-Pay-backend is meant to be shared payment infrastructure for every
  app long-term — one Korapay integration, one place.
- **Option B — a new, dedicated micro-service/repo** (e.g.
  `webhook-gateway`) whose only job is verify → route → forward,
  nothing else. Cleaner separation if B-Pay-backend is meant to stay
  narrower (mavins-web-specific business logic) rather than becoming
  general-purpose infra, or if some future app won't otherwise talk to
  B-Pay-backend at all.

Recommend **Option A** as the default unless the product owner wants
B-Pay-backend's scope kept narrower than "shared payment infra for
every app" — needs a one-line confirmation either way before building
starts, same as this file's convention for any real architectural
fork.

**Confirmed by the product owner, this session: Option A (B-Pay-
backend becomes the gateway), and the `MAVW-` reference prefix for
this app — both recommendations accepted as-is, no changes.** Decision
(c) below — whether B-Pay-backend's existing webhook-verification code
is the right starting template — wasn't explicitly addressed and isn't
blocking; whichever session builds this in B-Pay-backend should just
confirm it holds up as a base before extending it, same as any normal
implementation check.

**Done — B-Pay-backend side, confirmed directly, not from a stale
note.** `webhookGateway.js` (new file there): env-var-driven routing
table (`MAVW` prefix → this app), Korapay's own signature verified
once at the gateway, internal HMAC-SHA256 forwarding signature
(`X-Gateway-Signature`), idempotency dedup on `event:reference`, retry
sweep with fixed backoff (30s→2min→10min→30min→1hr, gives up after 5
attempts). Verified there via `node --check` + standalone functional
and signature smoke tests. **Real, explicitly-flagged gap carried
over, not resolved by this build:** B-Pay-backend has no database, so
the event store is in-memory only — durable for the life of the
process, wiped on restart/redeploy. Needs a product-owner decision
(own DB there vs. reuse this app's Supabase project vs. something
else), same open fork as that repo's own Task 12. See B-Pay-backend's
own `handover.md` → Task 41 for the full write-up.

**This repo's own remaining piece is now a real, separate task — see
Task 42 immediately below, not a redo of this paragraph.** Location
decision recorded: this was B-Pay-backend work, done there — the
gateway itself (routing table, signature verification,
persist-then-forward store) lives in that repo, not here.

---

## Task 42 — Swap korapay-webhook's signature verification to the gateway's internal signature, once B-Pay-backend's gateway is live [x]

**Done in commit `c086872`.** Both blockers confirmed cleared by the
product owner before starting: `MAVW_WEBHOOK_URL` +
`MAVW_WEBHOOK_FORWARD_SECRET` set on B-Pay-backend's Render dashboard,
and Korapay's own dashboard webhook URL re-pointed at that Render
service.

`korapay-webhook/index.ts`'s `verifyKorapaySignature` replaced with
`verifyGatewaySignature` — same HMAC-SHA256 + `timingSafeEqual` shape,
but checks `MAVW_WEBHOOK_FORWARD_SECRET` against the
`X-Gateway-Signature` header now, not `KORAPAY_SECRET_KEY` against
`x-korapay-signature`. Deliberately verifies the **raw request body
text** (`req.text()`, read once and reused for both verification and
`JSON.parse`), not a re-serialized copy of the parsed object — this is
a genuine improvement over the old code's approach, not just a
like-for-like port: `webhookGateway.js#signForward` hashes
`JSON.stringify(rawBody)` on the Node side and sends that exact string
as the body, so hashing the literal bytes received guarantees
byte-for-byte agreement, where re-stringifying after parsing would
only "probably" match. `KORAPAY_SECRET_KEY` is no longer read anywhere
in this function — Korapay's own signature isn't checked here at all
anymore.

Verified two ways: `npx tsc --noEmit` clean (`supabase/functions` is
tsconfig-excluded, as established by this same file's prior sessions —
Deno globals aren't valid under Node's checker); and a standalone Node
script simulating both sides of the exchange end-to-end (gateway signs
with the real algorithm, this function's real verification function
checks it) — genuine match confirmed, plus correct rejection of a
tampered body, a wrong secret, and a missing signature header, all
four cases passing.

**⚠️ Critical remaining step — NOT done by this patch, don't skip it:**
applying this patch only updates the source file in git. Supabase Edge
Functions are **not** auto-deployed by a `git push` — the function
running live in Supabase is still the OLD code until explicitly
redeployed, and the secret it needs is a Supabase secret, not (only) a
Render env var. After `git am` + `git push` land this patch, run, from
wherever the Supabase CLI is linked to this project (per this file's
own "Supabase CLI workflow" section — the `/root/mavins-web`
container clone):
```
supabase secrets set MAVW_WEBHOOK_FORWARD_SECRET=<the exact same value set on B-Pay-backend's Render dashboard> --project-ref atojskxrxfsbpeefigtm
supabase functions deploy korapay-webhook --project-ref atojskxrxfsbpeefigtm
```
Until both of those run, live Korapay webhooks forwarded through the
gateway will hit the **old** deployed code, which still checks for
`KORAPAY_SECRET_KEY`/`x-korapay-signature` — meaning every forwarded
webhook will fail signature verification and payments will stop
updating `payment_sessions`, a real regression from the pre-Task-42
working state, until the redeploy actually happens. Confirm both
commands' output shows success before considering this task's real
production behavior fixed, not just its source code.

**✅ Deploy confirmed by the product owner.** Both commands above have
been run successfully — `MAVW_WEBHOOK_FORWARD_SECRET` is set as a
Supabase secret, and `korapay-webhook` has been redeployed with the
gateway-signature-verification code. The regression window described
above is closed; this task is now fully done in both source and
production, not just source. **Not independently re-verified by a
session** (no Supabase API credentials in this sandbox to confirm the
deployed function's live behavior directly) — taken on the product
owner's direct confirmation, same evidentiary standard this file uses
for the Render-dashboard and Korapay-dashboard steps above. If a live
webhook is ever seen failing signature verification after this point,
the first thing to check is whether a *later* `git push` to
`korapay-webhook/index.ts` happened without a matching
`supabase functions deploy` — the manual-deploy gap this whole note
exists to warn about doesn't go away just because it was closed once.

---


- Always `git fetch origin && git reset --hard origin/main` before
  starting a session — multiple sessions/tools have been committing
  directly, so the remote is the source of truth, not any local
  cache.
- Always run `npx tsc --noEmit` before committing — this repo has
  caught several real bugs (missing exports, wrong RPC arg shapes,
  wrong currency var names) purely through the type checker across
  past sessions.

---

## Task 43 — Reference prefix never actually adopted `MAVW-`; every webhook silently unroutable through the gateway [x]

**Found and fixed this session (2026-08-28), before continuing to any
other task — this blocked everything built in Tasks 33/40/41/42.**

Task 41 confirmed the tenant-routing convention with the product
owner directly: B-Pay-backend's gateway (`webhookGateway.js`) resolves
which app a webhook belongs to purely via
`reference.split('-')[0].toUpperCase()`, matched against a static
routing table keyed `MAVW` → this app. Task 42 correctly built the
*receiving* side (`korapay-webhook/index.ts` verifying the gateway's
internal signature) and confirmed it deployed live — but **nothing
ever updated `/api/payments/initialize/route.ts`, the place that
actually generates the reference Korapay gets charged against.** It
was still generating `WLT-<user-id-slice>-<timestamp>` (authenticated)
and `GST-<timestamp>-<random>` (guest) — neither starts with `MAVW`,
so `resolveTenant()` finds no match for every single Mavins-web
payment, logs `"unroutable event ... matched no known tenant prefix"`,
and never forwards the webhook to `korapay-webhook` at all.

**Impact:** with this bug in place, Task 33 Part 2's crediting logic,
Task 40's fee-deduction logic, and Task 42's own signature work were
all unreachable in production — not broken themselves, just never
invoked, because no webhook for a Mavins-web payment could ever arrive
at this repo's Edge Function post-gateway. Every one of those tasks'
own "verified" notes about *their own* logic being correct were true
in isolation and still are; this was the one broken link connecting
this repo to the gateway at all.

**Fix:** both reference-generation sites in
`/api/payments/initialize/route.ts` now prefix with `MAVW-`:
`MAVW-WLT-<user-id-slice>-<timestamp>` and
`MAVW-GST-<timestamp>-<random>`. Confirmed via grep, nothing else in
this repo (`src/` or `supabase/functions/`) parses or depends on the
old bare `WLT-`/`GST-` prefix, so this is a pure additive fix, not a
breaking rename.

**Not verified: an actual live webhook round-trip through the
gateway** — same no-network-to-Supabase/Korapay limitation as every
prior task's own note. This should be confirmed with a real test
payment once deployed; if the gateway's `/gateway-stats` endpoint
(B-Pay-backend, Task 41) still shows the same unroutable-event count
after a real payment post-deploy, re-check this fix against
`webhookGateway.js`'s exact prefix-matching logic directly rather than
assuming this note settled it.

Verified via `npx tsc --noEmit` — clean.

---

## Task 44 — Migrate static/hardcoded campaign data into Supabase; promote page fetches dynamically, no static logic [x]

**Ask, from the product owner directly:** the promote page (and the
pricing engine behind it) currently runs entirely off hardcoded arrays
baked into the frontend/lib code. Move that data into real Supabase
tables — pricing tiers/"products," duration options, and supported
countries at minimum — and have the promote page fetch it dynamically
at read time instead of importing static TypeScript constants. No
static logic left driving what the user actually sees or what pricing
gets computed from.

**Full inventory of what's actually static today, found via this
session's own audit (grounded in real file/line references, not a
guess at scope):**

- **`src/lib/campaign/pricing.ts`** — the actual pricing engine every
  dollar amount on this site derives from:
  - `PRICING_TIERS` (line ~20): 6 rows, each `{ minViews, maxViews,
    pricePer1K (cents), label, description }` — this is the closest
    thing this app has to a "products" table; each tier is effectively
    a purchasable package.
  - `DURATION_SLOTS` (line ~45): 5 rows, each `{ id, label, weeks,
    days, maxDailyDrip, maxViews, description, badge }` — auto-assigned
    based on view count, not user-selectable directly.
  - `calculatePricing()` reads both arrays directly via `.find()` —
    whatever replaces these needs to preserve that exact tier-lookup
    behavior (clamped view count, first tier whose min/max range
    contains it, fallback to the last tier if none match), not just
    swap the data source and hope the logic still works.
- **`src/lib/campaign/geoAffinity.ts`** — the "countries supported"
  data plus genre-targeting logic:
  - `TARGET_COUNTRIES` (line ~30): 25 rows, each `{ code, country,
    flag }` — this is the actual supported-countries list the promote
    page's country picker renders from.
  - `GENRE_COUNTRY_AFFINITY` (line ~65): a genre → country → score
    (0-100) lookup table used to rank/recommend target countries once
    an artist picks a genre. This is denser, hand-tuned data (see that
    file's own header comment on what it is and isn't — a curated
    heuristic table, not a real content-analysis system) and migrating
    it needs to preserve that same nothing-changes-in-meaning
    property, not just move the numbers.
- **`src/app/promote/page.tsx`** — two *more* static arrays living
  directly in the page component, not even in a shared lib file:
  - `GENRES` (line ~41): a flat list of 14 genre strings, the options
    the genre picker renders.
  - `TIERS` (line ~47): **a second, separate hardcoded tier list** —
    `{ min, max, label, color }` — used for this page's own UI display
    (gradient colors per tier), duplicating `PRICING_TIERS`'
    min/max/label fields with no shared source. **Audit finding worth
    flagging on its own:** these two lists can already drift out of
    sync today (e.g. if `PRICING_TIERS`'s view-count bands ever change
    without a matching edit here) — migrating both into one shared
    Supabase-backed source fixes this class of bug structurally, not
    just relocates the data.

**Scope, not yet built — this is a fresh task, no code written for it
this session, per what was actually asked (add the task, not implement
it):**
1. **Schema.** At minimum: a `pricing_tiers` table (the
  `PRICING_TIERS` shape, plus whatever `TIERS`' `color` field needs —
  either folded into the same table or confirmed as a separate
  display-only concern), a `duration_slots` table (`DURATION_SLOTS`'
  shape), a `countries` table (`TARGET_COUNTRIES`' shape — `code`,
  `country`, `flag`), a `genres` table (currently just a flat string
  list — decide whether it needs to be more than `{ id, label }`), and
  a `genre_country_affinity` table (`GENRE_COUNTRY_AFFINITY`'s
  genre/country/score triples — likely the one place a proper
  relational table beats a hardcoded object literal, since today's
  structure is genre-keyed nested objects rather than rows).
2. **Backend read path.** Decide whether the promote page reads these
  tables directly via a Supabase client (RLS permitting — these are
  all public, non-sensitive reference data, so a public-read RLS
  policy is likely correct, unlike every money-adjacent table this
  file's other tasks deal with) or via a small API route that shapes
  the response the same way `calculatePricing()`'s current return
  value looks, so downstream consumers of `calculatePricing()`
  (`create/route.ts`, the new `initialize-campaign/route.ts` from Task
  36 Part 1, `promote/page.tsx` itself) don't all need to be rewritten
  at once — worth deciding before writing any code, since it changes
  how big this task's own "Part 1" would be.
3. **`calculatePricing()` itself.** Currently a synchronous, pure
  function called from both server routes and client components. Once
  its data source is Supabase, it either becomes async everywhere
  (touches every call site) or gets split into "fetch the tiers/slots
  once, cache them, keep `calculatePricing()` itself synchronous over
  the cached data" — the second avoids a much larger refactor blast
  radius but needs a real caching/invalidation story (server-side:
  fine to refetch per-request or cache briefly; client-side
  (`promote/page.tsx` computes pricing live as the user drags the view-
  count slider): needs the tiers loaded once on page mount, not
  re-fetched per keystroke).
4. **Frontend wiring.** `promote/page.tsx`'s own local `GENRES` and
  `TIERS` arrays get deleted entirely once genres/pricing tiers are
  fetched from the same backend source `calculatePricing()` uses — no
  page-local duplicate data left anywhere.
5. **Seed data.** The initial rows for every new table are exactly
  today's hardcoded arrays, verbatim — this is a data migration, not a
  chance to also redesign the actual pricing/country/genre values
  themselves. Any changes to the actual numbers/labels while migrating
  would conflate "move this to Supabase" with "also change what it
  says," which isn't what was asked.

**Not decided yet, worth a product-owner confirmation before Part 1
starts:** whether an admin-facing UI for editing these tables is
wanted as part of this task or a separate follow-up — "migrate to
Supabase" on its own doesn't imply an editing UI exists yet, just that
the data lives in a table a human (or a future admin page) *could*
edit directly via the Supabase dashboard in the meantime.

**Recommended split, once a session picks this up (same one-task-per-
session convention as everything else in this file — this is very
likely 3-4 parts on its own, mirroring Task 36's split immediately
above):** schema + seed migration first (no app code changes, pure
data layer), then the backend read path + `calculatePricing()`
refactor (Part 2), then frontend wiring to delete the static arrays
(Part 3), with the admin-editing-UI question (if confirmed wanted) as
a distinct Part 4 rather than folded into Part 3.

**Superseded by Task 45, below.** This "Recommended split" text is
kept as-is for history, but Parts 2-4 above are no longer the live
plan — the product owner gave a more specific architecture request
(store-backed client cache, resync-only-on-change, a modular pricing-
arithmetic pipeline) that Part 2's original framing didn't anticipate.
Task 45 absorbs Task 44's remaining scope (everything after Part 1,
which stays done and unchanged) into its own 5-part plan. Read Task 45
before starting any of Task 44's remaining work — don't build Part 2
as originally described above.

---

**Part 1 — schema + seed migration. [x] Done this session (2026-08-29).**
`supabase_migration_010_static_data_tables.sql` — five tables
(`pricing_tiers`, `duration_slots`, `countries`, `genres`,
`genre_country_affinity`), seeded verbatim from the current hardcoded
arrays per this task's own instruction not to also change any values
while migrating. No app code touched — `calculatePricing()`,
`promote/page.tsx`'s `GENRES`/`TIERS`, and `geoAffinity.ts` are all
completely unchanged and still what the app actually runs on; this
migration's tables aren't read by anything yet. That's Part 2/3, both
still open.

- **`pricing_tiers`** carries `PRICING_TIERS`' six rows plus `TIERS`'
  `color` field folded into the same table (one products table, not
  two) — confirmed via the audit at the top of this note that a
  genuine drift already exists between those two arrays (`TIERS`' last
  row caps at 5,000,000 views, `PRICING_TIERS`' at 10,000,000). Seeded
  `PRICING_TIERS`' number, since that's what `calculatePricing()`
  actually computes against — see this file's own top comment for why
  that's a deliberate choice, not an assumption, and why it's the
  right one to seed rather than picking a "more correct" number
  between two that already disagreed. This isn't fixed for the app
  itself yet (that's still whatever `TIERS` says, until Part 3 deletes
  it) — only recorded correctly in the new table.
- **`genre_country_affinity`** unrolls `GENRE_COUNTRY_AFFINITY`'s
  nested-object-literal shape into 350 rows (14 genres × 25
  countries) — verified programmatically this session, not just
  assumed from the source: every genre has exactly 25 rows, every
  country/genre code referenced matches a row in `countries`/`genres`
  exactly (no typos, no orphaned foreign keys), confirmed via a
  throwaway Python script parsing the migration file itself before
  treating this as done. The migration also has its own `DO $$ ...
  RAISE EXCEPTION $$` sanity check (25-rows-per-genre) that fails the
  whole migration at apply-time if this ever drifts, rather than
  relying on this note's one-time check staying true forever.
- **RLS:** all five tables are public-read (`USING (true)`), no
  write policy for `anon`/`authenticated` — this is non-sensitive
  reference data, unlike every money-adjacent table elsewhere in this
  project's migrations, so this is a deliberately different (more
  permissive) posture than e.g. `payment_sessions` or `users.wallet`,
  not an oversight.

**Not verified: this migration hasn't actually been run against the
real Supabase instance** — same `supabase db push`/dashboard-SQL-editor
hand-off every prior migration task in this file has needed, no
credentials to do that from this sandbox. The `DO $$ ... $$` sanity
check inside the migration itself is what actually proves the seed
data's row-count invariant once it does run, not this note.

**Next: see Task 45**, further down in this file — it absorbs and
supersedes this "Part 2" plan with a more specific architecture
(store-backed client cache, resync-only-on-change, a modular pricing-
arithmetic pipeline), per direct product-owner request. Don't build
the sync-vs-async decision described above in isolation; Task 45's own
Part 1-3 make that same decision as part of a larger, coherent plan.

**Closed out, 2026-08-29: Task 45 (all 5 parts) is now done**, which
was this task's entire remaining scope (everything after Part 1).
Checking this task's own box now rather than leaving it permanently
open under a task that no longer has any live work of its own — the
"Superseded" note above stays for history/context, not because
anything here is still outstanding.

---

## Task 45 — Store-backed reference data (Zustand/TanStack Query, fetch-once + resync-only-on-change) + a modular pricing-arithmetic pipeline [x]

**SPEC ONLY, per explicit instruction — no code written for this task
this session.** Supersedes Task 44's own Parts 2-4 (see that task's
own note, just above) — Task 44 Part 1 (schema + seed migration,
`supabase_migration_010_static_data_tables.sql`) stays done and
unchanged; this task builds on it, not around it.

**Ask, from the product owner directly, this session — paraphrased
from a stream-of-consciousness message, structure imposed here, not by
them:**
1. The promote page's slider (and everything pricing-related it
   drives) must stay smooth no matter what — dragging it must never
   trigger a Supabase fetch. Adding a new pricing tier, duration slot,
   country, genre, or affinity score in Supabase later must not make
   the slider janky or require a code change to pick up.
2. A client-side store, populated once at initialization, is what the
   slider actually reads from — not a live query. The two candidate
   tools named were Zustand and TanStack Query (**not one merged
   library** — two names given together, read here as two options to
   choose between, or combine, not a single "Zustand-TanStack" thing).
3. The store should resync with Supabase **only when the underlying
   data has actually changed** — not on a timer, not on every mount,
   not "every time," since the product owner's own framing is that
   updates to this reference data will be rare. Whatever mechanism
   decides "has it changed" is a real design decision this task needs
   to make, not hand-wave.
4. Separately, but related: "the pricing calculations and all the
   arithmetical logic" should be **modular** — so a new pricing rule,
   discount, or fee type can be added later as something that "fits
   right in without affecting the code," i.e. without editing existing
   calculation logic to bolt on something new.
5. Reconciling this with the previous message in this same session
   ("I want price calculation to be server side not client side"): the
   two asks are not in tension once split correctly — **the actual
   charged amount must always be recomputed authoritatively
   server-side, at the moment a payment is initialized, never trusted
   from whatever the client displayed.** The slider's live preview
   during dragging is a *display-only* computation, run client-side
   against the store's cached data, using the exact same pure
   calculation functions the server uses — never the source of truth
   for what gets charged. This task's own Part 3 makes this split
   explicit; it is the answer to "how are both true at once," not a
   contradiction to resolve by picking one side.

**Why 5 parts, and why this split specifically:** each part is
independently shippable and independently verifiable (this project's
own one-task-per-session convention, see this file's very first
lines) — Part 1 is pure refactor with no behavior change (safe to ship
alone), Part 2 is additive (new store, nothing deleted yet), Part 3 is
the security-relevant one (server stops trusting hardcoded arrays,
still doesn't trust the client), Part 4 is the actual deletion of the
old static arrays (the highest-risk part, done last and in isolation
once 1-3 are proven), Part 5 is documentation + a concrete
demonstration that the "modular" goal was actually achieved, not just
asserted.

---

### Part 1 — Extract calculation logic into pure, data-parameterized functions + define the modifier-pipeline extension point [x]

**Done this session (2026-08-28).** No data source changes, no
behavior changes, as specified — confirmed by verification, not just
asserted (see below).

- `pricing.ts`: added `PricingReferenceData` (`{ tiers, durationSlots }`
  — mirrors migration 010's `pricing_tiers`/`duration_slots` shapes),
  co-located in `pricing.ts` itself rather than a separate shared
  types file (decided against `referenceData.ts` — no import-cycle
  risk either way since these are just type-only imports, but
  co-locating each interface with the module it actually describes
  seemed cleaner than a third file with no logic of its own). Same for
  `geoAffinity.ts`'s new `GeoReferenceData` (`{ countries,
  genreCountryAffinity }`).
- **The modifier-pipeline** (the part that actually answers "modular,"
  not just the parameter-passing above): `calculatePricing()`'s five
  sequential concerns are now six named, pure step functions
  (`clampViewsStep`, `tierLookupStep`, `subtotalStep`,
  `platformFeeStep`, `durationAssignmentStep`, `savingsStep`), each
  `(ctx: PricingContext) => PricingContext`, folded via
  `PRICING_PIPELINE.reduce(...)`. `calculatePricing()` itself is now a
  thin runner — no arithmetic lives there directly anymore.
  `PricingContext`'s fields are optional except the two inputs every
  step can already rely on (documented in-file: each step only fills
  in what it owns; the non-null assertions live in exactly one place,
  `calculatePricing()`'s own return statement, not scattered through
  every step).
- **Worked example, per the task's own explicit requirement** ("needs
  at least one worked-through example... confirm it can be added as a
  single new step with zero edits to the other [steps]"):
  `EXAMPLE_firstTimeDiscountStep` in `pricing.ts` — a hypothetical 10%
  first-time-buyer discount, deliberately NOT wired into
  `PRICING_PIPELINE`, that would slot in between `subtotalStep` and
  `platformFeeStep` with zero edits to any of the six real steps.
  Verified this claim for real with a throwaway script (deleted after,
  per this project's convention), not just asserted in a comment — see
  "Verification" below.
- **`getRecommendedGeographies()` audited fresh, per the task's own
  instruction not to assume it needs the same treatment without
  checking — it doesn't.** Documented in-file why: it has exactly ONE
  arithmetic concern (a base-score lookup plus a single conditional
  home-market bump), not multiple separable concerns the way pricing's
  six steps are. No `PricingStep`-style pipeline built for it. Still
  parameterized to take `GeoReferenceData` instead of reading
  `TARGET_COUNTRIES`/`GENRE_COUNTRY_AFFINITY` as module globals — that
  part of the ask applies regardless of whether a pipeline shape fits.
  `getGeoTargetingPool()` threads the same `referenceData` through
  (placed after `homeCountryCode`, before `poolSize`, so `poolSize`'s
  default stays usable). `scoreLabel()` audited too — genuinely takes
  no reference data (a pure numeric→label mapping), left unchanged,
  noted explicitly in-file so it's clear this was checked, not
  overlooked.
- **Preserved, not fixed, exactly as instructed:** the `Math.min(...,
  5000000)` clamp that makes the seeded "Legend" tier (`max_views:
  10000000`) unreachable — carried through verbatim in
  `clampViewsStep`, with the same in-code flag this session's earlier
  audit (Task 44 Part 1) already left, so Part 4 doesn't accidentally
  silently fix it as an unasked drive-by change.
- **Call sites, all four real ones this session's own grep found:**
  `initialize-campaign/route.ts`, `create/route.ts`, and
  `promote/page.tsx` (three separate call sites within: the geo pool
  `useMemo`, the pricing `useMemo`, and `topTargetedGeo`'s
  `getRecommendedGeographies` call) — all now pass
  `{ tiers: PRICING_TIERS, durationSlots: DURATION_SLOTS }` /
  `{ countries: TARGET_COUNTRIES, genreCountryAffinity:
  GENRE_COUNTRY_AFFINITY }` explicitly instead of the functions reading
  them as globals. **Correction to the task's own text:**
  `campaign.service.ts` imports `calculatePricing` but this session
  confirmed via grep it's never actually called there (only the
  `PricingResult` type alias import is live) — a stale import, not a
  fifth real call site; nothing needed changing there.
- **Verification, run for real, not just eyeballed:**
  - `npx tsc --noEmit` — clean across the whole repo.
  - **Byte-for-byte comparison script** (transpiled the pre-refactor
    and post-refactor versions of both files with `tsc` to plain JS in
    a throwaway `/tmp` sandbox, `require()`'d both side by side): 121
    checks across every `calculatePricing()` tier boundary (including
    negative/zero/over-max edge cases), every genre in
    `GENRE_COUNTRY_AFFINITY` crossed with several home-country codes
    for `getRecommendedGeographies()`, `getGeoTargetingPool()`'s
    length/sort-order invariants (can't byte-compare its randomized
    pick, so checked what's actually deterministic about it), and
    `scoreLabel()`'s boundary scores. **0 failures** — confirmed
    identical output, not assumed from the refactor being "purely
    mechanical."
  - **Pipeline modularity proof**, separately: hand-computed what
    inserting the hypothetical discount step between `subtotalStep`
    and `platformFeeStep` would produce (a 50,000-view example) and
    confirmed it matches `calculatePricing()`'s own real subtotal/tier
    logic exactly — the concrete demonstration the task asked for that
    the modular claim is real, not aspirational.
  - Sandbox and script deleted after — nothing extra committed, per
    this project's established convention.

### Part 2 — Client-side store: TanStack Query vs. Zustand decision, fetch-once at init, resync-only-on-change mechanism [x]

**Depends on Part 1** (needs the data-parameterized functions to exist
so the store's cached data has something to be passed into).

**Done this session (2026-08-28).** Confirmed by the product owner
directly, this session: **migration 010 is live** — the five reference
tables (`pricing_tiers`, `duration_slots`, `countries`, `genres`,
`genre_country_affinity`) actually exist on the real Supabase instance,
not just as a checked-in SQL file. This matters because it's what makes
this part's own code meaningfully testable/correct rather than
hopeful — worth recording explicitly since nothing in this file had
confirmed migration 010's live status before this note (unlike
migrations 004/005/007/008, each individually confirmed earlier in this
same file).

- **Decision made, as this part's own spec asked for explicitly:
  TanStack Query alone**, no separate Zustand store for this specific
  data. Zustand stays available in this project (already a dependency)
  for genuinely client-only UI state that was never server data — not
  used for reference data, since Query's own cache already provides
  everything a hand-rolled store would just reimplement, with more
  room to disagree with itself.
- `src/lib/campaign/referenceData.ts` — new. A plain async
  `fetchReferenceData(client)` function (not a hook) that reads all
  five tables via one `Promise.all` and shapes them into Part 1's own
  `PricingReferenceData`/`GeoReferenceData` interfaces, plus a new
  `GenreOption[]` (`{id, label}`) that neither of those interfaces
  already covered — `promote/page.tsx`'s own local `GENRES` array
  (id-only strings today) is what Part 4 will eventually replace with
  this. `genre_country_affinity`'s flat table rows are folded into the
  nested `Record<genre, Record<country, score>>` shape
  `GENRE_COUNTRY_AFFINITY` already uses, so `geoAffinity.ts`'s scoring
  functions need no changes to accept it. Deliberately a plain function
  taking a `SupabaseClient` argument, not a hook — Part 3's server-side
  routes will call this exact same function (via the admin/
  service-role client, not the browser one) rather than duplicating the
  fetch+shape logic a second time; one function, two callers, matching
  Part 1's own "one engine, multiple data sources" framing.
- `src/hooks/campaign/useReferenceData.ts` — new. Wraps
  `fetchReferenceData` in a `useQuery` (`staleTime: Infinity` — nothing
  time-based decides staleness here) plus a `useEffect`-managed Supabase
  Realtime channel subscribed to `postgres_changes` on all five tables;
  any event on any of them calls `queryClient.invalidateQueries(...)`
  on this hook's own query key, triggering exactly one refetch. One
  channel for all five tables (every real consumer needs all five
  together anyway), not five separate subscriptions. The documented
  version-check fallback from this part's own spec was **not** built —
  Realtime was usable without any blocker found, so building the
  fallback alongside it would have been exactly the "don't build both
  speculatively" this part's own instructions warned against.
- `src/components/providers/QueryProvider.tsx` — new. A small client
  component wrapping `QueryClientProvider`, using the
  `useState(() => new QueryClient(...))` pattern (TanStack Query's own
  documented approach for the Next.js App Router, not invented here) so
  the client survives re-renders without losing its cache. Also wires
  up `@tanstack/react-query-devtools`, which turned out to already be
  an installed dependency with zero existing usage anywhere in the
  codebase before this session — connected it now that there's finally
  a `QueryClientProvider` for it to attach to (no-ops outside
  development on its own, nothing extra needed here).
- **Root-level, not scoped to the promote page** — wired into
  `src/app/layout.tsx` directly (the *real* root provider tree:
  `AuthProvider` → `ThemeProvider` → `LayoutContent`), not
  `src/app/providers.tsx`. Reference data is small/cheap enough that
  fetching it app-wide isn't wasteful, and it means the promote page
  never waits on a fresh fetch the first time a user reaches it.
- **Found and flagged, not fixed (separate, low-priority concern):**
  `src/app/providers.tsx` — the file that looked like the obvious place
  to add this — turned out to have **zero importers anywhere in the
  codebase**, confirmed by grep. The real provider tree lives directly
  in `layout.tsx`; `GeoProvider` is wired per-page instead (see its
  usage in `promote/page.tsx`/`fund-wallet/page.tsx`), not through this
  file either. Left the file in place (deleting unused-but-harmless
  code is a separate decision from this task's actual scope) but added
  an in-file comment explaining this, so a future session doesn't lose
  time on the same confusion this session had.
- **Verify:** this part's own spec says the live-Realtime-resync
  behavior "can't be scripted without live Supabase access from this
  sandbox" — still true; this sandbox has no network path to the real
  Supabase project (only migration 010 being *live* was confirmed, by
  the product owner directly, not independently re-verified from here).
  `npx tsc --noEmit` passes clean. `npx eslint` could not run at all in
  this sandbox — pre-existing environment issue
  (`ERR_PACKAGE_PATH_NOT_EXPORTED` on `eslint.config.mjs`), unrelated to
  this session's changes and not something previously fixed either; every
  other session in this file has used `tsc` alone as its verification
  bar, followed here too. **Still needs a human, with real Supabase
  dashboard access, to change a row in one of the five tables and
  confirm exactly one resync fires, and that leaving the data untouched
  triggers zero** — the two behaviors this part's entire premise rests
  on, per this part's own "Verify" bullet above.


- **Decide and document, explicitly, before writing code:** TanStack
  Query alone (it already provides a global cache + `staleTime` +
  refetch-on-focus/interval semantics — arguably already *is* "a store
  that's populated once and only resyncs on demand," built for exactly
  this) vs. Zustand alone (a plain global store, with a hand-rolled
  fetch-once-on-init effect and a manually-triggered refetch) vs. both
  together (TanStack Query owns the actual data-fetching/caching
  lifecycle for the five reference tables; a separate, small Zustand
  store — if one is wanted at all — only holds *derived/UI* state, e.g.
  "which genre is currently selected," "current slider position,"
  things that aren't server data and don't belong in a query cache).
  **Recommendation, not a mandate:** TanStack Query alone for the
  reference-data caching itself, since duplicating what it already does
  inside a hand-rolled Zustand store is the more failure-prone path
  (two caches that can disagree) — but this is a real decision for
  whoever implements this part to confirm, not something to treat as
  already settled by this note.
- **Fetch-once at init:** one query (or five, or one composed query —
  decide based on whether the five tables are ever needed
  independently anywhere, or always all-or-nothing on the promote
  page specifically) that runs once when the relevant part of the app
  mounts. Decide the scope: a root-level provider (data ready
  everywhere, costs a fetch even on pages that never touch pricing) vs.
  scoped to wherever the promote page's own provider tree starts (only
  fetches when actually needed, but a user navigating away and back
  without a persistent top-level cache may refetch — TanStack Query's
  own cache persistence across unmount/remount, if configured with a
  sensible `gcTime`, likely makes this a non-issue either way; confirm
  rather than assume).
- **The resync-only-on-change mechanism — the real design decision
  this part exists to make:**
  - **Recommended: Supabase Realtime (`postgres_changes`) subscriptions**
    on the five reference tables (`pricing_tiers`, `duration_slots`,
    `countries`, `genres`, `genre_country_affinity`) — this is
    literally what Realtime is for ("push a change when one happens,
    stay silent otherwise"), and matches "resync only when there's
    actually an update, not every time, not on a timer" far more
    directly than any polling scheme could. On an incoming change
    event, invalidate the TanStack Query cache key (triggering exactly
    one refetch) rather than trying to patch the changed row into the
    cache by hand.
  - **Documented fallback, if Realtime turns out impractical** (RLS +
    Realtime policy friction, connection-lifecycle complexity on a
    page that isn't always mounted, or any other real blocker found
    while implementing — don't assume none exists without checking):
    a cheap version-check. Either a `SELECT MAX(updated_at) FROM ...`
    unioned across the five tables, or (cleaner) a dedicated one-row
    `static_data_meta(key TEXT PRIMARY KEY, updated_at TIMESTAMPTZ)`
    table bumped by a trigger on any of the five tables' own
    INSERT/UPDATE/DELETE — the client checks this single cheap value
    (via TanStack Query's own `refetchInterval`, set to something
    genuinely infrequent, e.g. every few minutes, or on window refocus
    only) and only pulls the full five-table payload again if it
    changed. **Whichever mechanism is chosen, don't build both
    speculatively** — pick one, document why, implement it, leave the
    other documented here as the considered alternative.
- **Verify:** manually confirm (can't be scripted without live
  Supabase access from this sandbox) that changing a row in one of the
  five tables via the Supabase dashboard actually triggers exactly one
  resync, and that leaving the data untouched for an extended session
  triggers zero resyncs — the two behaviors this part's entire premise
  rests on.

### Part 3 — Server-side authoritative recomputation: the charge amount is never trusted from the client [x]

**Depends on Part 1.** This is the literal answer to "I want price
calculation to be server side" from earlier this session — made
precise here rather than left as a general preference.

**Done this session (2026-08-28).**

- Both real call sites (`create/route.ts`, `initialize-campaign/route.ts`)
  now call `getServerReferenceData(admin)` (new
  `src/lib/campaign/referenceDataCache.ts`) instead of importing
  `PRICING_TIERS`/`DURATION_SLOTS` directly, and pass the result into
  `calculatePricing()` exactly as before. `initialize/route.ts` stays
  untouched — confirmed by grep it has zero `calculatePricing()`
  references; it's still just a flat, price-irrelevant wallet top-up
  amount, matching this part's own "if it ever becomes price-relevant"
  conditional, which it hasn't.
- `src/lib/campaign/referenceDataCache.ts` — new. The module-level
  in-memory cache with a 60s TTL this part's own spec recommended,
  wrapping Part 2's shared `fetchReferenceData()` (not duplicated —
  same function Part 2's client hook calls, just given the
  admin/service-role client here instead of the browser one). Added
  one thing beyond the spec's literal ask: concurrent cache-miss
  requests (e.g. several checkouts initiating in the same instant right
  after the TTL expires) collapse into a single in-flight Supabase read
  via a shared promise, rather than each firing its own redundant
  fetch. Documented the real serverless caveat this cache has that a
  browser-tab cache wouldn't: it's only shared within a single warm
  instance, so a cold start or a request landing on a different
  instance gets its own fresh cache regardless of TTL — expected and
  fine for this data, noted so it isn't mistaken for a bug later.
- **No Realtime/webhook invalidation built server-side** — matches this
  part's own accepted tradeoff ("a stale-by-up-to-60-seconds price...
  is acceptable") and Part 2's "don't build both speculatively" logic,
  applied here too.
- **Verify, per this part's own explicit requirement** ("a throwaway
  script or manual test confirming a server route rejects/ignores a
  tampered client-supplied total"): wrote and ran a throwaway script
  (this project's own convention — write it, run it, delete it) that
  parsed both routes' actual source for every field read from the
  client request body (dot-access **and** destructuring, not just one
  pattern) and confirmed neither ever reads anything matching
  `/total|price|amount|cost|charge/i` — the stronger, more literal
  version of "rejects a tampered total" is that there is structurally
  no such field for a client to tamper *with*; only inputs
  (`viewCount`, `genre`, etc.) ever cross the wire, and the server
  computes the actual number from those every time. Also confirmed
  `calculatePricing()` is genuinely called in both files (not just
  imported) and that neither file references the hardcoded arrays
  outside of an explanatory comment. All checks passed; script deleted
  after, nothing extra committed.
- Verified: `npx tsc --noEmit` passes clean.

- Every server route that turns a price into an actual charge
  (`create/route.ts`, `initialize-campaign/route.ts`, and
  `initialize/route.ts` if it ever becomes price-relevant beyond flat
  wallet top-up amounts) must call Part 1's refactored
  `calculatePricing()` itself, server-side, against its **own**
  server-side read of the five reference tables — never accept a
  pre-computed total from the request body and trust it directly. This
  is already almost true today (these routes already call
  `calculatePricing()` server-side against the hardcoded arrays); the
  actual change here is swapping the data source from hardcoded arrays
  to a Supabase read, not introducing server-side computation that
  doesn't already exist.
- **Server-side caching, so this doesn't mean "hit Supabase on every
  single request":** these routes are serverless/edge functions with
  no long-lived process the way a browser tab has — a Zustand/TanStack
  Query store doesn't translate directly. Recommended: a simple
  module-level in-memory cache with a short TTL (e.g. 60 seconds) —
  first request in that window hits Supabase, subsequent ones within
  the TTL reuse the cached result, next request past the TTL refetches.
  Good enough for reference data that changes rarely; does not need
  Realtime or the version-check mechanism Part 2 builds for the
  client, since a stale-by-up-to-60-seconds price for someone actively
  checking out is an acceptable tradeoff this task treats as settled —
  flag for a product-owner call only if that assumption turns out to
  be wrong once someone thinks about it harder than this note did.
- **Explicit split to document in code comments, not just here:** the
  client's slider preview (Part 2's cached store, Part 1's pure
  functions run directly in the browser) is always a *preview* —
  labeled as such in the UI if it isn't already, and never sent to a
  server route as "the price," only the inputs that determine it
  (view count, genre, duration selection) are ever sent. The server
  recomputes from those inputs independently and that recomputed value
  is what actually gets charged. If the client's preview and the
  server's authoritative number ever disagree (a stale client cache
  during a rare mid-session data change, for instance), the server's
  number wins silently — worth a UI affordance to detect and handle
  that gracefully (e.g. re-show updated pricing before charging) but
  that's a nice-to-have, not this part's core scope.
- **Verify:** a throwaway script or manual test confirming a
  server route rejects/ignores a tampered client-supplied total and
  recomputes its own instead — the actual security property this part
  exists to guarantee, not just "the code calls calculatePricing()
  somewhere."

### Part 4 — Frontend wiring: delete the old static arrays, slider reads only from the store [x]

**Depends on Parts 1-3 all being done and verified — this is the
highest-risk part (deletion), done last and in isolation on purpose.**

**In progress, split into 3 stages this session (2026-08-29) to keep
each increment independently verifiable, same reasoning as this
task's own 5-part split above — not a deviation from it:**
- **Stage 1 [x]** — `promote/page.tsx` re-pointed at Part 2's
  `useReferenceData()` store (props threaded into `GenreChips`,
  `GeoTargetingSection`, `DurationSlotsGrid`, `SelectedCountriesStack`,
  `PricingBreakdown`; loading gate added around the New Campaign card;
  local `GENRES`/`TIERS` deleted). Old arrays in `pricing.ts`/
  `geoAffinity.ts` deliberately left in place as a safety net.
  `npx tsc --noEmit` clean.
- **Stage 2 [x]** — `PRICING_TIERS`/`DURATION_SLOTS` deleted from
  `pricing.ts`; `TARGET_COUNTRIES`/`GENRE_COUNTRY_AFFINITY` deleted
  from `geoAffinity.ts`; `campaign.service.ts`'s stale `calculatePricing`
  import removed (kept the `PricingResult` type import, per Part 1's
  own note that it was never actually called). **One real call site
  this task's own grep (both here and in Part 1's) missed:**
  `src/lib/currency/countryCurrency.ts` imported `TARGET_COUNTRIES`
  directly for a dev-time drift guard comparing its `COUNTRY_CURRENCY`
  map's keys against it. Fixed by converting that guard from a
  module-load-time side effect into an exported function,
  `checkCountryCurrencyDrift(countries)`, called once from
  `promote/page.tsx` in a `useEffect` after `referenceData` resolves
  (dev-only, same as before). `npx tsc --noEmit` clean; confirmed via
  grep that every remaining reference to the four deleted export names
  anywhere in `src/` is in a comment, not live code.
- **Stage 3 [x]** — done (2026-08-29). Closed out this part's own two
  "Verify" items by inspection (no running browser available in this
  sandbox, so this is a code-level trace rather than a literal manual
  click-through): (1) `handleSliderInput` (the DOM-input handler that
  fires continuously while dragging) only mutates a CSS custom
  property and a ref'd text node — no `setState`, no network call
  anywhere in it or anything it calls; `viewCount` React state (and
  therefore `pricing`, `useMemo`'d straight off `calculatePricing()`)
  only changes once, on release, via `handleSliderChange`.
  `calculatePricing()` itself (`pricing.ts`) is fully synchronous —
  confirmed no `fetch`/`await` anywhere in the file. (2) Traced every
  consumer of `pricing`/`referenceData` in `promote/page.tsx`
  (`DurationSlotsGrid`, `SelectedCountriesStack`, `PricingBreakdown`,
  the header tier badge, the submit button's price label) and
  confirmed each reads directly off the same `pricing`/`referenceData`
  values Part 1's own verified pipeline produces — nothing stale or
  re-derived separately. `npx tsc --noEmit` clean. Re-ran Stage 2's
  grep for the four deleted export names across `src/`: every
  remaining hit is still in a comment only. `npm run build` was also
  attempted; it fails solely on this sandbox's lack of network access
  to fetch Google Fonts at build time, unrelated to this task's
  changes.

- Delete `PRICING_TIERS`/`DURATION_SLOTS` from `pricing.ts`,
  `TARGET_COUNTRIES`/`GENRE_COUNTRY_AFFINITY` from `geoAffinity.ts`,
  and `GENRES`/`TIERS` from `promote/page.tsx` — all four call sites
  this session's grep found (`campaign.service.ts`,
  `initialize-campaign/route.ts`, `initialize/route.ts`,
  `create/route.ts`, `promote/page.tsx`) get re-pointed at either
  Part 2's client store (client-side call sites) or Part 3's
  server-side Supabase read (server-side call sites) — no file left
  importing a hardcoded array that no longer exists.
- `promote/page.tsx`'s slider drag handler calls Part 1's pure
  `calculatePricing()` directly against Part 2's store data — confirm
  by inspection (and ideally a quick manual interaction check) that
  dragging the slider triggers zero network requests, the actual
  end-to-end proof of this whole task's original premise.
- **Verify:** `npx tsc --noEmit` clean; manually exercise the promote
  page's full flow (genre pick → slider drag → duration/tier display →
  submit) and confirm every displayed number matches what Part 1's
  byte-for-byte comparison script (from Part 1's own verify step)
  already proved the new pipeline produces.

### Part 5 — Contributor guide + concrete proof the "modular" goal holds [x]

**Done this session (2026-08-29).** New `src/lib/campaign/CONTRIBUTING.md`
— a small dedicated file rather than a comment block, since the guide
needs to cover the whole reference-data/pricing pipeline (multiple
files: `pricing.ts`, `referenceData.ts`, `referenceDataCache.ts`,
`useReferenceData.ts`, migration 010), not just one function's own
neighborhood. Covers both required things with a worked example each:
1. **Adding a new data row** — a hypothetical seventh pricing tier,
   shown as a single `insert` statement, zero `.ts` files touched.
   Also flagged the one real caveat this example surfaces on its own:
   a tier whose range starts above `clampViewsStep`'s existing
   `Math.min(..., 5000000)` clamp is stored and visible but
   unreachable by the actual calculation until that clamp changes too
   — ties directly into the still-open Task 44 item below rather than
   silently glossing over it.
2. **Adding a new arithmetic rule** — narrated version of `pricing.ts`'s
   own `EXAMPLE_firstTimeDiscountStep` (already in the file, per Part
   1): the one new step function, the one line inserting it into
   `PRICING_PIPELINE`, and an explicit list of what was NOT touched
   (all six existing steps, `calculatePricing()` itself, every call
   site, `PricingContext`'s shape) — the actual demonstration, not an
   assertion.
Added a short pointer comment in `pricing.ts` (next to the existing
worked-example comment) linking to the new file, rather than
duplicating the guide's content into the code comments themselves.
`npx tsc --noEmit` clean (docs-only + one comment addition; no
behavior change).

**Task 44's three still-open items — checked, not assumed:**
- **Admin-editing UI question** — still open. Task 46 (SPEC ONLY) is
  the direct answer, not yet built.
- **5M-vs-10M clamp inconsistency** — still open, deliberately not
  fixed here either (see the guide's own §1 caveat) — needs a
  product-owner call since it's a pricing decision (does the seeded
  "Legend" tier become reachable), not a pure bug fix.
- **`TIERS`-vs-`PRICING_TIERS` drift** — confirmed resolved by Task 45
  Part 4 (the local `TIERS` array in `promote/page.tsx` is gone;
  one tiers source now, not two).

**Task 45 is now fully done — all 5 parts complete.**

**Depends on Part 4** (needs the final, real shape of the code to
document accurately — writing this earlier risks describing an
intermediate state that changes).

- A short, concrete written guide (a comment block at the top of
  wherever the pipeline lives, or a small dedicated markdown file —
  decide based on what actually gets read; a future session or the
  product owner themselves is the audience) covering exactly two
  things with a worked example each:
  1. **Adding a new *data* row** (a pricing tier, duration slot,
     country, genre, or affinity score) — purely a Supabase insert via
     the dashboard or a new migration, zero code touched, given Parts
     1-4 landed correctly. This should already be true by construction
     once this task is done; Part 5 just writes it down so it doesn't
     need re-deriving from the code every time.
  2. **Adding a new *kind* of arithmetic rule** — a worked, concrete
     example (can reuse Part 1's own hypothetical "10% off for a
     first-time buyer" if that's what was used to validate the
     pipeline shape there) showing the one new step function and the
     one line adding it to the pipeline array, with an explicit note
     of which existing files/functions were NOT touched to add it —
     the actual demonstration that "fits right in without affecting
     the code" is real, not aspirational.
- Confirm (don't just assert) that Task 44's own still-open items
  (admin-editing UI question; the 5M-vs-10M clamp inconsistency; the
  `TIERS`-vs-`PRICING_TIERS` drift) are either resolved by this task's
  own work or still explicitly open and flagged as such in this file —
  don't let this task's own done-note quietly imply they were fixed if
  they weren't.

---

## Task 46 — Full admin control unit: reference-data CRUD, fee arithmetic, live-campaign overrides, and a real admin dashboard (SPEC ONLY, not started) [ ]

**This directly answers Task 44's long-open "admin-editing UI
question"** (see that task's own note, and Task 45 Part 5's checklist
item referencing it) — the product owner has now confirmed, in detail,
that a real admin-facing editing surface is wanted, not just "a human
could edit the tables via the Supabase dashboard in the meantime."
Written up this session (2026-08-29) as a spec only — same convention
Task 45 used (see its own "(SPEC ONLY)" tag) — because this is large
enough that scoping it correctly matters more than starting to type
code immediately, and because several of the parts below touch live
money/campaign state where a wrong guess is expensive to unwind.

**Current state, confirmed by reading the actual code (not assumed):**
the entire admin surface today is `src/app/admin/page.tsx` (one page)
and `src/app/api/admin/dashboard/route.ts` (one route) — both
**read-only**. `isAdmin()` (`src/lib/auth/isAdmin.ts`) is the single
source of truth for "is this user an admin": a DB `role === 'admin'`
column check, with a hardcoded fallback email/password pair in that
same file as a bootstrap admin. There is no admin write path anywhere
in the app today — Task 46 is building that from zero, not extending
an existing one.
**Flagged, adjacent but NOT part of this task's 5 parts below:** that
hardcoded admin password lives in plaintext in this file, in the git
history, on every clone. Worth its own separate security cleanup
(env var at minimum, proper credential rotation ideally) — raising it
here so it isn't lost, not folding it into this task's scope since
it's a different kind of problem (security hygiene, not admin
capability).

**Split into 5 parts, per the product owner's own request — one part
per session, same convention as every multi-part task in this file:**

### 46a — Reference-data CRUD (countries, pricing tiers, duration slots, genres, demographic/genre-country affinity) [ ]
Full create/edit/delete admin UI + API routes for every table Task 45
Part 1-3 already made the app read dynamically:
`pricing_tiers`, `duration_slots`, `countries`, `genres`,
`genre_country_affinity` (migration 010 — see
`src/lib/campaign/referenceData.ts` for the exact columns each table
has today). This covers, explicitly, everything the product owner
listed that maps to *reference* data rather than a *live campaign*:
adding a new country, adding/editing/removing a pricing tier (which
also covers "increase or reduce the views count" when read as
adjusting a tier's `min_views`/`max_views` bounds — see 46c below for
the *other* reading, a live campaign's own delivered-view count),
editing a genre's demographic priority score
(`genre_country_affinity.score` — this is literally what "demographic
priority" already means in this codebase's own data model, per
`geoAffinity.ts`; nothing new to invent conceptually, just an editing
surface for a number that already exists and already drives targeting
today).
**Must integrate with Task 45 Part 2's client cache** — an edit here
needs to actually reach logged-in users' `promote` page without a
manual refresh, or this whole feature quietly fails its own purpose
the first time an admin changes a price and support gets a "why is it
still showing the old price" ticket. Task 45 Part 2's own "resync-only-
on-change" design (TanStack Query + Realtime) is exactly the mechanism
to hook into — confirm it actually fires on an admin write, don't
assume it does without checking, per this whole file's own "confirm,
don't assert" convention.

**Backend half done, this session — API routes only, UI explicitly not
started, stopped here on direct instruction before any UI code.**

- **New shared helper, `src/lib/auth/requireAdmin.ts`** — extracted
  from an identical ~15-line block that was independently copy-pasted
  across `api/admin/dashboard/route.ts`, `api/campaigns/cancel/
  route.ts`, `api/campaigns/create/route.ts`, and `api/campaigns/
  add-funds/route.ts` (confirmed via grep before extracting, not
  assumed). Only swapped into `dashboard/route.ts` this session — that
  route's semantics (admin-or-reject, no ownership fallback) match the
  helper exactly. **Deliberately did NOT touch `cancel`/`create`/
  `add-funds`** — those three let a *non-admin* act on their own
  resource and only use `isAdmin` as an additional flag, not a hard
  gate; force-fitting them onto a helper shaped for the dashboard
  route's stricter case would have risked changing real behavior on
  payment-adjacent routes for the sake of a cosmetic dedup. Left as
  their own inline checks, unchanged.
- **Five new routes, one per table**, all funneled through
  `requireAdmin()`:
  - `api/admin/pricing-tiers/route.ts` — POST (create) / PATCH
    (update by `id`) / DELETE (by `id`).
  - `api/admin/duration-slots/route.ts` — same shape.
  - `api/admin/countries/route.ts` — same shape, keyed on `code`
    instead of `id`; also handles the `korapay_channels`/
    `korapay_default_channel` columns Task 30b added (migration 012).
    Deleting a country **cascades into `genre_country_affinity`** —
    every affinity row for that country is removed automatically by
    the existing FK (migration 010's own `ON DELETE CASCADE`), not
    handled specially in this route. Worth a confirm-dialog warning
    about that once a UI exists (46e's job).
  - `api/admin/genres/route.ts` — same shape, keyed on `id`. Same
    cascade-delete note as countries.
  - `api/admin/genre-country-affinity/route.ts` — **shaped
    differently on purpose**: this table has a composite PK
    (`genre_id`, `country_code`), not a single `id`, and 350 rows (14
    genres × 25 countries) rather than a handful, so "edit the
    Afrobeats/Nigeria score" is the same action whether that pair
    already has a row or not — POST is an **upsert** (Supabase's own
    `.upsert()`, keyed on the composite PK), not separate strict-
    create/strict-update verbs like the other four routes. No PATCH;
    POST covers both. `score` is validated 0-100 both here (a clear
    400 with a useful message) and at the DB level (migration 010's
    own `CHECK` constraint, as a backstop).
- **Realtime propagation confirmed by reading the code, not
  assumed** (per this task's own explicit instruction): `useReferenceData.ts`
  subscribes to `postgres_changes` on all five tables and invalidates
  the shared TanStack Query key on any INSERT/UPDATE/DELETE — a write
  through any of these five new routes reaches the promote page's live
  slider with no manual cache-invalidation call needed from the routes
  themselves. Not manually re-verified against a live Supabase
  instance this session (no live credentials in this sandbox) — the
  mechanism existing and being correctly wired is confirmed by reading
  Task 45 Part 2's own code, which is not the same claim as "watched it
  actually fire." A session with deploy access should do one real
  end-to-end check (edit a price via one of these routes, confirm the
  promote page updates without a refresh) before treating this as
  fully proven.
- **Deliberately shallow validation across all five routes** — types
  and required-field presence only. None of the routes check
  cross-row business rules (e.g. whether a new/edited `pricing_tiers`
  row creates a gap or overlap in `min_views`/`max_views` coverage
  across tiers — `calculatePricing()`'s tier lookup falls back to the
  last tier if nothing matches, so a gap wouldn't crash anything, but
  could produce a confusing/wrong price for some view counts). Flagged
  as a known limitation, not fixed here — a fuller validation pass
  (or a UI that visualizes tier coverage as it's edited) is a
  reasonable follow-up, out of this session's scope.
- **UI: not started, stopped here on direct instruction** ("give me
  the patch for this only first, before adding any other UI creation
  or anything else on top") — before starting the actual admin editing
  surface (which this task's own scope still needs — "Full create/edit/
  delete admin **UI** + API routes", not routes alone), a session
  picking this back up should re-check `frontend-design`'s own
  guidance against Task 46d's explicit note ("matching this app's
  existing design system... rather than inventing a new visual
  language for just the admin section") — this is functional internal
  CRUD tooling extending an existing page's established visual
  language (`admin/page.tsx`'s glass-card/tab conventions), not
  greenfield brand design; leaned toward the former reading before
  stopping, worth confirming explicitly rather than re-deriving from
  scratch next session.
- **Verified:** `npx tsc --noEmit` clean across all six new/changed
  files. A throwaway Node script (deleted after use, not committed)
  mirrored each route's field-validation logic against valid-create,
  missing-required-field, valid-partial-update, invalid-number, and
  the affinity route's score-boundary cases (0/100/101/-1/NaN) — all
  correct. **Not verified — no way to check this from a sandbox:** an
  actual authenticated admin request against a live Supabase instance
  (no live credentials here) — same limitation flagged on the Realtime
  propagation point above.

**UI half, this session — commit `8f8c65c`. Per direct instruction:
pulled latest first (this task's own numbering had already shifted
underneath a separate, unrelated fee-decision session that landed
in between — see Task 35's own note for what happened there), then
split the remaining UI work into two parts and built only the first.**

- **Part A (built):** the two tables that share one simple shape —
  single string `id` PK, every other field a flat scalar, no
  cross-row relationships: `pricing_tiers` and `duration_slots`. New
  `src/components/admin/AdminCrudTable.tsx` — one reusable list/
  inline-add/inline-edit/delete-confirm component, matching
  `admin/page.tsx`'s existing glass-card/table visual language (per
  this task's own note above, checked `frontend-design` first and
  read this as "extend an existing page," not greenfield design).
  Wired into two new tabs on `admin/page.tsx` itself — no new page/
  route added, consistent with the rest of this file's admin surface
  living in that one page.
- **Part B (superseded by this note — split further into B-i/B-ii per
  direct instruction, see below):** `countries` (extra Korapay-channel
  columns this task's own note already flags, plus a real
  cascade-delete warning — deleting a country cascades into
  `genre_country_affinity` via the FK, migration 010), `genres` (simple
  on its own, just not reached this session), and
  `genre_country_affinity` (composite `(genre_id, country_code)` key,
  350 rows, upsert-not-strict-create semantics on its own API route —
  a fundamentally different UI shape from a flat table with an add
  row, more likely a filterable matrix/grid). `AdminCrudTable` as
  built (Part A) was NOT a fit for any of these three as-is — a future
  session should expect to extend it or build bespoke UI, not assume
  it drops in unchanged.

**Part B-i (built, this session — commit pending): `countries` +
`genres`.** Per direct instruction: pulled latest first (this session's
own numbering had shifted underneath Part A's own "UI half" commit
landing in between — same class of drift flagged in Part A's own
note), then split Part B into B-i (`countries` + `genres`) and B-ii
(`genre_country_affinity`, the composite-key matrix table) rather than
attempting all three together, and built only B-i.

- **`AdminCrudTable` generalized rather than duplicated** — two small,
  additive changes, both backward-compatible with Part A's existing
  two call sites (verified: `npx tsc --noEmit` clean on the whole
  project, Part A's tabs untouched in behavior):
  - **`idKey` prop** (defaults to `'id'`) — `countries` is keyed on
    `code`, not `id`; every internal reference to `row.id` became
    `row[idKey]`, and the generic constraint relaxed from
    `T extends { id: string }` to `T extends Record<string, any>` to
    allow it.
  - **`'text-array'` column type** — `countries.korapay_channels` is a
    real `string[] | null` DB column (migration 012), which the
    previous `'text' | 'number' | 'textarea'` union had no way to
    represent. Edited as a plain comma-separated text input; the
    conversion to/from the real array happens only twice — once at
    edit-start (array → joined string, populating draft) and once at
    save (string → trimmed/filtered array, or `null` if empty) —
    **deliberately not** re-converted on every keystroke, since a
    naive split-and-rejoin approach would silently eat a trailing
    comma the admin just typed to start entering the next channel
    name, making it fiddly to type a list at all. Verified with a
    throwaway script (deleted after): the round-trip is lossless for a
    populated array, `null`, and `[]` (both empty cases collapse to
    `null`, matching what the countries route itself treats as "no
    confirmed Korapay coverage" per migration 012's own comment), and
    confirmed a string mid-typed with a trailing comma is never
    silently rewritten (draft only converts at save, not per
    keystroke).
- **`countries` tab**: `idKey="code"`, `deleteWarning` set to a
  cascade-delete notice (shared with `genres` via one
  `CASCADE_DELETE_WARNING` constant — both tables cascade into
  `genre_country_affinity` via the same kind of FK, so one shared
  message is accurate for both, not a coincidence worth two separate
  strings). `korapay_default_channel` edited as a plain text field
  (not a dropdown constrained to whatever's currently in
  `korapay_channels`) — a real, deliberate gap: cross-field validation
  (this value should be one of that array's entries) isn't attempted
  here, matching Part A's own "deliberately shallow validation" note
  above; a stricter UI (a `<select>` populated from the sibling
  field's current draft value) is a reasonable follow-up, not built.
- **`genres` tab**: uses the component's default `idKey="id"` — no
  new capability needed here, it already fit Part A's original shape
  exactly; genuinely just "not reached yet" as Part B's own note said,
  not a hidden complication.
- **`countryRowToBody`/`genreRowToBody`** — same snake_case-row →
  camelCase-body mapping pattern as Part A's `tierRowToBody`/
  `slotRowToBody`, matching `api/admin/countries/route.ts` and
  `api/admin/genres/route.ts`'s own `fromBody()` field lists exactly
  (both already existed from this task's backend half — not built this
  session, just wired to).
- **Integrates with Task 45 Part 2's shared cache**, same pattern and
  same reasoning as Part A: `refreshAfterWrite` extended to cover
  `'countries' | 'genres'` alongside the original two tables, calling
  `queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY })`
  after every successful write.
- **Not built this session — Part B-ii, explicitly deferred, not
  attempted:** `genre_country_affinity`. Per this task's own earlier
  note, its shape (composite key, 350 rows, upsert semantics) doesn't
  fit `AdminCrudTable` even generalized — needs its own bespoke
  filterable matrix/grid UI, a different-enough component that
  building it inside this same session (after already generalizing
  `AdminCrudTable` once) would have risked rushing a second, harder
  UI design in the same sitting rather than giving it its own proper
  attempt. Left as its own follow-up task.
- **Verified:** `npx tsc --noEmit` clean on the whole project. A
  throwaway Node script (deleted after use, not committed) confirmed
  both new row-to-body mapping functions produce exactly the field set
  each route's own doc comment documents, and that the `text-array`
  draft/save conversion round-trips losslessly (populated array,
  `null`, and `[]` all handled correctly) without re-normalizing on
  every keystroke. **Not verified — no way to check from this
  sandbox:** an actual authenticated admin write against a live
  Supabase instance for either table, or the Realtime/query-
  invalidation round-trip reaching `promote/page.tsx` end-to-end —
  same standing limitation Part A's own note already flagged, not
  re-solved here.
- **A real, non-obvious wrinkle found while building Part A, worth
  flagging explicitly:** `useReferenceData()`'s own `PricingTier`/
  `DurationSlot` shapes (`src/lib/campaign/pricing.ts`) deliberately
  drop `id`/`color`/`sort_order` — `calculatePricing()` never needed
  them. An admin editing UI does need them back (for PATCH/DELETE and
  for controlling display order), so this reads the raw tables
  directly via the browser Supabase client instead of through that
  hook — safe because migration 010's RLS already permits public
  `SELECT` on both tables, confirmed by reading the migration file
  directly rather than assumed. No new GET route was added to either
  admin API route for this (those routes' own doc comments say "no GET
  here" on purpose) — the raw-table read is genuinely a different,
  already-permitted path, not a workaround for a missing one.
- **Integrates with Task 45 Part 2's shared cache, this task's own
  explicit requirement:** after a successful write, calls
  `queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY })`
  directly (imported from `useReferenceData.ts`) rather than relying
  solely on the Realtime round-trip that hook's own subscription
  already does — gives the admin's own list an immediate refresh
  rather than waiting on that trip, while still exercising the same
  shared cache the promote page reads from.
- **Verified:** `npx tsc --noEmit` clean on the full project. A
  throwaway Node script (deleted after use) confirmed both
  row-to-body mapping functions (`tierRowToBody`/`slotRowToBody`)
  produce exactly the field set each route's own doc comment
  documents. **Not verified — no way to check from this sandbox:** an
  actual authenticated admin write against a live Supabase instance,
  or that the Realtime/query-invalidation round-trip actually reaches
  `promote/page.tsx` end-to-end — same limitation the backend commit
  above already flagged.

### 46b — Platform-fee arithmetic control (campaign %, deposit %) [ ]
Move `PLATFORM_FEE_PERCENT` (`src/lib/campaign/pricing.ts`, currently
`10`) and `DEPOSIT_FEE_RATE` (`supabase/functions/korapay-webhook/
index.ts`, currently `0.05`) from hardcoded source constants into
something an admin can change without a code deploy — most likely a
new row (or two) in a settings/config table, read the same
store-backed way Task 45 built for pricing tiers, rather than a third,
different mechanism.
**This is the single highest-stakes part of this whole task — treat it
that way.** Task 40's entire rule (fee arithmetic lives in exactly ONE
place, nowhere else does math) exists because this fee rate has
already flip-flopped in this file's own history (see the top box's
own "Fee rate flip-flopped twice" note) purely from miscommunication
between sessions — making the rate itself admin-editable raises the
stakes further, not lower them: a wrong or accidental edit here changes
real money on every transaction from that moment forward, for every
user, silently, until someone notices. Whatever this part builds MUST:
keep Task 40's "one place computes it" invariant (the admin-editable
value should be the ONE input that one place reads, not a second
parallel fee calculation); log every change (old value, new value, who,
when — see 46e); very likely want a confirmation step beyond a normal
form submit (e.g. re-enter password, or a two-step confirm) given the
blast radius of a typo here.

### 46c — Live-campaign admin overrides [ ]
Per-campaign admin edits, on an already-`is_active`
`track_campaigns` row, without breaking Task 39's "campaign goes live
immediately" invariant or Task 38's wallet-deduction accounting:
- **Delivered view/stream counts** — `total_streams`/`real_streams`/
  `seeded_streams` (see `supabase_schema.sql`'s own `track_campaigns`
  definition for the exact columns) — the *other* reading of "increase
  or reduce the views count" from 46a's tier-bounds reading; this one
  is a live campaign's own progress number, likely for fraud
  correction or manual reconciliation, not a pricing change.
- **Demographic priority for a live campaign** — `target_countries`/
  `target_genres` (same table) — explicitly called out by the product
  owner as something admin needs to change **even during a live
  campaign**, not just at creation time. Check whether anything
  currently reads these columns as fixed-at-creation (e.g. a cached
  copy elsewhere, a running job that snapshotted them at start) before
  assuming a live edit here takes effect immediately — don't guess,
  trace the actual read path per this file's own convention.
- **Pause/resume, cancel** — `is_paused`/`is_active` already exist as
  columns; confirm whether an admin-initiated pause/cancel needs to
  reuse `api/campaigns/cancel/route.ts`'s existing refund-math (Task 35
  — the platform keeps its 10% fee, only the 90% subtotal refunds) or
  whether an admin override should behave differently (e.g. no refund
  at all for a fraud-driven admin cancellation) — this is a real
  product decision, not an implementation detail, and needs its own
  confirmation before building.

### 46d — Admin dashboard buildout (routes, pages, navigation, icons) [ ]
The actual UI surface for 46a/46b/46c above — today's single
`admin/page.tsx` needs to become a real multi-page dashboard: a nav
structure (sidebar or top-nav, matching this app's existing
`src/components/layout/` conventions rather than a one-off admin-only
layout), a dedicated route per concern (e.g. `/admin/countries`,
`/admin/pricing`, `/admin/fees`, `/admin/campaigns`, plausibly
`/admin/users` too — see "possibly missed" list below), appropriate
icons/empty-states/loading-states matching this app's existing design
system (check `frontend-design` conventions already established
elsewhere in this codebase rather than inventing a new visual language
for just the admin section), and route-level `isAdmin()` gating
consistent with how `api/admin/dashboard/route.ts` already does it
(check the caller's own session, not just trust a client-side
`isAdmin()` check, which is trivially bypassable from devtools — every
new admin API route in 46a/46b/46c needs the same server-side check
that route already has, not a weaker one).

### 46e — Audit trail + safety rails across all of the above [ ]
Every mutation from 46a/46b/46c needs: who made it, when, and the
before/after value — a new `admin_actions` (or similarly named) table,
written to on every admin write, not just the money-sensitive ones
(46b/46c) — a changed country flag or a changed pricing label is worth
auditing too, just lower-stakes than a changed fee percentage. Also:
confirmation dialogs for destructive or high-impact changes (deleting
a country/tier a live campaign might reference; editing the platform
fee; overriding a live campaign's view count) — not every edit needs
one (renaming a genre's label doesn't), but this part should establish
the pattern/component once so 46a-46c don't each invent their own.

**Possibly missed, worth raising with the product owner before/during
46d's route planning rather than silently added or silently
skipped:**
- **User management** — the product owner's "full control of the
  whole web app" plausibly extends to admin being able to view/manage
  individual users (not just campaigns/pricing) — e.g. manually
  adjusting a user's wallet balance for a support case.
  **Withdrawal approval specifically — CORRECTED, this session:** the
  original version of this bullet said no admin approval surface was
  found for `api/withdrawal/request/route.ts` and flagged that as
  possibly missing. That was based on an incomplete read — the
  withdrawal feature isn't partially missing an approval step, it's
  **entirely disabled**, on purpose, per Task 21 (`[x]`, see that
  task's own entry above): `earnings/page.tsx`'s withdraw UI and the
  `POST` handler in that route are both commented out, with the route
  short-circuiting to a `403`. Nothing to build here unless/until a
  future task explicitly re-enables Task 21's feature — not a Task 46
  gap.

**Confirmed decisions (product owner, 2026-08-29) — supersedes the
open questions this section used to list; implement against these,
don't re-derive or re-ask:**

- **46b fee-change confirmation UX:** not re-authentication (retype
  password) — the whole admin surface is already gated, and stacking
  re-auth on top adds friction without real added security here.
  Use a **type-to-confirm pattern** instead: show e.g. "Changing
  platform fee from 10% to 12%" and require the admin to type the new
  number into a second field before the save button enables (same
  proven pattern as AWS's resource-deletion confirms — no new
  infrastructure needed). **More important than the confirmation UX
  itself: fee changes must be forward-only, never retroactive** — a
  campaign's price is already locked in at creation
  (`total_budget_cents` set then, per Task 35), so a fee-rate change
  must only affect campaigns created *after* the change. Build this as
  an explicit, tested invariant, not an assumption. 46e's audit trail
  is mandatory for this part specifically, not optional — don't ship
  46b without it landing in the same body of work.

- **46c admin-cancellation refund policy:** not one fixed rule —
  **require a reason** on every admin-initiated cancellation, and
  branch on it:
  - `fraud` / `policy_violation` -> **no refund**. Refunding a ToS
    violation would subsidize the abuse it's meant to stop.
  - `customer_service` / `technical_issue` -> **same 90% refund as a
    normal user cancellation** (Task 35's existing math, unchanged) —
    the customer isn't at fault here and shouldn't be treated as if
    they were.
  Logging the reason (via 46e) makes this both more correct and more
  defensible after the fact than a single blanket rule either
  direction would be.

- **Currency/exchange-rate data (46a's sibling question):** **do NOT**
  make raw FX rates admin-edited free-form data — a manually maintained
  rate is a classic operational risk (someone forgets to update one,
  the business either loses money or overcharges). Keep rates
  live-sourced (`korapayDccCurrency.ts` already does this). If the
  product owner wants business control over margin here, scope it as
  an **admin-editable markup percentage layered on top of the live
  rate** — same shape as the platform fee (46b), not a raw-rate
  override.

- **Admin roles — structure, confirmed:**
  - **Root admin** — the existing hardcoded-credential account
    (`bossblingzs@gmail.com`, `isAdmin.ts`) IS the root admin going
    forward under this new model, not replaced by it. Always full
    access; does not count against the cap below.
  - **Assigned admins — max 3, assigned by the root admin.** Each one
    gets EITHER the **Full** role (every 46a-46e capability, same as
    root) OR a **limited role**, chosen per-admin at assignment time —
    the product owner named **"monitor"** explicitly as one concrete
    limited-role example (read visibility across the dashboard, no
    edit/write capability anywhere), but also said an assigned admin
    can "have few roles separately" — i.e. limited roles are not
    locked to a single fixed "monitor" tier; the root admin should be
    able to hand-pick which specific capabilities (pricing edit,
    country edit, fee edit — 46b specifically, campaign overrides —
    46c, user management) a given limited admin gets, individually.
  - **Proposed shape for 46d/46e to build against** (mine, not
    dictated verbatim by the product owner — confirm the exact
    capability-key taxonomy when 46d is actually built, don't treat
    this list as final): a `role` value of `'root' | 'full' |
    'monitor' | 'custom'` per admin user, plus a `permissions` field
    (array/jsonb of capability keys) that's only consulted when
    `role = 'custom'` — `'full'`/`'root'` imply every capability,
    `'monitor'` implies view-only across the board as a convenient
    named preset for the common case, `'custom'` is the per-admin
    hand-picked subset. Every new admin API route this whole task adds
    needs to check the caller's specific role/permission, not just a
    single boolean `isAdmin()` — that boolean becomes "has ANY admin
    access" at most, not "can do this specific thing."
  - **Ambiguity worth confirming before 46d locks the schema in:**
    whether "max 3 admins" means 3 *assigned* admins in addition to
    root (4 people total with any admin access — this note's working
    assumption, since the product owner's phrasing was "other person
    admin assigns... max is 3 admins can be assigned") or 3 total
    including root (2 assignable slots left). Implement against the
    4-total reading unless corrected, but don't let it go unconfirmed
    once 46d actually starts.

- **The hardcoded admin password — fix BEFORE 46d, not alongside it,
  not after.** It has been sitting in plaintext in this file's own git
  history, and has now also been pasted directly into a chat
  conversation — treat it as already compromised, not merely
  theoretically risky. Immediate: rotate the password, move it to an
  environment variable instead of a literal in `isAdmin.ts`.
  Longer-term, once the root/assigned-admin role model above is real:
  retire the hardcoded-email fallback entirely in favor of the
  `role === 'admin'` (or `'root'`) DB-column check that already
  exists — real admin accounts created via normal signup plus a role
  grant, nothing bespoke or hardcoded left in source at all.

Given the fee-confirmation UX, refund-reason policy, exchange-rate
scoping, and admin-role structure are now all confirmed above, the
main things still genuinely open before 46d locks in its schema are:
the exact capability-key taxonomy for `'custom'` roles, and the
root-vs-4-total headcount ambiguity just flagged. Everything else in
this task can proceed against the decisions above without re-asking.

**Recommendation for unblocking both, written this session — not yet
confirmed by the product owner, don't treat as a third "confirmed
decision" alongside the ones above:**

1. **Capability-key taxonomy — don't block 46a/46b/46c on this at
   all.** The taxonomy isn't really a product decision to invent from
   nothing; it's a mechanical enumeration of whatever admin-mutating
   resources 46a/46b/46c end up actually building — one capability key
   per resource/action (e.g. `countries.write`, `pricing_tiers.write`,
   `duration_slots.write`, `genres.write`,
   `genre_country_affinity.write`, `fees.write`,
   `campaigns.override.views`, `campaigns.override.targeting`,
   `campaigns.pause_cancel`, plus `users.manage` if that "possibly
   missed" item above gets confirmed in scope). **Recommendation: let
   46a, 46b, and 46c proceed now**, each one just needs to gate its own
   new route(s) behind *some* named permission key it defines as it's
   built — the taxonomy naturally falls out of that as a byproduct, at
   which point it's a **concrete, finished list** ready for 46d to
   consume. Only 46d (route/dashboard gating) and 46e (audit-trail
   keying) actually need the taxonomy to be locked, and by the time
   those start, 46a-46c will have already produced it. This also makes
   the eventual product-owner check-in easier and more concrete: "here
   are the 9 specific things an assigned admin can be individually
   granted, does this match what you meant by 'a few roles
   separately'" is a much easier thing for a non-technical stakeholder
   to react to than being asked to design an abstract taxonomy from a
   blank page up front.
2. **Root-vs-4-total headcount — proceed on the existing 4-total
   working assumption (already this section's own default), but hedge
   the implementation rather than hard-coding the number anywhere.**
   The literal quoted phrasing ("other person admin assigns... max is
   3 admins can be assigned") reads more naturally as "3 assignable
   slots, root is separate and not counted" than as "3 total including
   root" — consistent with the working assumption already on record
   above. Recommendation: implement the cap as a single named
   constant/config value (not inlined into a query limit or a UI
   string in multiple places), specifically because this is still
   unconfirmed — if the product owner later says "no, 3 total," fixing
   it is then a one-line change, not a schema or logic rewrite. Ask it
   as a single, low-effort, non-blocking yes/no at the product owner's
   convenience (e.g. "just to double check — root plus 3 more admins,
   4 people total with any admin access, right?") rather than treating
   it as a hard gate on starting 46d.
3. **Sequencing recommendation, combining both of the above with the
   already-flagged security item:** rotate the hardcoded admin
   password **first**, standalone (already flagged above as
   "already compromised, do this before 46d, not alongside it") — this
   has nothing to do with either open question and shouldn't wait on
   them. Then 46a/46b/46c can proceed in any order/session, each
   registering its own capability key as it goes. 46d picks up the
   now-concrete taxonomy plus a settled (or still-4-total-assumed, per
   above) headcount once it starts. 46e threads through starting no
   later than 46b, per that part's own "mandatory for this part
   specifically" note.

---
