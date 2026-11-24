import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PENDING_POLL_CEILING_MS,
  PENDING_POLL_INTERVAL_MS,
  pendingRefetchInterval,
  usePendingCeiling,
} from '../src/lib/pending-confirmation';
import { createHookHarness } from './hook-harness';

describe('pendingRefetchInterval (CF6-05)', () => {
  it('polls every 2 s while the order is PENDING_PAYMENT and the ceiling has not passed', () => {
    expect(pendingRefetchInterval('PENDING_PAYMENT', false)).toBe(PENDING_POLL_INTERVAL_MS);
    expect(PENDING_POLL_INTERVAL_MS).toBe(2_000);
  });

  it('stops polling once the ceiling has passed, even though the order is still pending', () => {
    expect(pendingRefetchInterval('PENDING_PAYMENT', true)).toBe(false);
  });

  it.each(['PAID', 'REFUNDED', 'ABANDONED', undefined])('does not poll when the status is %s', (status) => {
    expect(pendingRefetchInterval(status, false)).toBe(false);
  });
});

describe('usePendingCeiling (CF6-05)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(pending: boolean) {
    const reset = createHookHarness();
    let isPending = pending;
    const read = () => {
      reset();
      return usePendingCeiling(isPending);
    };
    return {
      read,
      setPending: (value: boolean) => {
        isPending = value;
      },
    };
  }

  it('is not expired at first and expires after the ceiling while the order stays pending', () => {
    const { read } = setup(true);
    expect(read().expired).toBe(false);

    vi.advanceTimersByTime(PENDING_POLL_CEILING_MS - 1);
    expect(read().expired).toBe(false);

    vi.advanceTimersByTime(1);
    expect(read().expired).toBe(true);
  });

  it('never expires when the order is not pending', () => {
    const { read } = setup(false);
    read();
    vi.advanceTimersByTime(PENDING_POLL_CEILING_MS * 3);
    expect(read().expired).toBe(false);
  });

  it('cancels the countdown when the order settles before the ceiling', () => {
    const { read, setPending } = setup(true);
    read();
    vi.advanceTimersByTime(PENDING_POLL_CEILING_MS / 2);

    setPending(false);
    read();
    vi.advanceTimersByTime(PENDING_POLL_CEILING_MS * 2);

    expect(read().expired).toBe(false);
  });

  it('restart() re-arms the countdown so « Actualiser » polls again for a full window', () => {
    const { read } = setup(true);
    read();
    vi.advanceTimersByTime(PENDING_POLL_CEILING_MS);
    const expired = read();
    expect(expired.expired).toBe(true);

    expired.restart();
    const restarted = read();
    expect(restarted.expired).toBe(false);

    vi.advanceTimersByTime(PENDING_POLL_CEILING_MS - 1);
    expect(read().expired).toBe(false);
    vi.advanceTimersByTime(1);
    expect(read().expired).toBe(true);
  });
});
