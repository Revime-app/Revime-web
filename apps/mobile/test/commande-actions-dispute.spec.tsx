import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CommandeDto } from '@revime/shared';

// Mock theme
vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      navy: '#25324f',
      navySoft: '#eef2f8',
      ink: '#141414',
      paper: '#ffffff',
      muted: '#6b7280',
      greenSoft: '#cfe9d6',
      red: '#ef4444',
    },
    radii: { card: 20 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 40 },
  }),
}));

// Mock router
const mockPush = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock api to isolate from auth-client and native SecureStore
vi.mock('../src/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  },
}));

// Mock queries
const mockAdvanceMutate = vi.fn();
const mockReleaseMutate = vi.fn();
vi.mock('../src/lib/queries', () => ({
  useAdvanceStep: () => ({
    mutate: mockAdvanceMutate,
    isPending: false,
    error: null,
  }),
  useReleaseCommande: () => ({
    mutate: mockReleaseMutate,
    isPending: false,
    error: null,
  }),
}));

// Mock Button component
vi.mock('../src/components/Button', () => ({
  Button: (props: any) => React.createElement('Button', props),
}));

import { CommandeActions } from '../src/components/commande/CommandeActions';

function findButtons(node: any): any[] {
  if (!node) return [];
  const results: any[] = [];
  if (node.type === 'Button' || (node.props && node.props.label)) {
    results.push(node.props);
  }
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...findButtons(child));
    }
  } else if (children && typeof children === 'object') {
    results.push(...findButtons(children));
  }
  return results;
}

function findTexts(node: any): string[] {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  const results: string[] = [];
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...findTexts(child));
    }
  } else if (children) {
    results.push(...findTexts(children));
  }
  return results;
}

function makeCommande(overrides?: Partial<CommandeDto>): CommandeDto {
  return {
    id: 'cmd-v3-test',
    demandeId: 'dem-test',
    demandeTitle: 'Écran iPhone 13 cassé',
    demandeDescription: 'Vitre brisée',
    delivery: 'WORKSHOP',
    status: 'PAID',
    step: 'PAID',
    totalCents: 10000,
    payoutCents: 8500,
    paidAt: '2026-10-12T10:00:00.000Z',
    releasedAt: null,
    releaseRequestedAt: null,
    returnSentAt: null,
    viewerRole: 'REPAIRER',
    disputeOpen: false,
    disputeOpenedAt: null,
    stepEvents: [{ step: 'PAID', at: '2026-10-12T10:00:00.000Z' }],
    photoUrls: [],
    client: { name: 'Client Alice', avatarUrl: null },
    repairer: { userId: 'rep-1', name: 'Atelier Bob', avatarUrl: null },
    conversationId: 'conv-1',
    offerId: 'off-test',
    shipments: [],
    ...overrides,
  } as unknown as CommandeDto;
}

describe('Bug V3: CommandeActions dispute gating', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "Marquer « Réparation en cours »" when disputeOpen is false for repairer on HAND_DELIVERY', () => {
    const data = makeCommande({
      viewerRole: 'REPAIRER',
      delivery: 'WORKSHOP',
      step: 'PAID',
      disputeOpen: false,
    });

    const element = CommandeActions({ commandeId: data.id, data });
    const buttons = findButtons(element);

    const advanceBtn = buttons.find((b) => b.label?.includes('Réparation en cours'));
    expect(advanceBtn).toBeDefined();
    expect(advanceBtn.label).toBe('Marquer « Réparation en cours »');
  });

  it('HIDES advance button when disputeOpen is true (Bug V3 requirement)', () => {
    const data = makeCommande({
      viewerRole: 'REPAIRER',
      delivery: 'WORKSHOP',
      step: 'PAID',
      disputeOpen: true,
      disputeOpenedAt: '2026-10-12T11:00:00.000Z',
      dispute: {
        number: 1,
        reference: '#LIT-0001',
        status: 'OPEN',
        motifLabel: 'Problème de communication',
        openedAt: '2026-10-12T11:00:00.000Z',
        openedBySide: 'CLIENT',
        unread: false,
      },
    });

    const element = CommandeActions({ commandeId: data.id, data });
    const buttons = findButtons(element);

    const advanceBtn = buttons.find((b) => b.label?.includes('Réparation en cours'));
    expect(advanceBtn).toBeUndefined();
  });

  it('HIDES step advancement during dispute for subsequent steps (e.g. REPAIR_STARTED -> REPAIR_DONE)', () => {
    const data = makeCommande({
      viewerRole: 'REPAIRER',
      delivery: 'WORKSHOP',
      step: 'REPAIR_STARTED',
      disputeOpen: true,
    });

    const element = CommandeActions({ commandeId: data.id, data });
    const buttons = findButtons(element);

    const advanceBtn = buttons.find((b) => b.label?.includes('Réparation'));
    expect(advanceBtn).toBeUndefined();
  });

  it('HIDES release request button and timeout note during dispute at RETURN_SENT', () => {
    const data = makeCommande({
      viewerRole: 'REPAIRER',
      delivery: 'PARCEL',
      step: 'RETURN_SENT',
      returnSentAt: '2026-10-01T10:00:00.000Z', // Past timeout
      disputeOpen: true,
    });

    const element = CommandeActions({ commandeId: data.id, data });
    const buttons = findButtons(element);
    const texts = findTexts(element);

    const releaseBtn = buttons.find((b) => b.label?.includes('déblocage'));
    expect(releaseBtn).toBeUndefined();

    const waitingText = texts.find((t) => t.includes('confirmation du client'));
    expect(waitingText).toBeUndefined();
  });

  it('HIDES AWAITING_VALIDATION info note during dispute', () => {
    const data = makeCommande({
      viewerRole: 'REPAIRER',
      step: 'AWAITING_VALIDATION',
      disputeOpen: true,
    });

    const element = CommandeActions({ commandeId: data.id, data });
    const texts = findTexts(element);

    const awaitingText = texts.find((t) => t.includes('Déblocage demandé'));
    expect(awaitingText).toBeUndefined();
  });

  it('HIDES REPAIR_DONE client validation note during dispute', () => {
    const data = makeCommande({
      viewerRole: 'CLIENT',
      step: 'REPAIR_DONE',
      disputeOpen: true,
    });

    const element = CommandeActions({ commandeId: data.id, data });
    const texts = findTexts(element);

    const doneText = texts.find((t) => t.includes('Réparation terminée'));
    expect(doneText).toBeUndefined();
  });
});
