import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { STEP_UP_COPY, type StepUpChoice, type StepUpProvider } from '@revime/shared';
import { findNodesByType, findTextNodes } from './render-tree';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: { ink: '#141414', muted: '#6b7280', paper: '#ffffff', red: '#f61b39', redSoft: '#fde8eb', redDeep: '#bd0e26' },
    radii: { card: 20, field: 14 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  }),
}));
vi.mock('../src/components/Button', () => ({ Button: (p: Record<string, unknown>) => React.createElement('Button', p) }));
vi.mock('../src/components/Field', () => ({ Field: (p: Record<string, unknown>) => React.createElement('Field', p) }));
vi.mock('../src/components/KeyboardAvoider', () => ({
  KeyboardAvoider: (p: Record<string, unknown>) => React.createElement('KeyboardAvoider', p),
}));
vi.mock('../src/components/GoogleMark', () => ({ GoogleMark: () => React.createElement('GoogleMark') }));
vi.mock('../src/icons', () => ({ IconLock: () => React.createElement('IconLock') }));
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));
vi.mock('../src/lib/apple-auth', () => ({ appleAuth: () => null, isAppleAuthAvailable: () => false }));

import { StepUpSheetView, type StepUpSheetViewProps } from '../src/components/StepUpSheet';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` `DEC9-09` (1), (2), (8)). What the « Confirmez votre identité » sheet
 * offers for each set of choices. The view is stateless and called as a function (`render-tree.ts`).
 */
const noop = () => {};
function view(choices: StepUpChoice[], providers: StepUpProvider[], over: Partial<StepUpSheetViewProps> = {}) {
  return StepUpSheetView({
    request: { choices, providers },
    value: '',
    codeSent: false,
    busy: null,
    error: null,
    onChangeValue: noop,
    onSendCode: noop,
    onConfirm: noop,
    onProvider: noop,
    onCancel: noop,
    ...over,
  });
}
const texts = (tree: unknown) => findTextNodes(tree).join(' | ');
const labels = (tree: unknown) => findNodesByType(tree, 'Button').map((b) => b.props.label as string);

describe('V9 U3 StepUpSheetView', () => {
  it('Google only: the Google button and its sentence, no field, no code', () => {
    const tree = view(['GOOGLE'], ['GOOGLE']);
    expect(texts(tree)).toContain(STEP_UP_COPY.title);
    expect(texts(tree)).toContain(STEP_UP_COPY.providerSubtitle('GOOGLE'));
    expect(labels(tree)).toEqual(['Continuer avec Google', 'Annuler']);
    expect(findNodesByType(tree, 'Field')).toHaveLength(0);
  });

  it('password and Google: both, with the combined sentence', () => {
    const tree = view(['PASSWORD', 'GOOGLE'], ['GOOGLE']);
    expect(texts(tree)).toContain(STEP_UP_COPY.passwordOrProviderSubtitle('GOOGLE'));
    expect(findNodesByType(tree, 'Field')).toHaveLength(1);
    expect(labels(tree)).toEqual(['Confirmer', 'Continuer avec Google', 'Annuler']);
  });

  it('Apple only: Apple\'s own button and the Apple sentence', () => {
    const tree = view(['APPLE'], ['APPLE']);
    expect(texts(tree)).toContain(STEP_UP_COPY.providerSubtitle('APPLE'));
    expect(findNodesByType(tree, 'AppleConfirmButton')).toHaveLength(1);
    expect(labels(tree)).toEqual(['Annuler']);
  });

  it('no usable choice: says so, and only « Annuler »', () => {
    const tree = view([], ['APPLE']);
    expect(texts(tree)).toContain(STEP_UP_COPY.noChoice);
    expect(labels(tree)).toEqual(['Annuler']);
    expect(findNodesByType(tree, 'Field')).toHaveLength(0);
  });

  it('the e-mailed code is unchanged for an account with neither', () => {
    const tree = view(['EMAIL_CODE'], []);
    expect(texts(tree)).toContain('Pour votre sécurité, nous vous envoyons un code par e-mail avant de continuer.');
    expect(labels(tree)).toEqual(['Recevoir un code', 'Annuler']);
    const sent = view(['EMAIL_CODE'], [], { codeSent: true });
    expect(labels(sent)).toEqual(['Confirmer', 'Renvoyer un code', 'Annuler']);
  });

  it('the password alone keeps today\'s sentence', () => {
    expect(texts(view(['PASSWORD'], []))).toContain('Pour votre sécurité, saisissez votre mot de passe avant de continuer.');
  });

  it('shows a failure\'s message', () => {
    expect(texts(view(['GOOGLE'], ['GOOGLE'], { error: STEP_UP_COPY.googleNotConfirmed }))).toContain(STEP_UP_COPY.googleNotConfirmed);
  });

  it('the Google button runs the provider confirmation', () => {
    const onProvider = vi.fn();
    const google = findNodesByType(view(['GOOGLE'], ['GOOGLE'], { onProvider }), 'Button').find((b) => b.props.label === 'Continuer avec Google');
    google.props.onPress();
    expect(onProvider).toHaveBeenCalledWith('GOOGLE');
  });

  it('closed when there is no request, and no dash anywhere', () => {
    expect(view([], []).props.visible).toBe(true);
    expect(StepUpSheetView({ ...({} as StepUpSheetViewProps), request: null, onCancel: noop } as StepUpSheetViewProps).props.visible).toBe(false);
    for (const set of [['GOOGLE'], ['PASSWORD', 'APPLE'], [], ['EMAIL_CODE']] as StepUpChoice[][]) {
      expect(texts(view(set, ['GOOGLE', 'APPLE']))).not.toMatch(/[–—]/);
    }
  });
});
