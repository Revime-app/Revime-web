import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { accents, palette, radii, spacing } from '@revime/tokens';
import { repairerJourney, type ProfileCompletion, type RepairerJourney } from '@revime/shared';
import { findNodesByType, findTextNodes } from './render-tree';

/** V8 E1, mockups 1 and 6: the setup card on Accueil/Profil, and « Configuration terminée » on Profil. */

vi.mock('../src/theme', () => ({
  useTheme: () => ({ palette, accent: accents.pro, radii, spacing }),
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../src/icons', () => ({
  IconLock: (props: any) => React.createElement('IconLock', props),
  IconTick: (props: any) => React.createElement('IconTick', props),
}));
vi.mock('../src/components/VerificationPendingBanner', () => ({
  VerificationPendingContent: () => React.createElement('VerificationPendingContent'),
}));

let mockMode: 'REPAIRER' | 'CLIENT' = 'REPAIRER';
vi.mock('../src/lib/session', () => ({
  useSessionContext: () => ({ me: { profile: { activeMode: mockMode } } }),
}));
let mockJourney: RepairerJourney | null = null;
vi.mock('../src/lib/use-repairer-journey', () => ({
  useRepairerJourney: () => ({ loading: false, journey: mockJourney }),
}));

import { RepairerJourneyCard } from '../src/components/RepairerJourneyCard';
import { SetupCompleteRow } from '../src/components/SetupCompleteRow';

function completion(completed: number): ProfileCompletion {
  const keys = ['photo', 'banner', 'description', 'categories', 'zone', 'availability'] as const;
  return { completed, total: 6, items: Object.fromEntries(keys.map((k, i) => [k, i < completed])) as ProfileCompletion['items'] };
}
const MOCKUP_1 = repairerJourney({
  kind: 'INDIVIDUAL',
  level: 'IDENTITY',
  identityStatus: 'VERIFIED',
  lastErrorCode: null,
  completion: completion(1),
  connectStatus: 'VERIFIED',
  connectEnabled: true,
  fiscalCompleted: false,
});
const DONE = repairerJourney({
  kind: 'INDIVIDUAL',
  level: 'IDENTITY',
  identityStatus: 'VERIFIED',
  lastErrorCode: null,
  completion: completion(6),
  connectStatus: 'VERIFIED',
  connectEnabled: true,
  fiscalCompleted: true,
});

beforeEach(() => {
  mockMode = 'REPAIRER';
  mockJourney = null;
});

describe('V8 E1 RepairerJourneyCard (mockup 1)', () => {
  it('shows progress, time left, the next step with its time and what it unlocks', () => {
    mockJourney = MOCKUP_1;
    const tree = RepairerJourneyCard({});
    const texts = findTextNodes(tree);
    expect(texts).toContain('Configuration réparateur · 3/5');
    expect(texts).toContain('≈ 4 min');
    expect(texts).toContain('Étape suivante : Informations fiscales (2 min)');
    expect(texts).toContain('Nécessaire pour recevoir vos paiements');
    expect(findNodesByType(tree, 'JourneyProgressBar')[0]?.props).toMatchObject({ completed: 3, total: 5 });
    expect(findNodesByType(tree, 'Button')[0]?.props.label).toBe('Continuer');
  });

  it('is gone once setup is complete', () => {
    mockJourney = DONE;
    expect(RepairerJourneyCard({})).toBeNull();
  });

  it('is gone in client mode', () => {
    mockJourney = MOCKUP_1;
    mockMode = 'CLIENT';
    expect(RepairerJourneyCard({})).toBeNull();
  });
});

describe('V8 E1 SetupCompleteRow (mockup 6)', () => {
  it('confirms a complete setup', () => {
    mockJourney = DONE;
    const texts = findTextNodes(SetupCompleteRow({}));
    expect(texts).toContain('Configuration terminée');
    expect(texts).toContain('Vous pouvez envoyer des offres et recevoir vos paiements.');
  });

  it('renders nothing while setup is unfinished, or in client mode', () => {
    mockJourney = MOCKUP_1;
    expect(SetupCompleteRow({})).toBeNull();
    mockJourney = DONE;
    mockMode = 'CLIENT';
    expect(SetupCompleteRow({})).toBeNull();
  });
});
