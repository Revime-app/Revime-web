'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

export const THEME_STORAGE_KEY = 'revime-admin-theme';

const DARK_QUERY = '(prefers-color-scheme: dark)';

export type ThemeContextType = {
  theme: ThemeMode;
  resolvedTheme: 'light' | 'dark';
  setTheme: (theme: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextType | null>(null);

export function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  try {
    return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** The stored choice, or null when nothing valid is stored or storage is blocked. */
export function readStoredTheme(): ThemeMode | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : null;
  } catch {
    return null;
  }
}

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  return mode === 'dark' || (mode === 'system' && getSystemTheme() === 'dark') ? 'dark' : 'light';
}

function applyTheme(resolved: 'light' | 'dark'): void {
  try {
    document.documentElement.setAttribute('data-theme', resolved);
  } catch {}
}

/**
 * The first render, on the server and on the client, is always `system` / `light`: reading
 * localStorage during render made a returning dark-theme user hydrate against server HTML that
 * said otherwise. The stored choice is read after mount. Nothing flashes in between, because
 * the inline script in `layout.tsx` has already set `data-theme` before first paint, and this
 * provider does not touch the attribute until it has read the stored choice (`ready`).
 */
export function AdminThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setThemeState(readStoredTheme() ?? 'system');
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const resolved = resolveTheme(theme);
    setResolvedTheme(resolved);
    applyTheme(resolved);

    if (theme !== 'system') return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = (e: MediaQueryListEvent) => {
      const next = e.matches ? 'dark' : 'light';
      setResolvedTheme(next);
      applyTheme(next);
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [theme, ready]);

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {}
  }, []);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme, setTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useOptionalTheme(): ThemeContextType | null {
  return useContext(ThemeContext);
}

export function useTheme(): ThemeContextType {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within an AdminThemeProvider');
  }
  return ctx;
}
