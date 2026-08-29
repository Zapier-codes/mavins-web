// src/lib/campaign/referenceDataCache.ts
//
// Task 45 Part 3 (handover.md). Server-side counterpart to Part 2's
// client store — same underlying data (migration 010's five reference
// tables), same fetchReferenceData() function (src/lib/campaign/
// referenceData.ts, shared with Part 2 rather than duplicated), but a
// different caching strategy: these are serverless/edge routes with no
// long-lived process the way a browser tab has, so a TanStack
// Query/Realtime setup doesn't translate directly here.
//
// Recommended approach from Part 3's own spec, implemented as
// specified: a simple module-level in-memory cache with a short TTL
// (60s) — first request in a window hits Supabase, subsequent ones
// within the TTL reuse the cached result. A stale-by-up-to-60-seconds
// price for someone actively checking out is an accepted tradeoff per
// that spec, not something this module tries to solve more precisely
// (no Realtime/webhook invalidation server-side — deliberately not
// built, matching Part 2's own "don't build both speculatively" logic
// applied to the server side too).
//
// NOTE on serverless reality: this module-level cache is only shared
// across requests within the SAME warm serverless instance — a cold
// start (or a request routed to a different instance) gets its own
// fresh cache and will hit Supabase again regardless of TTL. This is
// expected and fine for this data (small, cheap, rarely-changing) —
// noted here so a future session doesn't mistake occasional
// unexpected fetches for a bug in the TTL logic itself.

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchReferenceData, type AllReferenceData } from './referenceData';

const TTL_MS = 60_000;

let cached: AllReferenceData | null = null;
let cachedAt = 0;
let inFlight: Promise<AllReferenceData> | null = null;

export async function getServerReferenceData(client: SupabaseClient): Promise<AllReferenceData> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) {
    return cached;
  }
  // Collapse concurrent cache-miss requests (e.g. several checkouts
  // initiating in the same moment right after the TTL expires) into
  // one Supabase read rather than a stampede of identical fetches.
  if (inFlight) {
    return inFlight;
  }
  inFlight = fetchReferenceData(client)
    .then((data) => {
      cached = data;
      cachedAt = Date.now();
      return data;
    })
    .finally(() => { inFlight = null; });
  return inFlight;
}
