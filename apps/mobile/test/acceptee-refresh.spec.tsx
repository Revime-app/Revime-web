import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockParams = vi.fn();
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams(),
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: any) => React.createElement('SafeAreaView', { style }, children),
}));

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      paper: '#FFFFFF',
      ink: '#101828',
      line: '#E4E7EC',
      muted: '#667085',
      green: '#12B76A',
      amber: '#F79009',
      red: '#D92D20',
    },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 },
    type: { screenTitle: { size: 24 } },
  }),
}));

const mockUseCommande = vi.fn();
vi.mock('../src/lib/queries', () => ({
  useCommande: (...args: any[]) => mockUseCommande(...args),
}));

vi.mock('../src/components/lottie/RevimeLoader', () => ({
  RevimeLoader: (props: any) => React.createElement('RevimeLoader', props),
}));

import Acceptee from '../app/demande/[id]/acceptee';
import { PENDING_POLL_CEILING_MS } from '../src/lib/pending-confirmation';
import { SUPPORT_EMAIL } from '../src/lib/support';
import { createHookHarness } from './hook-harness';

function makeCommande(status: string, step: string | null = null) {
  return {
    id: 'commande-456',
    status,
    step,
    disputeOpen: false,
    demandeTitle: 'Réparation iPhone 13',
    repairCents: 5000,
    shippingCents: 0,
    protectionCents: 500,
    insuranceCents: 0,
    totalCents: 5500,
    repairerName: 'Atelier Express',
    delivery: 'HAND_DELIVERY',
  };
}

function query(overrides: Record<string, unknown> = {}) {
  return {
    data: makeCommande('PENDING_PAYMENT'),
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** Calls the screen the way React would on each render: same hook slots, fresh element tree. */
function mount() {
  const reset = createHookHarness();
  return () => {
    reset();
    return Acceptee() as any;
  };
}

function walk(node: any, visit: (n: any) => void) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) return node.forEach((n) => walk(n, visit));
  visit(node);
  walk(node.props?.children, visit);
}

function textOf(node: any): string {
  const parts: string[] = [];
  const collect = (n: any) => {
    if (typeof n === 'string' || typeof n === 'number') parts.push(String(n));
    else if (Array.isArray(n)) n.forEach(collect);
    else if (n && typeof n === 'object') collect(n.props?.children);
  };
  collect(node);
  return parts.join(' ');
}

function findByLabel(tree: any, label: string): any | undefined {
  let found: any;
  walk(tree, (n) => {
    if (n.props?.label === label) found = n;
  });
  return found;
}

describe('CF6-05: confirmation screen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockParams.mockReturnValue({ id: 'demande-123', c: 'commande-456' });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('pull-to-refresh', () => {
    it('gives the scroll view no `refreshing` prop, so a background poll (isRefetching) cannot drive the spinner', () => {
      mockUseCommande.mockReturnValue(query({ isRefetching: true }));
      const scroll = mount()().props.children;
      expect('refreshing' in scroll.props).toBe(false);
    });

    it('hands it an onRefresh that returns the refetch promise, so the spinner lasts exactly the pull', async () => {
      const refetch = vi.fn().mockResolvedValue(undefined);
      mockUseCommande.mockReturnValue(query({ refetch }));

      const result = mount()().props.children.props.onRefresh();

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('polling', () => {
    it('hands useCommande an interval that polls while pending and stops once the ceiling passed', () => {
      mockUseCommande.mockReturnValue(query());
      const render = mount();
      render();

      const options = mockUseCommande.mock.calls[0]?.[1];
      const pendingQuery = { state: { data: { status: 'PENDING_PAYMENT' } } };
      expect(options.refetchInterval(pendingQuery)).toBe(2_000);
      expect(options.refetchInterval({ state: { data: { status: 'PAID' } } })).toBe(false);

      vi.advanceTimersByTime(PENDING_POLL_CEILING_MS);
      render();
      expect(options.refetchInterval(pendingQuery)).toBe(false);
    });
  });

  describe('pending copy', () => {
    it('does not claim the bank accepted the payment, and does not tell the user to pull down', () => {
      mockUseCommande.mockReturnValue(query());
      const text = textOf(mount()());

      expect(text).toContain('Paiement en cours de confirmation');
      expect(text).toContain('se met à jour toute seule');
      expect(text).not.toContain('Votre banque a accepté');
      expect(text).not.toContain('tirez vers le bas');
    });

    it('after the ceiling it says it is taking longer, gives the support address and offers « Actualiser »', () => {
      const refetch = vi.fn().mockResolvedValue(undefined);
      mockUseCommande.mockReturnValue(query({ refetch }));
      const render = mount();
      render();

      vi.advanceTimersByTime(PENDING_POLL_CEILING_MS);
      const tree = render();
      const text = textOf(tree);

      expect(text).toContain('plus de temps que prévu');
      expect(text).toContain(SUPPORT_EMAIL);
      expect(text).not.toContain('toute seule');
      expect(findByLabel(tree, 'Actualiser')).toBeDefined();
    });

    it('« Actualiser » refetches and starts a fresh polling window', async () => {
      const refetch = vi.fn().mockResolvedValue(undefined);
      mockUseCommande.mockReturnValue(query({ refetch }));
      const render = mount();
      render();
      vi.advanceTimersByTime(PENDING_POLL_CEILING_MS);

      await findByLabel(render(), 'Actualiser').props.onPress();

      expect(refetch).toHaveBeenCalledTimes(1);
      expect(textOf(render())).toContain('toute seule');
    });

    it('offers no « Actualiser » while the first window is still running', () => {
      mockUseCommande.mockReturnValue(query());
      expect(findByLabel(mount()(), 'Actualiser')).toBeUndefined();
    });
  });

  describe('missing commande id', () => {
    it('shows the error card instead of a loader that can never finish', () => {
      mockParams.mockReturnValue({ id: 'demande-123' });
      mockUseCommande.mockReturnValue(query({ data: undefined, isPending: true }));
      const tree = mount()();
      const text = textOf(tree);

      expect(text).toContain('Impossible de confirmer le paiement');
      let loaders = 0;
      walk(tree, (n) => {
        if (n.type === 'RevimeLoader' || n.type?.name === 'RevimeLoader') loaders += 1;
      });
      expect(loaders).toBe(0);
    });
  });

  describe('settled states', () => {
    it('renders PAID with the receipt', () => {
      mockUseCommande.mockReturnValue(query({ data: makeCommande('PAID', 'SELECT_OFFER') }));
      const text = textOf(mount()());
      expect(text).toContain('Paiement effectué');
      expect(text).toContain('DÉTAIL DU PAIEMENT');
      expect(text).toContain('Atelier Express');
    });

    it('renders REFUNDED', () => {
      mockUseCommande.mockReturnValue(query({ data: makeCommande('REFUNDED') }));
      expect(textOf(mount()())).toContain('Paiement remboursé');
    });

    it('renders ABANDONED', () => {
      mockUseCommande.mockReturnValue(query({ data: makeCommande('ABANDONED') }));
      expect(textOf(mount()())).toContain("Le paiement n'a pas abouti");
    });
  });
});
