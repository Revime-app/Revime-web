import { describe, expect, it, vi } from 'vitest';
import type { AdminOfferContextDto } from '@revime/shared';
import { AdminOffresService } from '../src/admin/admin-offres.service.js';
import { PAGE_SIZE } from '../src/admin/admin-constants.js';

type AdminOffresServiceWithContext = AdminOffresService & {
  getContext(id: string): Promise<AdminOfferContextDto>;
};

function prismaStub(
  rows: unknown[] = [],
  total = 0,
  revisionData: unknown[] = [],
  conversations: unknown[] = [],
  reviews: unknown[] = [],
  repairs: unknown[] = [],
) {
  const stub = {
    $transaction: vi
      .fn()
      .mockResolvedValueOnce([rows, total])
      .mockResolvedValueOnce([revisionData, conversations]),
    offer: {
      findUnique: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(total),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue(conversations),
    },
    review: {
      groupBy: vi.fn().mockResolvedValue(reviews),
    },
    commande: {
      groupBy: vi.fn().mockResolvedValue(repairs),
    },
  };
  return stub;
}

function contextStub({
  targetOffer = null as unknown,
  competingOffers = [] as unknown[],
  revisionData = [] as unknown[],
  conversations = [] as unknown[],
  reviews = [] as unknown[],
  repairs = [] as unknown[],
} = {}) {
  const stub = {
    $transaction: vi.fn().mockImplementation(async (queries: unknown[]) => {
      if (Array.isArray(queries)) {
        return Promise.all(queries);
      }
      return [revisionData, conversations];
    }),
    offer: {
      findUnique: vi.fn().mockResolvedValue(targetOffer),
      findMany: vi.fn().mockImplementation((args?: { where?: { OR?: unknown[] } }) => {
        if (args?.where?.OR) {
          return Promise.resolve(revisionData);
        }
        return Promise.resolve(competingOffers);
      }),
      count: vi.fn().mockResolvedValue(competingOffers.length),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue(conversations),
    },
    review: {
      groupBy: vi.fn().mockResolvedValue(reviews),
    },
    commande: {
      groupBy: vi.fn().mockResolvedValue(repairs),
    },
  };
  return stub;
}


const svc = (p: unknown) =>
  new AdminOffresService(p as never) as AdminOffresServiceWithContext;

