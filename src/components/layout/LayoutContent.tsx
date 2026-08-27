'use client';

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { useAuth } from "@/hooks/auth/useAuth";
import { getUnreadCount } from "@/services/notifications/notifications.service";

const UNREAD_POLL_MS = 60_000;

function walletBalanceCents(user: any): number {
  if (!user?.wallet) return 0;
  const wallet = typeof user.wallet === 'string' ? JSON.parse(user.wallet) : user.wallet;
  return wallet?.balance || 0;
}

export function LayoutContent({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  const refreshUnread = useCallback(async () => {
    if (!user?.id) { setUnreadCount(0); return; }
    const count = await getUnreadCount(user.id);
    setUnreadCount(count);
  }, [user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) { setUnreadCount(0); return; }
    refreshUnread();
    const interval = setInterval(refreshUnread, UNREAD_POLL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, user?.id, refreshUnread]);

  return (
    <div className="flex min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          onMenuClick={() => setSidebarOpen(true)}
          onNotificationClick={() => router.push('/notifications')}
          notificationCount={unreadCount}
          points={walletBalanceCents(user)}
        />
        <main className="flex-1">
          {children}
        </main>
        <MobileNav />
      </div>
    </div>
  );
}
