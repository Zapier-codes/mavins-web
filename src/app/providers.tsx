'use client';

// Task 45 Part 2 (handover.md) — found this file has ZERO importers
// anywhere in the codebase (grepped for `from '@/app/providers'` and
// found nothing) while looking for where to add QueryProvider. The
// real provider tree lives directly in layout.tsx
// (AuthProvider → ThemeProvider → LayoutContent, plus QueryProvider as
// of this session) — GeoProvider is wired per-page instead (see its
// usage in promote/page.tsx, fund-wallet/page.tsx), not through this
// file either. Left in place rather than deleted — being dead code
// isn't this task's concern to fix, and deleting an unused-but-harmless
// file is a separate decision — but flagging here plus in handover.md
// so a future session doesn't lose time on the same confusion, or
// assume this is where new root providers belong.

import { ThemeProvider } from '@/components/providers/ThemeProvider';
import { AuthProvider } from '@/components/providers/AuthProvider';
import { GeoProvider } from '@/components/providers/GeoProvider';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GeoProvider>
      <AuthProvider>
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </AuthProvider>
    </GeoProvider>
  );
}
