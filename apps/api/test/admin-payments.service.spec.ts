import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminPaymentsService } from '../src/admin/admin-payments.service.js';
import type { AdminPaymentListQuery } from '@revime/shared';

function makePrismaMock() {
  return {
    commande: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    dispute: {
      count: vi.fn(),
    },
    $transaction: vi.fn((callbackOrOps: any) => {
      if (typeof callbackOrOps === 'function') {
        return callbackOrOps(makePrismaMock());
      }
      return Promise.all(callbackOrOps);
    }),
  } as any;
}

const mockCommandeRow = {
  id: 'cmd-101',
  createdAt: new Date('2026-09-15T10:00:00.000Z'),
  paidAt: new Date('2026-09-15T10:05:00.000Z'),
  status: 'PAID' as const,
  step: 'PARCEL_SENT' as const,
  delivery: 'PARCEL' as const,
  totalCents: 15000,
  repairCents: 12000,
  shippingCents: 1800,
  protectionCents: 1200,
  disputedAt: new Date('2026-09-16T08:00:00.000Z'),
  stripeChargeId: 'ch_test_101',
  stripeTransferId: null,
  stripeRefundId: null,
  refundedCents: null,
  clientUser: {
    id: 'usr-client-1',
    name: 'Claire Dupont',
    email: 'claire@example.com',
  },
  repairerUser: {
    id: 'usr-repairer-1',
    name: 'David Atelier',
    email: 'david@example.com',
  },
  dispute: {
    id: 'disp-201',
    status: 'OPEN' as const,
  },
};

