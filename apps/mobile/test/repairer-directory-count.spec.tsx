import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mocks
const mockPush = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock('../src/lib/auth-client', () => ({
  authClient: {},
}));

vi.mock('../src/lib/api', () => ({
  ApiError: class ApiError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
}));

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette: {
      paper: '#FFFFFF',
      ink: '#101828',
      line: '#E4E7EC',
      muted: '#667085',
      mist: '#F2F4F7',
      faint: '#98A2B3',
      red: '#D92D20',
    },
    radii: { card: 20, pill: 999, field: 12 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
    type: { body: { size: 15 } },
  }),
}));

vi.mock('../src/lib/use-tab-bar-space', () => ({
  useTabBarSpace: () => 80,
}));

vi.mock('../src/lib/use-debounced', () => ({
  useDebounced: (v: string) => v,
}));

const mockSession = {
  me: { id: 'u1', profile: { activeMode: 'CLIENT' } },
  loading: false,
};
vi.mock('../src/lib/session', () => ({
  useSessionContext: () => mockSession,
}));

vi.mock('../src/components/Card', () => ({
  Card: ({ children }: any) => React.createElement('Card', null, children),
}));

vi.mock('../src/components/Badge', () => ({
  Badge: (props: any) => React.createElement('Badge', props),
}));

vi.mock('../src/components/Chip', () => ({
  Chip: (props: any) => React.createElement('Chip', props),
}));

vi.mock('../src/components/Initials', () => ({
  Initials: (props: any) => React.createElement('Initials', props),
}));

vi.mock('../src/components/FavoriteHeart', () => ({
  FavoriteHeart: (props: any) => React.createElement('FavoriteHeart', props),
}));

vi.mock('../src/components/lottie/RevimeLoader', () => ({
  RevimeLoader: (props: any) => React.createElement('RevimeLoader', props),
}));

vi.mock('../src/components/RevimeRefreshScrollView', () => ({
  RevimeRefreshScrollView: ({ children, ...props }: any) =>
    React.createElement('RevimeRefreshScrollView', props, children),
}));

vi.mock('../src/components/DirectoryFilterSheet', () => ({
  DirectoryFilterSheet: (props: any) => React.createElement('DirectoryFilterSheet', props),
  NO_FILTERS: { near: '', radiusKm: null, sort: 'az', minRating: null, categoryId: null },
  activeFilterCount: () => 0,
}));

const mockUseRepairers = vi.fn();
const mockUseFavoriteRepairers = vi.fn();
const mockUseToggleFavoriteRepairer = vi.fn();
const mockUseCategories = vi.fn();

vi.mock('../src/lib/queries', () => ({
  useRepairers: (params: any) => mockUseRepairers(params),
  useFavoriteRepairers: () => mockUseFavoriteRepairers(),
  useToggleFavoriteRepairer: () => mockUseToggleFavoriteRepairer(),
  useCategories: () => mockUseCategories(),
}));

import { RepairerDirectory } from '../src/components/RepairerDirectory';

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

describe('D1: RepairerDirectory Loading Counter Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseFavoriteRepairers.mockReturnValue({ data: [] });
    mockUseToggleFavoriteRepairer.mockReturnValue({ mutate: vi.fn() });
    mockUseCategories.mockReturnValue({ data: [] });

    // React 19 test dispatcher
    const clientInternals =
      (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE ||
      (React as any).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_OR_YOU_WILL_BE_FIRED;
    if (clientInternals) {
      clientInternals.H = {
        useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, vi.fn()],
        useCallback: (fn: any) => fn,
        useMemo: (fn: any) => fn(),
        useRef: (initial: any) => ({ current: initial }),
        useEffect: vi.fn(),
      };
    }
  });

  it('does NOT render "0 réparateurs" when query is pending/loading', () => {
    mockUseRepairers.mockReturnValue({
      isPending: true,
      isError: false,
      data: undefined,
      isRefetching: false,
    });

    const vdom = RepairerDirectory();
    const texts = findTextNodes(vdom);

    // Must NOT contain "0 réparateurs"
    expect(texts.some((t) => t.includes('0 réparateur'))).toBe(false);
    expect(texts.some((t) => t.includes('réparateur'))).toBe(false);
  });

  it('renders count when data has loaded with results', () => {
    mockUseRepairers.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          userId: 'rep-1',
          displayName: 'Atelier Jean',
          avatarUrl: null,
          rating: 4.8,
          reviewCount: 12,
          serviceAreaLabel: 'Paris 17e',
          distanceKm: 2.5,
          verifiedBadge: null,
        },
      ],
      isRefetching: false,
    });

    const vdom = RepairerDirectory();
    const texts = findTextNodes(vdom);

    expect(texts.some((t) => t.includes('1 réparateur'))).toBe(true);
  });

  it('renders "0 réparateurs" once query completes and result is genuinely empty', () => {
    mockUseRepairers.mockReturnValue({
      isPending: false,
      isError: false,
      data: [],
      isRefetching: false,
    });

    const vdom = RepairerDirectory();
    const texts = findTextNodes(vdom);

    expect(texts.some((t) => t.includes('0 réparateurs'))).toBe(true);
  });

  it('does NOT render count when query has an error', () => {
    mockUseRepairers.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('Network error'),
      data: undefined,
      isRefetching: false,
    });

    const vdom = RepairerDirectory();
    const texts = findTextNodes(vdom);

    expect(texts.some((t) => t.includes('0 réparateur'))).toBe(false);
  });

  it('does NOT render count when a refetch failed over stale data', () => {
    mockUseRepairers.mockReturnValue({
      isPending: false,
      isError: true,
      error: new Error('Network error'),
      data: [{ userId: 'r1' }, { userId: 'r2' }],
      isRefetching: false,
    });

    const texts = findTextNodes(RepairerDirectory());

    expect(texts.some((t) => /^\d+ réparateur/.test(t))).toBe(false);
  });

  it('keeps existing count visible during background refetches without flickering', () => {
    mockUseRepairers.mockReturnValue({
      isPending: false,
      isError: false,
      data: [
        {
          userId: 'rep-1',
          displayName: 'Atelier Jean',
          avatarUrl: null,
          rating: 4.8,
          reviewCount: 12,
          serviceAreaLabel: 'Paris 17e',
          distanceKm: 2.5,
          verifiedBadge: null,
        },
      ],
      isRefetching: true,
    });

    const vdom = RepairerDirectory();
    const texts = findTextNodes(vdom);

    expect(texts.some((t) => t.includes('1 réparateur'))).toBe(true);
  });
});
