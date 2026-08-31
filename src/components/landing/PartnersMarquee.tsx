'use client';

import Image from 'next/image';
import { PARTNER_SLOTS } from '@/lib/partners/partners.config';

export function PartnersMarquee() {
  const looped = [...PARTNER_SLOTS, ...PARTNER_SLOTS];
  return (
    <div className="relative overflow-hidden py-4" style={{
      maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
      WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
    }}>
      <div className="marquee-track marquee-track--reverse flex items-center gap-12 w-max">
        {looped.map((partner, i) => (
          <div key={`${partner.id}-${i}`} className="flex flex-col items-center gap-2 flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity cursor-pointer" title={partner.name}>
            <div className="w-16 h-16 rounded-xl overflow-hidden bg-[var(--card)] border border-[var(--border)] shadow-lg shadow-black/10">
              <Image src={partner.logo} alt={partner.name} width={64} height={64} className="w-full h-full object-cover" />
            </div>
            <span className="text-xs font-semibold text-[var(--muted-foreground)] whitespace-nowrap">{partner.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
