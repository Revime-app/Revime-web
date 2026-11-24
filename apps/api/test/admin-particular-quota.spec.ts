import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detailUser, makeUsersService } from './admin-user-detail-fixture.js';

/**
 * A2: the particular réparateur's counter. The counting itself (`particular-quota.ts`) is specified in
 * `particular-quota.spec.ts`; here the page's wiring: who gets a counter, which orders are asked for,
 * what « En attente » and « Bloqué » mean. The old spec answered with rows whenever `where.createdAt`
 * existed, so the window and the order filter were never tested (RU-29).
 */
const NOW = new Date('2026-10-17T12:00:00.000Z');

const individual = (fiscalCompletedAt: Date | null = null) => ({
  id: 'rp-1',
  kind: 'INDIVIDUAL' as const,
  fiscalCompletedAt,
  fiscalReminderCount: 0,
  lastFiscalReminderAt: null,
});

describe('Admin Particular Repairer Quota (A-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns particularQuota: null for a client-only user', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ repairerProfile: null }));
    expect((await service.detail('usr-1')).particularQuota).toBeNull();
    // The fiche's other counters also use `commande`; the quota's own « en attente » query is the one on reversals.
    const pendingQueries = prisma.commande.aggregate.mock.calls.filter(
      ([args]) => 'stripeTransferReversalId' in (args as { where: object }).where,
    );
    expect(pendingQueries).toHaveLength(0);
  });

  it('returns particularQuota: null for a PRO repairer', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(
      detailUser({ repairerProfile: { ...individual(new Date()), kind: 'PRO' } }),
    );
    expect((await service.detail('usr-1')).particularQuota).toBeNull();
  });

  it('counts the paid, unrefunded orders of the last 12 months and dates the release from the oldest payment', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ repairerProfile: individual() }));
    const paid = (repairCents: number, paidAt: string) => ({
      repairerUserId: 'usr-1',
      repairCents,
      refundRepairCents: null,
      paidAt: new Date(paidAt),
    });
    // 8 missions, 1 140 euros; the oldest was paid on 2025-11-14.
    // Only the quota's own query (the one on `paidAt`) gets these rows; the fiche's recent-orders list does not.
    const quotaRows = [
      paid(15000, '2026-09-12T17:00:00.000Z'),
      paid(15000, '2025-11-14T14:00:00.000Z'),
      paid(12000, '2026-01-10T10:00:00.000Z'),
      paid(20000, '2026-02-15T11:00:00.000Z'),
      paid(15000, '2026-03-20T16:00:00.000Z'),
      paid(14000, '2026-05-01T09:00:00.000Z'),
      paid(13000, '2026-06-18T13:00:00.000Z'),
      paid(10000, '2026-08-05T15:00:00.000Z'),
    ];
    prisma.commande.findMany.mockImplementation(({ where }: { where: { paidAt?: unknown } }) =>
      Promise.resolve(where.paidAt ? quotaRows : []),
    );
    prisma.commande.aggregate.mockResolvedValue({ _sum: { repairCents: 8500 } });

    const { particularQuota } = await service.detail('usr-1');

    expect(prisma.commande.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repairerUserId: 'usr-1',
          status: 'PAID',
          stripeRefundId: null,
          paidAt: { gte: new Date('2025-10-17T12:00:00.000Z') },
        },
      }),
    );
    expect(particularQuota).toEqual({
      missionsCount: 8,
      missionsMax: 10,
      amountCollectedCents: 114000,
      amountMaxCents: 150000,
      nextMissionReleaseAt: '2026-11-14T14:00:00.000Z',
      pendingPayoutCents: 8500,
      isBlockedFiscal: true,
    });
  });

  it('asks for « en attente » money still owed: paid, not transferred, not refunded, not taken back', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ repairerProfile: individual() }));
    await service.detail('usr-1');
    expect(prisma.commande.aggregate).toHaveBeenCalledWith({
      where: {
        repairerUserId: 'usr-1',
        status: 'PAID',
        stripeTransferId: null,
        stripeRefundId: null,
        stripeTransferReversalId: null,
      },
      _sum: { repairCents: true },
    });
  });

  it('marks isBlockedFiscal: false once the fiscal declaration is complete, and with nothing pending', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ repairerProfile: individual(new Date('2026-10-01')) }));
    prisma.commande.aggregate.mockResolvedValue({ _sum: { repairCents: 5000 } });
    const complete = (await service.detail('usr-1')).particularQuota;
    expect(complete?.isBlockedFiscal).toBe(false);
    expect(complete?.pendingPayoutCents).toBe(5000);

    prisma.user.findUnique.mockResolvedValue(detailUser({ repairerProfile: individual() }));
    prisma.commande.aggregate.mockResolvedValue({ _sum: { repairCents: null } });
    expect((await service.detail('usr-1')).particularQuota?.isBlockedFiscal).toBe(false);
  });

  it('has no release date with no mission in the window', async () => {
    const { service, prisma } = makeUsersService();
    prisma.user.findUnique.mockResolvedValue(detailUser({ repairerProfile: individual() }));
    expect((await service.detail('usr-1')).particularQuota).toMatchObject({
      missionsCount: 0,
      amountCollectedCents: 0,
      nextMissionReleaseAt: null,
    });
  });
});
