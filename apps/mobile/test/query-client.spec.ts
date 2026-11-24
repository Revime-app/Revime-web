import { describe, it, expect, vi, afterEach } from 'vitest';
import { createQueryClient } from '../src/lib/query';
import { ApiError } from '../src/lib/api';

vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

describe('createQueryClient: a 429 is not retried (S1)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** Runs one query through the client's real retry pipeline and counts the attempts. */
  async function attemptsFor(error: Error): Promise<number> {
    vi.useFakeTimers();
    const queryFn = vi.fn().mockRejectedValue(error);
    const settled = createQueryClient()
      .fetchQuery({ queryKey: ['s1'], queryFn })
      .catch(() => undefined);
    await vi.advanceTimersByTimeAsync(60_000);
    await settled;
    return queryFn.mock.calls.length;
  }

  it('gives up after the first 429', async () => {
    expect(await attemptsFor(new ApiError('TOO_MANY_REQUESTS', 'Trop de requêtes', undefined, 429))).toBe(1);
  });

  it('still retries another server failure once', async () => {
    expect(await attemptsFor(new ApiError('INTERNAL', 'Erreur', undefined, 500))).toBe(2);
  });

  it('still retries a network failure once', async () => {
    expect(await attemptsFor(new TypeError('Network request failed'))).toBe(2);
  });
});
