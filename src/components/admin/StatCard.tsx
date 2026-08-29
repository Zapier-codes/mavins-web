// Task 46d (handover.md) — extracted verbatim from the old
// admin/page.tsx monolith's own module-scope StatCard, now shared
// between /admin (overview) and any other admin route that wants the
// same small stat tile.

import { cn } from '@/lib/utils/cn';

export function StatCard({
  icon: Icon,
  label,
  value,
  color = 'text-white',
}: {
  icon: any;
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <Icon className="w-5 h-5 text-[var(--subtle-foreground)] mb-2" />
      <div className={cn('text-xl font-bold', color)}>{value}</div>
      <div className="text-xs text-[var(--subtle-foreground)]">{label}</div>
    </div>
  );
}
