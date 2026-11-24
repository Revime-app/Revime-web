import { describe, expect, it } from 'vitest';
import {
  EMPTY_THROTTLE_STATE,
  THROTTLE_RULES,
  isLocked,
  ladderLockMs,
  registerFailure,
  registerSuccess,
  type ThrottleRule,
  type ThrottleState,
} from '../src/auth/throttle/policy.js';

/**
 * V7 A11 / D3 (U2). The rules agreed with the owner on 2026-10-28 (CLIENT_FEEDBACK_V7.md §4 A11):
 * 5 failures lock an account for 15 minutes, each new lock doubles up to 24 h, a success resets the
 * failure count, 24 h without a failure resets everything; staff lock after 3; 20 failures per IP
 * in 15 minutes block it for 15 minutes; 3 reset requests per e-mail per hour.
 */
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const T0 = new Date('2026-10-28T10:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

function fail(state: ThrottleState, times: number, now: Date, rule: ThrottleRule = THROTTLE_RULES.LOGIN_ACCOUNT, key?: string) {
  let s = state;
  let lockedNow = false;
  for (let i = 0; i < times; i++) {
    const r = registerFailure(s, rule, now, key);
    s = r.state;
    lockedNow = r.lockedNow;
  }
  return { state: s, lockedNow };
}

describe('ladderLockMs', () => {
  it('starts at 15 minutes and doubles per level', () => {
    expect(ladderLockMs(1)).toBe(15 * MIN);
    expect(ladderLockMs(2)).toBe(30 * MIN);
    expect(ladderLockMs(3)).toBe(60 * MIN);
    expect(ladderLockMs(4)).toBe(120 * MIN);
  });

  it('never exceeds 24 hours', () => {
    expect(ladderLockMs(7)).toBe(16 * HOUR); // 15 min × 64
    expect(ladderLockMs(8)).toBe(24 * HOUR); // 32 h, capped
    expect(ladderLockMs(40)).toBe(24 * HOUR);
  });
});

describe('account login ladder', () => {
  it('does not lock on the 4th failure', () => {
    const { state, lockedNow } = fail(EMPTY_THROTTLE_STATE, 4, T0);
    expect(lockedNow).toBe(false);
    expect(isLocked(state, T0)).toBe(false);
  });

  it('locks for 15 minutes on the 5th failure', () => {
    const { state, lockedNow } = fail(EMPTY_THROTTLE_STATE, 5, T0);
    expect(lockedNow).toBe(true);
    expect(state.level).toBe(1);
    expect(state.lockedUntil).toEqual(at(15 * MIN));
    expect(isLocked(state, at(15 * MIN - 1))).toBe(true);
    expect(isLocked(state, at(15 * MIN))).toBe(false);
  });

  it('doubles the next lock after a new series of 5 failures', () => {
    const first = fail(EMPTY_THROTTLE_STATE, 5, T0).state;
    const second = fail(first, 5, at(20 * MIN));
    expect(second.lockedNow).toBe(true);
    expect(second.state.level).toBe(2);
    expect(second.state.lockedUntil).toEqual(at(20 * MIN + 30 * MIN));
  });

  it('starts a fresh count of 5 once a lock has expired', () => {
    const first = fail(EMPTY_THROTTLE_STATE, 5, T0).state;
    const after = fail(first, 4, at(20 * MIN));
    expect(after.lockedNow).toBe(false);
    expect(isLocked(after.state, at(20 * MIN))).toBe(false);
  });

  it('resets the failure count on a success but keeps the ladder', () => {
    const four = fail(EMPTY_THROTTLE_STATE, 4, T0).state;
    const ok = registerSuccess(four);
    expect(ok.failures).toBe(0);
    expect(fail(ok, 4, at(MIN)).lockedNow).toBe(false);

    const locked = fail(EMPTY_THROTTLE_STATE, 5, T0).state;
    const okAfterLock = registerSuccess(locked);
    expect(okAfterLock.level).toBe(1);
    expect(fail(okAfterLock, 5, at(20 * MIN)).state.lockedUntil).toEqual(at(20 * MIN + 30 * MIN));
  });

  it('resets the ladder after 24 hours without a failure', () => {
    const first = fail(EMPTY_THROTTLE_STATE, 5, T0).state;
    const next = fail(first, 5, at(24 * HOUR + 15 * MIN));
    expect(next.state.level).toBe(1);
    expect(next.state.lockedUntil).toEqual(at(24 * HOUR + 30 * MIN));
  });

  it('keeps climbing while failures keep coming within 24 hours', () => {
    let s = EMPTY_THROTTLE_STATE;
    let seriesAt = T0.getTime();
    for (let level = 1; level <= 9; level++) {
      if (level > 1) seriesAt = s.lockedUntil!.getTime() + MIN;
      s = fail(s, 5, new Date(seriesAt)).state;
      expect(s.level).toBe(level);
    }
    // level 9 would be 15 min × 256 = 64 h: capped at 24 h from the series that caused it
    expect(s.lockedUntil!.getTime() - seriesAt).toBe(24 * HOUR);
  });

  it('applies the staff threshold of 3', () => {
    const r = fail(EMPTY_THROTTLE_STATE, 3, T0, THROTTLE_RULES.LOGIN_STAFF);
    expect(r.lockedNow).toBe(true);
    expect(r.state.lockedUntil).toEqual(at(15 * MIN));
    expect(fail(EMPTY_THROTTLE_STATE, 2, T0, THROTTLE_RULES.LOGIN_STAFF).lockedNow).toBe(false);
  });

  it('ignores a failure recorded while already locked', () => {
    const locked = fail(EMPTY_THROTTLE_STATE, 5, T0).state;
    const again = registerFailure(locked, THROTTLE_RULES.LOGIN_ACCOUNT, at(MIN));
    expect(again.lockedNow).toBe(false);
    expect(again.state).toEqual(locked);
  });
});

describe('IP rule', () => {
  it('blocks for a fixed 15 minutes on the 20th failure within 15 minutes', () => {
    const r = fail(EMPTY_THROTTLE_STATE, 20, T0, THROTTLE_RULES.IP);
    expect(r.lockedNow).toBe(true);
    expect(r.state.lockedUntil).toEqual(at(15 * MIN));
    const again = fail(r.state, 20, at(16 * MIN), THROTTLE_RULES.IP);
    expect(again.state.lockedUntil).toEqual(at(16 * MIN + 15 * MIN));
  });

  it('forgets failures older than its 15-minute window', () => {
    const nineteen = fail(EMPTY_THROTTLE_STATE, 19, T0, THROTTLE_RULES.IP).state;
    const r = registerFailure(nineteen, THROTTLE_RULES.IP, at(15 * MIN));
    expect(r.lockedNow).toBe(false);
    expect(r.state.failures).toBe(1);
  });

  it('remembers the distinct accounts tried, capped', () => {
    let s = EMPTY_THROTTLE_STATE;
    for (let i = 0; i < 60; i++) {
      s = registerFailure(s, THROTTLE_RULES.IP, T0, `user${i % 30}@example.com`).state;
      if (isLocked(s, T0)) break;
    }
    expect(s.recentKeys).toHaveLength(20);
    expect(new Set(s.recentKeys).size).toBe(20);

    let many = EMPTY_THROTTLE_STATE;
    for (let i = 0; i < 80; i++) {
      many = { ...registerFailure(many, { ...THROTTLE_RULES.IP, threshold: 1000 }, T0, `u${i}@x.fr`).state };
    }
    expect(many.recentKeys).toHaveLength(50);
  });
});

describe('reset request rule', () => {
  it('allows 3 requests in an hour and refuses the 4th until the hour is over', () => {
    const r = fail(EMPTY_THROTTLE_STATE, 3, T0, THROTTLE_RULES.RESET_ACCOUNT);
    expect(r.lockedNow).toBe(true);
    expect(r.state.lockedUntil).toEqual(at(HOUR));

    const twoEarly = fail(EMPTY_THROTTLE_STATE, 2, T0, THROTTLE_RULES.RESET_ACCOUNT).state;
    const third = registerFailure(twoEarly, THROTTLE_RULES.RESET_ACCOUNT, at(40 * MIN));
    expect(third.state.lockedUntil).toEqual(at(HOUR));
  });
});
