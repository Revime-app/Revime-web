import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { palette, spacing } from '@revime/tokens';

const mockPush = vi.fn();
// V8 E2: the help bubbles' hooks are not under test here.
vi.mock('../src/tour/use-tour', () => ({
  useTourPage: () => ({ scrollProps: {} }),
  useTourTarget: () => ({}),
  useTourActions: () => ({ replayCurrentMode: () => {} }),
}));
vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette,
    spacing,
  }),
}));

let mockMe: any = {
  id: 'usr_repairer_1',
  profile: {
    activeMode: 'REPAIRER',
  },
  repairer: {
    kind: 'INDIVIDUAL',
    fiscalCompleted: false,
  },
};

vi.mock('../src/lib/session', () => ({
  useSessionContext: () => ({
    me: mockMe,
  }),
}));

let mockCommandesData: any[] = [];

vi.mock('../src/lib/queries', () => ({
  useMyDemandes: () => ({ data: [], isPending: false, isError: false }),
  useCommandes: () => ({
    data: mockCommandesData,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn(),
  }),
}));

// V8 `ISS8-020` (d), added 2026-11-18: the list reads « Virements » from the repairer journey. Payouts done by
// default, so the CMP-D3 cases below keep their meaning; one case sets them missing.
let mockPayouts: 'done' | 'todo' = 'done';
vi.mock('../src/lib/use-repairer-journey', () => ({
  useRepairerJourney: () => ({
    journey: { steps: [{ key: 'payouts', status: mockPayouts, minutes: 3 }] },
    identityError: false,
    connectError: false,
  }),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, ...props }: any) => React.createElement('SafeAreaView', props, children),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock('../src/components/ScreenMotif', () => ({
  ScreenMotif: () => null,
}));

vi.mock('../src/components/lottie/RevimeLoader', () => ({
  RevimeLoader: () => null,
}));

vi.mock('../src/components/RevimeRefreshScrollView', () => ({
  RevimeRefreshScrollView: ({ children }: any) => <>{children}</>,
}));

import Commandes from '../app/commandes';

function evaluateTree(node: any): any {
  if (!node) return node;
  if (Array.isArray(node)) return node.map(evaluateTree);
  if (typeof node === 'object') {
    if (typeof node.type === 'function') {
      try {
        const rendered = node.type(node.props ?? {});
        return evaluateTree(rendered);
      } catch {
        return node;
      }
    }
    if (node.props && node.props.children) {
      return {
        ...node,
        props: {
          ...node.props,
          children: evaluateTree(node.props.children),
        },
      };
    }
  }
  return node;
}

function findText(node: any, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string') return node.includes(text);
  if (Array.isArray(node)) return node.some((child) => findText(child, text));
  if (typeof node === 'object' && node.props) {
    if (typeof node.props.title === 'string' && node.props.title.includes(text)) return true;
    if (typeof node.props.label === 'string' && node.props.label.includes(text)) return true;
    return findText(node.props.children, text);
  }
  return false;
}

function findPressableWithText(node: any, text: string): any {
  if (!node) return null;
  if (typeof node === 'object' && node.props) {
    if (node.props.onPress && findText(node, text)) {
      return node;
    }
    if (Array.isArray(node.props.children)) {
      for (const child of node.props.children) {
        const found = findPressableWithText(child, text);
        if (found) return found;
      }
    } else if (node.props.children) {
      return findPressableWithText(node.props.children, text);
    }
  }
  return null;
}

describe('Commandes - CMP-D3 Fiscal Hold Warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPayouts = 'done';
    mockMe = {
      id: 'usr_repairer_1',
      profile: {
        activeMode: 'REPAIRER',
      },
      repairer: {
        kind: 'INDIVIDUAL',
        fiscalCompleted: false,
      },
    };
  });

  it('renders amber warning card and button when payout is held pending fiscal declaration (CMP-D3)', () => {
    mockCommandesData = [
      {
        id: 'cmd-hold-1',
        demandeId: 'dem-1',
        demandeTitle: 'Écran cassé · Galaxy S22',
        counterpartyName: 'Alice',
        delivery: 'WORKSHOP',
        step: 'RELEASED',
        status: 'PAID',
        payoutCents: 8500,
        totalCents: 9500,
        createdAt: '2026-10-10T10:00:00.000Z',
        releasedAt: '2026-10-12T14:30:00.000Z',
        hasStripeTransfer: false,
        disputeOpen: false,
      },
    ];

    const tree = evaluateTree(Commandes());

    expect(findText(tree, 'Écran cassé · Galaxy S22')).toBe(true);
    // Amended 2026-11-18, V8 `ISS8-020` (c): the title row's badge is `Q8-08`'s « Paiement en attente » (was a
    // hard-coded « Validée »); the line under the title still says who validated and when.
    expect(findText(tree, 'Paiement en attente')).toBe(true);
    expect(findText(tree, 'Validée par le client le 12/10/2026')).toBe(true);
    expect(findText(tree, 'Paiement en attente : 85 €')).toBe(true);
    expect(
      findText(tree, 'Complétez vos informations fiscales pour recevoir votre paiement.'),
    ).toBe(true);
    expect(findText(tree, 'Compléter mes informations fiscales')).toBe(true);

    const buttonNode = findPressableWithText(tree, 'Compléter mes informations fiscales');
    expect(buttonNode).not.toBeNull();
    buttonNode.props.onPress();
    expect(mockPush).toHaveBeenCalledWith('/fiscalite');
  });

  it('renders standard card without amber warning when fiscal declaration is completed', () => {
    mockMe.repairer.fiscalCompleted = true;
    mockCommandesData = [
      {
        id: 'cmd-hold-1',
        demandeId: 'dem-1',
        demandeTitle: 'Écran cassé · Galaxy S22',
        counterpartyName: 'Alice',
        delivery: 'WORKSHOP',
        step: 'RELEASED',
        status: 'PAID',
        payoutCents: 8500,
        totalCents: 9500,
        createdAt: '2026-10-10T10:00:00.000Z',
        releasedAt: '2026-10-12T14:30:00.000Z',
        hasStripeTransfer: true,
        disputeOpen: false,
      },
    ];

    const tree = evaluateTree(Commandes());

    expect(findText(tree, 'Écran cassé · Galaxy S22')).toBe(true);
    expect(findText(tree, 'Paiement en attente : 85,00 €')).toBe(false);
    expect(findText(tree, 'Compléter mes informations fiscales')).toBe(false);
  });

  it('V8 ISS8-020 (d): an individual missing BOTH fiscal info and « Virements » is sent to the setup page', () => {
    mockPayouts = 'todo';
    mockCommandesData = [
      {
        id: 'cmd-hold-3',
        demandeId: 'dem-3',
        demandeTitle: 'Ecran fissuré pour tournage pub',
        counterpartyName: 'Camille',
        delivery: 'WORKSHOP',
        step: 'RELEASED',
        status: 'PAID',
        payoutCents: 100,
        totalCents: 395,
        createdAt: '2026-11-18T00:33:00.000Z',
        releasedAt: '2026-11-18T00:41:00.000Z',
        hasStripeTransfer: false,
        disputeOpen: false,
      },
    ];

    const tree = evaluateTree(Commandes());

    expect(findText(tree, 'Votre paiement vous attend : terminez votre configuration pour le recevoir.')).toBe(true);
    expect(findText(tree, 'Compléter mes informations fiscales')).toBe(false);
    findPressableWithText(tree, 'Terminer ma configuration').props.onPress();
    expect(mockPush).toHaveBeenCalledWith('/statut-verification');
  });

  it('V8 B2: a declared individual whose payout is held for « Virements » is sent to the setup page', () => {
    mockMe.repairer.fiscalCompleted = true;
    mockCommandesData = [
      {
        id: 'cmd-hold-2',
        demandeId: 'dem-2',
        demandeTitle: 'Trois touches muettes',
        counterpartyName: 'Alice',
        delivery: 'WORKSHOP',
        step: 'RELEASED',
        status: 'PAID',
        payoutCents: 8900,
        totalCents: 9500,
        createdAt: '2026-10-10T10:00:00.000Z',
        releasedAt: null,
        hasStripeTransfer: false,
        disputeOpen: false,
      },
    ];

    const tree = evaluateTree(Commandes());

    expect(findText(tree, 'Paiement en attente : 89 €')).toBe(true);
    expect(findText(tree, 'Votre paiement vous attend : terminez votre configuration pour le recevoir.')).toBe(true);
    expect(findText(tree, 'Compléter mes informations fiscales')).toBe(false);
    findPressableWithText(tree, 'Terminer ma configuration').props.onPress();
    expect(mockPush).toHaveBeenCalledWith('/statut-verification');
  });

  // V8 B2 (amended): a PRO's held payout now shows the setup card. What stays true is that he is
  // never sent to the PERSONAL fiscal form.
  it('does not send a PRO repairer to the personal fiscal form', () => {
    mockMe.repairer.kind = 'PRO';
    mockMe.repairer.fiscalCompleted = false;
    mockCommandesData = [
      {
        id: 'cmd-hold-pro',
        demandeId: 'dem-pro',
        demandeTitle: 'Batterie iPhone 13',
        counterpartyName: 'Bob',
        delivery: 'WORKSHOP',
        step: 'RELEASED',
        status: 'PAID',
        payoutCents: 5000,
        totalCents: 6000,
        createdAt: '2026-10-10T10:00:00.000Z',
        releasedAt: '2026-10-12T14:30:00.000Z',
        hasStripeTransfer: false,
        disputeOpen: false,
      },
    ];

    const tree = evaluateTree(Commandes());

    expect(findText(tree, 'Batterie iPhone 13')).toBe(true);
    expect(findText(tree, 'Compléter mes informations fiscales')).toBe(false);
    expect(findText(tree, 'Terminer ma configuration')).toBe(true);
  });
});
