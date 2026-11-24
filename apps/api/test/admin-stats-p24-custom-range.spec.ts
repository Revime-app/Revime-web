import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminStatsService } from '../src/admin/admin-stats.service.js';

function makePrismaMock() {
  return {
    demande: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    commande: {
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: 0, protectionCents: 0 } }),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    offer: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    $transaction: vi.fn((callbackOrOps: any) => {
      if (typeof callbackOrOps === 'function') {
        return callbackOrOps(makePrismaMock());
      }
      return Promise.all(callbackOrOps);
    }),
  } as any;
}

describe('P24 AdminStatsService - Custom Period & Dynamic Bucketing', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AdminStatsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminStatsService(prisma);
  });

  describe('Custom Period Boundaries', () => {
    it('takes from and to as whole UTC days, the last day INCLUDED', async () => {
      const result = await service.getOverview({ period: 'custom' as any, from: '2026-05-01', to: '2026-05-15' });

      expect(result.period).toBe('custom');
      expect(result.startDate).toBe('2026-05-01T00:00:00.000Z');
      // the chosen last day is part of the period: the window ends at its last millisecond
      expect(result.endDate).toBe('2026-05-15T23:59:59.999Z');
      expect(result.comparisonPeriod).not.toBeNull();

      const currentDuration = new Date(result.endDate).getTime() - new Date(result.startDate).getTime();
      const priorDuration =
        new Date(result.comparisonPeriod!.endDate).getTime() -
        new Date(result.comparisonPeriod!.startDate).getTime();
      expect(priorDuration).toBe(currentDuration);
      expect(new Date(result.comparisonPeriod!.endDate).getTime()).toBe(new Date(result.startDate).getTime());
    });

    it('queries the demandes up to the end of the chosen last day (to = today still counts today)', async () => {
      await service.getOverview({ period: 'custom' as any, from: '2026-05-10', to: '2026-05-10' });

      const where = prisma.demande.findMany.mock.calls[0]![0].where;
      expect(where.createdAt.gte).toEqual(new Date('2026-05-10T00:00:00.000Z'));
      expect(where.createdAt.lte).toEqual(new Date('2026-05-10T23:59:59.999Z'));
    });

    it('refuses a custom period without both dates instead of guessing a 30 day window', async () => {
      await expect(service.getOverview({ period: 'custom' as any })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      await expect(service.getOverview({ period: 'custom' as any, from: '2026-05-01' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
    });
  });

  describe('Dynamic Timeseries Bucketing for Custom Period', () => {
    it('generates daily buckets for short custom spans (<= 31 days)', async () => {
      // 1 to 10 May, both included: 10 days
      const result = await service.getOverview({ period: 'custom' as any, from: '2026-05-01', to: '2026-05-10' });

      expect(result.timeseries.activity.length).toBe(10);
      expect(result.timeseries.registrations.length).toBe(10);
      expect(result.timeseries.financials.length).toBe(10);

      const day0 = new Date(result.timeseries.activity[0]!.date).getTime();
      const day1 = new Date(result.timeseries.activity[1]!.date).getTime();
      expect(day1 - day0).toBe(24 * 60 * 60 * 1000);
    });

    it('generates weekly 7-day buckets for medium custom spans (> 31 days and <= 90 days)', async () => {
      // 1 March to 25 April, both included: 56 days = exactly 8 weeks
      const result = await service.getOverview({ period: 'custom' as any, from: '2026-03-01', to: '2026-04-25' });

      expect(result.timeseries.activity.length).toBe(8);
      const week0 = new Date(result.timeseries.activity[0]!.date).getTime();
      const week1 = new Date(result.timeseries.activity[1]!.date).getTime();
      expect(week1 - week0).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it('generates monthly buckets for long custom spans (> 90 days)', async () => {
      const result = await service.getOverview({ period: 'custom' as any, from: '2026-01-01', to: '2026-06-30' });

      expect(result.timeseries.activity.length).toBe(6);
      expect(result.timeseries.activity[0]!.label.toLowerCase()).toContain('janv');
      expect(result.timeseries.activity[5]!.label.toLowerCase()).toContain('juin');
    });
  });

  describe('P24 « classement triable par CA »: the rows contain the top of every sortable column', () => {
    const when = new Date('2026-05-05T10:00:00Z');
    const offersOf = (repairerUserId: string, n: number, accepted = 0) =>
      Array.from({ length: n }, (_, i) => ({
        id: `${repairerUserId}-o${i}`,
        repairerUserId,
        status: i < accepted ? 'ACCEPTED' : 'SENT',
        createdAt: when,
        demandeId: 'd1',
      }));

    it('keeps a big earner who sent few offers, and keeps the default ranking (offers sent) first', async () => {
      // r1..r12 sent 12..1 offers, one accepted each, and earned nothing; "rich" sent ONE offer (none
      // accepted) and earned 9 999 €: only the revenue column can bring it into the rows
      const offers = Array.from({ length: 12 }, (_, i) => offersOf(`r${i + 1}`, 12 - i, 1)).flat();
      offers.push(...offersOf('rich', 1));
      prisma.offer.findMany.mockResolvedValue(offers);
      prisma.commande.findMany.mockResolvedValue([
        { id: 'c1', repairerUserId: 'rich', repairCents: 999_900, totalCents: 999_900, status: 'PAID', paidAt: when, createdAt: when },
      ]);

      const result = await service.getOverview({ period: 'custom' as any, from: '2026-05-01', to: '2026-05-31' });

      const ids = result.topRepairers.map((r) => r.repairerId);
      // default ranking first: the ten most active, in order
      expect(ids.slice(0, 10)).toEqual(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9', 'r10']);
      // the top earner is there although ten others sent more offers
      expect(ids).toContain('rich');
      expect(result.topRepairers.find((r) => r.repairerId === 'rich')!.totalRevenueCents).toBe(999_900);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('keeps the top of the accepted-offers and of the conversion columns too', async () => {
      const mk = (id: string, n: number, accepted: number) =>
        Array.from({ length: n }, (_, i) => ({
          id: `${id}-o${i}`,
          repairerUserId: id,
          status: i < accepted ? 'ACCEPTED' : 'SENT',
          createdAt: when,
          demandeId: 'd1',
        }));
      // p1..p10: busiest (20 offers, none accepted). q1..q10: one offer, accepted (100 %).
      // acc: 3 offers, 2 accepted: the most accepted offers (2) but only 67 %.
      const offers = [
        ...Array.from({ length: 10 }, (_, i) => mk(`p${i + 1}`, 20, 0)).flat(),
        ...Array.from({ length: 10 }, (_, i) => mk(`q${i + 1}`, 1, 1)).flat(),
        ...mk('acc', 3, 2),
      ];
      prisma.offer.findMany.mockResolvedValue(offers);

      const result = await service.getOverview({ period: 'custom' as any, from: '2026-05-01', to: '2026-05-31' });

      const ids = result.topRepairers.map((r) => r.repairerId);
      // reachable ONLY through the accepted-offers column
      expect(ids).toContain('acc');
      // q10 is the tenth 100 %: reachable ONLY through the conversion column
      expect(ids).toContain('q10');
    });
  });
});
