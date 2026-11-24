import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHookHarness } from './hook-harness';
import { findNodes, findNodesByType, findTextNodes } from './render-tree';

const mockPush = vi.fn();
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));

const mockHandoff = vi.fn();
vi.mock('../src/lib/stripe-handoff', () => ({
  openStripeHandoff: (...args: unknown[]) => mockHandoff(...args),
}));

vi.mock('@stripe/stripe-react-native', () => ({
  loadConnectAndInitialize: vi.fn(() => ({ id: 'mock-instance' })),
  ConnectComponentsProvider: ({ children }: any) =>
    React.createElement('ConnectComponentsProvider', null, children),
  ConnectAccountOnboarding: (props: any) => React.createElement('ConnectAccountOnboarding', props),
}));

// V7 U2b: no step-up in these specs; the wrapper passes the call straight through.
vi.mock('../src/lib/step-up-context', () => ({
  useStepUp: () => async <T,>(call: () => Promise<T>) => ({ ok: true as const, value: await call() }),
}));
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

vi.mock('../src/lib/session', () => ({
  useSessionContext: () => ({ me: { id: 'user-1' }, refresh: vi.fn(), loading: false }),
}));

const mockMutateAsync = vi.fn();
vi.mock('../src/lib/queries', () => ({
  useStartConnectOnboarding: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  queryKeys: { connectStatus: ['connectStatus'] },
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { ConnectOnboardingSheet } from '../src/components/ConnectOnboardingSheet';
import {
  useConnectOnboarding,
  CONNECT_ONBOARDING_TIMEOUT_MS as TIMEOUT,
} from '../src/lib/use-connect-onboarding';

const attempt = (n: number) => ({
  publishableKey: 'pk_test',
  clientSecret: `sec_${n}`,
  url: `https://connect.stripe.com/setup/${n}`,
});

function setup() {
  const reset = createHookHarness();
  const read = () => {
    reset();
    return useConnectOnboarding();
  };
  return { read, unmount: reset.unmount, hook: read() };
}

describe('S3: the sheet', () => {
  const props = {
    visible: true,
    connectInstance: { id: 'mock' } as any,
    onExit: vi.fn(),
    onRetry: vi.fn(),
    onDismiss: vi.fn(),
    onLoadError: vi.fn(),
    onPageDidLoad: vi.fn(),
  };

  beforeEach(() => vi.clearAllMocks());

  it("renders Stripe's component, and no timeout screen, while it is loading", () => {
    const element = ConnectOnboardingSheet(props);

    expect(findNodesByType(element, 'ConnectAccountOnboarding')).toHaveLength(1);
    expect(findTextNodes(element)).not.toContain('La page ne répond pas');
  });

  it('replaces it with « La page ne répond pas » and a working « Réessayer » once timed out', () => {
    const element = ConnectOnboardingSheet({ ...props, isTimedOut: true });

    expect(findTextNodes(element)).toContain('La page ne répond pas');
    expect(findNodesByType(element, 'ConnectAccountOnboarding')).toHaveLength(0);
    findNodesByType(element, 'Button')
      .find((b) => b.props.label === 'Réessayer')
      .props.onPress();
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  it('closes the timed-out screen with onDismiss, never onExit (which routes to « Informations envoyées »)', () => {
    const element = ConnectOnboardingSheet({ ...props, isTimedOut: true });

    findNodes(element, (e) => e.props?.accessibilityLabel === 'Fermer')[0].props.onPress();
    findNodesByType(element, 'Modal')[0].props.onRequestClose();

    expect(props.onDismiss).toHaveBeenCalledTimes(2);
    expect(props.onExit).not.toHaveBeenCalled();
  });
});

describe('S3: useConnectOnboarding ceilings and hand-over', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockHandoff.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('times the sheet out after 15 s without a page load', async () => {
    mockMutateAsync.mockResolvedValueOnce(attempt(1));
    const { read, hook } = setup();
    await hook.startOnboarding();

    vi.advanceTimersByTime(TIMEOUT - 1);
    expect(read().isTimedOut).toBe(false);
    vi.advanceTimersByTime(1);
    expect(read()).toMatchObject({ isTimedOut: true, visible: true });
  });

  it('never times out a page that loaded', async () => {
    mockMutateAsync.mockResolvedValueOnce(attempt(1));
    const { read, hook } = setup();
    await hook.startOnboarding();

    vi.advanceTimersByTime(5_000);
    read().handlePageDidLoad();
    vi.advanceTimersByTime(60_000);

    expect(read().isTimedOut).toBe(false);
  });

  it('« Réessayer » starts a fresh attempt and leaves the timed-out screen', async () => {
    mockMutateAsync.mockResolvedValue(attempt(1));
    const { read, hook } = setup();
    await hook.startOnboarding();
    vi.advanceTimersByTime(TIMEOUT);

    await read().handleRetry();

    expect(mockMutateAsync).toHaveBeenCalledTimes(2);
    expect(read()).toMatchObject({ isTimedOut: false, visible: true });
    expect(mockHandoff).not.toHaveBeenCalled();
  });

  it("hands a sheet that hangs TWICE over to the hosted flow, with the second attempt's link", async () => {
    mockMutateAsync.mockResolvedValueOnce(attempt(1)).mockResolvedValueOnce(attempt(2));
    const { read, hook } = setup();
    await hook.startOnboarding();
    vi.advanceTimersByTime(TIMEOUT);
    await read().handleRetry();
    vi.advanceTimersByTime(TIMEOUT);
    await vi.advanceTimersByTimeAsync(0);

    expect(mockHandoff).toHaveBeenCalledTimes(1);
    expect(mockHandoff.mock.calls[0][0]).toBe(attempt(2).url);
    expect(read()).toMatchObject({ isTimedOut: false, visible: false, connectInstance: null });
  });

  it("counts timeouts from the user's own start: after a hand-over, starting again gets the retry screen first", async () => {
    mockMutateAsync.mockResolvedValue(attempt(1));
    const { read, hook } = setup();
    await hook.startOnboarding();
    vi.advanceTimersByTime(TIMEOUT);
    await read().handleRetry();
    vi.advanceTimersByTime(TIMEOUT);
    await vi.advanceTimersByTimeAsync(0);
    expect(mockHandoff).toHaveBeenCalledTimes(1);

    await read().startOnboarding();
    vi.advanceTimersByTime(TIMEOUT);

    expect(read().isTimedOut).toBe(true);
    expect(mockHandoff).toHaveBeenCalledTimes(1);
  });

  it('closing the timed-out screen routes nowhere', async () => {
    mockMutateAsync.mockResolvedValueOnce(attempt(1));
    const { read, hook } = setup();
    await hook.startOnboarding();
    vi.advanceTimersByTime(TIMEOUT);

    read().handleDismiss();

    expect(read()).toMatchObject({ isTimedOut: false, visible: false });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('a real exit still lands on /connect/retour', async () => {
    mockMutateAsync.mockResolvedValueOnce(attempt(1));
    const { read, hook } = setup();
    await hook.startOnboarding();

    await read().handleExit();

    expect(mockPush).toHaveBeenCalledWith('/connect/retour');
    expect(read().visible).toBe(false);
  });

  it('gives up on an API call that hangs, says so, and ignores its late answer', async () => {
    let answer!: (v: unknown) => void;
    mockMutateAsync.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const { read, hook } = setup();
    const started = hook.startOnboarding();

    await vi.advanceTimersByTimeAsync(TIMEOUT);
    await started;
    expect(read().error).toBe('Le service ne répond pas. Vérifiez votre connexion et réessayez.');

    answer(attempt(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(read()).toMatchObject({ visible: false, connectInstance: null });
    expect(mockHandoff).not.toHaveBeenCalled();
  });

  it('stops the timer on a load error, on unmount and on exit', async () => {
    mockMutateAsync.mockResolvedValue(attempt(1));

    for (const stop of ['loadError', 'unmount', 'exit'] as const) {
      const { read, unmount, hook } = setup();
      await hook.startOnboarding();
      if (stop === 'loadError') await read().handleLoadError(new Error('x'));
      if (stop === 'unmount') unmount();
      if (stop === 'exit') await read().handleExit();

      vi.advanceTimersByTime(TIMEOUT * 2);
      expect(read().isTimedOut, stop).toBe(false);
    }
    // A load error is the one stop that hands over to the hosted flow.
    expect(mockHandoff).toHaveBeenCalledTimes(1);
  });
});
