'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getThemeClasses, toggleThemeMode, applyCssVariables, type ThemeMode } from '@/lib/theme';

interface ThemeContextType {
  theme: ReturnType<typeof getThemeClasses>;
  mode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: getThemeClasses('dark'),
  mode: 'dark',
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('dark');

  useEffect(() => {
    applyCssVariables(mode);
    document.documentElement.classList.toggle('dark', mode === 'dark');
  }, [mode]);

  const toggleTheme = () => {
    setMode((prev) => toggleThemeMode(prev));
  };

  const theme = getThemeClasses(mode);

  return (
    <ThemeContext.Provider value={{ theme, mode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
