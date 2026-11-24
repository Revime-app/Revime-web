import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      navy: '#25324F',
      red: '#D92D20',
      paper: '#FFFFFF',
      line: '#E4E7EC',
      mist: '#F2F4F7',
      ink: '#101828',
      muted: '#667085',
      faint: '#98A2B3',
    },
    accent: {
      accent: '#25324F',
    },
    radii: { card: 16 },
    spacing: { md: 16, xl: 32 },
  }),
}));

vi.mock('../src/icons', () => ({
  IconCamera: (props: any) => React.createElement('IconCamera', props),
  IconLocation: (props: any) => React.createElement('IconLocation', props),
}));

import { NearbyDemandeRow } from '../src/components/NearbyDemandeRow';
import type { FeedItem } from '@revime/shared';

function findTextNodes(node: any): string[] {
  if (!node) return [];
  if (Array.isArray(node)) {
    return node.flatMap((item) => findTextNodes(item));
  }
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  const results: string[] = [];
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...findTextNodes(child));
    }
  } else if (children && typeof children === 'object') {
    results.push(...findTextNodes(children));
  } else if (typeof children === 'string' || typeof children === 'number') {
    results.push(String(children));
  }
  return results;
}

const mockBaseDemande: FeedItem = {
  id: 'demande-1',
  title: 'Écran iPhone 13 cassé',
  brand: 'Apple',
  model: 'iPhone 13',
  categoryLabelFr: 'Smartphone',
  mode: 'OFFERS',
  budgetCents: null,
  distanceKm: 4.2,
  createdAt: new Date('2026-10-17T10:00:00Z').toISOString(),
  photoUrl: null,
  offerCount: 0,
  hasMyOffer: false,
  locationLabel: 'Paris 75017',
};

describe('D3: NearbyDemandeRow Status Label & Card Formatting', () => {
  it('renders "Ouverte" when budgetCents is null instead of truncated "Recherche d’offres"', () => {
    const vdom = NearbyDemandeRow({
      items: [mockBaseDemande],
      isPending: false,
      isError: false,
      located: true,
      now: new Date('2026-10-17T10:15:00Z'),
      onOpenDemande: vi.fn(),
      onSeeAll: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts).toContain('Ouverte');
    expect(texts.some((t) => t.includes("Recherche d'o"))).toBe(false);
    expect(texts.some((t) => t.includes('Recherche d’offres'))).toBe(false);
  });

  it('renders the formatted price when budgetCents is set', () => {
    const vdom = NearbyDemandeRow({
      items: [{ ...mockBaseDemande, id: 'demande-2', mode: 'BUDGET', budgetCents: 4500 }],
      isPending: false,
      isError: false,
      located: true,
      now: new Date('2026-10-17T10:15:00Z'),
      onOpenDemande: vi.fn(),
      onSeeAll: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts).toContain('45 €');
    expect(texts.includes('Ouverte')).toBe(false);
  });

  it('renders "0 €" when budgetCents is explicitly 0', () => {
    const vdom = NearbyDemandeRow({
      items: [{ ...mockBaseDemande, id: 'demande-3', mode: 'BUDGET', budgetCents: 0 }],
      isPending: false,
      isError: false,
      located: true,
      now: new Date('2026-10-17T10:15:00Z'),
      onOpenDemande: vi.fn(),
      onSeeAll: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts).toContain('0 €');
    expect(texts.includes('Ouverte')).toBe(false);
  });

  it('displays loading state correctly', () => {
    const vdom = NearbyDemandeRow({
      items: undefined,
      isPending: true,
      isError: false,
      located: true,
      now: new Date(),
      onOpenDemande: vi.fn(),
      onSeeAll: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts).toContain('Chargement…');
  });

  it('displays error state correctly', () => {
    const vdom = NearbyDemandeRow({
      items: undefined,
      isPending: false,
      isError: true,
      located: false,
      now: new Date(),
      onOpenDemande: vi.fn(),
      onSeeAll: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts).toContain('Impossible de charger les demandes. Tirez vers le bas pour réessayer.');
  });

  it('displays empty state when no cards exist', () => {
    const vdom = NearbyDemandeRow({
      items: [],
      isPending: false,
      isError: false,
      located: false,
      now: new Date(),
      onOpenDemande: vi.fn(),
      onSeeAll: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts).toContain('Aucune demande ouverte pour le moment.');
  });
});