describe('AdminOffresService.list', () => {
  it('clamps a NaN page to 1', async () => {
    const p = prismaStub();
    await svc(p).list({ page: Number.NaN });
    expect(p.offer.findMany.mock.calls[0]![0]!.skip).toBe(0);
  });

  it('clamps a negative page to 1', async () => {
    const p = prismaStub();
    await svc(p).list({ page: -5 });
    expect(p.offer.findMany.mock.calls[0]![0]!.skip).toBe(0);
  });

  it('pages with PAGE_SIZE', async () => {
    const p = prismaStub();
    await svc(p).list({ page: 3 });
    expect(p.offer.findMany.mock.calls[0]![0]!.skip).toBe(2 * PAGE_SIZE);
    expect(p.offer.findMany.mock.calls[0]![0]!.take).toBe(PAGE_SIZE);
  });

  /**
   * 🛑 The default shows every state, including withdrawn offers. An operator looking at
   * offers must see offers on demandes he has hidden, and offers that have been withdrawn.
   */
  it('shows every state by default', async () => {
    const p = prismaStub();
    await svc(p).list({});
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('deletedAt');
  });

  it('etat=retiree filters on deletedAt set', async () => {
    const p = prismaStub();
    await svc(p).list({ etat: 'retiree' });
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ deletedAt: { not: null } }],
    });
  });

  it('etat=visible filters on deletedAt null', async () => {
    const p = prismaStub();
    await svc(p).list({ etat: 'visible' });
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ deletedAt: null }],
    });
  });

  it('statut=SENT filters on status', async () => {
    const p = prismaStub();
    await svc(p).list({ statut: 'SENT' });
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ status: 'SENT' }],
    });
  });

  it('ignores unknown statut value', async () => {
    const p = prismaStub();
    await svc(p).list({ statut: 'UNKNOWN' });
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('status');
  });

  it('searches q in repairer name, email, username, demande title, comment, warrantyLabel, partsLabel', async () => {
    const p = prismaStub();
    await svc(p).list({ q: 'test query' });
    const where = p.offer.findMany.mock.calls[0]![0]!.where;
    expect(where.AND[0]!.OR).toEqual(
      expect.arrayContaining([
        { repairer: { name: { contains: 'test query', mode: 'insensitive' } } },
        { repairer: { email: { contains: 'test query', mode: 'insensitive' } } },
        { repairer: { username: { contains: 'test query', mode: 'insensitive' } } },
        { demande: { title: { contains: 'test query', mode: 'insensitive' } } },
        { comment: { contains: 'test query', mode: 'insensitive' } },
        { warrantyLabel: { contains: 'test query', mode: 'insensitive' } },
        { partsLabel: { contains: 'test query', mode: 'insensitive' } },
      ]),
    );
  });

  it('adds no filter for blank q', async () => {
    const p = prismaStub();
    await svc(p).list({ q: '   ' });
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('OR');
  });

  it('filters date range on createdAt with inclusive upper bound', async () => {
    const p = prismaStub();
    await svc(p).list({ du: '2026-09-01', au: '2026-09-30' });
    const where = p.offer.findMany.mock.calls[0]![0]!.where;
    expect(where.AND[0]!.createdAt).toMatchObject({
      gte: new Date('2026-09-01'),
      lt: new Date('2026-10-01'),
    });
  });

  /**
   * 🛑 The single-day query (du === au) must produce bounds exactly one day apart.
   * Without this, the natural query for « offers created on 30 September » returns empty.
   */
  it('du === au produces gte and lt exactly one day apart', async () => {
    const p = prismaStub();
    await svc(p).list({ du: '2026-09-30', au: '2026-09-30' });
    const where = p.offer.findMany.mock.calls[0]![0]!.where;
    expect(where.AND[0]!.createdAt).toMatchObject({
      gte: new Date('2026-09-30'),
      lt: new Date('2026-10-01'),
    });
  });

  it('ignores unparseable date', async () => {
    const p = prismaStub();
    await svc(p).list({ du: 'not-a-date' });
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('createdAt');
  });

  it('computes the revision chain from the réparateur ordered offers on that demande', async () => {
    const offer = {
      id: 'o2',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 11000,
      delayHours: 48,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-02'),
      deletedAt: null,
      demande: { title: 'Demande 1' },
      repairer: { name: 'Repairer 1' },
    };

    const revisionData = [
      { id: 'o1', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-01') },
      { id: 'o2', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-02') },
      { id: 'o3', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-03') },
    ];

    // The service is asked for o2; it must report position 2 of 3.
    const p = prismaStub([offer], 1, revisionData, []);
    const result = await svc(p).list({});
    expect(result.items[0]!.revision).toEqual({ position: 2, total: 3 });
  });

  /**
   * 🛑 A single offer is 1 of 1, not 0 of 0 and not 1 of 0. Pinned because an off-by-one in
   * a « révision 1 sur 0 » label is the kind of thing that reads as a data problem.
   */
  it('reports 1 of 1 for a réparateur first and only offer', async () => {
    const offer = {
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 10000,
      delayHours: 24,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-01'),
      deletedAt: null,
      demande: { title: 'Demande 1' },
      repairer: { name: 'Repairer 1' },
    };

    const revisionData = [
      { id: 'o1', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-01') },
    ];

    const p = prismaStub([offer], 1, revisionData, []);
    const result = await svc(p).list({});
    expect(result.items[0]!.revision).toEqual({ position: 1, total: 1 });
  });

  it('counts conversation reports keyed by demandeId and repairerUserId', async () => {
    const offer = {
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 10000,
      delayHours: 24,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-01'),
      deletedAt: null,
      demande: { title: 'Demande 1' },
      repairer: { name: 'Repairer 1' },
    };

    const revisionData = [
      { id: 'o1', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-01') },
    ];

    const conversations = [{ demandeId: 'd1', repairerUserId: 'r1', _count: { reports: 3 } }];

    const p = prismaStub([offer], 1, revisionData, conversations);
    const result = await svc(p).list({});
    expect(result.items[0]!.conversationReportCount).toBe(3);
  });

  it('returns 0 conversation reports when none exist', async () => {
    const offer = {
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 10000,
      delayHours: 24,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-01'),
      deletedAt: null,
      demande: { title: 'Demande 1' },
      repairer: { name: 'Repairer 1' },
    };

    const revisionData = [
      { id: 'o1', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-01') },
    ];

    const p = prismaStub([offer], 1, revisionData, []);
    const result = await svc(p).list({});
    expect(result.items[0]!.conversationReportCount).toBe(0);
  });

  it('returns pagination metadata', async () => {
    const p = prismaStub([], 42);
    const result = await svc(p).list({ page: 2 });
    expect(result).toMatchObject({
      items: [],
      total: 42,
      page: 2,
      pageSize: 25,
    });
  });

  /**
   * Pins that conversation reports are keyed by BOTH demandeId AND repairerUserId.
   * Without this, keying by demandeId alone would attribute all reports on a demande
   * to every offer on it, which is the bug mutation 3 checks for.
   */
  it('distinguishes conversation reports per réparateur on same demande', async () => {
    const offer1 = {
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 10000,
      delayHours: 24,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-01'),
      deletedAt: null,
      demande: { title: 'Demande 1' },
      repairer: { name: 'Repairer 1' },
    };

    const offer2 = {
      id: 'o2',
      demandeId: 'd1',
      repairerUserId: 'r2',
      priceCents: 12000,
      delayHours: 48,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'HOME',
      acceptsParcel: true,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-02'),
      deletedAt: null,
      demande: { title: 'Demande 1' },
      repairer: { name: 'Repairer 2' },
    };

    const revisionData = [
      { id: 'o1', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-01') },
      { id: 'o2', demandeId: 'd1', repairerUserId: 'r2', createdAt: new Date('2026-09-02') },
    ];

    // Two conversations on same demande, different repairers, different report counts
    const conversations = [
      { demandeId: 'd1', repairerUserId: 'r1', _count: { reports: 3 } },
      { demandeId: 'd1', repairerUserId: 'r2', _count: { reports: 5 } },
    ];

    const p = prismaStub([offer1, offer2], 2, revisionData, conversations);
    const result = await svc(p).list({});
    expect(result.items[0]!.conversationReportCount).toBe(3);
    expect(result.items[1]!.conversationReportCount).toBe(5);
  });

  it('maps DB RepairerKind and repairerStats to AdminOffreListItem in list()', async () => {
    const offerPro = {
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 10000,
      delayHours: 24,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-01'),
      deletedAt: null,
      deletedReason: null,
      deletedByUserId: null,
      demande: { title: 'Demande 1' },
      repairer: {
        name: 'Pro Repairer',
        repairerProfile: { kind: 'PRO' },
      },
    };

    const offerIndividual = {
      id: 'o2',
      demandeId: 'd1',
      repairerUserId: 'r2',
      priceCents: 12000,
      delayHours: 48,
      warrantyLabel: 'Warranty',
      partsLabel: 'Parts',
      travel: 'HOME',
      acceptsParcel: true,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-02'),
      deletedAt: null,
      deletedReason: null,
      deletedByUserId: null,
      demande: { title: 'Demande 1' },
      repairer: {
        name: 'Indiv Repairer',
        repairerProfile: { kind: 'INDIVIDUAL' },
      },
    };

    const revisionData = [
      { id: 'o1', demandeId: 'd1', repairerUserId: 'r1', createdAt: new Date('2026-09-01') },
      { id: 'o2', demandeId: 'd1', repairerUserId: 'r2', createdAt: new Date('2026-09-02') },
    ];
    const conversations = [
      { demandeId: 'd1', repairerUserId: 'r1', _count: { reports: 1 } },
      { demandeId: 'd1', repairerUserId: 'r2', _count: { reports: 0 } },
    ];
    const reviews = [
      { repairerUserId: 'r1', _avg: { rating: 4.9 }, _count: { _all: 25 } },
    ];

    const p = prismaStub([offerPro, offerIndividual], 2, revisionData, conversations, reviews);
    const result = await svc(p).list({});

    expect(result.items[0]!.repairerKind).toBe('PROFESSIONNEL');
    expect(result.items[0]!.repairerRating).toBe(4.9);
    expect(result.items[0]!.repairerReviewCount).toBe(25);

    expect(result.items[1]!.repairerKind).toBe('PARTICULIER');
    expect(result.items[1]!.repairerRating).toBeNull();
    expect(result.items[1]!.repairerReviewCount).toBe(0);
  });


  it('kind=PARTICULIER filters on repairer repairerProfile kind INDIVIDUAL', async () => {
    const p = prismaStub();
    await svc(p).list({ kind: 'PARTICULIER' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ repairer: { repairerProfile: { kind: 'INDIVIDUAL' } } }],
    });
  });

  it('kind=PROFESSIONNEL filters on repairer repairerProfile kind PRO', async () => {
    const p = prismaStub();
    await svc(p).list({ kind: 'PROFESSIONNEL' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ repairer: { repairerProfile: { kind: 'PRO' } } }],
    });
  });


  it('ignores unknown kind value', async () => {
    const p = prismaStub();
    await svc(p).list({ kind: 'UNKNOWN' } as never);
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('repairerProfile');
  });

  it('travel=WORKSHOP filters on travel mode', async () => {
    const p = prismaStub();
    await svc(p).list({ travel: 'WORKSHOP' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ travel: 'WORKSHOP' }],
    });
  });

  it('travel=HOME filters on travel mode', async () => {
    const p = prismaStub();
    await svc(p).list({ travel: 'HOME' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ travel: 'HOME' }],
    });
  });

  it('ignores unknown travel value', async () => {
    const p = prismaStub();
    await svc(p).list({ travel: 'UNKNOWN' } as never);
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('travel');
  });

  it('parcel=true filters on acceptsParcel true', async () => {
    const p = prismaStub();
    await svc(p).list({ parcel: 'true' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ acceptsParcel: true }],
    });
  });

  it('parcel=false does not filter on acceptsParcel', async () => {
    const p = prismaStub();
    await svc(p).list({ parcel: 'false' } as never);
    const where = JSON.stringify(p.offer.findMany.mock.calls[0]![0]!.where);
    expect(where).not.toContain('acceptsParcel');
  });

  it('minPriceCents filters on priceCents gte', async () => {
    const p = prismaStub();
    await svc(p).list({ minPriceCents: 1500 } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ priceCents: { gte: 1500 } }],
    });
  });

  it('maxPriceCents filters on priceCents lte', async () => {
    const p = prismaStub();
    await svc(p).list({ maxPriceCents: 9000 } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ priceCents: { lte: 9000 } }],
    });
  });

  it('minPriceCents and maxPriceCents filter on priceCents range', async () => {
    const p = prismaStub();
    await svc(p).list({ minPriceCents: 1500, maxPriceCents: 9000 } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.where).toEqual({
      AND: [{ priceCents: { gte: 1500, lte: 9000 } }],
    });
  });

  it('sortBy=created_desc sorts by createdAt desc (default)', async () => {
    const p = prismaStub();
    await svc(p).list({ sortBy: 'created_desc' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.orderBy).toEqual({ createdAt: 'desc' });
  });

  it('sortBy=created_asc sorts by createdAt asc', async () => {
    const p = prismaStub();
    await svc(p).list({ sortBy: 'created_asc' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.orderBy).toEqual({ createdAt: 'asc' });
  });

  it('sortBy=price_asc sorts by priceCents asc', async () => {
    const p = prismaStub();
    await svc(p).list({ sortBy: 'price_asc' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.orderBy).toEqual({ priceCents: 'asc' });
  });

  it('sortBy=price_desc sorts by priceCents desc', async () => {
    const p = prismaStub();
    await svc(p).list({ sortBy: 'price_desc' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.orderBy).toEqual({ priceCents: 'desc' });
  });

  it('ignores unknown sortBy and defaults to createdAt desc', async () => {
    const p = prismaStub();
    await svc(p).list({ sortBy: 'unknown_sort' } as never);
    expect(p.offer.findMany.mock.calls[0]![0]!.orderBy).toEqual({ createdAt: 'desc' });
  });
});

describe('AdminOffresService.getContext', () => {
  it('throws 404 Ressource introuvable. when offer does not exist', async () => {
    const p = contextStub({ targetOffer: null });
    await expect(svc(p).getContext('non-existent')).rejects.toThrow('Ressource introuvable.');
  });

  it('returns target offer, demande context, competing offers, and price statistics', async () => {
    const targetOffer = {
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 15000,
      delayHours: 24,
      warrantyLabel: '6 mois',
      partsLabel: 'Originales',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: 'Réparation rapide',
      status: 'SENT',
      createdAt: new Date('2026-09-02T10:00:00.000Z'),
      deletedAt: null,
      deletedReason: null,
      deletedByUserId: null,
      demande: {
        id: 'd1',
        title: 'Écran iPhone 13 brisé',
        budgetCents: 20000,
        mode: 'OFFERS',
        status: 'OPEN',
        locationLabel: 'Paris 11e',
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
        category: { labelFr: 'Smartphones', slug: 'smartphones' },
        author: { id: 'u-client', name: 'Alice Martin' },
      },
      repairer: {
        name: 'Bob Réparateur',
        repairerProfile: {
          kind: 'PRO',
        },
      },
    };

    const competingOffers = [
      {
        id: 'o2',
        demandeId: 'd1',
        repairerUserId: 'r2',
        priceCents: 10000,
        delayHours: 48,
        warrantyLabel: '3 mois',
        partsLabel: 'Compatibles',
        travel: 'HOME',
        acceptsParcel: true,
        status: 'SENT',
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
        repairer: {
          name: 'Charlie Pro',
          repairerProfile: { kind: 'INDIVIDUAL' },
        },
      },
      {
        id: 'o1',
        demandeId: 'd1',
        repairerUserId: 'r1',
        priceCents: 15000,
        delayHours: 24,
        warrantyLabel: '6 mois',
        partsLabel: 'Originales',
        travel: 'WORKSHOP',
        acceptsParcel: false,
        status: 'SENT',
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        repairer: {
          name: 'Bob Réparateur',
          repairerProfile: { kind: 'PRO' },
        },
      },
      {
        id: 'o3',
        demandeId: 'd1',
        repairerUserId: 'r3',
        priceCents: 20000,
        delayHours: 72,
        warrantyLabel: '12 mois',
        partsLabel: 'Originales',
        travel: 'WORKSHOP',
        acceptsParcel: false,
        status: 'SENT',
        createdAt: new Date('2026-09-03T14:00:00.000Z'),
        repairer: {
          name: 'David Expert',
          repairerProfile: { kind: 'PRO' },
        },
      },
    ];

    const p = contextStub({
      targetOffer,
      competingOffers,
      revisionData: [
        {
          id: 'o1',
          demandeId: 'd1',
          repairerUserId: 'r1',
          createdAt: new Date('2026-09-02T10:00:00.000Z'),
        },
      ],
      reviews: [
        { repairerUserId: 'r1', _avg: { rating: 4.8 }, _count: { _all: 15 } },
        { repairerUserId: 'r2', _avg: { rating: 4.2 }, _count: { _all: 5 } },
        { repairerUserId: 'r3', _avg: { rating: 5.0 }, _count: { _all: 20 } },
      ],
    });

    const result = await svc(p).getContext('o1');

    // Demande context
    expect(result.demande).toEqual({
      id: 'd1',
      title: 'Écran iPhone 13 brisé',
      categoryName: 'Smartphones',
      categorySlug: 'smartphones',
      budgetCents: 20000,
      mode: 'OFFERS',
      status: 'OPEN',
      authorName: 'Alice Martin',
      authorUserId: 'u-client',
      locationLabel: 'Paris 11e',
      createdAt: '2026-09-01T08:00:00.000Z',
    });

    // Target offer item
    expect(result.offer).toMatchObject({
      offerId: 'o1',
      demandeId: 'd1',
      priceCents: 15000,
      repairerUserId: 'r1',
      repairerName: 'Bob Réparateur',
      repairerKind: 'PROFESSIONNEL',
      repairerRating: 4.8,
      repairerReviewCount: 15,
      withdrawn: false,
    });

    // Competing offers with isCurrent flag
    expect(result.competingOffers).toHaveLength(3);
    expect(result.competingOffers[0]).toMatchObject({
      id: 'o2',
      priceCents: 10000,
      isCurrent: false,
    });
    expect(result.competingOffers[1]).toMatchObject({
      id: 'o1',
      priceCents: 15000,
      isCurrent: true,
    });
    expect(result.competingOffers[2]).toMatchObject({
      id: 'o3',
      priceCents: 20000,
      isCurrent: false,
    });

    // Computed statistics: min 10000, avg (10000+15000+20000)/3 = 15000, max 20000
    expect(result.stats).toEqual({
      totalOffers: 3,
      lowestPriceCents: 10000,
      averagePriceCents: 15000,
      highestPriceCents: 20000,
    });
  });

  it('calculates stats correctly when only one offer exists', async () => {
    const targetOffer = {
      id: 'o1',
      demandeId: 'd1',
      repairerUserId: 'r1',
      priceCents: 12000,
      delayHours: 24,
      warrantyLabel: '6 mois',
      partsLabel: 'Originales',
      travel: 'WORKSHOP',
      acceptsParcel: false,
      comment: null,
      status: 'SENT',
      createdAt: new Date('2026-09-02T10:00:00.000Z'),
      deletedAt: null,
      deletedReason: null,
      deletedByUserId: null,
      demande: {
        id: 'd1',
        title: 'Machine à laver',
        budgetCents: null,
        mode: 'OFFERS',
        status: 'OPEN',
        locationLabel: 'Lyon',
        createdAt: new Date('2026-09-01T08:00:00.000Z'),
        category: { labelFr: 'Électroménager', slug: 'electromenager' },
        author: { id: 'u-1', name: 'Client' },
      },
      repairer: {
        name: 'Réparateur',
        repairerProfile: { kind: 'PARTICULIER', ratingAvg: null, reviewCount: 0 },
      },
    };

    const competingOffers = [
      {
        id: 'o1',
        demandeId: 'd1',
        repairerUserId: 'r1',
        priceCents: 12000,
        delayHours: 24,
        warrantyLabel: '6 mois',
        partsLabel: 'Originales',
        travel: 'WORKSHOP',
        acceptsParcel: false,
        status: 'SENT',
        createdAt: new Date('2026-09-02T10:00:00.000Z'),
        repairer: {
          name: 'Réparateur',
          repairerProfile: { kind: 'PARTICULIER', ratingAvg: null, reviewCount: 0 },
        },
      },
    ];

    const p = contextStub({
      targetOffer,
      competingOffers,
      revisionData: [
        {
          id: 'o1',
          demandeId: 'd1',
          repairerUserId: 'r1',
          createdAt: new Date('2026-09-02T10:00:00.000Z'),
        },
      ],
    });

    const result = await svc(p).getContext('o1');
    expect(result.stats).toEqual({
      totalOffers: 1,
      lowestPriceCents: 12000,
      averagePriceCents: 12000,
      highestPriceCents: 12000,
    });
    expect(result.competingOffers[0]!.isCurrent).toBe(true);
  });
});
