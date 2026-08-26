'use client';

import Image from 'next/image';
import { PARTNER_SLOTS } from '@/lib/partners/partners.config';

/**
 * Placeholder "supporting partners" strip. Every logo/name here is a
 * generic filler slot (see partners.config.ts) — swap in a real, provided
 * asset only once an actual partnership exists for that slot.
 */
export function PartnersMarquee() {
  const looped = [...PARTNER_SLOTS, ...PARTNER_SLOTS];

  return (
    <div className="space-y-2">
      <p className="text-center text-[11px] uppercase tracking-wider text-[var(--subtle-foreground)]">
        Supporting Partners
      </p>
      <div
        className="relative overflow-hidden py-1"
        style={{
          maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
          WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
        }}
      >
        <div className="marquee-track flex items-center gap-8 w-max">
          {looped.map((partner, i) => (
            <div
              key={`${partner.id}-${i}`}
              className="flex items-center gap-2 flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              title={`${partner.name} (placeholder — swap when a real partnership is signed)`}
            >
              <Image
                src={partner.logo}
                alt={partner.name}
                width={28}
                height={28}
                className="w-7 h-7 text-[var(--muted-foreground)]"
              />
              <span className="text-xs font-medium text-[var(--muted-foreground)] whitespace-nowrap">
                {partner.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
