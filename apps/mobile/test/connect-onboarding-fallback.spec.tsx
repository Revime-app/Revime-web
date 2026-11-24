import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockPush = vi.fn();
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

const mockHandoff = vi.fn();
vi.mock('../src/lib/stripe-handoff', () => ({
  openStripeHandoff: (...args: unknown[]) => mockHandoff(...args),
}));

const mockLoadConnect = vi.fn();
vi.mock('@stripe/stripe-react-native', () => ({
  loadConnectAndInitialize: (...args: unknown[]) => mockLoadConnect(...args),
}));

// V7 U2b: no step-up in these specs; the wrapper passes the call straight through.
vi.mock('../src/lib/step-up-context', () => ({
  useStepUp: () => async <T,>(call: () => Promise<T>) => ({ ok: true as const, value: await call() }),
}));
vi.mock('../src/lib/auth-client', () => ({
  authClient: { useSession: vi.fn(), getSession: vi.fn() },
}));

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

import { useConnectOnboarding } from '../src/lib/use-connect-onboarding';
import { ApiError } from '../src/lib/api';
import { createHookHarness } from './hook-harness';

const FIRST = {
  publishableKey: 'pk_test',
  clientSecret: 'sec_1',
  url: 'https://connect.stripe.com/setup/first',
};
const SECOND = {
  publishableKey: 'pk_test',
  clientSecret: 'sec_2',
  url: 'https://connect.stripe.com/setup/second',
};

function setup() {
  const reset = createHookHarness();
  const read = () => {
    reset();
    return useConnectOnboarding();
  };
  return { read, hook: read() };
}

describe('useConnectOnboarding fallbacks (CF6-02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockLoadConnect.mockReturnValue({ id: 'instance' });
    mockHandoff.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('falls back to the hosted flow with the URL it already has, without a second API call', async () => {
    mockMutateAsync.mockResolvedValueOnce(FIRST);
    mockLoadConnect.mockImplementationOnce(() => {
      throw new Error('init failed');
    });
    const { read, hook } = setup();

    await hook.startOnboarding();

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockHandoff).toHaveBeenCalledTimes(1);
    expect(mockHandoff.mock.calls[0][0]).toBe(FIRST.url);
    expect(read().error).toBeNull();
  });

  it('does not open a stale hosted link when a later attempt fails at the API, and shows the API message', async () => {
    mockMutateAsync.mockResolvedValueOnce(FIRST);
    const { read, hook } = setup();
    await hook.startOnboarding();
    expect(read().visible).toBe(true);

    mockMutateAsync.mockRejectedValueOnce(
      new ApiError('FORBIDDEN' as any, 'Informations fiscales requises.'),
    );
    await read().handleRetry();

    expect(mockHandoff).not.toHaveBeenCalled();
    expect(read().error).toBe('Informations fiscales requises.');
  });

  it('uses the NEW url, not the first one, when a later attempt succeeds then fails to initialise', async () => {
    mockMutateAsync.mockResolvedValueOnce(FIRST);
    const { read, hook } = setup();
    await hook.startOnboarding();

    mockMutateAsync.mockResolvedValueOnce(SECOND);
    mockLoadConnect.mockImplementationOnce(() => {
      throw new Error('init failed');
    });
    await read().handleRetry();

    expect(mockHandoff).toHaveBeenCalledTimes(1);
    expect(mockHandoff.mock.calls[0][0]).toBe(SECOND.url);
  });

  it('handleLoadError closes the sheet and opens the hosted flow with the cached URL', async () => {
    mockMutateAsync.mockResolvedValueOnce(FIRST);
    const { read, hook } = setup();
    await hook.startOnboarding();
    expect(read().visible).toBe(true);

    await read().handleLoadError({ error: { type: 'x', message: 'y' } });

    const after = read();
    expect(after.visible).toBe(false);
    expect(after.connectInstance).toBeNull();
    expect(mockHandoff).toHaveBeenCalledTimes(1);
    expect(mockHandoff.mock.calls[0][0]).toBe(FIRST.url);
    expect(after.error).toBeNull();
  });

  it('handleLoadError reports an error when the hosted flow cannot be opened', async () => {
    mockMutateAsync.mockResolvedValueOnce(FIRST);
    const { read, hook } = setup();
    await hook.startOnboarding();
    mockHandoff.mockRejectedValueOnce(new Error('no browser'));

    await read().handleLoadError(new Error('boom'));

    expect(read().error).toBe("La configuration n'a pas pu démarrer. Réessayez.");
  });
});
