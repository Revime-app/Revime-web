import { describe, it, expect } from 'vitest';
import { palette, paletteDark, semanticBadgesDark } from '../src/index.js';
import { tokensCss } from '../src/css.js';

describe('tokens dark mode', () => {
  it('exports paletteDark with exact brand hex values', () => {
    expect(paletteDark.page).toBe('#010524'); // Bleu prusse
    expect(paletteDark.paper).toBe('#0d1645'); // Lifted Dark Navy
    expect(paletteDark.line).toBe('rgba(255, 255, 255, 0.09)');
    expect(paletteDark.ink).toBe('#f8fafc');
    expect(paletteDark.ink2).toBe('#e2e8f0');
    expect(paletteDark.muted).toBe('#94a3b8');
    expect(paletteDark.faint).toBe('#64748b');
    expect(paletteDark.navy).toBe('#3b5fb0');
    expect(paletteDark.navyLift).toBe('#4b72cb');
    expect(paletteDark.red).toBe('#f61b39');
  });

  it('exports semanticBadgesDark with high-contrast text and translucent backgrounds', () => {
    expect(semanticBadgesDark.success.text).toBe('#4ade80');
    expect(semanticBadgesDark.success.bg).toBe('rgba(34, 197, 94, 0.15)');
    expect(semanticBadgesDark.warning.text).toBe('#fbbf24');
    expect(semanticBadgesDark.warning.bg).toBe('rgba(245, 158, 11, 0.15)');
    expect(semanticBadgesDark.info.text).toBe('#60a5fa');
    expect(semanticBadgesDark.info.bg).toBe('rgba(59, 130, 246, 0.15)');
    expect(semanticBadgesDark.danger.text).toBe('#f87171');
    expect(semanticBadgesDark.danger.bg).toBe('rgba(239, 68, 68, 0.15)');
    expect(semanticBadgesDark.neutral.text).toBe('#cbd5e1');
    expect(semanticBadgesDark.neutral.bg).toBe('rgba(148, 163, 184, 0.15)');
  });

  it('tokensCss("pro") generates :root and :root[data-theme="dark"] blocks with dark tokens', () => {
    const css = tokensCss('pro');
    expect(css).toContain(':root {');
    expect(css).toContain('--page: #f9fafb;');
    expect(css).toContain('--paper: #ffffff;');

    expect(css).toContain(':root[data-theme="dark"] {');
    expect(css).toContain('--page: #010524;');
    expect(css).toContain('--paper: #0d1645;');
    expect(css).toContain('--line: rgba(255, 255, 255, 0.09);');
    expect(css).toContain('--ink: #f8fafc;');
    expect(css).toContain('--navy: #3b5fb0;');
    expect(css).toContain('--badge-success-text: #4ade80;');

    expect(css).toContain('@media (prefers-color-scheme: dark) {');
    expect(css).toContain(':root:not([data-theme="light"]) {');
  });
});
