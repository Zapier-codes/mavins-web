'use client';

import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { SiYoutube, SiSpotify, SiTiktok, SiInstagram, SiSoundcloud } from 'react-icons/si';
import { formatCents } from '@/lib/campaign/pricing';
import {
  getEarningsTicker,
  type EarningTickerItem,
  type TickerPlatform,
} from '@/services/earnings/earningsTicker.service';

type BrandIcon = ComponentType<{ className?: string; style?: CSSProperties }>;

const PLATFORM_META: Record<TickerPlatform, { Icon: BrandIcon; color: string; label: string }> = {
  youtube: { Icon: SiYoutube as BrandIcon, color: '#ff0000', label: 'YouTube views' },
  spotify: { Icon: SiSpotify as BrandIcon, color: '#1db954', label: 'Spotify streams' },
  tiktok: { Icon: SiTiktok as BrandIcon, color: '#ff0050', label: 'TikTok views' },
  instagram: { Icon: SiInstagram as BrandIcon, color: '#e1306c', label: 'Instagram reach' },
  soundcloud: { Icon: SiSoundcloud as BrandIcon, color: '#ff7700', label: 'SoundCloud plays' },
};

function formatWholeDollars(cents: number): string {
  const dollars = Math.round(cents / 100);
  return `$${dollars.toLocaleString('en-US')}`;
}

function TickerPill({ item }: { item: EarningTickerItem }) {
  const meta = PLATFORM_META[item.platform];
  return (
    <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full glass-card whitespace-nowrap flex-shrink-0">
      <span
        className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
      >
        <meta.Icon className="w-3 h-3" />
      </span>
      <span className="text-sm">
        <span className="font-semibold">{item.name}</span>
        <span className="text-[var(--muted-foreground)]"> just earned </span>
        <span className="font-semibold text-[var(--accent-light)]">{formatWholeDollars(item.amountCents)}</span>
        <span className="text-[var(--muted-foreground)]"> from {meta.label}</span>
      </span>
    </div>
  );
}

export function EarningsMarquee() {
  const [items, setItems] = useState<EarningTickerItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEarningsTicker().then(({ items }) => {
      if (!cancelled) setItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!items || items.length === 0) {
    return (
      <div className="flex gap-3 overflow-hidden py-1">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-11 w-56 rounded-full shimmer glass-card flex-shrink-0" />
        ))}
      </div>
    );
  }

  // Duplicate the list so the track can translate exactly -50% and loop
  // without a visible seam.
  const looped = [...items, ...items];

  return (
    <div
      className="relative overflow-hidden py-1"
      style={{
        maskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, black 8%, black 92%, transparent)',
      }}
    >
      <div className="marquee-track marquee-track--slow flex gap-3 w-max">
        {looped.map((item, i) => (
          <TickerPill key={`${item.id}-${i}`} item={item} />
        ))}
      </div>
    </div>
  );
}
