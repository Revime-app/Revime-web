import { describe, expect, it, vi } from 'vitest';
import { RepairersService } from '../src/repairers/repairers.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import { withUserLookups } from './support/review-seal.js';

/**
 * `CF-34` gave `RepairersService` a second constructor argument. This stub resolves nothing,
 * which is correct for every test in this file: none sends `near`, so `lookupPostalCode` must
 * never be called. Returning null rather than throwing keeps the failure mode "distance is
 * absent" rather than "the suite explodes" if one ever does.
 */
const noGeocode = {
  lookupPostalCode: () => Promise.resolve(null),
} as unknown as GeocodeService;

/**
 * `CF-33`. What the filter puts into the directory's `where` - and, above all, what it must
 * NOT take out of it.
 */

const CALLER = '11111111-1111-4111-8111-111111111111';
const ROOT = '22222222-2222-4222-8222-222222222222';
const CHILD = '33333333-3333-4333-8333-333333333333';

type Harness = { service: RepairersService; findMany: ReturnType<typeof vi.fn> };

function harness(category: { id: string; parentId: string | null; children: { id: string }[] } | null): Harness {
  const findMany = vi.fn().mockImplementation(() => Promise.resolve([]));
  const prisma = withUserLookups({
    repairerProfile: { findMany },
    category: { findFirst: vi.fn().mockImplementation(() => Promise.resolve(category)) },
    review: { groupBy: vi.fn().mockImplementation(() => Promise.resolve([])) },
    commande: { groupBy: vi.fn().mockImplementation(() => Promise.resolve([])) },
  }) as unknown as PrismaService;
  return { service: new RepairersService(prisma, noGeocode), findMany };
}

// PUB-33 (DECP-23): the store-review seal always sits first under AND (a real caller here).
const SEAL = { user: { email: { not: { endsWith: '@review.revime.fr' }, mode: 'insensitive' } } };

const whereOf = (findMany: ReturnType<typeof vi.fn>) =>
  (findMany.mock.calls[0] as [{ where: Record<string, unknown> }])[0].where;

describe('the unfiltered directory is untouched', () => {
  it('adds no speciality clause when no categoryId is sent, only the store-review seal', async () => {
    const h = harness(null);
    await h.service.list(CALLER, {});
    expect(whereOf(h.findMany).AND).toEqual([SEAL]);
  });

  it('does not resolve a category when none was asked for', async () => {
    const h = harness(null);
    await h.service.list(CALLER, {});
    // One query for the page, not two: §7 says the extra round trip happens ONLY when the
    // filter is present.
    expect(h.findMany).toHaveBeenCalledTimes(1);
  });
});

describe('the filter composes rather than replaces', () => {
  it('🛑 KEEPS directoryWhere\'s user.profile clause, which a second `user` key would clobber', async () => {
    // THE REGRESSION THIS TASK EXISTS TO PREVENT. `directoryWhere` returns
    // `user: { profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } }`.
    // Spreading `{ user: { repairerCategories: … } }` after it REPLACES that key, and the filtered
    // directory would then return réparateurs who disabled the mode, deleted their account, or are
    // suspended. Both spellings are valid Prisma input, so `tsc` cannot see the difference.
    const h = harness({ id: CHILD, parentId: ROOT, children: [] });
    await h.service.list(CALLER, { categoryId: CHILD });
    const where = whereOf(h.findMany);
    expect(where.user).toEqual({ profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } });
    expect(where.deletedAt).toBeNull();
    expect(where.userId).toEqual({ not: CALLER });
  });

  it('puts the speciality condition under AND, matching the child truth-table row', async () => {
    const h = harness({ id: CHILD, parentId: ROOT, children: [] });
    await h.service.list(CALLER, { categoryId: CHILD });
    expect(whereOf(h.findMany).AND).toEqual([
      SEAL,
      { user: { repairerCategories: { some: { categoryId: { in: [CHILD, ROOT] } } } } },
    ]);
  });

  it('matches a root filter against the root and its children', async () => {
    const h = harness({ id: ROOT, parentId: null, children: [{ id: CHILD }] });
    await h.service.list(CALLER, { categoryId: ROOT });
    expect(whereOf(h.findMany).AND).toEqual([
      SEAL,
      { user: { repairerCategories: { some: { categoryId: { in: [ROOT, CHILD] } } } } },
    ]);
  });

  it('still applies the name search alongside the filter', async () => {
    const h = harness({ id: CHILD, parentId: ROOT, children: [] });
    await h.service.list(CALLER, { categoryId: CHILD, q: 'Lyon' });
    expect(whereOf(h.findMany).displayName).toEqual({ contains: 'Lyon', mode: 'insensitive' });
    expect(whereOf(h.findMany).AND).toBeDefined();
  });
});

describe('an unusable categoryId is refused', () => {
  it('throws rather than answering an empty list', async () => {
    // A guessed filter value returning 0 rows rather than an error is a failure mode this
    // project has already paid for once. USABLE_CATEGORY: if a category cannot be offered to a
    // client, it cannot be accepted from one.
    const h = harness(null);
    await expect(h.service.list(CALLER, { categoryId: ROOT })).rejects.toThrow(AppException);
    expect(h.findMany).not.toHaveBeenCalled();
  });
});
