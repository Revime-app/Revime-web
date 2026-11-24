import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { REACCEPT_CHECKBOX_LABEL, REACCEPT_TITLE, type PlatformStatus } from '@revime/shared';
import { findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: { ink: '#141414', ink2: '#2b2b2e', muted: '#6b7280', line: '#e4e7ec', paper: '#ffffff', red: '#f61b39', navySoft: '#eef0f5' },
    accent: { accent: '#f61b39', accentDeep: '#bd0e26' },
    radii: { card: 20, field: 12 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
    type: { caption: { size: 12 } },
  }),
}));
vi.mock('../src/components/Button', () => ({
  Button: (props: Record<string, unknown>) => React.createElement('Button', props),
}));
vi.mock('../src/components/Checkbox', () => ({
  Checkbox: (props: Record<string, unknown>) => React.createElement('Checkbox', props),
}));
vi.mock('../src/components/BrandWordmark', () => ({
  BrandWordmark: (props: Record<string, unknown>) => React.createElement('BrandWordmark', props),
}));
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

import { maintenanceView } from '../src/lib/maintenance';
import { newerLegalVersionNotice } from '../src/lib/legal-version-notice';
import { onMaintenanceAnswer } from '../src/lib/maintenance-signal';
import { throwApiError } from '../src/lib/api';
import { ReacceptScreen } from '../src/components/ReacceptScreen';

/**
 * V7 D5 (U9b, `DEC7-24` / `DEC7-25`). The app's half of forced CGU re-acceptance: a blocking screen
 * for a signed-in user whose accepted version is not the active one, staff included; a way out (sign
 * out, or delete the account); and, in the in-app reader, a line pointing to a newer published PDF.
 */

function status(opts: { maintenance?: boolean; force?: boolean; cgu?: string; notice?: string } = {}): PlatformStatus {
  return {
    maintenance: { enabled: opts.maintenance ?? false, message: 'm' },
    cgu: { version: opts.cgu ?? '2026-11-15', forceReaccept: opts.force ?? true, summary: null, publishedAt: null },
    legalNotice: { version: opts.notice ?? '2026-10-10' },
  };
}
const view = (s: PlatformStatus, extra: Partial<Parameters<typeof maintenanceView>[0]> = {}) =>
  maintenanceView({ status: s, role: null, teamLogin: false, inAuthGroup: false, signedIn: true, cguVersion: '2026-10-10', ...extra });

describe('when the re-acceptance screen shows (Q7, Q13)', () => {
  it('for a signed-in user not on the active version, while forced', () => {
    expect(view(status())).toBe('reaccept');
    // V9 B1 (2026-11-19, `FND9-017`): was 'reaccept'. An account that never accepted anything now gets
    // its own terms screen (`/(auth)/conditions`), not « Nos conditions d'utilisation évoluent ».
    expect(view(status(), { cguVersion: null })).toBe('none');
  });

  it('not when he is on it, not when unticked, not signed out', () => {
    expect(view(status(), { cguVersion: '2026-11-15' })).toBe('none');
    expect(view(status({ force: false }))).toBe('none');
    expect(view(status(), { signedIn: false, cguVersion: null })).toBe('none');
  });

  it('for staff too, and maintenance still comes first for everyone else', () => {
    expect(view(status(), { role: 'super_admin' })).toBe('reaccept');
    expect(view(status({ maintenance: true }))).toBe('screen');
  });

  it('steps aside on the deletion screen after « Supprimer mon compte », and comes back if he leaves it (DEC7-25 Q1)', () => {
    expect(view(status(), { deleteFlow: true, inDeleteRoute: true })).toBe('none');
    expect(view(status(), { deleteFlow: true, inDeleteRoute: false })).toBe('reaccept');
    expect(view(status(), { deleteFlow: false, inDeleteRoute: true })).toBe('reaccept');
  });
});

