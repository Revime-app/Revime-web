import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('next/navigation', () => ({
  usePathname: () => '/statistiques',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));
vi.mock('../lib/auth-client', () => ({
  useSession: () => ({ data: null, isPending: true }),
  signOut: vi.fn(),
}));

import { AdminGate } from '../components/AdminGate';

// ISS-133: every refresh of the admin showed « Chargement… » with a « Se déconnecter » button for the
// second or so the session and `admin/me` take. The button is there on purpose (a cold API takes
// 22 s to nearly 6 min, and the first version of the gate was a dead end), but on a normal refresh
// it is noise. It is now hidden for the first 10 s and then appears, by a CSS animation delay: no
// state, no timer, nothing to forget to cancel, and the contract is readable from the stylesheet.
const css = fs.readFileSync(path.resolve(__dirname, '../app/globals.css'), 'utf8').replace(/\r\n/g, '\n');

function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return m ? m[1] : '';
}

describe('ISS-133: the loading screen of the gate', () => {
  const html = renderToString(
    <AdminGate>
      <p>contenu</p>
    </AdminGate>,
  );

  it('shows « Chargement… » and not the page while the session is pending', () => {
    expect(html).toContain('Chargement');
    expect(html).not.toContain('contenu');
  });

  it('still offers « Se déconnecter » for a cold start, as a real button', () => {
    expect(html).toMatch(/<button[^>]*type="button"[^>]*class="gate-loading__signout"|<button[^>]*class="gate-loading__signout"[^>]*type="button"/);
    expect(html).toContain('Se déconnecter');
  });

  it('hides that button at first, without display:none so it can still be revealed', () => {
    const b = block('.gate-loading__signout');
    expect(b).toMatch(/visibility:\s*hidden/);
    expect(b).not.toMatch(/display:\s*none/);
  });

  it('reveals it after a delay that is not a flash on a normal refresh and not a dead end on a cold start', () => {
    const b = block('.gate-loading__signout');
    expect(b).toMatch(/animation:\s*gate-signout-reveal\b/);
    const delay = Number(b.match(/(\d+(?:\.\d+)?)s\s+forwards/)?.[1]);
    expect(delay).toBeGreaterThanOrEqual(5);
    expect(delay).toBeLessThanOrEqual(20);
  });

  it('keeps it visible once revealed (fill-mode forwards) and the keyframes make it visible', () => {
    expect(block('.gate-loading__signout')).toMatch(/\bforwards\b/);
    expect(css).toMatch(/@keyframes gate-signout-reveal\s*\{[^}]*(\{[^}]*\}[^}]*)*visibility:\s*visible/);
  });

  // A first version showed the button at once under `prefers-reduced-motion: reduce`, to be safe
  // against a disabled animation. But the owner's browser reports reduced motion (Windows with
  // animations off does), so the button flashed on every refresh anyway. A change of `visibility` is
  // not movement, so reduced motion must get the same delay as everyone else.
  it('does not show it at once for visitors who ask for reduced motion', () => {
    const reduced = [...css.matchAll(/@media[^{]*prefers-reduced-motion[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
    expect(reduced).not.toContain('gate-loading__signout');
  });

  it('reveals with a change of visibility only, nothing that moves', () => {
    const keyframes = css.match(/@keyframes gate-signout-reveal\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
    expect(keyframes).toMatch(/visibility:\s*visible/);
    expect(keyframes).not.toMatch(/transform|translate|scale|rotate|margin|top:|left:|height|width/);
  });
});
