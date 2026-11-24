import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminRefundsService } from '../src/admin/admin-refunds.service.js';

function makePrismaMock() {
  return {
    commande: {
      findMany: vi.fn(),
    },
  } as any;
}

const baseRow = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  status: 'REFUNDED' as const,
  refundedAt: new Date('2026-09-20T10:00:00.000Z'),
  updatedAt: new Date('2026-09-19T09:00:00.000Z'),
  refundedCents: 8000,
  totalCents: 8000,
  repairCents: 8000,
  refundRepairCents: 8000,
  refundMotif: 'CLIENT_CANCELLED' as const,
  stripeRefundId: 're_test_123',
  stripeChargeId: 'ch_1',
  stripePaymentIntentId: 'pi_1',
  stripeTransferId: null,
  stripeTransferReversalId: null,
  client: { id: 'usr-client-1', name: 'Claire Dupont', username: 'claire', email: 'claire@example.com' },
  repairer: { id: 'usr-repairer-1', name: 'David Atelier', username: 'david', email: 'david@example.com' },
};

describe('P13: AdminRefundsService Summary & Stripe ID', () => {
  let prisma: any;
  let service: AdminRefundsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminRefundsService(prisma);
    prisma.commande.findMany.mockResolvedValue([]);
  });

  describe('Stripe Refund ID Mapping', () => {
    it('maps stripeRefundId on each returned list item', async () => {
      prisma.commande.findMany.mockResolvedValue([
        { ...baseRow, id: 'c-1', stripeRefundId: 're_stripe_abc123' },
        { ...baseRow, id: 'c-2', stripeRefundId: null },
      ]);

      const res = await service.list({ page: 1, pageSize: 25 });

      expect(res.items).toHaveLength(2);
      // Same date on both rows: the order between them is the id tiebreak, so look each row up.
      expect(res.items.find((i) => i.commandeId === 'c-1')?.stripeRefundId).toBe('re_stripe_abc123');
      expect(res.items.find((i) => i.commandeId === 'c-2')?.stripeRefundId).toBeNull();
    });
  });

  describe('Summary Aggregates (totalRefundedCents, count, averageRefundCents)', () => {
    it('computes accurate summary statistics across filtered items', async () => {
      const rows = [
        { ...baseRow, id: 'c-1', refundedCents: 6000 },
        { ...baseRow, id: 'c-2', refundedCents: 4000 },
        { ...baseRow, id: 'c-3', refundedCents: 5000 },
      ];
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ page: 1, pageSize: 25 });

      expect(res.summary).toBeDefined();
      expect(res.summary?.totalRefundedCents).toBe(15000);
      expect(res.summary?.count).toBe(3);
      expect(res.summary?.averageRefundCents).toBe(5000);
    });

    it('returns 0 for count, total, and average when no refunds match', async () => {
      prisma.commande.findMany.mockResolvedValue([]);

      const res = await service.list({ page: 1, pageSize: 25 });

      expect(res.summary).toEqual({
        totalRefundedCents: 0,
        count: 0,
        averageRefundCents: 0,
      });
    });

    it('leaves an INCOMPLETE refund (PAID, Stripe refund reference, nothing returned) out of the count and the average', async () => {
      const rows = [
        { ...baseRow, id: 'c-1', refundedCents: 3000 },
        { ...baseRow, id: 'c-2', status: 'PAID', stripeRefundId: 're_incomplete', refundedCents: null },
      ];
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ page: 1, pageSize: 25 });

      expect(res.items.map((i) => i.status).sort()).toEqual(['INCOMPLETE', 'PARTIAL']);
      expect(res.summary).toEqual({ totalRefundedCents: 3000, count: 1, averageRefundCents: 3000 });
    });

    it('calculates summary based on filtered set before pagination slicing', async () => {
      // 10 items of 2000 cents each = total 20000, avg 2000
      const rows = Array.from({ length: 10 }, (_, i) => ({
        ...baseRow,
        id: `c-${i}`,
        refundedCents: 2000,
      }));
      prisma.commande.findMany.mockResolvedValue(rows);

      // Request page 1 with pageSize 3
      const res = await service.list({ page: 1, pageSize: 3 });

      expect(res.items).toHaveLength(3);
      expect(res.total).toBe(10);
      expect(res.summary?.count).toBe(10);
      expect(res.summary?.totalRefundedCents).toBe(20000);
      expect(res.summary?.averageRefundCents).toBe(2000);
    });

    it('updates summary when filtered by status in-memory', async () => {
      const rows = [
        { ...baseRow, id: 'c-full-1', status: 'REFUNDED', refundRepairCents: 8000, refundedCents: 8000 },
        { ...baseRow, id: 'c-full-2', status: 'REFUNDED', refundRepairCents: 8000, refundedCents: 8000 },
        {
          ...baseRow,
          id: 'c-share-owed',
          status: 'REFUNDED',
          repairCents: 8000,
          refundRepairCents: 4000,
          refundedCents: 4000,
          stripeTransferId: null,
        },
      ];
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ status: 'FULL', page: 1, pageSize: 25 });

      expect(res.items).toHaveLength(2);
      expect(res.summary?.count).toBe(2);
      expect(res.summary?.totalRefundedCents).toBe(16000);
      expect(res.summary?.averageRefundCents).toBe(8000);
    });
  });

  describe('History Retrieval: date fallback', () => {
    it('uses updatedAt when refundedAt is null', async () => {
      const rows = [
        {
          ...baseRow,
          id: 'c-null-refunded-at',
          refundedAt: null,
          updatedAt: new Date('2026-09-22T14:00:00.000Z'),
          refundedCents: 5000,
        },
      ];
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ page: 1, pageSize: 25 });

      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.date).toBe('2026-09-22T14:00:00.000Z');
    });
  });
});
