import type { PrismaClient } from '../../generated/prisma/client.js';
import { EMPTY_THROTTLE_STATE, QUIET_RESET_MS, type ThrottleState } from './policy.js';

export type ThrottleScope = 'LOGIN_ACCOUNT' | 'CODE_ACCOUNT' | 'IP' | 'RESET_ACCOUNT';

/** Where the lock-out counters live. `mutate` is a read-modify-write that two requests cannot interleave. */
export interface ThrottleStore {
  read(scope: ThrottleScope, key: string): Promise<ThrottleState>;
  mutate<T>(
    scope: ThrottleScope,
    key: string,
    fn: (state: ThrottleState) => { state: ThrottleState; result: T },
  ): Promise<T>;
  remove(scope: ThrottleScope, key: string): Promise<void>;
  /** Deletes rows a quiet reset would empty anyway (24 h past their last failure and lock). */
  prune(now: Date): Promise<void>;
}

type Row = {
  failures: number;
  level: number;
  windowStartedAt: Date | string | null;
  lastFailureAt: Date | string | null;
  lockedUntil: Date | string | null;
  recentKeys: string[] | null;
};

/** `$queryRaw` hands back what the driver gives; the policy compares Dates, so never trust the type. */
const toDate = (value: Date | string | null): Date | null =>
  value === null ? null : value instanceof Date ? value : new Date(value);

const toState = (row: Row | null | undefined): ThrottleState =>
  row
    ? {
        failures: Number(row.failures),
        level: Number(row.level),
        windowStartedAt: toDate(row.windowStartedAt),
        lastFailureAt: toDate(row.lastFailureAt),
        lockedUntil: toDate(row.lockedUntil),
        recentKeys: row.recentKeys ?? [],
      }
    : EMPTY_THROTTLE_STATE;

type PrismaLike = Pick<PrismaClient, 'authThrottle' | '$transaction'>;

/**
 * Postgres-backed, so a lock survives a deploy and holds across processes. `mutate` creates the row
 * if needed and takes `SELECT … FOR UPDATE` inside one transaction: two failures arriving together
 * are applied one after the other, so neither the count nor the « one e-mail per lock » can be lost
 * to a race.
 */
export class PrismaThrottleStore implements ThrottleStore {
  constructor(private readonly prisma: PrismaLike) {}

  async read(scope: ThrottleScope, key: string): Promise<ThrottleState> {
    return toState(await this.prisma.authThrottle.findUnique({ where: { scope_key: { scope, key } } }));
  }

  async mutate<T>(
    scope: ThrottleScope,
    key: string,
    fn: (state: ThrottleState) => { state: ThrottleState; result: T },
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "AuthThrottle" ("scope", "key", "updatedAt")
        VALUES (${scope}::"AuthThrottleScope", ${key}, now())
        ON CONFLICT ("scope", "key") DO NOTHING`;
      const rows = await tx.$queryRaw<Row[]>`
        SELECT "failures", "level", "windowStartedAt", "lastFailureAt", "lockedUntil", "recentKeys"
        FROM "AuthThrottle"
        WHERE "scope" = ${scope}::"AuthThrottleScope" AND "key" = ${key}
        FOR UPDATE`;
      const { state, result } = fn(toState(rows[0]));
      await tx.authThrottle.update({
        where: { scope_key: { scope, key } },
        data: {
          failures: state.failures,
          level: state.level,
          windowStartedAt: state.windowStartedAt,
          lastFailureAt: state.lastFailureAt,
          lockedUntil: state.lockedUntil,
          recentKeys: state.recentKeys,
        },
      });
      return result;
    });
  }

  async remove(scope: ThrottleScope, key: string): Promise<void> {
    await this.prisma.authThrottle.deleteMany({ where: { scope, key } });
  }

  async prune(now: Date): Promise<void> {
    const before = new Date(now.getTime() - QUIET_RESET_MS);
    await this.prisma.authThrottle.deleteMany({
      where: {
        OR: [{ lastFailureAt: null }, { lastFailureAt: { lt: before } }],
        AND: [{ OR: [{ lockedUntil: null }, { lockedUntil: { lt: before } }] }],
      },
    });
  }
}
