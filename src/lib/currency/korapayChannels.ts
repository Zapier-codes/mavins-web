// src/lib/currency/korapayChannels.ts
//
// Task 30c (handover.md) — pure selection function mirroring
// getKorapayDccCurrency's own shape (same file-neighbor, same
// "explicit undefined fallback for an unmapped country" philosophy),
// but for Korapay's payment *channel* (mobile_money/bank_transfer/
// card/pay_with_bank) rather than DCC currency.
//
// This is also the file B-Pay-backend's own handover.md (Task 16's
// companion-change note) claimed already existed here, in confident
// past tense — it didn't; see Task 30's own "real cross-repo
// documentation bug" note for the full account. This file is what
// makes that claim actually true, finally.
//
// Deliberately reads from already-fetched TargetCountry data (Task
// 30b's korapayChannels/korapayDefaultChannel fields, populated by
// migration 012 + referenceData.ts) rather than its own hardcoded map
// the way korapayDccCurrency.ts does — that file predates the
// Supabase-backed reference-data pipeline (Task 45); this one is
// built after it and should use it, not duplicate a second static
// source of the same kind of per-country data Task 44/45 exist to
// centralize.

import type { TargetCountry } from '@/lib/campaign/geoAffinity';

export interface KorapayChannelSelection {
  /** Valid Korapay checkout channel strings for this country --
   * always a non-empty array when this type is returned (see
   * getKorapayChannels' own `.length` check below). */
  channels: string[];
  /** Which of `channels` to pre-select on Korapay's checkout UI -- a
   * UX preference, not a Korapay requirement. May be absent even when
   * `channels` isn't (see migration 012's own header comment) --
   * absence here means "let Korapay's checkout show its own default
   * ordering among the offered channels," not an error. */
  defaultChannel?: string;
}

/**
 * Returns this country's confirmed Korapay channel coverage, or
 * `null` if the country isn't in the reference data at all, or has no
 * confirmed coverage (Task 30a's 17 always-uncovered countries, or
 * ZA/SN's two deliberately-left-ambiguous flags -- see that task's own
 * note for why those two specifically aren't guessed at here either).
 *
 * `null` is the correct, expected, non-error result for most
 * countries today -- the caller's job (Task 30d) is to fall back to
 * *not sending* `channels`/`default_channel` at all when this returns
 * `null`, letting Korapay's checkout pick its own default the same way
 * it already does for every currently-unmapped country, not to treat
 * `null` as a failure to handle specially.
 *
 * @param countries The reference-data countries array (from
 *   `useReferenceData()`'s `countries` field, or `fetchReferenceData()`
 *   server-side) -- this function does no fetching of its own, same as
 *   `getKorapayDccCurrency` takes a pre-resolved `countryCode` rather
 *   than doing its own geo lookup.
 * @param countryCode The country to look up -- case-insensitive, same
 *   convention as `getKorapayDccCurrency`.
 */
export function getKorapayChannels(
  countries: TargetCountry[],
  countryCode: string | null | undefined,
): KorapayChannelSelection | null {
  if (!countryCode) return null;

  const normalized = countryCode.toUpperCase();
  const country = countries.find((c) => c.code === normalized);
  if (!country?.korapayChannels?.length) return null;

  return {
    channels: country.korapayChannels,
    defaultChannel: country.korapayDefaultChannel,
  };
}
