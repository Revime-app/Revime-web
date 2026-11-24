import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDepartmentInfo, FRENCH_DEPARTMENTS } from '../src/admin/admin-stats-geo.js';
import { AdminStatsService } from '../src/admin/admin-stats.service.js';
import { GENUINE_COLLECTED_COMMANDE_WHERE, GENUINE_USER_WHERE } from '../src/admin/admin-constants.js';
import type { AdminStatsOverviewDto } from '@revime/shared';

// ISS-131: the leaderboard avatars. `profile.avatarPath` is a path inside the PRIVATE photo bucket,
// not a URL, so it must be signed before the admin can use it as an <img src>.
const storage = vi.hoisted(() => ({
  configured: true,
  createSignedReadUrls: vi.fn(),
}));
vi.mock('../src/storage/gateway.js', () => ({
  isStorageConfigured: () => storage.configured,
  storageGateway: () => ({ createSignedReadUrls: storage.createSignedReadUrls }),
}));

function makePrismaMock() {
  return {
    demande: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    commande: {
      findMany: vi.fn(),
      aggregate: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    offer: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn((callbackOrOps: any) => {
      if (typeof callbackOrOps === 'function') {
        return callbackOrOps(makePrismaMock());
      }
      return Promise.all(callbackOrOps);
    }),
  } as any;
}

describe('French Departments Geo Dictionary (getDepartmentInfo)', () => {
  it('maps metropolitan postal codes to department code and name', () => {
    expect(getDepartmentInfo('75001')).toEqual({ code: '75', name: 'Paris' });
    expect(getDepartmentInfo('69002')).toEqual({ code: '69', name: 'Rhône' });
    expect(getDepartmentInfo('13001')).toEqual({ code: '13', name: 'Bouches-du-Rhône' });
    expect(getDepartmentInfo('33000')).toEqual({ code: '33', name: 'Gironde' });
    expect(getDepartmentInfo('59000')).toEqual({ code: '59', name: 'Nord' });
  });

  it('maps Corsican postal codes to 2A and 2B correctly', () => {
    // 20000-20199 -> 2A (Corse-du-Sud)
    expect(getDepartmentInfo('20000')).toEqual({ code: '2A', name: 'Corse-du-Sud' });
    expect(getDepartmentInfo('20167')).toEqual({ code: '2A', name: 'Corse-du-Sud' });
    // 20200+ -> 2B (Haute-Corse)
    expect(getDepartmentInfo('20200')).toEqual({ code: '2B', name: 'Haute-Corse' });
    expect(getDepartmentInfo('20600')).toEqual({ code: '2B', name: 'Haute-Corse' });
  });

  it('maps DOM-TOM 3-digit postal codes correctly', () => {
    expect(getDepartmentInfo('97100')).toEqual({ code: '971', name: 'Guadeloupe' });
    expect(getDepartmentInfo('97200')).toEqual({ code: '972', name: 'Martinique' });
    expect(getDepartmentInfo('97300')).toEqual({ code: '973', name: 'Guyane' });
    expect(getDepartmentInfo('97400')).toEqual({ code: '974', name: 'La Réunion' });
    expect(getDepartmentInfo('97600')).toEqual({ code: '976', name: 'Mayotte' });
  });

  it('accepts direct department codes', () => {
    expect(getDepartmentInfo('75')).toEqual({ code: '75', name: 'Paris' });
    expect(getDepartmentInfo('2A')).toEqual({ code: '2A', name: 'Corse-du-Sud' });
    expect(getDepartmentInfo('974')).toEqual({ code: '974', name: 'La Réunion' });
  });

  it('handles invalid or unknown postal codes gracefully', () => {
    const unknown = getDepartmentInfo('99999');
    expect(unknown.code).toBe('99');
    expect(unknown.name).toBe('Inconnu');

    const empty = getDepartmentInfo('');
    expect(empty.code).toBe('UNKNOWN');
    expect(empty.name).toBe('Inconnu');
  });

  it('exports complete dictionary with at least 100 departments', () => {
    expect(Object.keys(FRENCH_DEPARTMENTS).length).toBeGreaterThanOrEqual(100);
    expect(FRENCH_DEPARTMENTS['75']).toBe('Paris');
    expect(FRENCH_DEPARTMENTS['2A']).toBe('Corse-du-Sud');
    expect(FRENCH_DEPARTMENTS['2B']).toBe('Haute-Corse');
    expect(FRENCH_DEPARTMENTS['974']).toBe('La Réunion');
  });
});

describe('AdminStatsService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AdminStatsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminStatsService(prisma);
  });

  describe('Period Boundaries & Comparison Period', () => {
    it('defaults to 30d period and calculates contiguous comparison window', async () => {
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({});

      expect(result.period).toBe('30d');
      expect(result.comparisonPeriod).not.toBeNull();

      const start = new Date(result.startDate).getTime();
      const end = new Date(result.endDate).getTime();
      const priorStart = new Date(result.comparisonPeriod!.startDate).getTime();
      const priorEnd = new Date(result.comparisonPeriod!.endDate).getTime();

      // Duration is 30 days
      expect(end - start).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -3);
      // Contiguous: priorEnd equals start
      expect(priorEnd).toBe(start);
      // Prior duration matches current duration
      expect(priorEnd - priorStart).toBe(end - start);
    });

    it('handles 7d, 90d, 12m, and all periods', async () => {
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const res7d = await service.getOverview({ period: '7d' });
      expect(res7d.period).toBe('7d');
      const diff7d = new Date(res7d.endDate).getTime() - new Date(res7d.startDate).getTime();
      expect(diff7d).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -3);

      const res90d = await service.getOverview({ period: '90d' });
      expect(res90d.period).toBe('90d');
      const diff90d = new Date(res90d.endDate).getTime() - new Date(res90d.startDate).getTime();
      expect(diff90d).toBeCloseTo(90 * 24 * 60 * 60 * 1000, -3);

      const res12m = await service.getOverview({ period: '12m' });
      expect(res12m.period).toBe('12m');
      const diff12m = new Date(res12m.endDate).getTime() - new Date(res12m.startDate).getTime();
      expect(diff12m).toBeCloseTo(365 * 24 * 60 * 60 * 1000, -3);

      const resAll = await service.getOverview({ period: 'all' });
      expect(resAll.period).toBe('all');
      expect(resAll.comparisonPeriod).toBeNull();
      expect(resAll.kpis.totalDemandes.changePct).toBeNull();
      expect(resAll.kpis.acceptanceRate.changePct).toBeNull();
      expect(resAll.kpis.averageResponseTimeMinutes.changePct).toBeNull();
      expect(resAll.kpis.totalGmvCents.changePct).toBeNull();
      expect(resAll.kpis.totalCommissionsCents.changePct).toBeNull();
      expect(resAll.kpis.totalRegistrations.changePct).toBeNull();
    });
  });

  describe('Indicator 1: repairsByCategory', () => {
    it('groups paid orders by category and calculates count, volumeCents, and percentage', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.commande.findMany.mockImplementation(({ where }: any) => {
        // Return current period orders
        if (where?.paidAt?.gte || where?.OR) {
          return Promise.resolve([
            {
              id: 'cmd-1',
              status: 'PAID',
              totalCents: 10000,
              protectionCents: 1000,
              repairCents: 8000,
              paidAt: now,
              demande: { categoryId: 'cat-phones', postalCode: '75001', category: { labelFr: 'Téléphonie' } },
            },
            {
              id: 'cmd-2',
              status: 'PAID',
              totalCents: 15000,
              protectionCents: 1500,
              repairCents: 12000,
              paidAt: now,
              demande: { categoryId: 'cat-phones', postalCode: '75002', category: { labelFr: 'Téléphonie' } },
            },
            {
              id: 'cmd-3',
              status: 'PAID',
              totalCents: 20000,
              protectionCents: 2000,
              repairCents: 16000,
              paidAt: now,
              demande: { categoryId: 'cat-computers', postalCode: '69001', category: { labelFr: 'Informatique' } },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getOverview({ period: '30d' });

      expect(result.repairsByCategory).toHaveLength(2);
      // Sorted by count descending: cat-phones (2) then cat-computers (1)
      expect(result.repairsByCategory[0]).toEqual({
        categoryId: 'cat-phones',
        categoryName: 'Téléphonie',
        count: 2,
        percentage: 66.7, // 2 / 3 = 66.7%
        volumeCents: 25000,
      });
      expect(result.repairsByCategory[1]).toEqual({
        categoryId: 'cat-computers',
        categoryName: 'Informatique',
        count: 1,
        percentage: 33.3, // 1 / 3 = 33.3%
        volumeCents: 20000,
      });
    });
  });

  describe('Indicator 2: geoDistribution', () => {
    it('groups demands by department and sorts descending, limited to top 15', async () => {
      const now = new Date();
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.demande.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            { id: 'd-1', postalCode: '75001', createdAt: now, offers: [] },
            { id: 'd-2', postalCode: '75010', createdAt: now, offers: [] },
            { id: 'd-3', postalCode: '75020', createdAt: now, offers: [] },
            { id: 'd-4', postalCode: '69001', createdAt: now, offers: [] },
            { id: 'd-5', postalCode: '20000', createdAt: now, offers: [] },
            { id: 'd-6', postalCode: '97400', createdAt: now, offers: [] },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getOverview({ period: '30d' });

      expect(result.geoDistribution).toHaveLength(4);
      expect(result.geoDistribution[0]).toEqual({
        departmentCode: '75',
        departmentName: 'Paris',
        demandesCount: 3,
        activeRepairersCount: 0,
        percentage: 50.0,
      });
      expect(result.geoDistribution.find((g) => g.departmentCode === '2A')).toEqual({
        departmentCode: '2A',
        departmentName: 'Corse-du-Sud',
        demandesCount: 1,
        activeRepairersCount: 0,
        percentage: 16.7,
      });
      expect(result.geoDistribution.find((g) => g.departmentCode === '974')).toEqual({
        departmentCode: '974',
        departmentName: 'La Réunion',
        demandesCount: 1,
        activeRepairersCount: 0,
        percentage: 16.7,
      });
    });
  });

  describe('Indicator 3: responseTime', () => {
    it('computes response delays, average, median, and bucket distribution', async () => {
      const t0 = new Date('2026-09-01T10:00:00Z');
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.demande.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            // Delay 30 min (< 60 min)
            {
              id: 'd-1',
              createdAt: t0,
              offers: [{ createdAt: new Date('2026-09-01T10:30:00Z') }],
            },
            // Delay 120 min (within 24h)
            {
              id: 'd-2',
              createdAt: t0,
              offers: [{ createdAt: new Date('2026-09-01T12:00:00Z') }],
            },
            // Delay 1500 min (> 24h)
            {
              id: 'd-3',
              createdAt: t0,
              offers: [{ createdAt: new Date('2026-09-02T11:00:00Z') }],
            },
            // No offers
            {
              id: 'd-4',
              createdAt: t0,
              offers: [],
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getOverview({ period: '30d' });

      // Delays: 30, 120, 1500. Average = (30 + 120 + 1500) / 3 = 550. Median = 120.
      expect(result.responseTime).toEqual({
        averageMinutes: 550,
        medianMinutes: 120,
        within1HourCount: 1,
        within24HoursCount: 1,
        over24HoursCount: 1,
        noOfferCount: 1,
      });
      expect(result.kpis.averageResponseTimeMinutes.value).toBe(550);
    });

    it('handles empty demands or zero answered demands gracefully', async () => {
      prisma.demande.findMany.mockResolvedValue([
        { id: 'd-1', createdAt: new Date(), offers: [] },
      ]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });
      expect(result.responseTime).toEqual({
        averageMinutes: 0,
        medianMinutes: 0,
        within1HourCount: 0,
        within24HoursCount: 0,
        over24HoursCount: 0,
        noOfferCount: 1,
      });
      expect(result.kpis.averageResponseTimeMinutes.value).toBe(0);
    });
  });

  describe('Indicator 4: offerAcceptance', () => {
    it('aggregates total, accepted, rejected, and pending offers and rate', async () => {
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.offer.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            { id: 'o-1', status: 'ACCEPTED', repairerUserId: 'u-1' },
            { id: 'o-2', status: 'ACCEPTED', repairerUserId: 'u-1' },
            { id: 'o-3', status: 'REJECTED', repairerUserId: 'u-2' },
            { id: 'o-4', status: 'SENT', repairerUserId: 'u-3' },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getOverview({ period: '30d' });

      expect(result.offerAcceptance).toEqual({
        totalOffers: 4,
        acceptedOffers: 2,
        rejectedOffers: 1,
        pendingOffers: 1,
        acceptanceRate: 50.0, // 2 / 4 = 50.0%
      });
      expect(result.kpis.acceptanceRate.value).toBe(50.0);
    });

    it('returns 0 acceptanceRate when totalOffers is 0', async () => {
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });
      expect(result.offerAcceptance.acceptanceRate).toBe(0);
      expect(result.kpis.acceptanceRate.value).toBe(0);
    });
  });

  describe('Indicator 5: popularCategories', () => {
    it('groups demands by category with demandsCount, offersCount and conversionRate', async () => {
      const now = new Date();
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.demande.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            // Category 1: 2 demands, 3 offers, 1 accepted
            {
              id: 'd-1',
              categoryId: 'cat-1',
              createdAt: now,
              category: { labelFr: 'Smartphones' },
              offers: [{ status: 'ACCEPTED' }, { status: 'REJECTED' }],
              commandes: [],
            },
            {
              id: 'd-2',
              categoryId: 'cat-1',
              createdAt: now,
              category: { labelFr: 'Smartphones' },
              offers: [{ status: 'SENT' }],
              commandes: [],
            },
            // Category 2: 1 demand, 0 offers
            {
              id: 'd-3',
              categoryId: 'cat-2',
              createdAt: now,
              category: { labelFr: 'Tablettes' },
              offers: [],
              commandes: [],
            },
          ]);
        }
        return Promise.resolve([]);
      });

      const result = await service.getOverview({ period: '30d' });

      expect(result.popularCategories).toHaveLength(2);
      expect(result.popularCategories[0]).toEqual({
        categoryId: 'cat-1',
        categoryName: 'Smartphones',
        demandesCount: 2,
        offersCount: 3,
        conversionRate: 50.0, // 1 of 2 demands converted = 50.0%
      });
      expect(result.popularCategories[1]).toEqual({
        categoryId: 'cat-2',
        categoryName: 'Tablettes',
        demandesCount: 1,
        offersCount: 0,
        conversionRate: 0,
      });
    });
  });

  describe('Indicator 6: topRepairers', () => {
    it('ranks repairers by offersSent descending and attaches profile and review data', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([]);

      prisma.offer.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            { id: 'o-1', repairerUserId: 'rep-1', status: 'ACCEPTED', createdAt: now },
            { id: 'o-2', repairerUserId: 'rep-1', status: 'ACCEPTED', createdAt: now },
            { id: 'o-3', repairerUserId: 'rep-1', status: 'SENT', createdAt: now },
            { id: 'o-4', repairerUserId: 'rep-2', status: 'ACCEPTED', createdAt: now },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.commande.findMany.mockImplementation(({ where }: any) => {
        if (where?.paidAt?.gte || where?.OR) {
          return Promise.resolve([
            {
              id: 'c-1',
              repairerUserId: 'rep-1',
              repairCents: 45000,
              totalCents: 50000,
              protectionCents: 5000,
              paidAt: now,
              demande: { categoryId: 'c-1', postalCode: '75001' },
            },
            {
              id: 'c-2',
              repairerUserId: 'rep-2',
              repairCents: 15000,
              totalCents: 18000,
              protectionCents: 3000,
              paidAt: now,
              demande: { categoryId: 'c-1', postalCode: '75001' },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where?.id?.in) {
          return Promise.resolve([
            {
              id: 'rep-1',
              name: 'Alice Martin',
              image: 'https://avatar.com/alice.jpg',
              repairerProfile: {
                displayName: 'Atelier Express',
                serviceAreaLabel: 'Paris 1er',
                postalCode: '75001',
              },
              reviewsReceived: [{ rating: 5 }, { rating: 4 }],
            },
            {
              id: 'rep-2',
              name: 'Bob Durand',
              image: null,
              repairerProfile: {
                displayName: 'Bob Réparations',
                serviceAreaLabel: null,
                postalCode: '69002',
              },
              reviewsReceived: [{ rating: 3 }],
            },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });

      expect(result.topRepairers).toHaveLength(2);
      expect(result.topRepairers[0]).toEqual({
        repairerId: 'rep-1',
        name: 'Alice Martin',
        businessName: 'Atelier Express',
        avatarUrl: 'https://avatar.com/alice.jpg',
        city: 'Paris 1er',
        offersSent: 3,
        offersAccepted: 2,
        acceptanceRate: 66.7,
        totalRevenueCents: 45000,
        rating: 4.5,
        reviewsCount: 2,
      });
      expect(result.topRepairers[1]).toEqual({
        repairerId: 'rep-2',
        name: 'Bob Durand',
        businessName: 'Bob Réparations',
        avatarUrl: null,
        city: 'Rhône', // falls back to department name
        offersSent: 1,
        offersAccepted: 1,
        acceptanceRate: 100.0,
        totalRevenueCents: 15000,
        rating: 3.0,
        reviewsCount: 1,
      });
    });

    describe('avatars (ISS-131)', () => {
      const AVATAR = 'avatars/rep-1/9f2c.jpg';

      /** One repairer, one accepted offer, with the given `image` and `profile.avatarPath`. */
      function arrange(user: { image: string | null; avatarPath: string | null }) {
        const now = new Date();
        prisma.demande.findMany.mockResolvedValue([]);
        prisma.offer.findMany.mockImplementation(({ where }: any) =>
          Promise.resolve(
            where?.createdAt?.gte
              ? [{ id: 'o-1', repairerUserId: 'rep-1', status: 'ACCEPTED', createdAt: now }]
              : [],
          ),
        );
        prisma.commande.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);
        prisma.user.findMany.mockImplementation(({ where }: any) =>
          Promise.resolve(
            where?.id?.in
              ? [
                  {
                    id: 'rep-1',
                    name: 'Nes Dab',
                    image: user.image,
                    profile: user.avatarPath === null ? null : { avatarPath: user.avatarPath },
                    repairerProfile: { displayName: 'Nes', serviceAreaLabel: null, postalCode: null },
                    reviewsReceived: [],
                  },
                ]
              : [],
          ),
        );
      }

      beforeEach(() => {
        storage.configured = true;
        storage.createSignedReadUrls.mockReset();
      });

      it('signs a stored avatar path and returns the signed URL, not the raw path', async () => {
        arrange({ image: null, avatarPath: AVATAR });
        storage.createSignedReadUrls.mockResolvedValue(new Map([[AVATAR, 'https://signed.example/a?token=1']]));

        const result = await service.getOverview({ period: '30d' });

        expect(result.topRepairers[0]?.avatarUrl).toBe('https://signed.example/a?token=1');
        expect(storage.createSignedReadUrls).toHaveBeenCalledTimes(1);
        expect(storage.createSignedReadUrls).toHaveBeenCalledWith([AVATAR], 3600);
      });

      it('uses the account image (a Google photo URL) as it is and does not sign anything', async () => {
        arrange({ image: 'https://lh3.googleusercontent.com/x.jpg', avatarPath: AVATAR });

        const result = await service.getOverview({ period: '30d' });

        expect(result.topRepairers[0]?.avatarUrl).toBe('https://lh3.googleusercontent.com/x.jpg');
        expect(storage.createSignedReadUrls).not.toHaveBeenCalled();
      });

      it('never leaks the raw storage path: an unsignable avatar becomes null so the initials show', async () => {
        arrange({ image: null, avatarPath: AVATAR });
        storage.createSignedReadUrls.mockResolvedValue(new Map()); // the object is gone

        const result = await service.getOverview({ period: '30d' });

        expect(result.topRepairers[0]?.avatarUrl).toBeNull();
      });

      it('returns null without calling storage when it is not configured', async () => {
        arrange({ image: null, avatarPath: AVATAR });
        storage.configured = false;

        const result = await service.getOverview({ period: '30d' });

        expect(result.topRepairers[0]?.avatarUrl).toBeNull();
        expect(storage.createSignedReadUrls).not.toHaveBeenCalled();
      });

      it('keeps the statistics when signing fails, with no avatar rather than an error', async () => {
        arrange({ image: null, avatarPath: AVATAR });
        storage.createSignedReadUrls.mockRejectedValue(new Error('storage down'));

        const result = await service.getOverview({ period: '30d' });

        expect(result.topRepairers).toHaveLength(1);
        expect(result.topRepairers[0]?.avatarUrl).toBeNull();
      });

      it('does not call storage for a repairer with no avatar at all', async () => {
        arrange({ image: null, avatarPath: null });

        const result = await service.getOverview({ period: '30d' });

        expect(result.topRepairers[0]?.avatarUrl).toBeNull();
        expect(storage.createSignedReadUrls).not.toHaveBeenCalled();
      });
    });
  });

  describe('Timeseries (Indicators 7, 8, 9 & Activity)', () => {
    it('populates registrations, financials, and activity buckets for 7d daily intervals', async () => {
      const testDate = new Date(Date.now() - 3600 * 1000);

      prisma.demande.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            { id: 'd-1', createdAt: testDate, postalCode: '75001', offers: [] },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.offer.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            { id: 'o-1', createdAt: testDate, status: 'SENT', repairerUserId: 'u-1' },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.commande.findMany.mockImplementation(({ where }: any) => {
        if (where?.paidAt?.gte || where?.OR) {
          return Promise.resolve([
            {
              id: 'c-1',
              paidAt: testDate,
              totalCents: 20000,
              protectionCents: 2000,
              repairCents: 18000,
              demande: { categoryId: 'c1', postalCode: '75001' },
            },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.user.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte) {
          return Promise.resolve([
            { id: 'u-client', createdAt: testDate, repairerProfile: null },
            { id: 'u-rep', createdAt: testDate, repairerProfile: { id: 'rp-1', deletedAt: null } },
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '7d' });

      expect(result.timeseries.registrations.length).toBe(7);
      expect(result.timeseries.financials.length).toBe(7);
      expect(result.timeseries.activity.length).toBe(7);

      const totalRegistered = result.timeseries.registrations.reduce((s, r) => s + r.total, 0);
      expect(totalRegistered).toBe(2);

      const totalGmv = result.timeseries.financials.reduce((s, f) => s + f.gmvCents, 0);
      expect(totalGmv).toBe(20000);

      const totalDemandes = result.timeseries.activity.reduce((s, a) => s + a.demandes, 0);
      expect(totalDemandes).toBe(1);

      const totalOffers = result.timeseries.activity.reduce((s, a) => s + a.offers, 0);
      expect(totalOffers).toBe(1);
    });

    it('generates weekly intervals for 90d and monthly intervals for 12m', async () => {
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const res90d = await service.getOverview({ period: '90d' });
      expect(res90d.timeseries.registrations.length).toBeGreaterThanOrEqual(12);

      const res12m = await service.getOverview({ period: '12m' });
      expect(res12m.timeseries.registrations.length).toBe(12);
    });
  });

  describe('KPIs & Prior Period Comparison Calculations', () => {
    it('computes change percentages correctly with positive, negative, and zero baselines', async () => {
      const now = new Date();
      // Mock current period: 120 demandes, 80 offers (60 accepted = 75%), avg delay 40min, 100k GMV, 10k Comm, 50 users
      // Mock prior period: 100 demandes, 100 offers (50 accepted = 50%), avg delay 50min, 80k GMV, 8k Comm, 40 users
      prisma.demande.findMany.mockImplementation(({ where }: any) => {
        // Current period
        if (where?.createdAt?.gte && !where?.createdAt?.lt) {
          return Promise.resolve(
            Array.from({ length: 120 }, (_, i) => ({
              id: `d-cur-${i}`,
              createdAt: now,
              postalCode: '75001',
              offers: [{ createdAt: new Date(now.getTime() + 40 * 60000) }],
            })),
          );
        }
        // Prior period
        if (where?.createdAt?.lt) {
          return Promise.resolve(
            Array.from({ length: 100 }, (_, i) => ({
              id: `d-pri-${i}`,
              createdAt: now,
              postalCode: '75001',
              offers: [{ createdAt: new Date(now.getTime() + 50 * 60000) }],
            })),
          );
        }
        return Promise.resolve([]);
      });

      prisma.offer.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte && !where?.createdAt?.lt) {
          return Promise.resolve([
            ...Array.from({ length: 60 }, (_, i) => ({ id: `o-c-${i}`, status: 'ACCEPTED', createdAt: now })),
            ...Array.from({ length: 20 }, (_, i) => ({ id: `o-c-rej-${i}`, status: 'REJECTED', createdAt: now })),
          ]);
        }
        if (where?.createdAt?.lt) {
          return Promise.resolve([
            ...Array.from({ length: 50 }, (_, i) => ({ id: `o-p-${i}`, status: 'ACCEPTED', createdAt: now })),
            ...Array.from({ length: 50 }, (_, i) => ({ id: `o-p-rej-${i}`, status: 'REJECTED', createdAt: now })),
          ]);
        }
        return Promise.resolve([]);
      });

      prisma.commande.findMany.mockImplementation(({ where }: any) => {
        const isPrior = where?.OR?.[0]?.paidAt?.lt || where?.paidAt?.lt;
        if (!isPrior) {
          return Promise.resolve([
            { id: 'c-1', totalCents: 100000, protectionCents: 10000, repairCents: 90000, paidAt: now, demande: { postalCode: '75001' } },
          ]);
        }
        return Promise.resolve([
          { id: 'c-2', totalCents: 80000, protectionCents: 8000, repairCents: 72000, paidAt: now, demande: { postalCode: '75001' } },
        ]);
      });

      prisma.user.findMany.mockResolvedValue(
        Array.from({ length: 50 }, (_, i) => ({ id: `u-${i}`, createdAt: now, repairerProfile: null })),
      );
      prisma.user.count.mockResolvedValue(40); // prior count

      const result = await service.getOverview({ period: '30d' });

      // Demandes: 120 vs 100 -> +20.0%
      expect(result.kpis.totalDemandes.value).toBe(120);
      expect(result.kpis.totalDemandes.changePct).toBe(20.0);

      // Acceptance rate: 75.0% vs 50.0% -> +50.0%
      expect(result.kpis.acceptanceRate.value).toBe(75.0);
      expect(result.kpis.acceptanceRate.changePct).toBe(50.0);

      // Average response: 40 min vs 50 min -> -20.0%
      expect(result.kpis.averageResponseTimeMinutes.value).toBe(40);
      expect(result.kpis.averageResponseTimeMinutes.changePct).toBe(-20.0);

      // GMV: 100000 vs 80000 -> +25.0%
      expect(result.kpis.totalGmvCents.value).toBe(100000);
      expect(result.kpis.totalGmvCents.changePct).toBe(25.0);

      // Commissions: 10000 vs 8000 -> +25.0%
      expect(result.kpis.totalCommissionsCents.value).toBe(10000);
      expect(result.kpis.totalCommissionsCents.changePct).toBe(25.0);

      // Registrations: 50 vs 40 -> +25.0%
      expect(result.kpis.totalRegistrations.value).toBe(50);
      expect(result.kpis.totalRegistrations.changePct).toBe(25.0);
    });

    it('returns +100% when current value > 0 and prior value is 0', async () => {
      const now = new Date();
      prisma.demande.findMany.mockImplementation(({ where }: any) => {
        if (where?.createdAt?.gte && !where?.createdAt?.lt) {
          return Promise.resolve([{ id: 'd-1', createdAt: now, offers: [] }]);
        }
        return Promise.resolve([]);
      });
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });
      expect(result.kpis.totalDemandes.value).toBe(1);
      expect(result.kpis.totalDemandes.changePct).toBe(100);
    });
  });

  describe('Filters: categoryId and department', () => {
    it('applies categoryId filter to queries', async () => {
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.getOverview({ period: '30d', categoryId: 'cat-phones' });

      // Verify prisma demande.findMany was called with categoryId filter
      expect(prisma.demande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: 'cat-phones',
          }),
        }),
      );

      // Verify prisma commande.findMany was called with categoryId filter
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            demande: expect.objectContaining({
              categoryId: 'cat-phones',
            }),
          }),
        }),
      );
    });

    it('applies department filter to filter demands and related entities', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([
        { id: 'd-1', postalCode: '75001', createdAt: now, offers: [] },
        { id: 'd-2', postalCode: '69001', createdAt: now, offers: [] },
      ]);
      prisma.commande.findMany.mockResolvedValue([
        {
          id: 'c-1',
          totalCents: 10000,
          protectionCents: 1000,
          repairCents: 9000,
          paidAt: now,
          demande: { categoryId: 'cat-1', postalCode: '75001' },
        },
        {
          id: 'c-2',
          totalCents: 15000,
          protectionCents: 1500,
          repairCents: 13500,
          paidAt: now,
          demande: { categoryId: 'cat-1', postalCode: '69001' },
        },
      ]);
      prisma.offer.findMany.mockResolvedValue([
        { id: 'o-1', status: 'ACCEPTED', createdAt: now, demande: { postalCode: '75001' } },
        { id: 'o-2', status: 'SENT', createdAt: now, demande: { postalCode: '69001' } },
      ]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d', department: '75' });

      // Only 75 demands should be counted in totalDemandes
      expect(result.kpis.totalDemandes.value).toBe(1);
      // Only 75 in geoDistribution
      expect(result.geoDistribution).toHaveLength(1);
      expect(result.geoDistribution[0]!.departmentCode).toBe('75');
      // Only 75 commande in GMV (10000 cents)
      expect(result.kpis.totalGmvCents.value).toBe(10000);
      // Only 75 offer in offer acceptance (1 total, 1 accepted = 100%)
      expect(result.offerAcceptance.totalOffers).toBe(1);
      expect(result.offerAcceptance.acceptanceRate).toBe(100);
    });
  });

  describe('Zero Data & Edge Cases', () => {
    it('returns a completely valid AdminStatsOverviewDto when all tables are empty', async () => {
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });

      expect(result.kpis.totalDemandes).toEqual({ value: 0, changePct: null });
      expect(result.kpis.acceptanceRate).toEqual({ value: 0, changePct: null });
      expect(result.kpis.averageResponseTimeMinutes).toEqual({ value: 0, changePct: null });
      expect(result.kpis.totalGmvCents).toEqual({ value: 0, changePct: null });
      expect(result.kpis.totalCommissionsCents).toEqual({ value: 0, changePct: null });
      expect(result.kpis.totalRegistrations).toEqual({ value: 0, changePct: null });
      expect(result.kpis.averageBasketCents).toEqual({ value: 0, changePct: null });
      expect(result.kpis.actualCommissionRate).toEqual({ value: 0, changePct: null });
      expect(result.kpis.disputeRate).toEqual({ value: 0, changePct: null });
      expect(result.kpis.refundRate).toEqual({ value: 0, changePct: null });

      expect(result.conversionFunnel.overallConversionRate).toBe(0);
      expect(result.conversionFunnel.stages).toHaveLength(5);
      expect(result.conversionFunnel.stages[0]).toEqual({
        id: 'demandes',
        label: 'Demandes publiées',
        count: 0,
        percentageOfTotal: 0,
        stepConversionRate: 100,
        dropOffRate: 0,
      });

      expect(result.repairsByCategory).toEqual([]);
      expect(result.popularCategories).toEqual([]);
      expect(result.geoDistribution).toEqual([]);
      expect(result.topRepairers).toEqual([]);

      expect(result.responseTime).toEqual({
        averageMinutes: 0,
        medianMinutes: 0,
        within1HourCount: 0,
        within24HoursCount: 0,
        over24HoursCount: 0,
        noOfferCount: 0,
      });

      expect(result.offerAcceptance).toEqual({
        totalOffers: 0,
        acceptedOffers: 0,
        rejectedOffers: 0,
        pendingOffers: 0,
        acceptanceRate: 0,
      });

      expect(result.timeseries.registrations.length).toBeGreaterThan(0);
      expect(result.timeseries.financials.length).toBeGreaterThan(0);
      expect(result.timeseries.activity.length).toBeGreaterThan(0);
    });

    it('clamps negative response time to 0 in case of slight clock skew', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([
        {
          id: 'd-1',
          createdAt: now,
          offers: [{ createdAt: new Date(now.getTime() - 10000) }], // 10s earlier
        },
      ]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });
      expect(result.responseTime.averageMinutes).toBe(0);
      expect(result.responseTime.medianMinutes).toBe(0);
      expect(result.responseTime.within1HourCount).toBe(1);
    });

    it('uses the earliest offer when a demand receives multiple offers', async () => {
      const t0 = new Date('2026-09-01T10:00:00Z');
      prisma.demande.findMany.mockResolvedValue([
        {
          id: 'd-1',
          createdAt: t0,
          offers: [
            { createdAt: new Date('2026-09-01T10:15:00Z') }, // 15 min (earliest)
            { createdAt: new Date('2026-09-01T11:00:00Z') }, // 60 min
            { createdAt: new Date('2026-09-01T14:00:00Z') }, // 240 min
          ],
        },
      ]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });
      expect(result.responseTime.averageMinutes).toBe(15);
      expect(result.responseTime.within1HourCount).toBe(1);
    });

    it('caps topRepairers at 10 items and caps geoDistribution at 15 items', async () => {
      const now = new Date();
      // 20 departments
      const demands = Array.from({ length: 20 }, (_, i) => ({
        id: `d-${i}`,
        postalCode: `${String(i + 1).padStart(2, '0')}000`,
        createdAt: now,
        offers: [],
      }));
      prisma.demande.findMany.mockResolvedValue(demands);

      // 15 repairers
      const offers = Array.from({ length: 15 }, (_, i) => ({
        id: `o-${i}`,
        repairerUserId: `rep-${i}`,
        status: 'SENT',
        createdAt: now,
      }));
      prisma.offer.findMany.mockResolvedValue(offers);

      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue(
        Array.from({ length: 15 }, (_, i) => ({
          id: `rep-${i}`,
          name: `Repairer ${i}`,
          repairerProfile: null,
          reviewsReceived: [],
        })),
      );
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });
      expect(result.geoDistribution).toHaveLength(15);
      expect(result.topRepairers).toHaveLength(10);
    });

    it('uses createdAt when paidAt is null for paid orders', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.commande.findMany.mockResolvedValue([
        {
          id: 'c-1',
          status: 'PAID',
          paidAt: null,
          createdAt: now,
          totalCents: 50000,
          protectionCents: 5000,
          repairCents: 45000,
          demande: { categoryId: 'cat-1', postalCode: '75001' },
        },
      ]);

      const result = await service.getOverview({ period: '30d' });
      expect(result.kpis.totalGmvCents.value).toBe(50000);
      expect(result.kpis.totalCommissionsCents.value).toBe(5000);
      expect(result.repairsByCategory[0]!.volumeCents).toBe(50000);
    });
  });

  describe('Bug B10: All-time period (period === "all") earliest data & buckets', () => {
    it('starts at earliest data date instead of Unix epoch (1970-01-01)', async () => {
      const earliestActivity = new Date('2026-03-15T14:30:00.000Z');
      prisma.user.findFirst.mockResolvedValue({ createdAt: earliestActivity });
      prisma.demande.findFirst.mockResolvedValue(null);
      prisma.commande.findFirst.mockResolvedValue(null);

      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: 'all' });

      // Must NOT be Unix epoch
      expect(result.startDate).not.toBe('1970-01-01T00:00:00.000Z');
      // Starts on the day of earliest activity
      expect(result.startDate.startsWith('2026-03-15')).toBe(true);

      // Monthly buckets must start at the earliest data month (March 2026), not 13 months ago
      const firstBucket = result.timeseries.registrations[0];
      expect(firstBucket).toBeDefined();
      expect(firstBucket?.date).toBe('2026-03-01');
      expect(firstBucket?.label).toMatch(/mars 2026/i);
    });

    it('falls back to platform baseline (2026-01-01) when database has no records, never 1970', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.demande.findFirst.mockResolvedValue(null);
      prisma.commande.findFirst.mockResolvedValue(null);

      prisma.demande.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: 'all' });

      expect(result.startDate).not.toBe('1970-01-01T00:00:00.000Z');
      expect(new Date(result.startDate).getUTCFullYear()).toBeGreaterThanOrEqual(2026);
    });

    // RU-13 review: "Tout" must open on the first REAL data, like every other figure of the page (PRE-3).
    // A fixture or demo account created before launch used to pull the start date back.
    describe('the earliest date reads the same real platform as the figures', () => {
      beforeEach(() => {
        prisma.user.findFirst.mockResolvedValue(null);
        prisma.demande.findFirst.mockResolvedValue(null);
        prisma.commande.findFirst.mockResolvedValue(null);
        prisma.demande.findMany.mockResolvedValue([]);
        prisma.commande.findMany.mockResolvedValue([]);
        prisma.offer.findMany.mockResolvedValue([]);
        prisma.user.findMany.mockResolvedValue([]);
        prisma.user.count.mockResolvedValue(0);
      });

      it('excludes fixture and demo accounts from the first user, demande and order', async () => {
        await service.getOverview({ period: 'all' });

        expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: GENUINE_USER_WHERE }));
        expect(prisma.demande.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { deletedAt: null, author: GENUINE_USER_WHERE } }),
        );
        expect(prisma.commande.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: GENUINE_COLLECTED_COMMANDE_WHERE }),
        );
      });

      it('keeps the same exclusion when a category is chosen', async () => {
        await service.getOverview({ period: 'all', categoryId: 'cat-1' });

        expect(prisma.demande.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { deletedAt: null, author: GENUINE_USER_WHERE, categoryId: 'cat-1' },
          }),
        );
        expect(prisma.commande.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { ...GENUINE_COLLECTED_COMMANDE_WHERE, demande: { categoryId: 'cat-1' } },
          }),
        );
      });
    });
  });

  describe('F11 New Business KPIs (averageBasketCents, actualCommissionRate, disputeRate, refundRate)', () => {
    it('computes averageBasketCents and actualCommissionRate for current and prior periods with changePct', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.commande.findMany.mockImplementation(({ where }: any) => {
        const isPrior = where?.OR?.[0]?.paidAt?.lt || where?.paidAt?.lt;
        if (!isPrior) {
          // Current: 2 orders -> total GMV 30000, commissions 3000 -> avg basket 15000, rate 10.0%
          return Promise.resolve([
            { id: 'c-1', totalCents: 12000, protectionCents: 1200, paidAt: now, demande: { postalCode: '75001' } },
            { id: 'c-2', totalCents: 18000, protectionCents: 1800, paidAt: now, demande: { postalCode: '75001' } },
          ]);
        }
        // Prior: 1 order -> total GMV 10000, commissions 800 -> avg basket 10000, rate 8.0%
        return Promise.resolve([
          { id: 'c-p1', totalCents: 10000, protectionCents: 800, paidAt: now, demande: { postalCode: '75001' } },
        ]);
      });

      const result = await service.getOverview({ period: '30d' });

      // Average Basket: 15000 vs 10000 -> +50.0%
      expect(result.kpis.averageBasketCents.value).toBe(15000);
      expect(result.kpis.averageBasketCents.changePct).toBe(50.0);

      // Commission Rate: 10.0% vs 8.0% -> +25.0%
      expect(result.kpis.actualCommissionRate.value).toBe(10.0);
      expect(result.kpis.actualCommissionRate.changePct).toBe(25.0);
    });

    it('computes disputeRate and refundRate for current and prior periods with changePct', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.commande.findMany.mockImplementation(({ where }: any) => {
        const isPrior = where?.OR?.[0]?.paidAt?.lt || where?.paidAt?.lt;
        if (!isPrior) {
          // Current: 4 orders -> 1 dispute, 1 refunded -> 25.0% disputeRate, 25.0% refundRate
          return Promise.resolve([
            { id: 'c-1', totalCents: 10000, protectionCents: 1000, paidAt: now, status: 'PAID', dispute: { id: 'disp-1' }, demande: { postalCode: '75001' } },
            { id: 'c-2', totalCents: 10000, protectionCents: 1000, paidAt: now, status: 'REFUNDED', demande: { postalCode: '75001' } },
            { id: 'c-3', totalCents: 10000, protectionCents: 1000, paidAt: now, status: 'PAID', demande: { postalCode: '75001' } },
            { id: 'c-4', totalCents: 10000, protectionCents: 1000, paidAt: now, status: 'PAID', demande: { postalCode: '75001' } },
          ]);
        }
        // Prior: 2 orders -> 1 dispute, 1 refunded -> 50.0% disputeRate, 50.0% refundRate
        return Promise.resolve([
          { id: 'c-p1', totalCents: 10000, protectionCents: 1000, paidAt: now, status: 'PAID', disputedAt: now, demande: { postalCode: '75001' } },
          { id: 'c-p2', totalCents: 10000, protectionCents: 1000, paidAt: now, status: 'PAID', refundedAt: now, demande: { postalCode: '75001' } },
        ]);
      });

      const result = await service.getOverview({ period: '30d' });

      // Dispute Rate: 25.0% vs 50.0% -> -50.0%
      expect(result.kpis.disputeRate.value).toBe(25.0);
      expect(result.kpis.disputeRate.changePct).toBe(-50.0);

      // Refund Rate: 25.0% vs 50.0% -> -50.0%
      expect(result.kpis.refundRate.value).toBe(25.0);
      expect(result.kpis.refundRate.changePct).toBe(-50.0);
    });

    it('returns null changePct for period === "all"', async () => {
      const now = new Date();
      prisma.user.findFirst.mockResolvedValue({ createdAt: now });
      prisma.demande.findFirst.mockResolvedValue(null);
      prisma.commande.findFirst.mockResolvedValue(null);

      prisma.demande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.commande.findMany.mockResolvedValue([
        { id: 'c-1', totalCents: 20000, protectionCents: 2000, paidAt: now, status: 'PAID', demande: { postalCode: '75001' } },
      ]);

      const result = await service.getOverview({ period: 'all' });

      expect(result.kpis.averageBasketCents).toEqual({ value: 20000, changePct: null });
      expect(result.kpis.actualCommissionRate).toEqual({ value: 10.0, changePct: null });
      expect(result.kpis.disputeRate).toEqual({ value: 0, changePct: null });
      expect(result.kpis.refundRate).toEqual({ value: 0, changePct: null });
    });
  });

  describe('F11 business KPIs without a prior period to compare', () => {
    it('gives no change for a rate when the prior period had no paid order (not +100 %)', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([]);
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      prisma.commande.findMany.mockImplementation(({ where }: any) => {
        const isPrior = where?.OR?.[0]?.paidAt?.lt || where?.paidAt?.lt;
        if (isPrior) return Promise.resolve([]);
        return Promise.resolve([
          { id: 'c-1', totalCents: 10000, protectionCents: 700, status: 'REFUNDED', disputedAt: now, paidAt: now, demande: { postalCode: '75001' } },
        ]);
      });

      const result = await service.getOverview({ period: '30d' });

      expect(result.kpis.disputeRate.value).toBe(100);
      expect(result.kpis.disputeRate.changePct).toBeNull();
      expect(result.kpis.refundRate.changePct).toBeNull();
      expect(result.kpis.averageBasketCents.changePct).toBeNull();
      expect(result.kpis.actualCommissionRate.changePct).toBeNull();
    });
  });

  describe('F11 5-Stage Conversion Funnel (conversionFunnel)', () => {
    it('calculates counts, percentageOfTotal, stepConversionRate, dropOffRate, and overallConversionRate', async () => {
      const now = new Date();
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      prisma.demande.findMany.mockResolvedValue([
        // d-1: has offer, accepted, paid, completed (step: RELEASED)
        {
          id: 'd-1',
          postalCode: '75001',
          createdAt: now,
          offers: [{ id: 'o-1', status: 'ACCEPTED' }],
          commandes: [{ id: 'cmd-1', status: 'PAID', step: 'RELEASED' }],
        },
        // d-2: has offer, accepted, paid, in-progress (step: REPAIR_STARTED)
        {
          id: 'd-2',
          postalCode: '75001',
          createdAt: now,
          offers: [{ id: 'o-2', status: 'ACCEPTED' }],
          commandes: [{ id: 'cmd-2', status: 'PAID', step: 'REPAIR_STARTED' }],
        },
        // d-3: has offer, pending (SENT), no commande
        {
          id: 'd-3',
          postalCode: '75001',
          createdAt: now,
          offers: [{ id: 'o-3', status: 'SENT' }],
          commandes: [],
        },
        // d-4: no offers
        {
          id: 'd-4',
          postalCode: '75001',
          createdAt: now,
          offers: [],
          commandes: [],
        },
      ]);

      const result = await service.getOverview({ period: '30d' });

      expect(result.conversionFunnel.stages).toHaveLength(5);

      // Stage 1: Demandes publiées (4)
      const stage1 = result.conversionFunnel.stages[0];
      expect(stage1).toEqual({
        id: 'demandes',
        label: 'Demandes publiées',
        count: 4,
        percentageOfTotal: 100,
        stepConversionRate: 100,
        dropOffRate: 0,
      });

      // Stage 2: Avec offre (3 of 4 = 75%)
      const stage2 = result.conversionFunnel.stages[1];
      expect(stage2).toEqual({
        id: 'with_offer',
        label: 'Avec offre',
        count: 3,
        percentageOfTotal: 75.0,
        stepConversionRate: 75.0,
        dropOffRate: 25.0,
      });

      // Stage 3: Offre acceptée (2 of 3 = 66.7%)
      const stage3 = result.conversionFunnel.stages[2];
      expect(stage3).toEqual({
        id: 'accepted',
        label: 'Offre acceptée',
        count: 2,
        percentageOfTotal: 50.0,
        stepConversionRate: 66.7,
        dropOffRate: 33.3,
      });

      // Stage 4: Paiement effectué (2 of 2 = 100.0%)
      const stage4 = result.conversionFunnel.stages[3];
      expect(stage4).toEqual({
        id: 'paid',
        label: 'Paiement effectué',
        count: 2,
        percentageOfTotal: 50.0,
        stepConversionRate: 100.0,
        dropOffRate: 0,
      });

      // Stage 5: Réparation finalisée (1 of 2 = 50.0%)
      const stage5 = result.conversionFunnel.stages[4];
      expect(stage5).toEqual({
        id: 'completed',
        label: 'Réparation finalisée',
        count: 1,
        percentageOfTotal: 25.0,
        stepConversionRate: 50.0,
        dropOffRate: 50.0,
      });

      // Overall: 1 of 4 completed = 25.0%
      expect(result.conversionFunnel.overallConversionRate).toBe(25.0);
    });

    it('counts a demande as finalised only once its funds were released', async () => {
      const now = new Date();
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const demande = (id: string, commande: Record<string, unknown>) => ({
        id,
        postalCode: '75001',
        createdAt: now,
        offers: [{ id: `o-${id}`, status: 'ACCEPTED' }],
        commandes: [{ id: `c-${id}`, status: 'PAID', ...commande }],
      });
      prisma.demande.findMany.mockResolvedValue([
        demande('released-by-date', { step: 'AWAITING_VALIDATION', releasedAt: now }),
        demande('released-by-step', { step: 'RELEASED', releasedAt: null }),
        // The device is back but the client has not validated: money still held, not finalised
        demande('device-back', { step: 'RETURN_RECEIVED', releasedAt: null }),
        demande('repair-done', { step: 'REPAIR_DONE', releasedAt: null }),
      ]);

      const result = await service.getOverview({ period: '30d' });

      expect(result.conversionFunnel.stages[3]!.count).toBe(4);
      expect(result.conversionFunnel.stages[4]!.count).toBe(2);
      expect(result.conversionFunnel.overallConversionRate).toBe(50);
    });

    it('asks only for the offers of real accounts and the paid or refunded orders of the demandes it follows', async () => {
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      prisma.demande.findMany.mockResolvedValue([]);

      await service.getOverview({ period: '30d' });

      const include = prisma.demande.findMany.mock.calls[0][0].include;
      expect(include.offers.where).toEqual({ deletedAt: null, repairer: GENUINE_USER_WHERE });
      expect(include.commandes.where).toEqual({
        ...GENUINE_COLLECTED_COMMANDE_WHERE,
        status: { in: ['PAID', 'REFUNDED'] },
      });
    });

    it('follows the demandes of the period, not the orders paid in it', async () => {
      const now = new Date();
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      // An order paid in the period for a demande created before it must not enter the cohort
      prisma.commande.findMany.mockResolvedValue([
        { id: 'c-old', demandeId: 'd-old', status: 'PAID', paidAt: now, totalCents: 100, demande: { id: 'd-old', postalCode: '75001' } },
      ]);
      prisma.demande.findMany.mockResolvedValue([
        { id: 'd-new', postalCode: '75001', createdAt: now, offers: [], commandes: [] },
      ]);

      const result = await service.getOverview({ period: '30d' });

      expect(result.conversionFunnel.stages.map((st) => st.count)).toEqual([1, 0, 0, 0, 0]);
    });

    it('never lets a later funnel stage exceed the one before it', async () => {
      const now = new Date();
      prisma.offer.findMany.mockResolvedValue([]);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);
      // Paid, and even released, without any accepted offer: legacy data. It must still read as a funnel.
      prisma.demande.findMany.mockResolvedValue([
        { id: 'd-1', postalCode: '75001', createdAt: now, offers: [], commandes: [{ id: 'c-1', status: 'PAID', step: 'PAID', releasedAt: null }] },
        { id: 'd-2', postalCode: '75001', createdAt: now, offers: [], commandes: [{ id: 'c-2', status: 'PAID', step: 'RELEASED', releasedAt: now }] },
      ]);

      const result = await service.getOverview({ period: '30d' });
      expect(result.conversionFunnel.stages.map((st) => st.count)).toEqual([2, 0, 0, 0, 0]);
    });
  });

  describe('F11 Active Repairers Count in geoDistribution', () => {
    it('aggregates unique active repairers per department from currentOffers', async () => {
      const now = new Date();
      prisma.demande.findMany.mockResolvedValue([
        { id: 'd-1', postalCode: '75001', createdAt: now, offers: [] },
        { id: 'd-2', postalCode: '75002', createdAt: now, offers: [] },
        { id: 'd-3', postalCode: '69001', createdAt: now, offers: [] },
      ]);

      // rep-1 and rep-2 in 75, rep-3 in 69
      prisma.offer.findMany.mockResolvedValue([
        // rep-1 submits 2 offers in 75
        { id: 'o-1', repairerUserId: 'rep-1', createdAt: now, repairer: { repairerProfile: { postalCode: '75001' } } },
        { id: 'o-2', repairerUserId: 'rep-1', createdAt: now, repairer: { repairerProfile: { postalCode: '75001' } } },
        // rep-2 submits 1 offer in 75
        { id: 'o-3', repairerUserId: 'rep-2', createdAt: now, repairer: { repairerProfile: { postalCode: '75002' } } },
        // rep-3 submits 1 offer in 69
        { id: 'o-4', repairerUserId: 'rep-3', createdAt: now, repairer: { repairerProfile: { postalCode: '69001' } } },
      ]);

      prisma.commande.findMany.mockResolvedValue([]);
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      const result = await service.getOverview({ period: '30d' });

      expect(result.geoDistribution).toHaveLength(2);

      const paris = result.geoDistribution.find((g) => g.departmentCode === '75');
      expect(paris).toBeDefined();
      expect(paris!.demandesCount).toBe(2);
      expect(paris!.activeRepairersCount).toBe(2); // rep-1 (deduplicated) + rep-2

      const rhone = result.geoDistribution.find((g) => g.departmentCode === '69');
      expect(rhone).toBeDefined();
      expect(rhone!.demandesCount).toBe(1);
      expect(rhone!.activeRepairersCount).toBe(1); // rep-3
    });
  });
});
