import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SessionProvider,
  REFRESH_COOLDOWN_MS,
  __resetRefreshCooldownForTest,
} from '../src/lib/session';
import { createHookHarness } from './hook-harness';

const mockGetSession = vi.fn();
const mockUseSession = vi.fn();
vi.mock('../src/lib/auth-client', () => ({
  authClient: {
    useSession: () => mockUseSession(),
    getSession: () => mockGetSession(),
  },
}));

const mockApiGet = vi.fn();
vi.mock('../src/lib/api', () => ({
  api: {
    get: (path: string) => mockApiGet(path),
  },
}));

const SESSION = { data: { user: { id: 'user-1' }, session: { id: 'sess-1' } } };
const ME = { id: 'user-1', profile: { activeMode: 'CLIENT', repairerEnabled: false } };

/** Deferred promise, so a test can hold a fetch open and release it on cue. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe('Session refresh: dedupe and cooldown (S1)', () => {
  let rerender: () => ReturnType<typeof SessionProvider>['props']['value'];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    __resetRefreshCooldownForTest();

    // « Still deciding »: neither the first-load effect nor the sign-out effect fires, so every
    // network call below comes from the refresh the test makes itself.
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    mockGetSession.mockResolvedValue(SESSION);
    mockApiGet.mockResolvedValue(ME);

    const reset = createHookHarness();
    rerender = () => {
      reset();
      return SessionProvider({ children: null }).props.value;
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refresh() always fetches, even straight after another refresh', async () => {
    const { refresh } = rerender();

    await refresh();
    await refresh();

    // A caller that just changed something on the server (mode switch, verification) must see it.
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('refreshIfStale() skips inside the cooldown and fetches again once it has passed', async () => {
    const { refresh, refreshIfStale } = rerender();
    await refresh();

    vi.advanceTimersByTime(REFRESH_COOLDOWN_MS - 1);
    await refreshIfStale();
    expect(mockGetSession).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await refreshIfStale();
    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('refreshIfStale() callers during one fetch share it', async () => {
    const held = deferred<typeof SESSION>();
    mockGetSession.mockReturnValue(held.promise);
    const { refreshIfStale } = rerender();

    const calls = [refreshIfStale(), refreshIfStale(), refreshIfStale()];
    expect(mockGetSession).toHaveBeenCalledTimes(1);

    held.resolve(SESSION);
    await Promise.all(calls);
    expect(mockGetSession).toHaveBeenCalledTimes(1);
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it('refresh() during a fetch waits for it, then runs ONE more shared by every waiter', async () => {
    const held = deferred<typeof SESSION>();
    mockGetSession.mockReturnValueOnce(held.promise);
    const { refresh } = rerender();

    const first = refresh();
    // Two callers that changed something while that fetch was under way: it may predate their
    // change, so neither may be handed its result.
    const second = refresh();
    const third = refresh();
    expect(mockGetSession).toHaveBeenCalledTimes(1);

    held.resolve(SESSION);
    await Promise.all([first, second, third]);

    expect(mockGetSession).toHaveBeenCalledTimes(2);
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it('a sign-out clears the cooldown, so the next account is not skipped', async () => {
    const { refresh } = rerender();
    await refresh();

    // Signed out, then in as someone else, all inside the cooldown.
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    const afterSignOut = rerender();
    vi.advanceTimersByTime(1000);

    await afterSignOut.refreshIfStale();
    expect(mockGetSession).toHaveBeenCalledTimes(2);
  });

  it('a failed first refresh still ends the load, so the app is not stuck on the splash', async () => {
    mockGetSession.mockRejectedValue(new Error('429'));
    mockApiGet.mockRejectedValue(new Error('429'));
    // Signed in: the first render starts the refresh by itself.
    mockUseSession.mockReturnValue({ data: SESSION.data, isPending: false });

    expect(rerender().loading).toBe(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(rerender().loading).toBe(false);
  });
});
