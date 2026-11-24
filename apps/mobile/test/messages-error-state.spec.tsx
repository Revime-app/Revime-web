import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { palette, spacing } from '@revime/tokens';
import { createHookHarness } from './hook-harness';
import { findNodesByType, findTextNodes } from './render-tree';

// V8 E2: the help bubbles' hooks are not under test here.
vi.mock('../src/tour/use-tour', () => ({
  useTourPage: () => ({ scrollProps: {} }),
  useTourTarget: () => ({}),
  useTourActions: () => ({ replayCurrentMode: () => {} }),
}));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children, style }: any) => React.createElement('SafeAreaView', { style }, children),
}));

vi.mock('../src/theme', async () => {
  const tokens = await import('@revime/tokens');
  return { useTheme: () => ({ palette: tokens.palette, spacing: tokens.spacing }) };
});

vi.mock('../src/lib/use-tab-bar-space', () => ({ useTabBarSpace: () => 80 }));
vi.mock('../src/lib/when', () => ({ whenLabel: (d: string) => d }));
vi.mock('../src/components/ScreenMotif', () => ({
  ScreenMotif: (props: any) => React.createElement('ScreenMotif', props),
}));
vi.mock('../src/components/lottie/RevimeLoader', () => ({
  RevimeLoader: (props: any) => React.createElement('RevimeLoader', props),
}));
vi.mock('../src/components/RevimeRefreshScrollView', () => ({
  RevimeRefreshScrollView: ({ children, ...props }: any) =>
    React.createElement('RevimeRefreshScrollView', props, children),
}));

const mockUseConversations = vi.fn();
vi.mock('../src/lib/queries', () => ({ useConversations: () => mockUseConversations() }));

const mockSession: { me: any } = { me: null };
vi.mock('../src/lib/session', () => ({ useSessionContext: () => mockSession }));

import Messages from '../app/(tabs)/messages';

// Query states TanStack Query really produces.
const pending = { isPending: true, isError: false, data: undefined };
const failed = (data?: unknown[]) => ({ isPending: false, isError: true, data });
const loaded = (data: unknown[]) => ({ isPending: false, isError: false, data });

const conversation = (id: string, userRole: 'CLIENT' | 'REPAIRER') => ({
  id,
  counterpartName: `Contact ${id}`,
  avatarUrl: null,
  subject: 'Réparation iPhone',
  preview: 'Bonjour',
  lastMessageAt: '2026-10-12T12:00:00.000Z',
  unread: 0,
  userRole,
});

function render(query: object) {
  mockUseConversations.mockReturnValue({ refetch: vi.fn(), ...query });
  const element = Messages();
  return {
    texts: findTextNodes(element),
    rows: findNodesByType(element, 'MessageRow'),
    loaders: findNodesByType(element, 'RevimeLoader'),
    retry: findNodesByType(element, 'Button').find((b) => b.props.label === 'Réessayer'),
  };
}

describe('S2: Messages tab, a failed load is never an empty inbox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession.me = { profile: { activeMode: 'CLIENT' } };
    createHookHarness()();
  });

  it('shows the error card with a working Réessayer, and no empty state', () => {
    const refetch = vi.fn();
    const { texts, retry, rows } = render({ ...failed(), refetch });

    expect(texts).toContain('Impossible de charger vos conversations');
    expect(texts).not.toContain('Aucune conversation');
    expect(rows).toHaveLength(0);
    retry.props.onPress();
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('keeps the error card, and hides the stale list, when a refetch fails after a success', () => {
    const { texts, rows } = render(failed([conversation('a', 'CLIENT')]));

    expect(texts).toContain('Impossible de charger vos conversations');
    expect(rows).toHaveLength(0);
  });

  it('shows the loader while pending, with no error card and no empty state', () => {
    // What the retry looks like: with no data TanStack resets the query to pending and clears the error.
    const { texts, loaders, retry } = render(pending);

    expect(loaders.length).toBeGreaterThan(0);
    expect(retry).toBeUndefined();
    expect(texts).not.toContain('Aucune conversation');
  });

  it('shows the empty state only after a successful empty load', () => {
    const { texts, retry, loaders } = render(loaded([]));

    expect(texts).toContain('Aucune conversation');
    expect(retry).toBeUndefined();
    expect(loaders).toHaveLength(0);
  });

  describe('role filter', () => {
    const both = [conversation('as-client', 'CLIENT'), conversation('as-repairer', 'REPAIRER')];

    it('shows only the active mode\'s conversations', () => {
      const { rows } = render(loaded(both));

      expect(rows.map((r) => r.props.name)).toEqual(['Contact as-client']);
    });

    it('does not guess a mode while `me` is unknown: nothing is hidden by role', () => {
      // The S1 knock-on: `/users/me` failed, so the screen used to assume CLIENT and hid the
      // réparateur-side conversations behind « Aucune conversation ».
      mockSession.me = null;
      const { rows, texts } = render(loaded([conversation('as-repairer', 'REPAIRER')]));

      expect(rows).toHaveLength(1);
      expect(texts).not.toContain('Aucune conversation');
    });

    it('says Aucune conversation when every conversation belongs to the other mode (by design)', () => {
      // Same screen the client saw after the retry. Pinned so a change to it is a decision.
      const { texts, rows } = render(loaded([conversation('as-repairer', 'REPAIRER')]));

      expect(rows).toHaveLength(0);
      expect(texts).toContain('Aucune conversation');
    });
  });
});
