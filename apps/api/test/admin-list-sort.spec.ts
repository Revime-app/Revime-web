import { describe, expect, it, vi } from 'vitest';
import {
  adminDisputeListQuerySchema,
  adminPaymentListQuerySchema,
  adminRefundListQuerySchema,
  type AdminRefundListItem,
} from '@revime/shared';
import { disputeOrderBy, paymentOrderBy, sortRefundItems } from '../src/admin/list-sort.js';
import { AdminPaymentsService } from '../src/admin/admin-payments.service.js';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { AdminRefundsService } from '../src/admin/admin-refunds.service.js';

describe('RU-16 UI8: a list column sorts the whole filtered set on the server', () => {
  describe('query schemas', () => {
    it('accept only the columns the server can order by, and a direction', () => {
      expect(adminPaymentListQuerySchema.parse({ sort: 'totalCents', dir: 'asc' })).toMatchObject({ sort: 'totalCents', dir: 'asc' });
      expect(adminDisputeListQuerySchema.parse({ sort: 'disputeNumber', dir: 'desc' })).toMatchObject({ sort: 'disputeNumber' });
      expect(adminRefundListQuerySchema.parse({ sort: 'refundedCents' })).toMatchObject({ sort: 'refundedCents' });
      // derived columns (payout status, « en litige », a dispute's effective status) have no SQL form
      expect(adminPaymentListQuerySchema.safeParse({ sort: 'payoutStatus' }).success).toBe(false);
      expect(adminDisputeListQuerySchema.safeParse({ sort: 'status' }).success).toBe(false);
      expect(adminPaymentListQuerySchema.safeParse({ sort: 'createdAt', dir: 'sideways' }).success).toBe(false);
    });
  });

  describe('orderBy builders', () => {
    it('default to newest first, with the id as a stable tiebreak', () => {
      expect(paymentOrderBy(undefined, undefined)).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
      expect(disputeOrderBy(undefined, undefined)).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });

    it('order payments by a stored column or by a related user name', () => {
      expect(paymentOrderBy('totalCents', 'asc')).toEqual([{ totalCents: 'asc' }, { id: 'desc' }]);
      expect(paymentOrderBy('clientName', 'desc')).toEqual([{ client: { name: 'desc' } }, { id: 'desc' }]);
      expect(paymentOrderBy('repairerName', 'asc')).toEqual([{ repairer: { name: 'asc' } }, { id: 'desc' }]);
    });

    it('order disputes by their own column or through the commande', () => {
      expect(disputeOrderBy('disputeNumber', 'asc')).toEqual([{ number: 'asc' }, { id: 'desc' }]);
      expect(disputeOrderBy('totalCents', 'desc')).toEqual([{ commande: { totalCents: 'desc' } }, { id: 'desc' }]);
      expect(disputeOrderBy('clientName', 'asc')).toEqual([{ commande: { client: { name: 'asc' } } }, { id: 'desc' }]);
    });
  });

  describe('services hand the order to the query that paginates', () => {
    it('payments', async () => {
      const prisma = {
        commande: { findMany: vi.fn().mockResolvedValue([]), count: vi.fn().mockResolvedValue(0), aggregate: vi.fn().mockResolvedValue({ _sum: {} }) },
        dispute: { count: vi.fn().mockResolvedValue(0) },
      } as any;
      await new AdminPaymentsService(prisma).list({ sort: 'totalCents', dir: 'asc', page: 1, pageSize: 25 } as any);
      expect(prisma.commande.findMany.mock.calls[0][0].orderBy).toEqual([{ totalCents: 'asc' }, { id: 'desc' }]);
    });

    it('disputes', async () => {
      const prisma = {
        dispute: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
        user: { findMany: vi.fn().mockResolvedValue([]) },
      } as any;
      await new AdminDisputesService(prisma, {} as never, { announce: vi.fn() } as never).list({ sort: 'disputeNumber', dir: 'asc', page: 1, pageSize: 25 } as any);
      expect(prisma.dispute.findMany.mock.calls[0][0].orderBy).toEqual([{ number: 'asc' }, { id: 'desc' }]);
    });
  });

  describe('refunds (derived status, so sorted in memory before the page is cut)', () => {
    const item = (over: Partial<AdminRefundListItem>): AdminRefundListItem => ({
      commandeId: 'c', orderNumber: 'CMD-1', date: '2026-09-01T00:00:00.000Z', clientName: 'A', repairerName: 'A',
      refundedCents: 100, motif: null, status: 'FULL', stripeRefundId: null, ...over,
    });

    it('sorts by amount across pages, nulls last in either direction', () => {
      const items = [item({ commandeId: 'a', refundedCents: 300 }), item({ commandeId: 'b', refundedCents: null }), item({ commandeId: 'c', refundedCents: 100 })];
      expect(sortRefundItems(items, 'refundedCents', 'asc').map((i) => i.commandeId)).toEqual(['c', 'a', 'b']);
      expect(sortRefundItems(items, 'refundedCents', 'desc').map((i) => i.commandeId)).toEqual(['a', 'c', 'b']);
    });

    it('sorts names with French collation and defaults to newest first', () => {
      const items = [item({ commandeId: 'a', clientName: 'Zoé', date: '2026-09-01T00:00:00.000Z' }), item({ commandeId: 'b', clientName: 'Émile', date: '2026-09-03T00:00:00.000Z' })];
      expect(sortRefundItems(items, 'clientName', 'asc').map((i) => i.commandeId)).toEqual(['b', 'a']);
      expect(sortRefundItems(items, undefined, undefined).map((i) => i.commandeId)).toEqual(['b', 'a']);
    });

    it('the service applies it before pagination', async () => {
      const row = (id: string, cents: number) => ({
        id, status: 'REFUNDED', refundedAt: new Date('2026-09-20T10:00:00.000Z'), updatedAt: new Date(), refundedCents: cents,
        totalCents: cents, repairCents: cents, refundRepairCents: cents, refundMotif: null, stripeRefundId: null, stripeTransferReversalId: null,
        client: { name: 'C' }, repairer: { name: 'R' },
      });
      const prisma = { commande: { findMany: vi.fn().mockResolvedValue([row('aaaaaaaa-0000-0000-0000-000000000001', 100), row('bbbbbbbb-0000-0000-0000-000000000002', 900), row('cccccccc-0000-0000-0000-000000000003', 500)]) } } as any;
      const res = await new AdminRefundsService(prisma).list({ sort: 'refundedCents', dir: 'desc', page: 1, pageSize: 2 } as any);
      expect(res.items.map((i) => i.refundedCents)).toEqual([900, 500]);
      expect(res.total).toBe(3);
    });
  });
});