describe('AdminPaymentsService', () => {
  let prisma: any;
  let service: AdminPaymentsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminPaymentsService(prisma);
  });

  describe('list - metrics calculation', () => {
    it('aggregates platform volume, commissions, escrow holdings, refunds, and dispute counts', async () => {
      // Mock metrics aggregates
      // 1. Total volume & commissions (PAID status)
      prisma.commande.aggregate
        .mockResolvedValueOnce({
          _sum: { totalCents: 250000, protectionCents: 20000 },
        })
        // 2. Escrow in progress (PAID, step != 'RELEASED', status != 'REFUNDED')
        .mockResolvedValueOnce({
          _sum: { repairCents: 180000 },
        })
        // 3. Total refunded (REFUNDED status) - CF4-D task 5: refundedCents is what the CAS
        // actually writes as the refunded amount; totalCents is the order's original total
        // and would overstate a partial refund.
        .mockResolvedValueOnce({
          _sum: { refundedCents: 45000 },
        });

      // 4. Disputed count
      prisma.dispute.count.mockResolvedValueOnce(4);

      // Paginated items query
      prisma.commande.findMany.mockResolvedValue([mockCommandeRow]);
      prisma.commande.count.mockResolvedValue(1);

      const response = await service.list({});

      expect(response.metrics).toEqual({
        totalVolumeCents: 250000,
        commissionCents: 20000,
        escrowCents: 180000,
        refundedCents: 45000,
        disputedCount: 4,
      });
      expect(response.total).toBe(1);
      expect(response.items).toHaveLength(1);
    });

    it('returns zero values when aggregates are null / empty', async () => {
      prisma.commande.aggregate
        .mockResolvedValueOnce({ _sum: { totalCents: null, protectionCents: null } })
        .mockResolvedValueOnce({ _sum: { repairCents: null } })
        .mockResolvedValueOnce({ _sum: { refundedCents: null } });
      prisma.dispute.count.mockResolvedValueOnce(0);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.commande.count.mockResolvedValue(0);

      const response = await service.list({});

      expect(response.metrics).toEqual({
        totalVolumeCents: 0,
        commissionCents: 0,
        escrowCents: 0,
        refundedCents: 0,
        disputedCount: 0,
      });
      expect(response.total).toBe(0);
      expect(response.items).toEqual([]);
    });
  });

  describe('list - multi-criteria filtering', () => {
    beforeEach(() => {
      prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
      prisma.dispute.count.mockResolvedValue(0);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.commande.count.mockResolvedValue(0);
    });

    it('filters by status: PAID, REFUNDED, PENDING_PAYMENT, or ALL', async () => {
      await service.list({ status: 'PAID' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'PAID' }),
        }),
      );

      await service.list({ status: 'REFUNDED' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'REFUNDED' }),
        }),
      );

      await service.list({ status: 'ALL' });
      const call = prisma.commande.findMany.mock.calls.at(-1)![0];
      expect(call.where?.status).toBeUndefined();
    });

    it('filters by escrow step: RELEASED, PARCEL_SENT, or ALL', async () => {
      await service.list({ step: 'RELEASED' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ step: 'RELEASED' }),
        }),
      );

      await service.list({ step: 'PARCEL_SENT' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ step: 'PARCEL_SENT' }),
        }),
      );

      await service.list({ step: 'ALL' });
      const call = prisma.commande.findMany.mock.calls.at(-1)![0];
      expect(call.where?.step).toBeUndefined();
    });

    it('filters by delivery mode: PARCEL, WORKSHOP, HOME, or ALL', async () => {
      await service.list({ delivery: 'PARCEL' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ delivery: 'PARCEL' }),
        }),
      );

      await service.list({ delivery: 'WORKSHOP' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ delivery: 'WORKSHOP' }),
        }),
      );

      await service.list({ delivery: 'ALL' });
      const call = prisma.commande.findMany.mock.calls.at(-1)![0];
      expect(call.where?.delivery).toBeUndefined();
    });

    it('filters by disputed flag: true (active dispute) or false (no dispute)', async () => {
      // Disputed = true (active dispute, excluding REFUNDED orders)
      await service.list({ disputed: 'true' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { not: 'REFUNDED' },
            OR: expect.arrayContaining([
              expect.objectContaining({ dispute: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
              expect.objectContaining({
                AND: [{ disputedAt: { not: null } }, { dispute: null }],
              }),
            ]),
          }),
        }),
      );

      // Disputed = false (REFUNDED, resolved disputes, or no dispute and no disputedAt)
      await service.list({ disputed: 'false' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { status: 'REFUNDED' },
              { dispute: { status: { notIn: ['OPEN', 'IN_REVIEW'] } } },
              { AND: [{ dispute: null }, { disputedAt: null }] },
            ]),
          }),
        }),
      );
    });

    it('preserves status filter when filtering by disputed=true (prevents filter clobbering)', async () => {
      // status=PAID & disputed=true: must keep where.status = 'PAID'
      await service.list({ status: 'PAID', disputed: 'true' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'PAID',
            OR: expect.arrayContaining([
              expect.objectContaining({ dispute: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
            ]),
          }),
        }),
      );

      // status=REFUNDED & disputed=true: cannot be disputed, returns empty condition
      await service.list({ status: 'REFUNDED', disputed: 'true' });
      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [] },
          }),
        }),
      );
    });

    it('searches text query q across commande ID, parties, and Stripe IDs', async () => {
      await service.list({ q: 'ch_test_101' });

      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ id: expect.anything() }),
              expect.objectContaining({ stripeChargeId: expect.anything() }),
            ]),
          }),
        }),
      );
    });
  });

  describe('list - pagination and mapping', () => {
    it('applies pagination with skip and take, defaulting to page 1 and pageSize 25', async () => {
      prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
      prisma.dispute.count.mockResolvedValue(0);
      prisma.commande.findMany.mockResolvedValue([]);
      prisma.commande.count.mockResolvedValue(42);

      const res = await service.list({ page: 2, pageSize: 15 });

      expect(prisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 15,
          take: 15,
        }),
      );
      expect(res.page).toBe(2);
      expect(res.pageSize).toBe(15);
      expect(res.total).toBe(42);
    });

    it('maps items correctly with client/repairer details, escrow steps, and dispute indicators', async () => {
      prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
      prisma.dispute.count.mockResolvedValue(0);
      prisma.commande.findMany.mockResolvedValue([mockCommandeRow]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.list({});

      expect(res.items[0]).toEqual({
        id: 'cmd-101',
        createdAt: '2026-09-15T10:00:00.000Z',
        paidAt: '2026-09-15T10:05:00.000Z',
        status: 'PAID',
        step: 'PARCEL_SENT',
        delivery: 'PARCEL',
        totalCents: 15000,
        repairCents: 12000,
        shippingCents: 1800,
        protectionCents: 1200,
        clientName: 'Claire Dupont',
        clientEmail: 'claire@example.com',
        repairerName: 'David Atelier',
        repairerEmail: 'david@example.com',
        isDisputed: true,
        disputeId: 'disp-201',
        disputeStatus: 'OPEN',
        stripeChargeId: 'ch_test_101',
        stripeTransferId: null,
        stripeRefundId: null,
        refundedCents: null,
        cancellationPending: false,
        payoutStatus: 'PENDING',
        payoutAmountCents: 12000,
      });
    });

    // CF4-D final review, Important #1 (spec §5): the payments list must show the
    // refunded AMOUNT, not the order's total, for a REFUNDED row - this is the field
    // the table reads to do that.
    it('maps refundedCents from the row for a REFUNDED order', async () => {
      prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
      prisma.dispute.count.mockResolvedValue(0);
      prisma.commande.findMany.mockResolvedValue([
        {
          ...mockCommandeRow,
          status: 'REFUNDED',
          refundedCents: 3000,
        },
      ]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.list({});

      expect(res.items[0]?.status).toBe('REFUNDED');
      expect(res.items[0]?.refundedCents).toBe(3000);
    });

    it('maps refundedCents to null when the row has none (not refunded)', async () => {
      prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
      prisma.dispute.count.mockResolvedValue(0);
      prisma.commande.findMany.mockResolvedValue([mockCommandeRow]);
      prisma.commande.count.mockResolvedValue(1);

      const res = await service.list({});

      expect(res.items[0]?.refundedCents).toBeNull();
    });

    describe('Bug B12: Refunded orders and resolved disputes consistency', () => {
      it('marks isDisputed as false and clears escrow step to null for a REFUNDED order with historical disputedAt and dispute', async () => {
        prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
        prisma.dispute.count.mockResolvedValue(0);
        prisma.commande.findMany.mockResolvedValue([
          {
            ...mockCommandeRow,
            id: 'cmd-refunded-b12',
            status: 'REFUNDED',
            step: 'AWAITING_VALIDATION', // Stale frozen step
            disputedAt: new Date('2026-09-16T08:00:00.000Z'), // Historical dispute timestamp
            dispute: {
              id: 'disp-201',
              status: 'RESOLVED_REFUNDED',
            },
          },
        ]);
        prisma.commande.count.mockResolvedValue(1);

        const res = await service.list({});
        const item = res.items[0];

        expect(item?.status).toBe('REFUNDED');
        expect(item?.isDisputed).toBe(false);
        expect(item?.step).toBeNull();
        expect(item?.disputeStatus).toBe('RESOLVED_REFUNDED');
      });

      // B11: the dispute closed « Réparation reprise » before the order was refunded.
      it('shows a dispute closed as dismissed as refunded once its order is REFUNDED', async () => {
        prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
        prisma.dispute.count.mockResolvedValue(0);
        prisma.commande.findMany.mockResolvedValue([
          {
            ...mockCommandeRow,
            id: 'cmd-refunded-b11',
            status: 'REFUNDED',
            totalCents: 10636,
            refundedCents: 10636,
            dispute: { id: 'disp-6', status: 'RESOLVED_DISMISSED', verdict: 'DISMISSED' },
          },
        ]);
        prisma.commande.count.mockResolvedValue(1);

        const res = await service.list({});

        expect(res.items[0]?.disputeStatus).toBe('RESOLVED_REFUNDED');
      });

      it('marks isDisputed as false for a PAID order whose dispute is resolved (RESOLVED_RELEASED)', async () => {
        prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
        prisma.dispute.count.mockResolvedValue(0);
        prisma.commande.findMany.mockResolvedValue([
          {
            ...mockCommandeRow,
            id: 'cmd-resolved-b12',
            status: 'PAID',
            step: 'RELEASED',
            disputedAt: new Date('2026-09-16T08:00:00.000Z'),
            dispute: {
              id: 'disp-202',
              status: 'RESOLVED_RELEASED',
            },
          },
        ]);
        prisma.commande.count.mockResolvedValue(1);

        const res = await service.list({});
        const item = res.items[0];

        expect(item?.status).toBe('PAID');
        expect(item?.isDisputed).toBe(false);
        expect(item?.disputeStatus).toBe('RESOLVED_RELEASED');
      });

      it('filters disputed=true by excluding REFUNDED orders and only matching active disputes', async () => {
        prisma.commande.aggregate.mockResolvedValue({ _sum: {} });
        prisma.dispute.count.mockResolvedValue(0);
        prisma.commande.findMany.mockResolvedValue([]);
        prisma.commande.count.mockResolvedValue(0);

        await service.list({ disputed: 'true' });

        const call = prisma.commande.findMany.mock.calls[0]![0];
        expect(call.where.status).toEqual({ not: 'REFUNDED' });
        // The dispute filter must look for active disputes (OPEN, IN_REVIEW), not just any dispute
        expect(call.where.OR).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ dispute: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
          ]),
        );
      });
    });
  });
});
