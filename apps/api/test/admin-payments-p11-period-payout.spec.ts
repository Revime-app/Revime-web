import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminPaymentsService } from '../src/admin/admin-payments.service.js';

function makePrismaMock() {
  return {
    commande: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    dispute: {
      count: vi.fn(),
    },
  } as any;
}

const baseRow = {
  id: 'cmd-test-1',
  createdAt: new Date('2026-10-10T12:00:00.000Z'),
  paidAt: new Date('2026-10-10T12:05:00.000Z'),
  status: 'PAID' as const,
  step: 'PARCEL_SENT' as const,
  delivery: 'PARCEL' as const,
  totalCents: 10000,
  repairCents: 8000,
  shippingCents: 1200,
  protectionCents: 800,
  disputedAt: null,
  stripeChargeId: 'ch_1',
  stripeTransferId: null,
  stripeRefundId: null,
  refundedCents: null,
  cancellationRequestedAt: null,
  clientUser: { name: 'Client 1', email: 'c1@test.com' },
  repairerUser: { name: 'Rep 1', email: 'r1@test.com' },
  dispute: null,
};

describe('AdminPaymentsService P11 — Period Filter, Repairer Payout & Stale Abandonment', () => {
  let prisma: any;
  let service: AdminPaymentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminPaymentsService(prisma);
  });

  const emptyList = () => {
    prisma.commande.aggregate.mockResolvedValue({ _sum: { totalCents: 0, protectionCents: 0, repairCents: 0, refundedCents: 0 } });
    prisma.dispute.count.mockResolvedValue(0);
    prisma.commande.findMany.mockResolvedValue([]);
    prisma.commande.count.mockResolvedValue(0);
  };

  describe('1. Period Filter', () => {
    it('cuts the list and every KPI by the day the money was collected (paidAt, else createdAt)', async () => {
      emptyList();

      const before = Date.now();
      await service.list({ period: '7d' });
      const after = Date.now();

      const periodOf = (where: any) => where.AND.find((c: any) => c.OR?.some((o: any) => o.paidAt));
      const cutoffOf = (where: any) => periodOf(where).OR[0].paidAt.gte as Date;

      for (const call of prisma.commande.aggregate.mock.calls) {
        const cutoff = cutoffOf(call[0].where);
        expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - 7 * 86_400_000 - 100);
        expect(cutoff.getTime()).toBeLessThanOrEqual(after - 7 * 86_400_000 + 100);
        // An order with no paidAt falls back to its creation date, as /statistiques does.
        expect(periodOf(call[0].where).OR[1]).toEqual({ paidAt: null, createdAt: { gte: cutoff } });
      }
      expect(prisma.commande.aggregate).toHaveBeenCalledTimes(3);

      expect(cutoffOf(prisma.commande.findMany.mock.calls[0][0].where)).toBeInstanceOf(Date);
      expect(cutoffOf(prisma.commande.count.mock.calls[0][0].where)).toBeInstanceOf(Date);
      // The disputes tile follows the same orders.
      expect(periodOf(prisma.dispute.count.mock.calls[0][0].where.commande)).toBeDefined();
    });

    it('applies period "month" from the 1st of the current UTC month', async () => {
      emptyList();

      await service.list({ period: 'month' });

      const now = new Date();
      const expectedUtcMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
      const where = prisma.commande.aggregate.mock.calls[0][0].where;
      expect(where.AND[0].OR[0].paidAt.gte.getTime()).toBe(expectedUtcMonthStart.getTime());
    });

    it('keeps the search filter when a period is also set (both own an OR)', async () => {
      emptyList();

      await service.list({ period: '30d', q: 'abc', disputed: 'true' });

      // disputed + search already share `AND`; the period is a third clause, not an overwrite.
      const where = prisma.commande.findMany.mock.calls[0][0].where;
      expect(where.AND).toHaveLength(3);
      expect(where.OR).toBeUndefined();
    });

    it('adds no date condition when period is "all" or undefined', async () => {
      emptyList();

      await service.list({ period: 'all' });

      expect(prisma.commande.aggregate.mock.calls[0][0].where.AND).toEqual([]);
      expect(prisma.commande.findMany.mock.calls[0][0].where.AND).toBeUndefined();
    });
  });

  describe('2. Versement réparateur mapping', () => {
    const listOne = async (row: object) => {
      prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
      prisma.dispute.count.mockResolvedValue(0);
      prisma.commande.findMany.mockResolvedValue([{ ...baseRow, ...row }]);
      prisma.commande.count.mockResolvedValue(1);
      return (await service.list({})).items[0]!;
    };

    it('is TRANSFERRED only when a transfer id exists, and shows what was transferred', async () => {
      const item = await listOne({ step: 'REPAIR_DONE', stripeTransferId: 'tr_123', repairCents: 6200, transferredCents: 5900 });

      expect(item.payoutStatus).toBe('TRANSFERRED');
      expect(item.payoutAmountCents).toBe(5900);
    });

    it('is FAILED, not TRANSFERRED, for a released order with no transfer (the same rule as F5)', async () => {
      const item = await listOne({ step: 'RELEASED', stripeTransferId: null, repairCents: 8500 });

      expect(item.payoutStatus).toBe('FAILED');
      expect(item.payoutAmountCents).toBe(8500);
    });

    it('is REVERSED when Stripe took the transfer back', async () => {
      const item = await listOne({ stripeTransferId: 'tr_1', stripeTransferReversalId: 'trr_1' });

      expect(item.payoutStatus).toBe('REVERSED');
    });

    it('is PENDING while the money is still in escrow', async () => {
      const item = await listOne({ status: 'PAID', step: 'PARCEL_SENT', stripeTransferId: null, repairCents: 7500 });

      expect(item.payoutStatus).toBe('PENDING');
      expect(item.payoutAmountCents).toBe(7500);
    });

    it('is NOT_APPLICABLE with a null amount for REFUNDED, ABANDONED and PENDING_PAYMENT orders', async () => {
      for (const status of ['REFUNDED', 'ABANDONED', 'PENDING_PAYMENT']) {
        const item = await listOne({ status, step: null, stripeTransferId: status === 'REFUNDED' ? 'tr_9' : null });

        expect(item.payoutStatus).toBe('NOT_APPLICABLE');
        expect(item.payoutAmountCents).toBeNull();
      }
    });
  });

  describe('3. abandonStalePayments', () => {
    it('only touches checkouts that never reached Stripe, older than 24 h, and returns the count', async () => {
      prisma.commande.updateMany.mockResolvedValue({ count: 5 });

      const before = Date.now();
      const result = await service.abandonStalePayments();
      const after = Date.now();

      expect(result).toEqual({ count: 5 });
      expect(prisma.commande.updateMany).toHaveBeenCalledTimes(1);

      const call = prisma.commande.updateMany.mock.calls[0][0];
      expect(call.where.status).toBe('PENDING_PAYMENT');
      // A row with a Stripe id can still be paid: it is settled through Stripe by the cron.
      expect(call.where.stripeSessionId).toBeNull();
      expect(call.where.stripePaymentIntentId).toBeNull();
      const cutoffMs = call.where.createdAt.lte.getTime();
      expect(cutoffMs).toBeGreaterThanOrEqual(before - 24 * 3600 * 1000 - 100);
      expect(cutoffMs).toBeLessThanOrEqual(after - 24 * 3600 * 1000 + 100);
      expect(call.data).toEqual({ status: 'ABANDONED' });
    });
  });
});
