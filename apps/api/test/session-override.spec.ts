import { describe, expect, it } from 'vitest';
import {
  nextSessionOverride,
  isSessionLoading,
  nextMeState,
  type SessionCheckResult,
} from '@revime/shared';

/**
 * CF4-02. `SessionProvider.refresh()` (apps/mobile/src/lib/session.tsx) decides the session override
 * from `authClient.getSession()`. Better Auth's client does NOT throw on an HTTP error: it resolves
 * `{ data: null, error }` (429, 5xx, network). The old code read only `data === null` and so treated
 * any failed check as « signed out », and the `(tabs)` gate then sent a freshly signed-up user to the
 * login page. The decision now lives in this pure function so it can be tested (apps/mobile has no
 * test harness).
 */
type S = { user: { id: string } };
const live: S = { user: { id: 'u1' } };
const other: S = { user: { id: 'u2' } };

const ok = (data: S | null): SessionCheckResult<S> => ({ status: 'fulfilled', value: { data, error: null } });
const failed = (status?: number): SessionCheckResult<S> => ({
  status: 'fulfilled',
  value: { data: null, error: { status } },
});
const rejected: SessionCheckResult<S> = { status: 'rejected' };

describe('nextSessionOverride (CF4-02)', () => {
  it('takes a live session from a successful check', () => {
    expect(nextSessionOverride<S>(undefined, ok(live))).toBe(live);
    expect(nextSessionOverride<S>(null, ok(live))).toBe(live);
    expect(nextSessionOverride<S>(other, ok(live))).toBe(live);
  });

  it('records signed-out only when the server successfully answers « no session »', () => {
    expect(nextSessionOverride<S>(live, ok(null))).toBeNull();
    expect(nextSessionOverride<S>(undefined, ok(null))).toBeNull();
  });

  // The bug: each of these used to return null and sign the user out of the UI.
  it.each([
    ['a 429 rate limit', failed(429)],
    ['a 5xx', failed(503)],
    ['a network error with no status', failed()],
    ['a rejected promise', rejected],
  ])('keeps the previous state on %s', (_label, result) => {
    expect(nextSessionOverride<S>(live, result)).toBe(live);
    expect(nextSessionOverride<S>(undefined, result)).toBeUndefined();
    expect(nextSessionOverride<S>(null, result)).toBeNull();
  });

  it('treats a 401 as a genuine sign-out, as Better Auth itself does', () => {
    // session-atom.mjs sets `data: null` on 401 only; other errors keep the data.
    expect(nextSessionOverride<S>(live, failed(401))).toBeNull();
  });
});

describe('isSessionLoading', () => {
  it('is loading when authClient session check is pending', () => {
    expect(isSessionLoading(true, false, false)).toBe(true);
    expect(isSessionLoading(true, true, false)).toBe(true);
    expect(isSessionLoading(true, true, true)).toBe(true);
  });

  it('is loading when session exists but me has not been fetched yet', () => {
    expect(isSessionLoading(false, true, false)).toBe(true);
  });

  it('is NOT loading when no session exists and query is settled', () => {
    expect(isSessionLoading(false, false, false)).toBe(false);
  });

  it('is NOT loading once me has been fetched once, preventing tab unmount on background refresh', () => {
    // 🛑 Critical fix: background refresh on tab focus must never set loading: true,
    // which unmounts TabsLayout and resets the user back to Home screen.
    expect(isSessionLoading(false, true, true)).toBe(false);
  });
});

describe('nextMeState', () => {
  type Me = { id: string; name: string };
  const me1: Me = { id: 'u1', name: 'Alice' };
  const me2: Me = { id: 'u1', name: 'Alice Updated' };

  it('updates me on fulfilled result', () => {
    expect(nextMeState(null, ok(live), { status: 'fulfilled', value: me1 })).toEqual(me1);
    expect(nextMeState(me1, ok(live), { status: 'fulfilled', value: me2 })).toEqual(me2);
  });

  it('clears me when session is explicitly null or 401', () => {
    expect(nextMeState(me1, ok(null), { status: 'rejected', reason: new Error('net') })).toBeNull();
    expect(nextMeState(me1, failed(401), { status: 'rejected', reason: new Error('net') })).toBeNull();
  });

  it('preserves existing me on network or transient error when session is still live', () => {
    expect(nextMeState(me1, ok(live), { status: 'rejected', reason: new Error('network timeout') })).toEqual(me1);
    expect(nextMeState(me1, failed(503), { status: 'rejected', reason: new Error('503') })).toEqual(me1);
    expect(nextMeState(me1, rejected, { status: 'rejected', reason: new Error('error') })).toEqual(me1);
  });
});

