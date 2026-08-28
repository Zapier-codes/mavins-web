'use client';

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
