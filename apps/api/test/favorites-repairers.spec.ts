import { describe, expect, it, vi } from 'vitest';
import { FavoritesService } from '../src/favorites/favorites.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { withUserLookups } from './support/review-seal.js';

/**
 * `CF-18`. Unit tests with a hand-shaped Prisma and no `vi.mock`, for the standing reason
 * `avatar-service.spec.ts` records: `DATABASE_URL` points at PRODUCTION even locally, so the
 * integration suite writes and cannot be run.
 *
 * 🛑 The ids are shaped like the real thing - Better Auth ids, not `'u1'`. A hand-shaped stub
 * cannot refuse a wrong field name, so a fixture shaped unlike production hides real defects;
 * `CF-47` had a UUID fixture conceal a violated `[a-z0-9_]` invariant on a username.
 */
const ME = '11111111-1111-4111-8111-111111111111';
const TARGET = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';

/** One `CARD_SELECT`-shaped row, which is what `assembleRepairerCards` consumes. */
function profileRow(userId: string, displayName: string) {
  return {
    userId,
    displayName,
    serviceAreaLabel: null,
    // `avatarPath: null` keeps the signing branch short-circuited on `paths.length === 0`, so no
    // test here touches the storage gateway.
    user: { username: displayName.toLowerCase(), profile: { verificationLevel: null, avatarPath: null } },
  };
}

type Opts = {
  /**
   * What the shared `directoryWhere` predicate finds for the target, or `null` for « not a
   * listable réparateur ».
   *
   * 🛑 This used to be a `Profile` shape - `{ repairerEnabled, deletedAt }` - because the service
   * hand-copied `directoryWhere`'s clauses against the wrong table. It now ASKS the predicate, so
   * the only thing the stub can say is found or not found, and which of the three reasons applies
   * is the predicate's business rather than the service's.
   */
  target?: { userId: string } | null;
  /** Rows the favourite table already holds for ME, in join-table order (newest saved first). */
  existing?: string[];
  /** What `repairerProfile.findMany` answers for the list read. */
  profiles?: ReturnType<typeof profileRow>[];
};

function harness({
  target = { userId: TARGET },
  existing = [],
  profiles = [],
}: Opts = {}) {
  const upsert = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const findFirst = vi.fn().mockResolvedValue(target);
  const findMany = vi.fn().mockResolvedValue(profiles);

  const prisma = withUserLookups({
    favoriteRepairer: {
      upsert,
      deleteMany,
      findMany: vi
        .fn()
        .mockResolvedValue(existing.map((id) => ({ repairerUserId: id }))),
    },
    repairerProfile: { findFirst, findMany },
    review: { groupBy: vi.fn().mockResolvedValue([]) },
    commande: { groupBy: vi.fn().mockResolvedValue([]) },
  }) as unknown as PrismaService;

  return { service: new FavoritesService(prisma), upsert, deleteMany, findFirst, findMany };
}

