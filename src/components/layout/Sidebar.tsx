'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/auth/useAuth';
import { cn } from '@/lib/utils/cn';
import { 
  Home, BarChart3, Rocket, Trophy, Settings, 
  Wallet, X, ChevronRight, LogOut, Zap, Bell
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  { icon: Home, label: 'Home', href: '/' },
  { icon: Rocket, label: 'Promote', href: '/promote' },
  { icon: BarChart3, label: 'Analytics', href: '/analytics' },
  { icon: Trophy, label: 'Leaderboard', href: '/leaderboard' },
  { icon: Wallet, label: 'Earnings', href: '/earnings' },
  { icon: Bell, label: 'Notifications', href: '/notifications' },
  { icon: Settings, label: 'Settings', href: '/settings' },
];

export const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const { user, isAuthenticated, isAdmin, signOut } = useAuth();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (isOpen) onClose(); }, [pathname]);

  if (!mounted) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 z-50 h-full w-64 transition-transform duration-300 ease-out md:translate-x-0 md:static md:h-screen md:w-56 md:z-0',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        'glass-sidebar'
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-[var(--glass-border)]">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center shadow-lg shadow-[var(--accent)]/20">
                <Zap className="w-4 h-4 text-[var(--background)]" />
              </div>
              <span className="font-display font-semibold text-lg tracking-tight text-[var(--foreground)]">Mavins</span>
            </Link>
            <button onClick={onClose} className="p-1.5 rounded-lg glass-card md:hidden">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all',
                    isActive 
                      ? 'bg-[var(--accent)]/12 text-[var(--accent-light)] border border-[var(--accent)]/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' 
                      : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)]/5 hover:text-[var(--foreground)]'
                  )}
                >
                  <Icon className="w-4.5 h-4.5" />
                  <span>{item.label}</span>
                  {isActive && <ChevronRight className="w-4 h-4 ml-auto opacity-60 text-[var(--accent)]" />}
                </Link>
              );
            })}
          </nav>

          {/* User section */}
          <div className="p-3 border-t border-[var(--glass-border)]">
            {isAuthenticated && user ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 px-3 py-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent-light)] to-[var(--accent-dark)] flex items-center justify-center text-xs font-bold text-[var(--background)] shadow-lg shadow-[var(--accent)]/20">
                    {user.artistName?.charAt(0) || user.email?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-[var(--foreground)]">{user.artistName || user.email}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">{isAdmin ? 'Admin' : 'Artist'}</p>
                  </div>
                </div>
                <button 
                  onClick={signOut}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)]/5 rounded-xl transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            ) : (
              <Link 
                href="/login"
                className="flex items-center justify-center w-full py-2.5 rounded-xl bg-gradient-to-r from-[var(--accent-light)] to-[var(--accent)] text-[var(--background)] text-sm font-semibold hover:brightness-110 transition-all shadow-lg shadow-[var(--accent)]/25"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
