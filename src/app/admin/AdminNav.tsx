'use client';

// Task 46d (handover.md): same visual shape (horizontal pill bar) as
// the old admin/page.tsx monolith's own tab bar — deliberately kept,
// per this task's own instruction to match this app's existing
// conventions "rather than a one-off admin-only layout." Only the
// mechanism changed: each pill is now a real <Link> to its own route
// (usePathname()-driven active state) instead of a setActiveTab()
// call into shared component state — the whole point of this task is
// that these are now independently navigable/bookmarkable pages, not
// tab-switches within one component.

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/campaigns', label: 'Campaigns' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/ledger', label: 'Ledger' },
  { href: '/admin/pricing', label: 'Pricing Tiers' },
  { href: '/admin/duration', label: 'Duration Slots' },
  { href: '/admin/countries', label: 'Countries' },
  { href: '/admin/genres', label: 'Genres' },
  { href: '/admin/affinity', label: 'Genre Affinity' },
  { href: '/admin/fees', label: 'Platform Fees' },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-hide">
      {NAV_ITEMS.map((item) => {
        // Exact match for '/admin' itself (Overview) -- otherwise
        // '/admin' would also read as "active" while visiting every
        // other /admin/* route, since it's a prefix of all of them.
        const isActive = item.href === '/admin' ? pathname === '/admin' : pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap',
              isActive ? 'bg-[#1db954] text-black' : 'glass-card text-[var(--muted-foreground)]'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}
