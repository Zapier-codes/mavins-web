'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Loader2, Check, RotateCcw } from 'lucide-react';

/**
 * Task 46a Part B-ii (handover.md) — admin UI for
 * public.genre_country_affinity, the one table of the five Task 45
 * Part 1-3 made reference-data-driven that AdminCrudTable's flat-list
 * shape genuinely doesn't fit: composite (genre_id, country_code) key,
 * 350 rows (14 genres x 25 countries), upsert-not-strict-create
 * semantics (api/admin/genre-country-affinity/route.ts's own POST is
 * a Supabase .upsert(), no separate PATCH — see that route's header
 * comment).
 *
 * Shape chosen: pick ONE genre, then edit that genre's score against
 * every country in a single-column list — not a full genre x country
 * grid rendered all at once. A true 14x25 grid would need either
 * constant horizontal AND vertical scrolling on mobile, or 350
 * simultaneously-mounted number inputs; genre-at-a-time keeps exactly
 * one axis on screen, matches how an admin actually thinks about this
 * ("tune Afrobeats' markets," not "stare at the whole matrix at once"),
 * and is filterable per this task's own note by adding a country
 * search on top of the genre picker.
 *
 * An unset (genre, country) pair is a real, valid state, not missing
 * data needing a placeholder — geoAffinity.ts's own
 * getRecommendedGeographies() already does
 * `table[meta.code] ?? 20` (confirmed by reading that function
 * directly, not assumed), i.e. a pair with no row here safely falls
 * back to a baseline score of 20. That's why "Clear" (delete the row
 * entirely, not "set to 0") is a safe, well-defined action here, and
 * why an empty input shows a "(default 20)" placeholder rather than a
 * literal 0.
 */

export interface AffinityGenreOption {
  id: string;
  label: string;
}

export interface AffinityCountryOption {
  code: string;
  country: string;
  flag: string;
}

export interface AffinityRow {
  genre_id: string;
  country_code: string;
  score: number;
}

export interface AffinityMatrixProps {
  genres: AffinityGenreOption[];
  countries: AffinityCountryOption[];
  affinityRows: AffinityRow[];
  isLoading: boolean;
  onSave: (genreId: string, countryCode: string, score: number) => Promise<{ success: boolean; error?: string }>;
  onClear: (genreId: string, countryCode: string) => Promise<{ success: boolean; error?: string }>;
}

const DEFAULT_BASELINE_SCORE = 20; // geoAffinity.ts's own `?? 20` fallback — see header comment above.

