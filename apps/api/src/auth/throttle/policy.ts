/**
 * V7 A11 / D3 (U2). The lock-out rules, as pure functions over one counter's state. The store
 * (`store.ts`) persists the state; this file decides what a failure does to it.
 *
 * The numbers are the client's where he gave them (5 failures, 15 minutes, doubling, 3 for staff)
 * and the owner's answers where he did not (CLIENT_FEEDBACK_V7.md §4 A11, Q2 to Q5 of the U2
 * design round, 2026-10-28):
 * - a success resets the failure count but not the ladder;
 * - 24 h without a failure, counted from the end of the last lock, resets everything;
 * - the ladder stops at 24 h;
 * - an IP is blocked for a flat 15 minutes after 20 failures within 15 minutes;
 * - reset requests are capped at 3 per e-mail per hour.
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export const LADDER_BASE_MS = 15 * MINUTE_MS;
export const LADDER_CAP_MS = 24 * HOUR_MS;
export const QUIET_RESET_MS = 24 * HOUR_MS;

/** How many distinct accounts an IP row remembers, for the « comptes essayés » of its alert. */
export const RECENT_KEYS_CAP = 50;

export type ThrottleState = {
  /** Failures in the current series (or requests in the current window). */
  failures: number;
  /** How many locks this counter has had since its last quiet reset. Drives the ladder. */
  level: number;
  windowStartedAt: Date | null;
  lastFailureAt: Date | null;
  lockedUntil: Date | null;
  /** IP rows only: the distinct accounts tried, newest last. */
  recentKeys: string[];
};

export const EMPTY_THROTTLE_STATE: ThrottleState = {
  failures: 0,
  level: 0,
  windowStartedAt: null,
  lastFailureAt: null,
  lockedUntil: null,
  recentKeys: [],
};

export type ThrottleRule = {
  /** The failure (or request) that reaches this number locks. */
  threshold: number;
  /** Failures older than this are forgotten. Null: only a success or the quiet reset forgets them. */
  windowMs: number | null;
  /** `ladder`: 15 min doubling; `fixed`: a flat duration; `window`: until the window ends. */
  lock: { kind: 'ladder' } | { kind: 'fixed'; ms: number } | { kind: 'window' };
};

export const THROTTLE_RULES = {
  LOGIN_ACCOUNT: { threshold: 5, windowMs: null, lock: { kind: 'ladder' } },
  /** D3: any of the six staff roles. */
  LOGIN_STAFF: { threshold: 3, windowMs: null, lock: { kind: 'ladder' } },
  /** Wrong e-mail or SMS codes: its own ladder, so a wrong code never locks the password login. */
  CODE_ACCOUNT: { threshold: 5, windowMs: null, lock: { kind: 'ladder' } },
  IP: { threshold: 20, windowMs: 15 * MINUTE_MS, lock: { kind: 'fixed', ms: 15 * MINUTE_MS } },
  RESET_ACCOUNT: { threshold: 3, windowMs: HOUR_MS, lock: { kind: 'window' } },
  /**
   * V9 U1 (V9 B2 (4)): step-up code SENDS, 5 an hour (the client's figure), on their own key and apart
   * from wrong codes (`CODE_ACCOUNT`). Stored under the `RESET_ACCOUNT` scope with a `step-up:` key
   * prefix, so no new scope (and no migration) is needed; the key keeps it apart from password resets.
   */
  CODE_SEND: { threshold: 5, windowMs: HOUR_MS, lock: { kind: 'window' } },
} as const satisfies Record<string, ThrottleRule>;

export function ladderLockMs(level: number): number {
  const steps = Math.max(0, level - 1);
  // 2 ** 7 × 15 min is already past the cap, so stop multiplying before the number gets silly.
  return Math.min(LADDER_BASE_MS * 2 ** Math.min(steps, 10), LADDER_CAP_MS);
}

export function isLocked(state: ThrottleState, now: Date): boolean {
  return state.lockedUntil !== null && state.lockedUntil.getTime() > now.getTime();
}

/** The state as it stands at `now`, once expired windows, locks and quiet periods are applied. */
export function settle(state: ThrottleState, rule: ThrottleRule, now: Date): ThrottleState {
  const t = now.getTime();
  const lastActivity = Math.max(state.lastFailureAt?.getTime() ?? 0, state.lockedUntil?.getTime() ?? 0);
  if (lastActivity > 0 && t - lastActivity >= QUIET_RESET_MS) return EMPTY_THROTTLE_STATE;

  let s = state;
  if (s.lockedUntil !== null && s.lockedUntil.getTime() <= t) {
    s = { ...s, failures: 0, windowStartedAt: null, lockedUntil: null, recentKeys: [] };
  }
  if (rule.windowMs !== null && s.windowStartedAt !== null && t - s.windowStartedAt.getTime() >= rule.windowMs) {
    s = { ...s, failures: 0, windowStartedAt: null, recentKeys: [] };
  }
  return s;
}

/**
 * One more failure. `lockedNow` is true only for the failure that STARTS a lock, which is what
 * lets the caller send one e-mail and raise one alert per lock.
 */
export function registerFailure(
  state: ThrottleState,
  rule: ThrottleRule,
  now: Date,
  key?: string,
): { state: ThrottleState; lockedNow: boolean } {
  if (isLocked(state, now)) return { state, lockedNow: false };

  const s = settle(state, rule, now);
  const recentKeys =
    key === undefined || s.recentKeys.includes(key) ? s.recentKeys : [...s.recentKeys, key].slice(-RECENT_KEYS_CAP);
  const next: ThrottleState = {
    ...s,
    failures: s.failures + 1,
    windowStartedAt: s.windowStartedAt ?? now,
    lastFailureAt: now,
    recentKeys,
  };
  if (next.failures < rule.threshold) return { state: next, lockedNow: false };

  const level = next.level + 1;
  const until =
    rule.lock.kind === 'ladder'
      ? now.getTime() + ladderLockMs(level)
      : rule.lock.kind === 'fixed'
        ? now.getTime() + rule.lock.ms
        : next.windowStartedAt!.getTime() + (rule.windowMs ?? 0);
  return { state: { ...next, level, lockedUntil: new Date(until) }, lockedNow: true };
}

export function registerSuccess(state: ThrottleState): ThrottleState {
  return { ...state, failures: 0, windowStartedAt: null };
}
