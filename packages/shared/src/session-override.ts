/**
 * CF4-02. How `SessionProvider.refresh()` (apps/mobile/src/lib/session.tsx) updates its session
 * override from one `authClient.getSession()` call, run through `Promise.allSettled`.
 *
 * 🛑 BETTER AUTH'S CLIENT DOES NOT THROW ON AN HTTP ERROR. A 429, a 5xx or a network failure
 * resolves `{ data: null, error }`. The old code read only `data === null`, so every failed check
 * set the override to null and the app believed the user had signed out; the `(tabs)` gate then
 * sent a freshly signed-up user to the login page (« quand tu crées un compte parfois ça te renvoie
 * sur la page de connexion »). Until 2026-09-28 every user shared one rate-limit bucket per auth
 * path (no client IP), which made a 429 here far more likely.
 *
 * The rule, mirroring Better Auth's own session atom (`session-atom.mjs`):
 * - a successful answer with a session → that session;
 * - a successful answer with no session, or a 401 → signed out (`null`);
 * - any other error, or a rejected promise → KEEP the previous state. A failed check is not news.
 *
 * Returns the new override. `undefined` means « no override: defer to the live hook ».
 */
export type SessionCheckResult<T> =
  | { status: 'fulfilled'; value: { data: T | null; error: { status?: number } | null } | null | undefined }
  | { status: 'rejected' };

export function nextSessionOverride<T>(
  previous: T | null | undefined,
  result: SessionCheckResult<T>,
): T | null | undefined {
  if (result.status === 'rejected') return previous;
  const value = result.value;
  if (!value) return previous;
  if (value.error) return value.error.status === 401 ? null : previous;
  return value.data ? value.data : null;
}

/**
 * Derives whether the app is in the initial session-loading phase.
 *
 * 🛑 CRITICAL INVARIANT: Background refreshes (e.g. from useFocusEffect on tab visit)
 * must NEVER set loading to true. Doing so causes TabsLayout to return null and unmount
 * all tabs, resetting navigation back to index (Home screen). Loading is true ONLY:
 * 1. While authClient's initial session query is pending; OR
 * 2. When a session exists but `me` has not yet been fetched for the first time (`!hasFetchedOnce`).
 */
export function isSessionLoading(
  isPending: boolean,
  hasSession: boolean,
  hasFetchedOnce: boolean,
): boolean {
  return isPending || (hasSession && !hasFetchedOnce);
}

/**
 * Pure state reducer for `me` response updates during session refresh.
 *
 * Like `nextSessionOverride`, transient failures (5xx, 429, network offline) keep
 * the previous `me` object rather than wiping it to null and breaking the UI.
 * `me` is cleared to null only if the session is confirmed dead (401 or null data).
 */
export function nextMeState<T>(
  previous: T | null,
  sessionResult: SessionCheckResult<unknown>,
  meResult: PromiseSettledResult<T>,
): T | null {
  if (meResult.status === 'fulfilled') {
    return meResult.value;
  }
  if (sessionResult.status === 'rejected') return previous;
  const value = sessionResult.value;
  if (!value) return previous;
  if (value.error) {
    return value.error.status === 401 ? null : previous;
  }
  if (value.data === null) {
    return null;
  }
  return previous;
}

