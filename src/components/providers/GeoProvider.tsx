'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { detectUserGeo, type DetectedGeo } from '@/services/geo/ipGeolocation.service';

/**
 * Global, app-wide IP geolocation context (ipapi.co, via
 * `detectUserGeo()`). Fetched exactly once per visit, at true app
 * initialization — this provider is mounted at the root of the provider
 * tree in `src/app/providers.tsx`, deliberately OUTSIDE `AuthProvider`,
 * so it has no way to read auth/session state and therefore no way to be
 * reset by a login/logout event. Every page that needs the visitor's
 * detected country/currency should read it from `useGeo()` here instead
 * of calling `detectUserGeo()` directly — that keeps this a single
 * shared fetch instead of one per consumer (the underlying service does
 * dedupe concurrent calls via its own module-level cache, but going
 * through this context is what actually makes the value "known
 * globally" as a matter of app architecture, not just an implementation
 * detail of the service).
 *
 * Deliberately NOT persisted to Supabase or any other server-side/
 * account-tied store — see `ipGeolocation.service.ts`'s own header
 * comment for why (in short: this is meant to reflect wherever the
 * visitor's connection currently appears to be — including over a VPN —
 * not a "real" location pinned to their account that could go stale or
 * override a later, different connection).
 */

interface GeoContextType {
  /** Resolved detection result, or `null` once detection has completed
   *  and failed/found nothing (ad blockers, rate limits, offline, etc. —
   *  always a valid, expected outcome, never treated as an error state
   *  by consumers). Also `null` while `loading` is true. */
  geo: DetectedGeo | null;
  /** True only during the initial detection attempt for this visit. */
  loading: boolean;
}

const GeoContext = createContext<GeoContextType>({ geo: null, loading: true });

export function GeoProvider({ children }: { children: React.ReactNode }) {
  const [geo, setGeo] = useState<DetectedGeo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    detectUserGeo().then((result) => {
      if (cancelled) return;
      setGeo(result);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return <GeoContext.Provider value={{ geo, loading }}>{children}</GeoContext.Provider>;
}

export function useGeo() {
  return useContext(GeoContext);
}
