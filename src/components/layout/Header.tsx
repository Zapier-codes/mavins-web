'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useTheme } from '@/components/providers/ThemeProvider';
import { useAuth } from '@/hooks/auth/useAuth';
import { cn } from '@/lib/utils/cn';
import { Menu, Bell, Wallet, Sun, Moon, Zap, Search } from 'lucide-react';

interface HeaderProps {
  onMenuClick?: () => void;
  onNotificationClick?: () => void;
  taskCount?: number;
  notificationCount?: number;
  points?: number;
}

export const Header = ({ 
  onMenuClick, 
  onNotificationClick,
  notificationCount = 0,
  points = 0,
}: HeaderProps) => {
  const { mode, toggleTheme } = useTheme();
  const { user, isAuthenticated } = useAuth();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header 
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-300',
        scrolled ? 'glass-nav' : 'bg-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14 sm:h-16">
          {/* Left: Logo + Menu */}
          <div className="flex items-center gap-3">
            {onMenuClick && (
              <button 
                onClick={onMenuClick} 
                className="p-2 rounded-xl glass-card md:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
            )}
            <Link href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#f4e4bc] to-[#a8862c] flex items-center justify-center shadow-lg shadow-[#d4af37]/20">
                <Zap className="w-4 h-4 text-[#08070a]" />
              </div>
              <span className="font-display font-semibold text-lg tracking-tight hidden sm:block text-[#f5f1e8]">
                Mavins
              </span>
            </Link>
          </div>

          {/* Center: Search (desktop only) */}
          <div className="hidden md:flex flex-1 max-w-md mx-6">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#a39a8b]" />
              <input 
                type="text" 
                placeholder="Search campaigns, tracks..." 
                className="w-full pl-10 pr-4 py-2 rounded-xl text-sm glass-input text-[#f5f1e8] placeholder:text-[#a39a8b]"
              />
            </div>
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            {/* Wallet */}
            {isAuthenticated && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-card border-[#d4af37]/25">
                <Wallet className="w-3.5 h-3.5 text-[#d4af37]" />
                <span className="text-sm font-semibold text-[#f4e4bc]">
                  ${(points / 100).toFixed(2)}
                </span>
              </div>
            )}

            {/* Notifications */}
            <button 
              onClick={onNotificationClick} 
              className="p-2 rounded-xl glass-card relative"
            >
              <Bell className="w-5 h-5 text-[#a39a8b]" />
              {notificationCount > 0 && (
                <span className="absolute top-1 right-1 w-2 h-2 bg-[#c0392b] rounded-full pulse-ring" />
              )}
            </button>

            {/* Theme toggle */}
            <button 
              onClick={toggleTheme} 
              className="p-2 rounded-xl glass-card"
            >
              {mode === 'dark' ? (
                <Sun className="w-5 h-5 text-[#a39a8b]" />
              ) : (
                <Moon className="w-5 h-5 text-[#a39a8b]" />
              )}
            </button>

            {/* Avatar */}
            {isAuthenticated && user && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#f4e4bc] to-[#a8862c] flex items-center justify-center text-xs font-bold text-[#08070a] shadow-lg shadow-[#d4af37]/20">
                {user.artistName?.charAt(0) || user.email?.charAt(0) || 'U'}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
