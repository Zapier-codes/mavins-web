'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/auth/useAuth';
import { cn } from '@/lib/utils/cn';
import {
  Bell, CheckCheck, Loader2, Inbox, ChevronLeft,
} from 'lucide-react';
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationMeta,
  type AppNotification,
} from '@/services/notifications/notifications.service';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NotificationsPage() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) { setIsLoading(false); return; }
    setIsLoading(true);
    const data = await getNotifications(user.id);
    setItems(data);
    setIsLoading(false);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const handleItemClick = async (n: AppNotification) => {
    if (n.read) return;
    setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read: true } : i)));
    await markAsRead(n.id);
  };

  const handleMarkAllRead = async () => {
    if (!user?.id) return;
    setMarkingAll(true);
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    await markAllAsRead(user.id);
    setMarkingAll(false);
  };

  const unreadCount = items.filter((i) => !i.read).length;

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <Bell className="w-10 h-10 mx-auto mb-3 text-[var(--muted-foreground)] opacity-50" />
          <h1 className="font-display text-xl font-semibold">Sign in to see notifications</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1.5">
            Your streaks, payouts, and campaign milestones show up here.
          </p>
          <Link
            href="/login"
            className="inline-flex mt-5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-light)] to-[var(--accent)] text-[var(--background)] font-semibold text-sm"
          >
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[var(--accent)]/5 rounded-full blur-3xl animate-ambient" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="p-2 -ml-2 rounded-xl glass-card md:hidden"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-[#c0392b]/15 text-[#e0574a]">
                    {unreadCount} new
                  </span>
                )}
              </h1>
              <p className="text-[var(--muted-foreground)] text-sm mt-0.5">
                Streaks, payouts, tier changes, and campaign milestones
              </p>
            </div>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl glass-card text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50 flex-shrink-0"
            >
              {markingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCheck className="w-3.5 h-3.5" />
              )}
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2.5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 rounded-xl shimmer glass-card" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="glass-strong rounded-2xl p-10 text-center">
            <Inbox className="w-9 h-9 mx-auto mb-3 text-[var(--muted-foreground)] opacity-50" />
            <h3 className="font-semibold">You&apos;re all caught up</h3>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Nothing here yet. We&apos;ll let you know about streaks, payouts, and milestones.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n) => {
              const meta = getNotificationMeta(n.type);
              return (
                <button
                  key={n.id}
                  onClick={() => handleItemClick(n)}
                  className={cn(
                    'w-full text-left flex items-start gap-3 p-4 rounded-xl transition-all',
                    n.read ? 'glass-card' : 'glass-strong border-[var(--accent)]/25'
                  )}
                >
                  <div className="w-9 h-9 rounded-lg bg-[var(--accent)]/10 flex items-center justify-center text-base flex-shrink-0">
                    {meta.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm', n.read ? 'text-[var(--muted-foreground)]' : 'font-medium')}>
                      {n.content?.text || meta.label}
                    </p>
                    <p className="text-xs text-[var(--subtle-foreground)] mt-1">
                      {timeAgo(n.created_at)}
                    </p>
                  </div>
                  {!n.read && (
                    <span className="w-2 h-2 rounded-full bg-[var(--accent)] flex-shrink-0 mt-1.5" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