export function AffinityMatrix({
  genres, countries, affinityRows, isLoading, onSave, onClear,
}: AffinityMatrixProps) {
  const [selectedGenreId, setSelectedGenreId] = useState<string>('');
  const [countrySearch, setCountrySearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingCode, setSavingCode] = useState<string | null>(null);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});

  // Default to the first genre once genres actually load — can't pick
  // one before that, and genres may still be loading (lazy-loaded on
  // this tab's own first open, same pattern as every other tab on this
  // page) when this component first mounts.
  useEffect(() => {
    if (!selectedGenreId && genres.length > 0) setSelectedGenreId(genres[0].id);
  }, [genres, selectedGenreId]);

  // Persisted scores for the CURRENTLY selected genre only, keyed by
  // country_code — recomputed whenever the genre selection or the
  // underlying rows change (e.g. after a save/clear triggers a reload
  // from the parent).
  const persistedForGenre = useMemo(() => {
    const map: Record<string, number> = {};
    for (const row of affinityRows) {
      if (row.genre_id === selectedGenreId) map[row.country_code] = row.score;
    }
    return map;
  }, [affinityRows, selectedGenreId]);

  // Drafts reset to match whatever's actually persisted every time the
  // selected genre (or the underlying data) changes — otherwise a
  // draft edited under one genre would still be sitting in the input
  // after switching to another genre and back, looking unsaved when it
  // was never actually touched for THIS genre.
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const c of countries) {
      const persisted = persistedForGenre[c.code];
      next[c.code] = persisted !== undefined ? String(persisted) : '';
    }
    setDrafts(next);
    setRowErrors({});
  }, [selectedGenreId, persistedForGenre, countries]);

  const filteredCountries = countrySearch.trim()
    ? countries.filter((c) =>
        c.country.toLowerCase().includes(countrySearch.trim().toLowerCase()) ||
        c.code.toLowerCase().includes(countrySearch.trim().toLowerCase())
      )
    : countries;

  function isDirty(code: string): boolean {
    const persisted = persistedForGenre[code];
    const draft = drafts[code] ?? '';
    if (persisted === undefined) return draft !== '';
    return draft !== String(persisted);
  }

  async function handleSave(code: string) {
    const raw = drafts[code];
    const n = Number(raw);
    if (raw === '' || !Number.isFinite(n) || n < 0 || n > 100) {
      setRowErrors((prev) => ({ ...prev, [code]: 'Must be 0-100' }));
      return;
    }
    setSavingCode(code);
    setRowErrors((prev) => { const next = { ...prev }; delete next[code]; return next; });
    const result = await onSave(selectedGenreId, code, n);
    setSavingCode(null);
    if (!result.success) {
      setRowErrors((prev) => ({ ...prev, [code]: result.error || 'Failed to save' }));
    }
  }

  async function handleClear(code: string) {
    setSavingCode(code);
    setRowErrors((prev) => { const next = { ...prev }; delete next[code]; return next; });
    const result = await onClear(selectedGenreId, code);
    setSavingCode(null);
    if (!result.success) {
      setRowErrors((prev) => ({ ...prev, [code]: result.error || 'Failed to clear' }));
    } else {
      setDrafts((prev) => ({ ...prev, [code]: '' }));
    }
  }

  return (
    <div className="glass-strong rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 space-y-3">
        <h3 className="font-semibold text-sm">Genre → Country Affinity</h3>
        <div className="flex flex-col xs:flex-row gap-2">
          <select
            value={selectedGenreId}
            onChange={(e) => setSelectedGenreId(e.target.value)}
            disabled={genres.length === 0}
            className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-[#1db954]/50 focus:ring-1 focus:ring-[#1db954]/20 transition-all"
          >
            {genres.length === 0 && <option value="">Loading genres…</option>}
            {genres.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--subtle-foreground)]" />
            <input
              type="text"
              value={countrySearch}
              onChange={(e) => setCountrySearch(e.target.value)}
              placeholder="Filter countries…"
              className="w-full pl-8 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm focus:border-[#1db954]/50 focus:ring-1 focus:ring-[#1db954]/20 transition-all"
            />
          </div>
        </div>
        <p className="text-[11px] text-[var(--subtle-foreground)]">
          A blank score means no override exists yet — the app falls back to a baseline of {DEFAULT_BASELINE_SCORE} for that pair.
        </p>
      </div>

      {isLoading ? (
        <div className="px-4 py-8 text-center text-[var(--subtle-foreground)]">
          <Loader2 className="w-4 h-4 animate-spin inline" />
        </div>
      ) : (
        <div className="divide-y divide-white/5 max-h-[28rem] overflow-y-auto">
          {filteredCountries.map((c) => {
            const dirty = isDirty(c.code);
            const hasPersisted = persistedForGenre[c.code] !== undefined;
            const busy = savingCode === c.code;
            return (
              <div key={c.code} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-base flex-shrink-0" aria-hidden>{c.flag}</span>
                <span className="text-sm flex-1 truncate">{c.country}</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={drafts[c.code] ?? ''}
                  onChange={(e) => setDrafts((prev) => ({ ...prev, [c.code]: e.target.value }))}
                  placeholder={String(DEFAULT_BASELINE_SCORE)}
                  disabled={busy}
                  className="w-20 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-center focus:border-[#1db954]/50 focus:ring-1 focus:ring-[#1db954]/20 transition-all disabled:opacity-50"
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleSave(c.code)}
                    disabled={busy || !dirty}
                    title="Save"
                    className="p-1.5 rounded-lg hover:bg-emerald-500/20 text-emerald-400 disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleClear(c.code)}
                    disabled={busy || !hasPersisted}
                    title="Clear override"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-[var(--subtle-foreground)] disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
                {rowErrors[c.code] && (
                  <span className="text-[10px] text-rose-400 flex-shrink-0">{rowErrors[c.code]}</span>
                )}
              </div>
            );
          })}
          {filteredCountries.length === 0 && (
            <div className="px-4 py-8 text-center text-[var(--subtle-foreground)] text-sm">No countries match.</div>
          )}
        </div>
      )}
    </div>
  );
}
