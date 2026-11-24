import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accents, palette, radii, spacing } from '@revime/tokens';
import {
  repairerJourney,
  type ProfileCompletion,
  type RepairerJourney,
  type RepairerJourneyInput,
} from '@revime/shared';
import { findNodes, findNodesByType, findTextNodes } from './render-tree';

/** V8 E1, mockup 2 (`DEC8-08` (8), (10), (12)): the setup page, a button per step to do, « Configurer plus tard ». */

const mockNavigate = vi.fn();
const mockPush = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, navigate: mockNavigate, back: vi.fn() }),
}));
vi.mock('../src/theme', () => ({
  useTheme: () => ({ palette, accent: accents.pro, radii, spacing }),
}));
vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => React.createElement('SafeAreaView', props, children),
}));
vi.mock('../src/icons', () => ({
  IconLock: (props: any) => React.createElement('IconLock', props),
  IconTick: (props: any) => React.createElement('IconTick', props),
}));
vi.mock('../src/lib/session', () => ({
  useSessionContext: () => ({ me: { connectEnabled: true, profile: { activeMode: 'REPAIRER' } } }),
}));
vi.mock('../src/lib/use-identity-start', () => ({
  useIdentityStart: () => ({ startIdentity: vi.fn(), loading: false, error: null }),
}));
vi.mock('../src/lib/use-connect-onboarding', () => ({
  useConnectOnboarding: () => ({ startOnboarding: vi.fn(), loading: false, error: null, visible: false }),
}));
vi.mock('../src/components/ConnectOnboardingSheet', () => ({ ConnectOnboardingSheet: () => null }));
let mockJourney: RepairerJourney | null = null;
vi.mock('../src/lib/use-repairer-journey', () => ({
  useRepairerJourney: () => ({
    loading: false,
    identityError: false,
    connectError: false,
    journey: mockJourney,
    verificationLabel: 'Vérification requise',
    refetch: vi.fn(),
  }),
}));

import StatutVerification from '../app/statut-verification';

function completion(completed: number): ProfileCompletion {
  const keys = ['photo', 'banner', 'description', 'categories', 'zone', 'availability'] as const;
  return { completed, total: 6, items: Object.fromEntries(keys.map((k, i) => [k, i < completed])) as ProfileCompletion['items'] };
}
const journeyOf = (over: Partial<RepairerJourneyInput>) =>
  repairerJourney({
    kind: 'INDIVIDUAL',
    level: 'BASIC',
    identityStatus: null,
    lastErrorCode: null,
    completion: completion(0),
    connectStatus: null,
    connectEnabled: true,
    fiscalCompleted: false,
    ...over,
  });
const MOCKUP_2 = journeyOf({
  level: 'IDENTITY',
  identityStatus: 'VERIFIED',
  completion: completion(1),
  connectStatus: 'VERIFIED',
});

const buttonLabels = (tree: unknown) => findNodesByType(tree, 'Button').map((b) => b.props.label as string);
const button = (tree: unknown, label: string) => findNodesByType(tree, 'Button').find((b) => b.props.label === label);

beforeEach(() => {
  mockJourney = null;
  mockNavigate.mockClear();
});

describe('V8 E1 setup page (mockup 2)', () => {
  it('summary, done values, the steps to do with their time, chip and own button', () => {
    mockJourney = MOCKUP_2;
    const tree = StatutVerification();
    const texts = findTextNodes(tree);
    expect(findNodesByType(tree, 'ScreenHeader')[0]?.props.title).toBe('Configuration réparateur');
    expect(texts).toContain('3 étapes sur 5 terminées');
    expect(texts).toContain('≈ 4 min');
    expect(texts).toEqual(expect.arrayContaining(['Statut · Particulier', 'Identité · Vérifiée', 'Virements · Activés']));
    expect(texts).toContain('Informations fiscales · 2 min');
    expect(texts).toContain('Profil réparateur · 1/6 · 2 min');
    expect(texts).toEqual(
      expect.arrayContaining([
        'Nécessaire pour recevoir vos paiements',
        'Recommandé : les clients vous choisissent plus facilement',
      ]),
    );
    // A button on EVERY step to do, not only the next one.
    expect(buttonLabels(tree)).toEqual(expect.arrayContaining(['Renseigner mes informations', 'Compléter mon profil']));
  });

  it('« Configurer plus tard » opens the Demandes feed, with its note', () => {
    mockJourney = MOCKUP_2;
    const tree = StatutVerification();
    expect(findTextNodes(tree)).toContain('Vous pouvez déjà consulter les demandes près de chez vous.');
    const later = button(tree, 'Configurer plus tard');
    expect(later?.props.variant).toBe('secondary');
    later?.props.onPress();
    expect(mockNavigate).toHaveBeenCalledWith('/(tabs)/publier');
  });

  it('review I2: one step done reads in the singular', () => {
    mockJourney = journeyOf({});
    expect(findTextNodes(StatutVerification())).toContain('1 étape sur 5 terminée');
  });

  it('a blocked step shows why and has no button', () => {
    mockJourney = journeyOf({});
    const tree = StatutVerification();
    expect(findTextNodes(tree)).toContain('Disponible après la validation de votre identité.');
    expect(buttonLabels(tree)).toContain('Vérifier');
    expect(buttonLabels(tree)).not.toContain('Renseigner mes informations');
  });

  it('a step waiting on review reads « Vérification en cours » and has no button', () => {
    mockJourney = journeyOf({ identityStatus: 'PROCESSING' });
    const tree = StatutVerification();
    expect(findTextNodes(tree)).toContain('Vérification en cours');
    expect(buttonLabels(tree)).not.toContain('Vérifier');
  });

  it('complete: « Configuration terminée », and no « Configurer plus tard »', () => {
    mockJourney = journeyOf({
      level: 'IDENTITY',
      identityStatus: 'VERIFIED',
      completion: completion(6),
      connectStatus: 'VERIFIED',
      fiscalCompleted: true,
    });
    const tree = StatutVerification();
    const texts = findTextNodes(tree);
    expect(texts).toContain('Configuration terminée');
    expect(texts).toContain('Vous pouvez envoyer des offres et recevoir vos paiements.');
    expect(button(tree, 'Configurer plus tard')).toBeUndefined();
    expect(findNodes(tree, (n) => n?.props?.children === 'Tout est prêt')).toHaveLength(0);
  });
});
