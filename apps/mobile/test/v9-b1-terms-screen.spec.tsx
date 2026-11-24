import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { CGU_BOX_LABEL, PRIVACY_BOX_LABEL, SIGNUP_TERMS_HINT, SIGNUP_TERMS_SUBTITLE } from '@revime/shared';
import { findNodes, findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: { ink: '#141414', ink2: '#2b2b2e', muted: '#6b7280', line: '#e4e7ec', paper: '#ffffff', red: '#f61b39', navySoft: '#eef0f5' },
    accent: { accent: '#f61b39', accentDeep: '#bd0e26' },
    radii: { card: 20, field: 12 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  }),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('../src/components/Button', () => ({ Button: (p: Record<string, unknown>) => React.createElement('Button', p) }));
vi.mock('../src/components/Checkbox', () => ({ Checkbox: (p: Record<string, unknown>) => React.createElement('Checkbox', p) }));
vi.mock('../src/components/KeyboardAvoider', () => ({
  KeyboardAvoider: (p: Record<string, unknown>) => React.createElement('KeyboardAvoider', p),
}));
vi.mock('../src/components/BrandWordmark', () => ({ BrandWordmark: (p: Record<string, unknown>) => React.createElement('BrandWordmark', p) }));
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

import { TermsStepView } from '../src/components/signup/TermsStepView';
import { submitTerms } from '../src/lib/signup-actions';
import { ApiError } from '../src/lib/api';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` B1 (1), (2); `DEC9-05` (3)–(5)): the mockup's « Dernière étape »
 * screen, its two boxes, and the e-mail form's second box with the same wording.
 */
const noop = () => {};
const props = (over: Partial<Parameters<typeof TermsStepView>[0]> = {}): Parameters<typeof TermsStepView>[0] => ({
  title: 'Dernière étape',
  connectedWith: 'Apple',
  cguChecked: false,
  privacyChecked: false,
  error: null,
  submitting: false,
  onToggleCgu: noop,
  onTogglePrivacy: noop,
  onOpenCgu: noop,
  onOpenPrivacy: noop,
  onSubmit: noop,
  onSignOut: noop,
  onDelete: noop,
  ...over,
});
const continuer = (tree: unknown) => findNodesByType(tree, 'Button').find((b) => b.props.label === 'Continuer');

describe('TermsStepView', () => {
  it('draws the mockup for an Apple account', () => {
    const tree = TermsStepView(props());
    const text = findTextNodes(tree);
    expect(text).toContain('Dernière étape');
    expect(text).toContain(SIGNUP_TERMS_SUBTITLE);
    expect(text.join('')).toContain('Connecté avec');
    expect(text).toContain('Apple');
    expect(text).toContain(SIGNUP_TERMS_HINT);
  });

  it('labels the two boxes with the client wording, each document name a link', () => {
    const boxes = findNodesByType(TermsStepView(props()), 'Checkbox');
    expect(boxes).toHaveLength(2);
    expect(findTextNodes(boxes[0]).join('')).toBe(CGU_BOX_LABEL);
    expect(findTextNodes(boxes[1]).join('')).toBe(PRIVACY_BOX_LABEL);
    const opened: string[] = [];
    const tree = TermsStepView(props({ onOpenCgu: () => opened.push('cgu'), onOpenPrivacy: () => opened.push('privacy') }));
    const links = findNodes(tree, (e) => e?.props?.accessibilityRole === 'link');
    expect(links.map((l) => findTextNodes(l).join(''))).toEqual(["Conditions générales d'utilisation", 'Politique de confidentialité']);
    links.forEach((l) => l.props.onPress());
    expect(opened).toEqual(['cgu', 'privacy']);
  });

  it('enables « Continuer » only with both boxes ticked', () => {
    expect(continuer(TermsStepView(props())).props.disabled).toBe(true);
    expect(continuer(TermsStepView(props({ cguChecked: true }))).props.disabled).toBe(true);
    expect(continuer(TermsStepView(props({ privacyChecked: true }))).props.disabled).toBe(true);
    expect(continuer(TermsStepView(props({ cguChecked: true, privacyChecked: true }))).props.disabled).toBe(false);
  });

  it('for an e-mail account: « Avant de continuer » and no « Connecté avec » row', () => {
    const text = findTextNodes(TermsStepView(props({ title: 'Avant de continuer', connectedWith: null })));
    expect(text).toContain('Avant de continuer');
    expect(text.join('')).not.toContain('Connecté avec');
  });

  it('shows an error, offers no marketing box, keeps sign-out and deletion', () => {
    const tree = TermsStepView(props({ error: "Cette version n'est plus celle en vigueur : rouvrez l'application." }));
    const text = findTextNodes(tree);
    expect(text).toContain("Cette version n'est plus celle en vigueur : rouvrez l'application.");
    expect(text.join(' ')).not.toMatch(/offres|actualités|marketing/i);
    expect(text).toContain('Se déconnecter');
    expect(text).toContain('Supprimer mon compte');
  });
});

describe('submitTerms', () => {
  it('posts the active CGU version, refreshes the session, then goes to the tabs', async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const refresh = vi.fn(async () => {});
    const getStatus = vi.fn(async () => ({ cgu: { version: '2026-10-10' } }));
    expect(await submitTerms({ getStatus, post, refresh })).toEqual({ next: '/(tabs)' });
    expect(post).toHaveBeenCalledWith('/users/me/signup-acceptance', { cguVersion: '2026-10-10' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's sentence on a refusal", async () => {
    const post = vi.fn(async () => {
      throw new ApiError('CONFLICT', "Cette version n'est plus celle en vigueur : rouvrez l'application.");
    });
    expect(await submitTerms({ getStatus: async () => ({ cgu: { version: 'x' } }), post, refresh: async () => {} })).toEqual({
      error: "Cette version n'est plus celle en vigueur : rouvrez l'application.",
    });
  });

  it('answers in French when nothing reached the server', async () => {
    expect(
      await submitTerms({
        getStatus: async () => {
          throw new Error('offline');
        },
        post: vi.fn(),
        refresh: async () => {},
      }),
    ).toEqual({ error: "Impossible d'enregistrer votre accord. Réessayez." });
  });
});

describe('the e-mail sign-up form (source)', () => {
  const src = readFileSync(join(__dirname, '../app/(auth)/signup.tsx'), 'utf8');

  it('has the privacy box, validated and sent', () => {
    expect(src).toMatch(/const \[privacyAccepted, setPrivacyAccepted\] = useState\(false\)/);
    expect(src).toMatch(/signUpSchema\.safeParse\(\{[\s\S]*privacyAccepted,[\s\S]*\}\)/);
    expect(src).toMatch(/authClient\.signUp\.email\(\{[\s\S]*privacyAccepted: true,[\s\S]*\}\)/);
  });

  it('labels both boxes with the client wording', () => {
    expect(src).toContain("J&apos;accepte les{' '}");
    expect(src).toContain("Conditions générales d&apos;utilisation");
    expect(src).toContain("J&apos;accepte la{' '}");
    expect(src).toContain('Politique de confidentialité');
    expect(src).not.toContain('Consulter notre');
  });

  it('routes the server refusal of each box to its own box', () => {
    expect(src).toMatch(/PRIVACY_REQUIRED/);
  });
});
