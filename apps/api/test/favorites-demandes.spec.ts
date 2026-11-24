import { describe, expect, it, vi } from 'vitest';
import type { DemandeStatus } from '@revime/shared';
import { FavoritesService } from '../src/favorites/favorites.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { withUserLookups } from './support/review-seal.js';

const ME = '11111111-1111-4111-8111-111111111111';
const AUTHOR = '22222222-2222-4222-8222-222222222222';
const DEMANDE = '33333333-3333-4333-8333-333333333333';
const DEMANDE_2 = '44444444-4444-4444-8444-444444444444';

/** One row shaped like `listDemandes`' own `select`. `photos: []` keeps signing short-circuited. */
function demandeRow(id: string, title: string) {
  return {
    id,
    title,
    status: 'OPEN' as const,
    locationLabel: 'Paris 75011',
    brand: null,
    model: null,
    mode: 'OFFERS' as const,
    budgetCents: null,
    lat: null,
    lng: null,
    createdAt: new Date('2026-08-20T10:00:00Z'),
    category: { labelFr: 'Téléphonie' },
    offers: [],
    photos: [],
  };
}

type Opts = {
  demande?: { authorUserId: string; deletedAt: Date | null } | null;
  /** Rows the join table holds, newest first. */
  saved?: string[];
  /** What the demande read returns for the list. */
  rows?: Array<Record<string, unknown>>;
};

