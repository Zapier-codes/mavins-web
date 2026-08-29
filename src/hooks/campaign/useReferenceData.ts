// src/hooks/campaign/useReferenceData.ts
//
// Task 45 Part 2 (handover.md). Decision made here, per that task's
// own "decide and document, explicitly" instruction: **TanStack Query
// alone**, no separate Zustand store for this data — Query already
// provides the global cache + fetch-once-and-share-across-consumers
// behavior a hand-rolled Zustand store would just be reimplementing
// (and could disagree with). Zustand stays available in this project
// for genuinely client-only UI state (selected genre, slider position,
// etc.) that was never server data to begin with — not used here.
//
// Resync mechanism: Supabase Realtime (`postgres_changes`) on the five
// migration-010 tables, per Part 2's own recommendation — not the
// documented version-check fallback. On any INSERT/UPDATE/DELETE
// event, invalidate this hook's query key so TanStack Query refetches
// exactly once; no attempt to patch the changed row into the cache by
// hand, since these tables are small (a few hundred rows total) and a
// full refetch is cheap and simpler than merge logic that could drift.
//
// Fetch-once at init, root-level: wired into providers.tsx at the app
// root (see that file), not scoped to the promote page specifically —
// this data is small and rarely-changing enough that fetching it even
// on pages that don't need it yet is cheap, and it means a user who
// does eventually reach the promote page never waits on it. TanStack
// Query's own `gcTime` (kept at its default — this data is cheap
// enough not to need a longer one) means it isn't literally refetched
// on every unmount/remount within the same session either way.

import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { fetchReferenceData, type AllReferenceData } from '@/lib/campaign/referenceData';

export const REFERENCE_DATA_QUERY_KEY = ['campaign-reference-data'] as const;

const REALTIME_TABLES = [
  'pricing_tiers', 'duration_slots', 'countries', 'genres', 'genre_country_affinity',
] as const;

export function useReferenceData() {
  const queryClient = useQueryClient();

  const query = useQuery<AllReferenceData>({
    queryKey: REFERENCE_DATA_QUERY_KEY,
    queryFn: () => fetchReferenceData(createClient()),
    // Reference data changes rarely (per the product owner's own
    // framing in Part 2's spec) — staleTime effectively infinite;
    // the Realtime subscription below is what actually decides when
    // to refetch, not time.
    staleTime: Infinity,
  });

  // One Realtime channel, five tables, all invalidating the same query
  // key — deliberately not five separate channels/hooks, since every
  // consumer of this data needs all five tables together anyway
  // (calculatePricing() needs tiers+durationSlots, the geo scoring
  // functions need countries+genreCountryAffinity, promote/page.tsx —
  // once Part 4 wires it — needs genres too).
  useEffect(() => {
    const client = createClient();
    const channel = client.channel('reference-data-changes');
    for (const table of REALTIME_TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => { queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY }); }
      );
    }
    channel.subscribe();
    return () => { client.removeChannel(channel); };
    // queryClient is stable across renders (from context); intentionally
    // not re-subscribing on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return query;
}
