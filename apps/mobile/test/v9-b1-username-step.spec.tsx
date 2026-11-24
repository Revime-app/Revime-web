import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { USERNAME_STEP_HINT, USERNAME_STEP_TITLE, type MeResponse } from '@revime/shared';
import { findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: { ink: '#141414', ink2: '#2b2b2e', muted: '#6b7280', line: '#e4e7ec', paper: '#ffffff', red: '#f61b39' },
    accent: { accent: '#f61b39', accentDeep: '#bd0e26' },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  }),
}));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
vi.mock('../src/components/Button', () => ({ Button: (p: Record<string, unknown>) => React.createElement('Button', p) }));
vi.mock('../src/components/Field', () => ({ Field: (p: Record<string, unknown>) => React.createElement('Field', p) }));
vi.mock('../src/components/KeyboardAvoider', () => ({
  KeyboardAvoider: (p: Record<string, unknown>) => React.createElement('KeyboardAvoider', p),
}));
vi.mock('../src/components/BrandWordmark', () => ({ BrandWordmark: (p: Record<string, unknown>) => React.createElement('BrandWordmark', p) }));
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

import { UsernameStepView } from '../src/components/signup/UsernameStepView';
import { submitUsername } from '../src/lib/signup-actions';
import { ApiError } from '../src/lib/api';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-06` (2)): the username step. Pre-filled with the generated
 * handle, « Continuer » keeps it as is, no skip, never empty, a taken name shown under the field.
 */
const noop = () => {};
const view = (over: Partial<Parameters<typeof UsernameStepView>[0]> = {}) =>
  UsernameStepView({ value: 'oorvandel', error: null, submitting: false, onChange: noop, onSubmit: noop, onSignOut: noop, onDelete: noop, ...over });

describe('UsernameStepView', () => {
  it('shows the title, the field with the handle and its hint, and « Continuer »', () => {
    const tree = view();
    const text = findTextNodes(tree);
    expect(text).toContain(USERNAME_STEP_TITLE);
    const field = findNodesByType(tree, 'Field')[0];
    expect(field.props.value).toBe('oorvandel');
    expect(field.props.label).toBe("Nom d'utilisateur");
    expect(field.props.helperText).toBe(USERNAME_STEP_HINT);
    const button = findNodesByType(tree, 'Button').find((b) => b.props.label === 'Continuer');
    expect(button.props.disabled).toBe(false);
  });

  it('disables « Continuer » on an empty field', () => {
    const button = findNodesByType(view({ value: '   ' }), 'Button').find((b) => b.props.label === 'Continuer');
    expect(button.props.disabled).toBe(true);
  });

  it('shows a server error under the field', () => {
    const field = findNodesByType(view({ error: "Ce nom d'utilisateur est déjà pris." }), 'Field')[0];
    expect(field.props.error).toBe("Ce nom d'utilisateur est déjà pris.");
  });

  it('offers no skip, and keeps « Se déconnecter » and « Supprimer mon compte »', () => {
    const text = findTextNodes(view());
    expect(text.join(' ')).not.toMatch(/Passer/);
    expect(text).toContain('Se déconnecter');
    expect(text).toContain('Supprimer mon compte');
  });

  it('sits in the keyboard wrapper', () => {
    expect(findNodesByType(view(), 'KeyboardAvoider')).toHaveLength(1);
  });
});

describe('submitUsername', () => {
  const after = (over: Partial<MeResponse>) =>
    ({
      signupMethod: 'GOOGLE',
      usernameConfirmedAt: '2026-11-19T10:00:00.000Z',
      cguVersion: null,
      profile: { onboardingCompletedAt: null },
      ...over,
    }) as MeResponse;

  it('saves the handle, even unchanged, refreshes the session, and goes to the next owed step', async () => {
    const patch = vi.fn(async () => after({}));
    const refresh = vi.fn(async () => {});
    expect(await submitUsername('oorvandel', { patch, refresh })).toEqual({ next: '/(auth)/roles?apply=1' });
    expect(patch).toHaveBeenCalledWith('/users/me/username', { username: 'oorvandel' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('goes to the tabs when nothing is owed any more', async () => {
    const patch = vi.fn(async () =>
      after({ cguVersion: '2026-10-10', profile: { onboardingCompletedAt: '2026-11-19T10:01:00.000Z' } as MeResponse['profile'] }),
    );
    expect(await submitUsername('ana', { patch, refresh: async () => {} })).toEqual({ next: '/(tabs)' });
  });

  it('returns the field error of a taken name and does not navigate', async () => {
    const patch = vi.fn(async () => {
      throw new ApiError('CONFLICT', "Ce nom d'utilisateur est déjà pris.", { username: "Ce nom d'utilisateur est déjà pris." });
    });
    expect(await submitUsername('pris', { patch, refresh: async () => {} })).toEqual({ error: "Ce nom d'utilisateur est déjà pris." });
  });

  it('returns a generic French error on anything else', async () => {
    const patch = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await submitUsername('ana', { patch, refresh: async () => {} })).toEqual({
      error: "Impossible d'enregistrer votre nom d'utilisateur. Réessayez.",
    });
  });
});
