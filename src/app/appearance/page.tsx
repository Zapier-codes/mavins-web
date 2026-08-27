'use client';

import React from 'react';
import Link from 'next/link';
import { useTheme } from '@/components/providers/ThemeProvider';
import { cn } from '@/lib/utils/cn';
import { Palette, ChevronLeft, Moon, Sun, Check } from 'lucide-react';

export default function AppearancePage() {
  const { mode, setMode } = useTheme();

  const options: { value: 'dark' | 'light'; label: string; description: string; Icon: typeof Moon }[] = [
    { value: 'dark', label: 'Dark', description: 'Easier on the eyes at night', Icon: Moon },
    { value: 'light', label: 'Light', description: 'Bright and high-contrast', Icon: Sun },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#3d91f4]/5 rounded-full blur-3xl animate-ambient" />
      </div>

      <div className="relative max-w-2xl mx-auto px-4 sm:px-6 pt-20 pb-24 md:pb-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Link
            href="/settings"
            className="p-2 -ml-2 rounded-xl glass-card md:hidden"
            aria-label="Back to Settings"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Appearance</h1>
            <p className="text-[var(--muted-foreground)] text-sm mt-1">
              Choose how Mavins looks on this device
            </p>
          </div>
        </div>

        {/* Theme picker */}
        <div className="glass-strong rounded-2xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full bg-[#3d91f4]/15 flex items-center justify-center">
              <Palette className="w-4 h-4 text-[#3d91f4]" />
            </div>
            <div>
              <h3 className="font-bold">Theme</h3>
              <p className="text-xs text-[var(--subtle-foreground)]">Applies immediately, only on this device</p>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            {options.map(({ value, label, description, Icon }) => {
              const selected = mode === value;
              return (
                <button
                  key={value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'text-left p-4 rounded-xl border transition-all flex items-start gap-3',
                    selected
                      ? 'bg-[#1db954]/10 border-[#1db954]/30'
                      : 'glass-card border-transparent hover:border-white/10'
                  )}
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                      selected ? 'bg-[#1db954]/20 text-[#1db954]' : 'bg-white/5 text-[var(--muted-foreground)]'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">{label}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-[#1db954]" />}
                    </div>
                    <p className="text-xs text-[var(--subtle-foreground)] mt-0.5">{description}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
