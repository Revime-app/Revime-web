import { describe, expect, it, vi } from 'vitest';
import { PrismaThrottleStore } from '../src/auth/throttle/store.js';
import { EMPTY_THROTTLE_STATE } from '../src/auth/throttle/policy.js';

/**
 * V7 U2. The Postgres store's contract, without a database: one transaction, the row created if
 * absent, read FOR UPDATE, written back. The real SQL is only proven once the migration is applied;
 * this pins the shape and the conversions a raw query needs.
 */
function fakePrisma(row: Record<string, unknown> | undefined) {
  const tx = {
    $executeRaw: vi.fn(async () => 1),
    $queryRaw: vi.fn(async () => (row ? [row] : [])),
    authThrottle: { update: vi.fn(async () => ({})) },
  };
  const prisma = {
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    authThrottle: { findUnique: vi.fn(async () => null), deleteMany: vi.fn(async () => ({ count: 0 })) },
  };
  return { prisma, tx };
}

describe('PrismaThrottleStore.mutate', () => {
  it('creates the row if needed, locks it, and writes back what the function returns', async () => {
    const { prisma, tx } = fakePrisma(undefined);
    const store = new PrismaThrottleStore(prisma as never);
    const result = await store.mutate('LOGIN_ACCOUNT', 'ana@example.com', (state) => {
      expect(state).toEqual(EMPTY_THROTTLE_STATE);
      return { state: { ...state, failures: 1 }, result: 'done' };
    });
    expect(result).toBe('done');
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    expect(String((tx.$executeRaw.mock.calls[0] as unknown[])[0])).toContain('ON CONFLICT');
    expect(String((tx.$queryRaw.mock.calls[0] as unknown[])[0])).toContain('FOR UPDATE');
    expect(tx.authThrottle.update).toHaveBeenCalledWith({
      where: { scope_key: { scope: 'LOGIN_ACCOUNT', key: 'ana@example.com' } },
      data: expect.objectContaining({ failures: 1 }),
    });
  });

  it('hands the policy real Dates even when the raw query returns timestamps as text', async () => {
    const { prisma } = fakePrisma({
      failures: 4,
      level: 1,
      windowStartedAt: '2026-10-28T10:00:00.000Z',
      lastFailureAt: '2026-10-28T10:03:00.000Z',
      lockedUntil: null,
      recentKeys: [],
    });
    const store = new PrismaThrottleStore(prisma as never);
    await store.mutate('LOGIN_ACCOUNT', 'ana@example.com', (state) => {
      expect(state.lastFailureAt).toEqual(new Date('2026-10-28T10:03:00.000Z'));
      expect(state.windowStartedAt).toBeInstanceOf(Date);
      expect(state.failures).toBe(4);
      return { state, result: undefined };
    });
  });
});