describe('FavoritesService, réparateur half', () => {
  it('adds a favourite', async () => {
    const { service, upsert } = harness();
    await service.addRepairer(ME, TARGET);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  /**
   * 🛑 **M5. THIS TEST USED TO ASSERT NOTHING ABOUT THE WRITE'S SHAPE, which matters precisely
   * because a hand-shaped stub cannot refuse a wrong field name.** A swapped id in the `where`, or
   * an `update` that touched a column, passed every test in this file.
   *
   * `update: {}` is the part that makes the second tap a genuine no-op rather than a write: an
   * `update` with any payload would rewrite `createdAt` and silently reorder the list a re-tap was
   * not supposed to change.
   */
  it('upserts on the composite unique with exactly the two ids, and updates nothing', async () => {
    const { service, upsert } = harness();
    await service.addRepairer(ME, TARGET);
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_repairerUserId: { userId: ME, repairerUserId: TARGET } },
      create: { userId: ME, repairerUserId: TARGET },
      update: {},
    });
  });

  /**
   * 🛑 **M5. THIS USED TO ASSERT ONLY THAT A SECOND CALL RESOLVED, which is true of any method that
   * does not throw and says nothing about idempotency.** What makes a second tap safe is that the
   * write is an `upsert` on the composite unique rather than a read-then-insert - so both calls
   * must issue the IDENTICAL upsert, and neither may fall back to `create`.
   */
  it('is idempotent: a second add issues the identical upsert and never a create', async () => {
    const { service, upsert } = harness();
    await service.addRepairer(ME, TARGET);
    await expect(service.addRepairer(ME, TARGET)).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]).toEqual(upsert.mock.calls[1]);
  });

  it('refuses to favourite yourself', async () => {
    const { service, upsert } = harness();
    await expect(service.addRepairer(ME, ME)).rejects.toThrow(AppException);
    expect(upsert).not.toHaveBeenCalled();
  });

  /**
   * The three reasons `directoryWhere` can refuse a target. They share one stub - a `null` from
   * `repairerProfile.findFirst` - and that is the point of the M3 fix rather than a shortcut: the
   * service no longer evaluates the clauses itself, so it cannot tell the three apart and cannot
   * disagree with the list read about any of them. The test below pins that the predicate is really
   * the thing being asked.
   */
  for (const reason of [
    'is not a réparateur',
    'has a soft-deleted profile',
    'does not exist',
  ]) {
    it(`refuses a target that ${reason}`, async () => {
      const { service, upsert } = harness({ target: null });
      await expect(service.addRepairer(ME, TARGET)).rejects.toThrow(AppException);
      expect(upsert).not.toHaveBeenCalled();
    });
  }

  /**
   * 🛑 **M3's WHOLE POINT, ASSERTED RATHER THAN COMMENTED.** The add and the list must ask the
   * SAME question, and the comment that used to claim they did was false - the add read `Profile`
   * with two clauses while the list read `RepairerProfile` through `directoryWhere`'s three.
   */
  it('validates the target with the shared directory predicate, not a copy of its clauses', async () => {
    const { service, findFirst } = harness();
    await service.addRepairer(ME, TARGET);
    const call = findFirst.mock.calls[0]?.[0];
    if (!call) throw new Error('Expected repairerProfile.findFirst to be called');
    expect(call.where.AND).toHaveLength(2);
    expect(call.where.AND[0].deletedAt).toBeNull();
    expect(call.where.AND[0].userId).toEqual({ not: ME });
    expect(call.where.AND[0].user.profile).toEqual({ repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null });
    expect(call.where.AND[1].userId).toBe(TARGET);
  });

  it('removing is idempotent and does not throw when no row exists', async () => {
    const { service, deleteMany } = harness();
    await expect(service.removeRepairer(ME, TARGET)).resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list without querying profiles when nothing is favourited', async () => {
    const { service, findMany } = harness({ existing: [] });
    await expect(service.listRepairers(ME)).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('applies the shared directory predicate to the list read', async () => {
    const { service, findMany } = harness({ existing: [TARGET] });
    await service.listRepairers(ME);
    const call = findMany.mock.calls[0]?.[0];
    if (!call) throw new Error('Expected repairerProfile.findMany to be called');
    // The clause that is easy to miss, asserted rather than trusted. Corrected from the
    // brief's version to verify the AND array structure, which is the guard against the
    // key-collision bug where spreading `userId: { in: ids }` overwrites `userId: { not: ME }`.
    expect(call.where.AND).toBeDefined();
    expect(call.where.AND).toHaveLength(2);
    // TypeScript needs an explicit guard since `toBeDefined()` isn't a type guard.
    if (!call.where.AND) throw new Error('AND array is missing');
    expect(call.where.AND[0].deletedAt).toBeNull();
    expect(call.where.AND[0].userId).toEqual({ not: ME });
    expect(call.where.AND[0].user.profile).toEqual({ repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null });
    expect(call.where.AND[1].userId).toEqual({ in: [TARGET] });
  });

  /**
   * 🛑 **I1. THE TEST THAT WOULD HAVE CAUGHT THE MISSING RE-SORT.** `listRepairers` read the join
   * table `orderBy: { createdAt: 'desc' }`, derived the ids, then queried `repairerProfile` with an
   * `in:` list and NO `orderBy` and NO post-sort - so Postgres returned physical order and that
   * `orderBy` was dead code.
   *
   * The stub returns the entity rows REVERSED against the join-table order, which is the one shape
   * that fails if either the `orderBy` or the re-sort is removed. Two items is the minimum that can
   * express an order at all.
   */
  it('returns réparateurs in saved-at order even when the profile query answers reversed', async () => {
    const { service } = harness({
      existing: [TARGET, OTHER],
      profiles: [profileRow(OTHER, 'Bertrand'), profileRow(TARGET, 'Amandine')],
    });
    const result = await service.listRepairers(ME);
    expect(result.map((r) => r.userId)).toEqual([TARGET, OTHER]);
  });
});
