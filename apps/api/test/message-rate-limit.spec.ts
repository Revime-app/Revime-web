import { describe, expect, it } from 'vitest';
import {
  MAX_MESSAGES_PER_USER_PER_DAY,
  checkMessageLimit,
} from '../src/conversations/rate-limit.js';

/** A prisma stand-in that records the filter it was given and answers a fixed count. */
function stub(count: number) {
  const calls: unknown[] = [];
  return {
    calls,
    prisma: {
      message: {
        count: async (args: unknown) => {
          calls.push(args);
          return count;
        },
      },
    } as never,
  };
}

describe('checkMessageLimit', () => {
  it('allows a user below the cap', async () => {
    const { prisma } = stub(MAX_MESSAGES_PER_USER_PER_DAY - 1);
    expect(await checkMessageLimit(prisma, { userId: 'u1' })).toEqual({ allowed: true });
  });

  it('refuses AT the cap, not one past it', async () => {
    const { prisma } = stub(MAX_MESSAGES_PER_USER_PER_DAY);
    const verdict = await checkMessageLimit(prisma, { userId: 'u1' });
    expect(verdict.allowed).toBe(false);
  });

  it('counts a TRAILING day and only the caller own rows', async () => {
    const { prisma, calls } = stub(0);
    const before = Date.now();
    await checkMessageLimit(prisma, { userId: 'u1' });
    const where = (calls[0] as { where: { senderUserId: string; createdAt: { gte: Date } } }).where;
    expect(where.senderUserId).toBe('u1');
    // Trailing, never calendar: no timezone question and no free refill at midnight.
    const windowMs = before - where.createdAt.gte.getTime();
    expect(windowMs).toBeGreaterThan(86_000_000);
    expect(windowMs).toBeLessThan(86_500_000);
  });

  it('counts soft-deleted messages too, so moderation does not refill a spammer', async () => {
    const { prisma, calls } = stub(0);
    await checkMessageLimit(prisma, { userId: 'u1' });
    expect((calls[0] as { where: Record<string, unknown> }).where).not.toHaveProperty('deletedAt');
  });
});
