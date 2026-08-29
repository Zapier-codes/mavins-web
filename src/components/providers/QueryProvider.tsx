// src/components/providers/QueryProvider.tsx
//
// Task 45 Part 2 (handover.md). A thin client-component wrapper is
// needed because layout.tsx is a server component and QueryClient
// itself must be created client-side, once, and stay stable across
// re-renders — the useState(() => new QueryClient()) pattern below is
// TanStack Query's own documented approach for the Next.js App
// Router (not something invented here), specifically to avoid
// re-creating the client (and losing the whole cache) on every render.

'use client';

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        // Reference data changes rarely (see useReferenceData.ts) —
        // this default just avoids surprising refetch-on-focus/mount
        // behavior for any future query added to this same client;
        // useReferenceData.ts sets its own staleTime explicitly too,
        // this is a sane app-wide default, not load-bearing for it.
        staleTime: 60_000,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* @tanstack/react-query-devtools was already an installed
          dependency (package.json) before this session, unused
          anywhere — wiring it up now that there's finally a
          QueryClientProvider for it to attach to. Renders nothing in
          production: the package itself no-ops outside development,
          no env-check needed here. */}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
