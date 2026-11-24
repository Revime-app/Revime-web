import React from 'react';
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      navy: '#25324F',
      red: '#D92D20',
      paper: '#FFFFFF',
      ink: '#101828',
    },
    radii: { card: 20 },
    spacing: { lg: 24 },
  }),
}));

vi.mock('../src/icons', () => ({
  IconBriefcase: (props: any) => React.createElement('IconBriefcase', props),
  IconChevronRight: (props: any) => React.createElement('IconChevronRight', props),
}));

import { RepairerActivityCard } from '../src/components/RepairerActivityCard';

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

describe('D2: RepairerActivityCard Empty Rating Prevention', () => {
  it('hides rating display entirely when rating is null (no reviews)', () => {
    const vdom = RepairerActivityCard({
      offersThisMonth: 3,
      activeRepairs: 2,
      rating: null,
      isPending: false,
      onPress: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    // Should display repair count
    expect(texts).toContain('2 réparations en cours');
    // Must NOT contain "- ★" or any star rating
    expect(texts.some((t) => t.includes('★'))).toBe(false);
    expect(texts.some((t) => t.includes('- ★'))).toBe(false);
  });

  it('hides rating display when rating is 0 or less', () => {
    const vdom = RepairerActivityCard({
      offersThisMonth: 1,
      activeRepairs: 1,
      rating: 0,
      isPending: false,
      onPress: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts).toContain('1 réparation en cours');
    expect(texts.some((t) => t.includes('★'))).toBe(false);
  });

  it('renders rating with star when rating is present and positive', () => {
    const vdom = RepairerActivityCard({
      offersThisMonth: 5,
      activeRepairs: 2,
      rating: 4.8,
      isPending: false,
      onPress: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts.some((t) => t.includes('2 réparations en cours · 4,8 ★'))).toBe(true);
  });

  it('renders "-" for meta when isPending is true', () => {
    const vdom = RepairerActivityCard({
      offersThisMonth: 0,
      activeRepairs: 0,
      rating: 4.5,
      isPending: true,
      onPress: vi.fn(),
    });

    const texts = findTextNodes(vdom);
    expect(texts.some((t) => t.includes('★'))).toBe(false);
    expect(texts).toContain('-');
  });
});
