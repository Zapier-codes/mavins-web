'use client';

// Task 46d (handover.md): split verbatim from the old admin/page.tsx
// monolith's 'users' tab.

import { AlertCircle } from 'lucide-react';
import { useAdminDashboardData } from '../useAdminDashboardData';

export default function AdminUsersPage() {
  const { users, isLoading, loadError } = useAdminDashboardData();

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
                <th className="text-left px-4 py-3 font-medium">Artist</th>
                <th className="text-left px-4 py-3 font-medium">Email</th>
                <th className="text-left px-4 py-3 font-medium">Genre</th>
                <th className="text-left px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 font-medium">{u.artist_name || '—'}</td>
                  <td className="px-4 py-3 text-[var(--muted-foreground)]">{u.email}</td>
                  <td className="px-4 py-3">{u.primary_genre || '—'}</td>
                  <td className="px-4 py-3 text-[var(--subtle-foreground)]">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
