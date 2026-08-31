// src/lib/partners/partners.config.ts
/**
 * Partner roster for the "As seen with" / supporting-partners marquee.
 *
 * Task 53: Updated to use draft platform assets from the asset manifest.
 * These are draft placeholders — not real partnerships. When real partner
 * agreements are signed, swap the entries here via the manifest.
 */

import { PLATFORM_LOGOS } from '@/lib/assets/manifest';

export interface PartnerSlot {
  id: string;
  name: string;
  logo: string;
  href?: string;
}

/** Draft partner slots using platform logo assets.
 *  Replace with real partners once agreements are in place. */
export const PARTNER_SLOTS: PartnerSlot[] = PLATFORM_LOGOS.map((p) => ({
  id: p.id,
  name: p.name,
  logo: p.src,
  href: undefined, // No outbound links for draft assets
}));
