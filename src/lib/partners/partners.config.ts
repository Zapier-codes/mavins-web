// src/lib/partners/partners.config.ts
/**
 * PLACEHOLDER partner roster for the "As seen with" / supporting-partners
 * marquee on the landing page.
 *
 * IMPORTANT: every name and logo below is a generic placeholder — nothing
 * here references any real artist, label, or company. Do not swap in real
 * names/logos unless there is an actual signed partnership/sponsorship
 * agreement for that specific slot, since presenting a real, identifiable
 * person or brand here without one is a false-endorsement claim (and a
 * trademark / right-of-publicity problem), not just a content edit.
 *
 * To replace a slot with a real partner once an agreement is in place:
 *   1. Drop the real logo asset (provided by the partner, not scraped)
 *      into /public/icons/partners/ — do not source logos from the web.
 *   2. Update `name` and `logo` below to point at it.
 *   3. Optionally set `href` to the partner's site if they want the
 *      mark to link out.
 */

export interface PartnerSlot {
  id: string;
  /** Placeholder — replace with the real partner's name once contracted. */
  name: string;
  /** Path under /public — replace with the real partner's provided logo. */
  logo: string;
  href?: string;
}

export const PARTNER_SLOTS: PartnerSlot[] = [
  { id: 'slot-01', name: 'Partner Slot 01', logo: '/icons/partners/partner-01.svg' },
  { id: 'slot-02', name: 'Partner Slot 02', logo: '/icons/partners/partner-02.svg' },
  { id: 'slot-03', name: 'Partner Slot 03', logo: '/icons/partners/partner-03.svg' },
  { id: 'slot-04', name: 'Partner Slot 04', logo: '/icons/partners/partner-04.svg' },
  { id: 'slot-05', name: 'Partner Slot 05', logo: '/icons/partners/partner-05.svg' },
  { id: 'slot-06', name: 'Partner Slot 06', logo: '/icons/partners/partner-06.svg' },
  { id: 'slot-07', name: 'Partner Slot 07', logo: '/icons/partners/partner-07.svg' },
  { id: 'slot-08', name: 'Partner Slot 08', logo: '/icons/partners/partner-08.svg' },
];
