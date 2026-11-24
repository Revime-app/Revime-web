import { describe, expect, it, vi } from 'vitest';
import { feedQuerySchema, type FeedQuery } from '@revime/shared';
import { DemandesService } from '../src/demandes/demandes.service.js';
import { matchingDemandeWhere } from '../src/demandes/matching-demande-where.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { GeocodeService } from '../src/geo/geocode.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import { withUserLookups } from './support/review-seal.js';

/**
 * CF4-26 / G8 (spec §4.4). The feed's « Pour moi » filter narrows the feed with the SAME
 * where-builder as the dashboard count, so the number on the line and the list agree.
 */

function harness(declared: { categoryId: string }[] = [{ categoryId: 'c1' }]) {
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = withUserLookups({
    profile: { findFirst: vi.fn().mockResolvedValue({ repairerEnabled: true }) },
    repairerProfile: { findFirst: vi.fn().mockResolvedValue({ lat: null, lng: null }) },
    repairerCategory: { findMany: vi.fn().mockResolvedValue(declared) },
    category: {
      findMany: vi.fn().mockResolvedValue([{ id: 'c1', parentId: null }]),
      // `categoryIdsFor` (the existing categoryId filter) reads the tree too.
      findUnique: vi.fn().mockResolvedValue({ id: 'c1', parentId: null, children: [] }),
      findFirst: vi.fn().mockResolvedValue({ id: 'c1', parentId: null, children: [] }),
    },
    demande: { findMany },
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'match-1' }]),
  }) as unknown as PrismaService;
  const service = new DemandesService(
    prisma,
    {} as GeocodeService,
    {} as unknown as NotificationsService,
  );
  return { service, findMany };
}

const whereOf = (findMany: ReturnType<typeof vi.fn>) =>
  findMany.mock.calls[0]?.[0].where as Record<string, unknown>;

describe('feedQuerySchema.matching', () => {
  it("accepts '1' and absence, rejects anything else", () => {
    expect(feedQuerySchema.parse({ matching: '1' }).matching).toBe('1');
    expect(feedQuerySchema.parse({}).matching).toBeUndefined();
    expect(() => feedQuerySchema.parse({ matching: 'true' })).toThrow();
  });
});

describe('DemandesService.feed with matching=1', () => {
  it('ANDs matchingDemandeWhere into the feed where', async () => {
    const { service, findMany } = harness();
    await service.feed('me', { matching: '1' } as FeedQuery);
    const where = whereOf(findMany);
    expect(where.AND).toEqual([matchingDemandeWhere('me', ['c1'])]);
    // The feed's own base clauses stay.
    expect(where).toMatchObject({
      status: 'OPEN',
      authorUserId: { not: 'me' },
      deletedAt: null,
      hiddenAt: null,
    });
  });

  it('keeps the search and category filters alongside it', async () => {
    const { service, findMany } = harness();
    await service.feed('me', { matching: '1', q: 'écran' } as FeedQuery);
    const where = whereOf(findMany);
    expect(where.id).toEqual({ in: ['match-1'] });
    expect(where.AND).toEqual([matchingDemandeWhere('me', ['c1'])]);
  });

  it('intersects with a categoryId filter rather than replacing it', async () => {
    const { service, findMany } = harness();
    const pick = '11111111-1111-4111-8111-111111111111';
    await service.feed('me', { matching: '1', categoryId: pick } as FeedQuery);
    const where = whereOf(findMany);
    // The explicit filter's own clause is still there, top-level ...
    expect((where.categoryId as { in: string[] }).in).toContain(pick);
    // ... and the matching clause, with ITS category set, sits beside it under AND.
    expect(where.AND).toEqual([matchingDemandeWhere('me', ['c1'])]);
  });

  it('no declared categories -> [] without reading demandes', async () => {
    const { service, findMany } = harness([]);
    expect(await service.feed('me', { matching: '1' } as FeedQuery)).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('without matching the where is unchanged from today', async () => {
    const { service, findMany } = harness();
    await service.feed('me', {} as FeedQuery);
    expect(Object.keys(whereOf(findMany)).sort()).toEqual(
      // CF4-25 added `targetRepairerUserId` (public only); PUB-33 (DECP-23) the store-review seal
      // on `author`; matching still adds nothing.
      ['author', 'authorUserId', 'deletedAt', 'hiddenAt', 'status', 'targetRepairerUserId'].sort(),
    );
  });
});