function harness({
  demande = { authorUserId: AUTHOR, deletedAt: null },
  saved = [],
  rows = [],
}: Opts = {}) {
  const upsert = vi.fn().mockResolvedValue({});
  const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
  const demandeFindFirst = vi.fn().mockResolvedValue(demande);
  const demandeFindMany = vi.fn().mockResolvedValue(rows);

  const prisma = withUserLookups({
    demande: { findFirst: demandeFindFirst, findMany: demandeFindMany },
    favoriteDemande: {
      upsert,
      deleteMany,
      findMany: vi.fn().mockResolvedValue(saved.map((id) => ({ demandeId: id }))),
    },
    repairerProfile: { findFirst: vi.fn().mockResolvedValue({ lat: null, lng: null }) },
    offer: { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
  }) as unknown as PrismaService;

  return { service: new FavoritesService(prisma), upsert, deleteMany, demandeFindFirst, demandeFindMany };
}

describe('FavoritesService, demande half', () => {
  it('saves a demande', async () => {
    const { service, upsert } = harness();
    await service.addDemande(ME, DEMANDE);
    expect(upsert).toHaveBeenCalledTimes(1);
  });

  /**
   * 🛑 **M5. THIS USED TO ASSERT ONLY THAT A SECOND CALL RESOLVED**, which is true of any method
   * that does not throw and says nothing whatever about idempotency. What makes a second tap safe
   * is that the write is an `upsert` on the composite unique rather than a read-then-insert, so
   * both calls must issue the IDENTICAL upsert and neither may fall back to `create`.
   */
  it('is idempotent: a second save issues the identical upsert and never a create', async () => {
    const { service, upsert } = harness();
    await service.addDemande(ME, DEMANDE);
    await expect(service.addDemande(ME, DEMANDE)).resolves.toBeUndefined();
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert.mock.calls[0]).toEqual(upsert.mock.calls[1]);
  });

  /**
   * 🛑 **M5. NO TEST ASSERTED THE UPSERT'S PAYLOAD, so a swapped id in the `where` passed every
   * test in this file** - which matters precisely because a hand-shaped Prisma stub cannot refuse a
   * wrong field name or a wrong value. `update: {}` is what keeps a re-tap from rewriting
   * `createdAt` and silently reordering the list.
   */
  it('upserts on the composite unique with exactly the two ids, and updates nothing', async () => {
    const { service, upsert } = harness();
    await service.addDemande(ME, DEMANDE);
    expect(upsert).toHaveBeenCalledWith({
      where: { userId_demandeId: { userId: ME, demandeId: DEMANDE } },
      create: { userId: ME, demandeId: DEMANDE },
      update: {},
    });
  });

  it('refuses your own demande', async () => {
    const { service, upsert } = harness({ demande: { authorUserId: ME, deletedAt: null } });
    await expect(service.addDemande(ME, DEMANDE)).rejects.toThrow(AppException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('filters the visibility rule in the where, so a soft-deleted or hidden demande returns null', async () => {
    const { service, upsert, demandeFindFirst } = harness({ demande: null });
    await expect(service.addDemande(ME, DEMANDE)).rejects.toThrow(AppException);
    expect(upsert).not.toHaveBeenCalled();

    const call = demandeFindFirst.mock.calls[0];
    if (!call) throw new Error('Expected demandeFindFirst to be called');
    expect(call[0].where).toEqual({ id: DEMANDE, deletedAt: null, hiddenAt: null, targetRepairerUserId: null });
  });

  it('refuses a demande that does not exist', async () => {
    const { service, upsert } = harness({ demande: null });
    await expect(service.addDemande(ME, DEMANDE)).rejects.toThrow(AppException);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('removing is idempotent', async () => {
    const { service, deleteMany } = harness();
    await expect(service.removeDemande(ME, DEMANDE)).resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledTimes(1);
  });

  it('returns an empty list without reading demandes when nothing is saved', async () => {
    const { service, demandeFindMany } = harness({ saved: [] });
    await expect(service.listDemandes(ME)).resolves.toEqual([]);
    expect(demandeFindMany).not.toHaveBeenCalled();
  });

  /**
   * 🛑 THE ASSERTION THIS WHOLE TASK EXISTS FOR. The feed filters `status: 'OPEN'`; this list
   * must not, or a saved demande silently disappears when it closes.
   */
  it('does NOT filter the list by status', async () => {
    const { service, demandeFindMany } = harness({ saved: [DEMANDE] });
    await service.listDemandes(ME);
    const call = demandeFindMany.mock.calls[0];
    if (!call) throw new Error('Expected demandeFindMany to be called');
    const where = call[0].where;
    expect(where.status).toBeUndefined();
    expect(where.deletedAt).toBeNull();
    expect(where.id).toEqual({ in: [DEMANDE] });
  });

  /**
   * 🛑 B2 §5.2. The nested `offers` array feeds `assembleFeedItems`, the SAME helper `feed()`
   * uses, so this predicate and the feed's have to be one object - otherwise a saved annonce and
   * its feed card show different offer counts for the same demande. A suspended réparateur's
   * offer is neither visible nor countable.
   */
  it('counts only offers from a réparateur who is not suspended', async () => {
    const { service, demandeFindMany } = harness({ saved: [DEMANDE] });
    await service.listDemandes(ME);
    const call = demandeFindMany.mock.calls[0];
    if (!call) throw new Error('Expected demandeFindMany to be called');
    // Through `repairer.profile` and never `repairer.repairerProfile`, which is optional and
    // would drop every réparateur without that row.
    expect(call[0].select.offers.where).toEqual({
      status: 'SENT',
      deletedAt: null,
      repairer: { profile: { repairerSuspendedAt: null } },
    });
  });

  /**
   * 🛑 **I1's SIBLING. This half already re-sorted through a Map index; its counterpart in
   * `listRepairers` did not, and neither had a test.** The stub answers the entity rows REVERSED
   * against the join-table order, which is the one shape that fails if the re-sort is removed. Two
   * items is the minimum that can express an order at all.
   */
  it('returns saved annonces in saved-at order even when the demande query answers reversed', async () => {
    const { service } = harness({
      saved: [DEMANDE, DEMANDE_2],
      rows: [demandeRow(DEMANDE_2, 'Vélo'), demandeRow(DEMANDE, 'Écran cassé')],
    });
    const result = await service.listDemandes(ME);
    expect(result.map((d) => d.id)).toEqual([DEMANDE, DEMANDE_2]);
  });

  /**
   * 🛑 **`'CLOSED'` USED TO BE THE FIXTURE HERE AND IT IS NOT A VALUE THIS PRODUCT HAS.**
   * `demandeStatusSchema` is `['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']`; the string appeared
   * nowhere else in the repo, so the ONE test exercising the new field asserted a value the enum
   * forbids - and it passed, because a hand-shaped Prisma stub cannot refuse a wrong value any more
   * than it can refuse a wrong field name. `DemandeCard` was reading it back as « Clôturée », a
   * second status vocabulary that also mislabelled `IN_PROGRESS` as closed.
   *
   * Now TOTAL over the real enum, which is what makes the fixture unable to invent a fifth value:
   * `DemandeStatus` is imported, so a member added to the schema is a compile error in this array.
   */
  const STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const satisfies readonly DemandeStatus[];

  for (const status of STATUSES) {
    it(`carries status ${status} through to the DTO`, async () => {
      const { service } = harness({
        saved: [DEMANDE],
        rows: [
          {
            id: DEMANDE,
            title: 'Écran cassé',
            status,
            locationLabel: 'Paris 75011',
            brand: null,
            model: null,
            mode: 'OFFERS',
            budgetCents: null,
            lat: null,
            lng: null,
            createdAt: new Date('2026-08-20T10:00:00Z'),
            category: { labelFr: 'Téléphonie' },
            offers: [],
            photos: [],
          },
        ],
      });
      const result = await service.listDemandes(ME);
      expect(result).toHaveLength(1);
      const item = result[0];
      if (!item) throw new Error('Expected one item');
      expect(item.status).toBe(status);
      expect(item.distanceKm).toBeNull();
    });
  }
});
