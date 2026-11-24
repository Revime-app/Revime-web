import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock theme returning real tokens
vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      navy: '#25324f',
      navySoft: '#eef2f8',
      ink: '#141414',
      paper: '#ffffff',
      muted: '#6b7280',
    },
    radii: { card: 20 },
    spacing: { xl: 24 },
  }),
}));

// Mock icons
vi.mock('../src/icons', () => ({
  IconIdea: ({ size, color }: any) => React.createElement('IconIdea', { size, color }),
}));

// Mock queries
const mockUseDailyTip = vi.fn();
vi.mock('../src/lib/queries', () => ({
  useDailyTip: (mode: 'CLIENT' | 'REPAIRER' | 'ALL') => mockUseDailyTip(mode),
}));

import { Linking } from 'react-native';
import { TipCard } from '../src/components/TipCard';

/** Every element of the rendered tree, depth first. */
function elements(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const children = node.props?.children;
  const list = Array.isArray(children) ? children : children ? [children] : [];
  return [node, ...list.flatMap(elements)];
}

function findTextNodes(node: any): string[] {
  if (!node) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  const results: string[] = [];
  const children = node.props?.children;
  if (Array.isArray(children)) {
    for (const child of children) {
      results.push(...findTextNodes(child));
    }
  } else if (children) {
    results.push(...findTextNodes(children));
  }
  return results;
}

describe('CF6-17: TipCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null while loading', () => {
    mockUseDailyTip.mockReturnValue({ isLoading: true, data: null });
    const element = TipCard({ mode: 'REPAIRER' });
    expect(element).toBeNull();
    expect(mockUseDailyTip).toHaveBeenCalledWith('REPAIRER');
  });

  it('returns null when API returns null (all tips deleted or disabled)', () => {
    mockUseDailyTip.mockReturnValue({ isLoading: false, data: null });
    const element = TipCard({ mode: 'REPAIRER' });
    expect(element).toBeNull();
  });

  it('returns null when data has empty text', () => {
    mockUseDailyTip.mockReturnValue({ isLoading: false, data: { id: '1', text: '' } });
    const element = TipCard({ mode: 'CLIENT' });
    expect(element).toBeNull();
  });

  it('renders tip text when active tip is returned for REPAIRER', () => {
    mockUseDailyTip.mockReturnValue({
      isLoading: false,
      data: {
        id: 'c0000000-0000-4000-8000-000000000001',
        text: 'Texte du conseil réparateur',
        category: 'REPAIRER',
      },
    });

    const element = TipCard({ mode: 'REPAIRER' });
    expect(element).not.toBeNull();
    const texts = findTextNodes(element);
    expect(texts).toContain('Conseil du jour');
    expect(texts).toContain('Texte du conseil réparateur');
  });

  it('shows no image and no link for a tip that has none', () => {
    mockUseDailyTip.mockReturnValue({
      isLoading: false,
      data: { id: '1', text: 'Texte simple', category: 'ALL', imageUrl: null, linkUrl: null },
    });
    const tree = elements(TipCard({ mode: 'CLIENT' }));
    expect(tree.some((e) => e.props?.accessibilityRole === 'link')).toBe(false);
    expect(tree.some((e) => e.props?.source?.uri)).toBe(false);
  });

  it('P23: shows the tip image and opens the tip link, both https', () => {
    mockUseDailyTip.mockReturnValue({
      isLoading: false,
      data: {
        id: '1',
        text: 'Texte avec média',
        category: 'ALL',
        imageUrl: 'https://img.revime.fr/a.jpg',
        linkUrl: 'https://revime.fr/guides/batterie',
      },
    });
    const open = vi.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
    const tree = elements(TipCard({ mode: 'CLIENT' }));

    const image = tree.find((e) => e.props?.source?.uri);
    expect(image.props.source.uri).toBe('https://img.revime.fr/a.jpg');
    const link = tree.find((e) => e.props?.accessibilityRole === 'link');
    expect(findTextNodes(link)).toContain('En savoir plus');
    link.props.onPress();
    expect(open).toHaveBeenCalledWith('https://revime.fr/guides/batterie');
  });

  it('P23: never opens or draws an address that is not https (an old row, a tampered response)', () => {
    mockUseDailyTip.mockReturnValue({
      isLoading: false,
      data: {
        id: '1',
        text: 'Texte piégé',
        category: 'ALL',
        imageUrl: 'data:text/html,x',
        linkUrl: 'javascript:alert(1)',
      },
    });
    const tree = elements(TipCard({ mode: 'CLIENT' }));
    expect(tree.some((e) => e.props?.accessibilityRole === 'link')).toBe(false);
    expect(tree.some((e) => e.props?.source?.uri)).toBe(false);
  });

  it('renders tip text when active tip is returned for CLIENT', () => {
    mockUseDailyTip.mockReturnValue({
      isLoading: false,
      data: {
        id: 'c0000000-0000-4000-8000-000000000002',
        text: 'Texte du conseil client',
        category: 'CLIENT',
      },
    });

    const element = TipCard({ mode: 'CLIENT' });
    expect(element).not.toBeNull();
    const texts = findTextNodes(element);
    expect(texts).toContain('Conseil du jour');
    expect(texts).toContain('Texte du conseil client');
    expect(mockUseDailyTip).toHaveBeenCalledWith('CLIENT');
  });
});
