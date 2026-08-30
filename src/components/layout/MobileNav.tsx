'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Home, Rocket, BarChart3, Trophy } from 'lucide-react';

const tabs = [
  { id: 'home', icon: Home, label: 'Home', href: '/' },
  { id: 'promote', icon: Rocket, label: 'Promote', href: '/promote' },
  { id: 'analytics', icon: BarChart3, label: 'Stats', href: '/analytics' },
  { id: 'leaderboard', icon: Trophy, label: 'Rank', href: '/leaderboard' },
];

export const MobileNav = () => {
  const pathname = usePathname();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden glass-nav border-t border-[var(--glass-border)] pointer-events-auto"
      style={{ touchAction: 'manipulation' }}
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
