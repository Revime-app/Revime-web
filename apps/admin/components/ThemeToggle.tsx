'use client';

import React from 'react';
import { useOptionalTheme, type ThemeMode, type ThemeContextType } from '../lib/theme';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Icon } from './Icon';

export const CYCLE_ORDER: Record<ThemeMode, ThemeMode> = {
  system: 'light',
  light: 'dark',
  dark: 'system',
};

export const MODE_LABEL: Record<ThemeMode, string> = {
  light: 'Clair',
  dark: 'Sombre',
  system: 'Système',
};

export const MODE_ICON: Record<ThemeMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export type ThemeToggleProps = Partial<ThemeContextType>;

export function ThemeToggle(props: ThemeToggleProps = {}) {
  const ctx = useOptionalTheme();
  const theme: ThemeMode = props.theme ?? ctx?.theme ?? 'system';
  const resolvedTheme: 'light' | 'dark' = props.resolvedTheme ?? ctx?.resolvedTheme ?? 'light';
  const setTheme: (theme: ThemeMode) => void = props.setTheme ?? ctx?.setTheme ?? (() => {});

  const handleCycle = () => {
    const nextTheme = CYCLE_ORDER[theme];
    setTheme(nextTheme);
  };

  return (
    <button
      type="button"
      data-testid="admin-theme-toggle"
      className="theme-toggle-btn"
      onClick={handleCycle}
      title={`Thème d'affichage : ${MODE_LABEL[theme]} (actuellement ${resolvedTheme === 'dark' ? 'Sombre' : 'Clair'}). Cliquez pour changer.`}
      aria-label={`Changer le thème d'affichage (actuellement : ${MODE_LABEL[theme]})`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '38px',
        height: '38px',
        padding: 0,
        background: 'var(--paper)',
        color: 'var(--ink)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-field, 8px)',
        cursor: 'pointer',
        fontSize: '16px',
        transition: 'background-color 0.15s ease, border-color 0.15s ease',
      }}
    >
      <Icon as={MODE_ICON[theme]} />
      <span className="sr-only" aria-live="polite">
        {`Thème sélectionné : ${MODE_LABEL[theme]}`}
      </span>
    </button>
  );
}
