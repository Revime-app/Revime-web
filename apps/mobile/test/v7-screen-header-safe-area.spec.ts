import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * V7, found on build 40 (2026-11-02): « Mon entreprise »'s header sat under the iPhone's status bar and
 * Dynamic Island. `ScreenHeader` adds no top inset of its own; every screen that draws it sits in a
 * `SafeAreaView` (the top edge at least). `entreprise.tsx` lost its inset in `64d607cb` (2026-10-03),
 * when the title moved out of the scroll into a fixed `ScreenHeader` and `paddingTop: insets.top` went
 * with it. A screen that forgets the safe area fails here instead of on a phone.
 */
const ROOT = path.resolve(__dirname, '..');
const HEADER_FILE = 'src/components/ScreenHeader.tsx';

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(rel);
    return entry.name.endsWith('.tsx') ? [rel] : [];
  });
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SCREENS = [...sources('app'), ...sources('src')].filter(
  (rel) => rel !== HEADER_FILE && /<ScreenHeader\b/.test(read(rel)),
);

describe('every ScreenHeader screen keeps its header out of the status bar', () => {
  it('finds the screens', () => {
    expect(SCREENS).toContain('app/entreprise.tsx');
    expect(SCREENS.length).toBeGreaterThan(30);
  });

  it.each(SCREENS)('%s sits in a SafeAreaView', (rel) => {
    expect(read(rel)).toMatch(/<SafeAreaView\b/);
  });

  it('Mon entreprise keeps the top edge under its header', () => {
    const src = read('app/entreprise.tsx');
    expect(src).toMatch(/<SafeAreaView[^>]*edges=\{\['top'\]\}/);
    expect(src.indexOf('<SafeAreaView')).toBeLessThan(src.indexOf('<ScreenHeader'));
  });
});