describe('the re-acceptance screen (Q12)', () => {
  const handlers = () => ({ onRead: vi.fn(), onToggle: vi.fn(), onAccept: vi.fn(), onSignOut: vi.fn(), onDelete: vi.fn() });

  it('shows the title, the version date, the summary, the PDF link, the checkbox and the three ways on', () => {
    const h = handlers();
    const tree = ReacceptScreen({ version: '2026-11-15', summary: 'Article 12 précisé.', accepted: false, submitting: false, error: null, ...h });
    const text = findNodesByType(tree, 'Text').map((n) => findTextNodes(n).join(''));
    expect(text).toContain(REACCEPT_TITLE);
    expect(text).toContain('Version du 15/11/2026');
    expect(text).toContain('Article 12 précisé.');
    const [box] = findNodesByType(tree, 'Checkbox');
    expect(findTextNodes(box).join('')).toBe(REACCEPT_CHECKBOX_LABEL);
    expect(box.props.checked).toBe(false);
    box.props.onPress();
    expect(h.onToggle).toHaveBeenCalled();
    const [cont] = findNodesByType(tree, 'Button');
    expect(cont.props.label).toBe('Continuer');
    expect(cont.props.disabled).toBe(true);
    const link = (label: string) => findNodesByType(tree, 'Pressable').find((n) => findTextNodes(n).join('') === label);
    link('Lire les CGU').props.onPress();
    link('Se déconnecter').props.onPress();
    link('Supprimer mon compte').props.onPress();
    expect(h.onRead).toHaveBeenCalled();
    expect(h.onSignOut).toHaveBeenCalled();
    expect(h.onDelete).toHaveBeenCalled();
  });

  it('enables « Continuer » once ticked, shows the error, and draws no summary when there is none', () => {
    const h = handlers();
    const tree = ReacceptScreen({ version: '2026-11-15', summary: null, accepted: true, submitting: false, error: 'Réseau indisponible.', ...h });
    const [cont] = findNodesByType(tree, 'Button');
    expect(cont.props.disabled).toBe(false);
    cont.props.onPress();
    expect(h.onAccept).toHaveBeenCalled();
    const text = findNodesByType(tree, 'Text').map((n) => findTextNodes(n).join(''));
    expect(text).toContain('Réseau indisponible.');
    expect(text.filter((t) => t === 'null' || t === '')).toHaveLength(0);
  });
});

describe('the in-app reader’s line for a newer version', () => {
  it('points to the active PDF when it is newer than the text the app ships (10 October)', () => {
    expect(newerLegalVersionNotice('cgu', status({ cgu: '2026-11-15' }))).toEqual({
      text: 'Une version plus récente, du 15/11/2026, est en vigueur.',
      linkLabel: 'Lire la version en vigueur',
      path: '/legal-documents/cgu/2026-11-15',
    });
    expect(newerLegalVersionNotice('mentions-legales', status({ notice: '2026-12-01' }))?.path).toBe('/legal-documents/mentions-legales/2026-12-01');
  });

  it('nothing when the shipped text is the active one, for other documents, or without a status', () => {
    expect(newerLegalVersionNotice('cgu', status({ cgu: '2026-10-10' }))).toBeNull();
    expect(newerLegalVersionNotice('confidentialite', status({ cgu: '2026-11-15' }))).toBeNull();
    expect(newerLegalVersionNotice('cgu', null)).toBeNull();
  });
});

describe('a CGU_REACCEPT_REQUIRED answer from any call', () => {
  it('tells the gate at once, like MAINTENANCE', () => {
    const listener = vi.fn();
    const off = onMaintenanceAnswer(listener);
    expect(() => throwApiError({ error: { code: 'CGU_REACCEPT_REQUIRED', message: 'x' } }, 403)).toThrow('x');
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });
});

describe('wiring', () => {
  const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

  it('the gate accepts through the API, reads cguVersion through ?? null, and opens the deletion screen', () => {
    const gate = read('src/components/MaintenanceGate.tsx');
    expect(gate).toContain("'/users/me/cgu-acceptance'");
    expect(gate).toMatch(/me\?\.cguVersion \?\? null/);
    expect(gate).toContain("router.push('/parametres/supprimer')");
    expect(gate).toContain('signOutAndLeave(');
    expect(gate).toContain('<PlatformStatusContext.Provider');
  });

  it('the legal reader shows the newer-version line', () => {
    expect(read('app/legal/[slug].tsx')).toContain('newerLegalVersionNotice(');
    expect(read('src/components/LegalDocumentScreen.tsx')).toMatch(/notice/);
  });
});
