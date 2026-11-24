import type { MeResponse } from '@revime/shared';
import { nextSessionOverride, isSessionLoading, nextMeState } from '@revime/shared';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { api } from './api';
import { authClient } from './auth-client';
import { onSessionStale } from './session-signal';

type SessionData = Awaited<ReturnType<typeof authClient.getSession>>['data'];

type SessionContextValue = {
  session: SessionData;
  me: MeResponse | null;
  loading: boolean;
  /**
   * Always fetches. For a caller that has just changed something on the server (a mode switch, a
   * verification, a sign-in) and needs the result in `me`: skipping it would show the old state.
   */
  refresh: () => Promise<void>;
  /**
   * Fetches unless a refresh finished in the last `REFRESH_COOLDOWN_MS`, and joins one already in
   * flight. For callers that refresh only because a screen came into focus (S1: those fired a
   * `/get-session` and a `/users/me` on every tab visit).
   */
  refreshIfStale: () => Promise<void>;
};

// MODULE state on purpose (precedent: `RevimeStartupSplash`): one app instance has one session, and
// the dedupe has to hold across the provider re-rendering. Reset by `__resetRefreshCooldownForTest`.
export const REFRESH_COOLDOWN_MS = 5_000;
let lastRefreshTime = 0;
let inFlightRefresh: Promise<void> | null = null;
let queuedRefresh: Promise<void> | null = null;

export function __resetRefreshCooldownForTest(): void {
  lastRefreshTime = 0;
  inFlightRefresh = null;
  queuedRefresh = null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data: sessionHookData, isPending } = authClient.useSession();
  const [sessionOverride, setSessionOverride] = useState<SessionData | undefined>(undefined);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [hasFetchedOnce, setHasFetchedOnce] = useState(false);

  const session: SessionData = sessionOverride !== undefined ? sessionOverride : sessionHookData;

  const load = useCallback(async (): Promise<void> => {
    try {
      const [sessionRes, meRes] = await Promise.allSettled([
        authClient.getSession(),
        api.get<MeResponse>('/users/me'),
      ]);

      // CF4-02: a failed check (429, 5xx, network) keeps the previous state instead of signing the
      // user out of the UI. Rule and tests: packages/shared/src/session-override.ts.
      setSessionOverride((prev: SessionData | undefined) => nextSessionOverride(prev, sessionRes));
      setMe((prev) => nextMeState(prev, sessionRes, meRes));
      lastRefreshTime = Date.now();
    } finally {
      setHasFetchedOnce(true);
    }
  }, []);

  const startRefresh = useCallback((): Promise<void> => {
    const run: Promise<void> = load().finally(() => {
      if (inFlightRefresh === run) inFlightRefresh = null;
    });
    inFlightRefresh = run;
    return run;
  }, [load]);

  const refresh = useCallback((): Promise<void> => {
    if (!inFlightRefresh) return startRefresh();
    // A fetch already under way may have started before this caller's change, so joining it could
    // hand back the old state. Run exactly one more after it, shared by every caller that waits.
    queuedRefresh ??= inFlightRefresh.then(() => {
      queuedRefresh = null;
      return startRefresh();
    });
    return queuedRefresh;
  }, [startRefresh]);

  const refreshIfStale = useCallback((): Promise<void> => {
    if (Date.now() - lastRefreshTime < REFRESH_COOLDOWN_MS) return Promise.resolve();
    return inFlightRefresh ?? refresh();
  }, [refresh]);

  // V9 B1 (final review #2): an API refusal about the account's CGU state re-reads `me` (with the
  // cooldown, so a burst of refused calls is one read).
  useEffect(() => onSessionStale(() => void refreshIfStale()), [refreshIfStale]);

  useEffect(() => {
    if (sessionHookData === null && !isPending) {
      // CF4-02: UNSET, not null. The hook already says « no session », so `session` is null either
      // way - but a null override would keep shadowing the hook after it later reports a session
      // (signup, sign-in), and the refresh branch below would never fire.
      setSessionOverride(undefined);
      setMe(null);
      setHasFetchedOnce(false);
      // The next account must not inherit this one's cooldown, or its first refresh is skipped.
      lastRefreshTime = 0;
    } else if (sessionHookData && sessionOverride === undefined) {
      void refresh();
    }
  }, [sessionHookData, isPending]);

  // Loading is true only during initial auth / session gate before `hasFetchedOnce`.
  // 🛑 Background refreshes (e.g. useFocusEffect on tab visit) must NEVER toggle loading
  // to true, because doing so causes TabsLayout to return null and unmount all tabs.
  const loading = isSessionLoading(isPending, Boolean(session), hasFetchedOnce);

  return (
    <SessionContext.Provider value={{ session, me, loading, refresh, refreshIfStale }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSessionContext must be used within a SessionProvider');
  }
  return context;
}
