'use client';

// Task 46d (handover.md): split from the old admin/page.tsx monolith's
// 'affinity' tab (Task 46a Part B-ii). This page needs genres +
// countries for its own selector/list, in addition to the affinity
// rows themselves — loads all three independently rather than sharing
// state with /admin/genres or /admin/countries, same reasoning as
// every other split page (see pricing/page.tsx's own header comment).

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { AffinityMatrix, type AffinityRow } from '@/components/admin/AffinityMatrix';
import { REFERENCE_DATA_QUERY_KEY } from '@/hooks/campaign/useReferenceData';
import { type CountryRow, type GenreRow, callAdminRoute } from '@/lib/admin/adminHelpers';

export default function AdminAffinityPage() {
  const queryClient = useQueryClient();
  const [genres, setGenres] = useState<GenreRow[]>([]);
  const [genresLoaded, setGenresLoaded] = useState(false);
  const [countries, setCountries] = useState<CountryRow[]>([]);
  const [countriesLoaded, setCountriesLoaded] = useState(false);
  const [affinityRows, setAffinityRows] = useState<AffinityRow[]>([]);
  const [affinityLoaded, setAffinityLoaded] = useState(false);

  async function loadGenres() {
    const { data, error } = await supabase.from('genres').select('*').order('sort_order');
    if (!error) setGenres(data ?? []);
    setGenresLoaded(true);
  }

  async function loadCountries() {
    const { data, error } = await supabase.from('countries').select('*').order('sort_order');
    if (!error) setCountries(data ?? []);
    setCountriesLoaded(true);
  }

  // Task 46a Part B-ii — RLS already permits public SELECT (migration
  // 010), no scoping by genre server-side since 350 rows (14 genres x
  // 25 countries) is cheap to load whole and filter client-side (see
  // AffinityMatrix.tsx's own header comment for why genre-at-a-time
  // was chosen for the UI shape itself, independent of this decision).
  async function loadAffinity() {
    const { data, error } = await supabase.from('genre_country_affinity').select('genre_id, country_code, score');
    if (!error) setAffinityRows(data ?? []);
    setAffinityLoaded(true);
  }

  useEffect(() => {
    loadGenres();
    loadCountries();
    loadAffinity();
  }, []);

  async function refreshAfterWrite() {
    await loadAffinity();
    queryClient.invalidateQueries({ queryKey: REFERENCE_DATA_QUERY_KEY });
  }

  // api/admin/genre-country-affinity/route.ts's own POST is an upsert
  // — no separate PATCH, so "save" always calls the same route
  // regardless of whether this (genre, country) pair already had a
  // row. DELETE body is { genreId, countryCode }.
  async function saveAffinity(genreId: string, countryCode: string, score: number) {
    const result = await callAdminRoute('/api/admin/genre-country-affinity', 'POST', { genreId, countryCode, score });
    if (result.success) await refreshAfterWrite();
    return result;
  }

  async function clearAffinity(genreId: string, countryCode: string) {
    const result = await callAdminRoute('/api/admin/genre-country-affinity', 'DELETE', { genreId, countryCode });
    if (result.success) await refreshAfterWrite();
    return result;
  }

  return (
    <AffinityMatrix
      genres={genres}
      countries={countries}
      affinityRows={affinityRows}
      isLoading={!affinityLoaded || !genresLoaded || !countriesLoaded}
      onSave={saveAffinity}
      onClear={clearAffinity}
    />
  );
}
