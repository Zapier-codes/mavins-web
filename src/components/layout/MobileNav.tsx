'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Home, Rocket, BarChart3, Trophy, Wallet } from 'lucide-react';

const tabs = [
  { id: 'home', icon: Home, label: 'Home', href: '/' },
  { id: 'promote', icon: Rocket, label: 'Promote', href: '/promote' },
  { id: 'analytics', icon: BarChart3, label: 'Stats', href: '/analytics' },
  { id: 'leaderboard', icon: Trophy, label: 'Rank', href: '/leaderboard' },
  { id: 'earnings', icon: Wallet, label: 'Earn', href: '/earnings' },
];

// Ignore tiny scroll jitter (mobile momentum scroll, address-bar show/hide)
// so the nav doesn't flicker on sub-pixel scroll events.
const SCROLL_DELTA_THRESHOLD = 8;

export const MobileNav = () => {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;

    const onScroll = () => {
      const currentY = window.scrollY;
      const delta = currentY - lastScrollY.current;

      // Always show near the top of the page, regardless of direction.
      if (currentY < 48) {
        setHidden(false);
        lastScrollY.current = currentY;
        return;
      }

      if (Math.abs(delta) < SCROLL_DELTA_THRESHOLD) return;

      setHidden(delta > 0); // scrolling down -> hide, scrolling up -> reveal
      lastScrollY.current = currentY;
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-nav border-t border-[var(--glass-border)] pointer-events-auto transition-transform duration-300 ease-out"
      style={{
        touchAction: 'manipulation',
        transform: hidden ? 'translateY(100%)' : 'translateY(0)',
      }}
    >
      <div className="flex items-center justify-around px-1 py-1">
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname?.startsWith(tab.href + '/');
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={tab.href}
              prefetch
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[64px] active:scale-95',
                isActive ? 'text-[var(--accent)]' : 'text-[var(--muted-foreground)]'
              )}
              style={{ touchAction: 'manipulation' }}
            >
              <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 1.5} />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
};
