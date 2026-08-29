'use client';

// Task 46d (handover.md): split verbatim from the old admin/page.tsx
// monolith's 'ledger' tab.

import { AlertCircle } from 'lucide-react';
import { formatCents } from '@/lib/campaign/pricing';
import { cn } from '@/lib/utils/cn';
import { useAdminDashboardData } from '../useAdminDashboardData';

export default function AdminLedgerPage() {
  const { ledger, isLoading, loadError } = useAdminDashboardData();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-2 border-[#1db954]/30 border-t-[#1db954] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{loadError}</span>
        </div>
      )}

      <div className="glass-strong rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-[var(--muted-foreground)]">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Type</th>
                <th className="text-left px-4 py-3 font-medium">Amount</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {ledger.map((e) => (
                <tr key={e.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">{e.user?.artist_name || e.user?.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      'px-2 py-0.5 rounded text-xs font-medium',
                      e.type === 'bonus' && 'bg-emerald-400/10 text-emerald-400',
                      e.type === 'fee' && 'bg-rose-400/10 text-rose-400',
                      e.type === 'withdrawal' && 'bg-amber-400/10 text-amber-400',
                      e.type === 'earning' && 'bg-blue-400/10 text-blue-400',
                    )}>
                      {e.type}
                    </span>
                  </td>
                  <td className={cn('px-4 py-3 font-medium', e.amount_cents >= 0 ? 'text-emerald-400' : 'text-rose-400')}>
                    {e.amount_cents >= 0 ? '+' : ''}{formatCents(e.amount_cents)}
                  </td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)] max-w-xs truncate">{e.description}</td>
                  <td className="px-4 py-3 text-[var(--subtle-foreground)]">{new Date(e.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
