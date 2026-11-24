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
  stripeRefundId: 're_1',
  stripeChargeId: 'ch_1',
  stripePaymentIntentId: 'pi_1',
  stripeTransferId: null,
  stripeTransferReversalId: null,
  client: { id: 'usr-client-1', name: 'Claire Dupont', username: 'claire', email: 'claire@example.com' },
  repairer: { id: 'usr-repairer-1', name: 'David Atelier', username: 'david', email: 'david@example.com' },
};

describe('AdminRefundsService.list', () => {
  let prisma: any;
  let service: AdminRefundsService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminRefundsService(prisma);
    prisma.commande.findMany.mockResolvedValue([]);
  });

  describe('base where: REFUNDED plus PAID-with-attempt', () => {
    it('includes REFUNDED and PAID with a refund/reversal id in the OR', async () => {
      await service.list({ page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      expect(call.where.OR).toEqual([
        { status: 'REFUNDED' },
        { status: 'PAID', OR: [{ stripeRefundId: { not: null } }, { stripeTransferReversalId: { not: null } }] },
      ]);
    });
  });

  describe('where-building: each filter reaches the where', () => {
    it('filters by period (refundedAt from/to)', async () => {
      await service.list({
        from: '2026-09-01T00:00:00.000Z',
        to: '2026-09-30T00:00:00.000Z',
        page: 1,
        pageSize: 25,
      } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      expect(call.where.refundedAt).toEqual({
        gte: new Date('2026-09-01T00:00:00.000Z'),
        lte: new Date('2026-09-30T00:00:00.000Z'),
      });
    });

    it('filters by amount bounds (refundedCents gte/lte)', async () => {
      await service.list({ minCents: 1000, maxCents: 9000, page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      expect(call.where.refundedCents).toEqual({ gte: 1000, lte: 9000 });
    });

    it('filters by motif', async () => {
      await service.list({ motif: 'REPAIR_NOT_DONE', page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      expect(call.where.refundMotif).toBe('REPAIR_NOT_DONE');
    });

    it('filters by client (name/username/email OR, insensitive)', async () => {
      await service.list({ client: 'claire', page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      expect(call.where.client.OR).toEqual([
        { name: { contains: 'claire', mode: 'insensitive' } },
        { username: { contains: 'claire', mode: 'insensitive' } },
        { email: { contains: 'claire', mode: 'insensitive' } },
      ]);
    });

    it('filters by repairer (name/username/email OR, insensitive)', async () => {
      await service.list({ repairer: 'david', page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      expect(call.where.repairer.OR).toEqual([
        { name: { contains: 'david', mode: 'insensitive' } },
        { username: { contains: 'david', mode: 'insensitive' } },
        { email: { contains: 'david', mode: 'insensitive' } },
      ]);
    });

    it('q: order-number search reaches id startsWith, normalised', async () => {
      await service.list({ q: '#CMD-AaAaAaAa', page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      const idClause = call.where.AND[0].OR.find((c: any) => c.id);
      expect(idClause).toEqual({ id: { startsWith: 'aaaaaaaa' } });
    });

    it('q: matches stripeRefundId / stripeChargeId / stripePaymentIntentId equals', async () => {
      await service.list({ q: 're_123', page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      const or = call.where.AND[0].OR;
      expect(or).toContainEqual({ stripeRefundId: 're_123' });
      expect(or).toContainEqual({ stripeChargeId: 're_123' });
      expect(or).toContainEqual({ stripePaymentIntentId: 're_123' });
    });

    it('q: matches client/repairer username/name/email contains', async () => {
      await service.list({ q: 'claire', page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      const or = call.where.AND[0].OR;
      expect(or).toContainEqual({ client: { username: { contains: 'claire', mode: 'insensitive' } } });
      expect(or).toContainEqual({ client: { name: { contains: 'claire', mode: 'insensitive' } } });
      expect(or).toContainEqual({ client: { email: { contains: 'claire', mode: 'insensitive' } } });
      expect(or).toContainEqual({ repairer: { username: { contains: 'claire', mode: 'insensitive' } } });
      expect(or).toContainEqual({ repairer: { name: { contains: 'claire', mode: 'insensitive' } } });
      expect(or).toContainEqual({ repairer: { email: { contains: 'claire', mode: 'insensitive' } } });
    });

    it('combines the base OR (REFUNDED/PAID-attempt) with the q OR via AND, without losing either', async () => {
      await service.list({ q: 'claire', page: 1, pageSize: 25 } as any);
      const call = prisma.commande.findMany.mock.calls[0]![0];
      expect(call.where.AND).toHaveLength(2);
      expect(call.where.AND[1].OR).toEqual([
        { status: 'REFUNDED' },
        { status: 'PAID', OR: [{ stripeRefundId: { not: null } }, { stripeTransferReversalId: { not: null } }] },
      ]);
    });
  });

  describe('status: filtered in memory after SQL filters, before pagination', () => {
    it('maps status via refundListStatus and filters + computes total from the filtered set', async () => {
      const rows = [
        { ...baseRow, id: 'c-full', status: 'REFUNDED', refundRepairCents: 8000, stripeTransferId: null },
        {
          ...baseRow,
          id: 'c-share-owed',
          status: 'REFUNDED',
          repairCents: 8000,
          refundRepairCents: 4000,
          stripeTransferId: null,
        },
        { ...baseRow, id: 'c-incomplete', status: 'PAID', stripeRefundId: 're_2' },
      ];
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ status: 'SHARE_OWED', page: 1, pageSize: 25 } as any);

      expect(res.total).toBe(1);
      expect(res.items).toHaveLength(1);
      expect(res.items[0]?.commandeId).toBe('c-share-owed');
      expect(res.items[0]?.status).toBe('SHARE_OWED');
    });

    it('legacy REFUNDED row (null breakdown) resolves to FULL, motif null', async () => {
      const rows = [
        {
          ...baseRow,
          id: 'c-legacy',
          status: 'REFUNDED',
          refundRepairCents: null,
          refundMotif: null,
          stripeTransferId: null,
        },
      ];
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ page: 1, pageSize: 25 } as any);

      expect(res.items[0]?.status).toBe('FULL');
      expect(res.items[0]?.motif).toBeNull();
    });
  });

  describe('sorting and pagination', () => {
    it('sorts by refundedAt (or updatedAt) desc and paginates', async () => {
      const rows = Array.from({ length: 30 }, (_, i) => ({
        ...baseRow,
        id: `c-${i}`,
        refundedAt: new Date(2026, 8, i + 1),
        status: 'REFUNDED',
        refundRepairCents: 8000,
        stripeTransferId: null,
      }));
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ page: 2, pageSize: 25 } as any);

      expect(res.total).toBe(30);
      expect(res.items).toHaveLength(5);
      expect(res.items[0]?.commandeId).toBe('c-4');
    });

    it('uses updatedAt for a PAID/Incomplet row that has no refundedAt', async () => {
      const rows = [
        { ...baseRow, id: 'c-old', status: 'REFUNDED', refundedAt: new Date('2026-09-01'), refundRepairCents: 8000, stripeTransferId: null },
        { ...baseRow, id: 'c-incomplete', status: 'PAID', refundedAt: null, updatedAt: new Date('2026-09-25'), stripeRefundId: 're_2' },
      ];
      prisma.commande.findMany.mockResolvedValue(rows);

      const res = await service.list({ page: 1, pageSize: 25 } as any);

      expect(res.items[0]?.commandeId).toBe('c-incomplete');
    });
  });

  describe('mapping', () => {
    it('maps a row to an AdminRefundListItem with orderNumber, party names, amount, motif, status', async () => {
      prisma.commande.findMany.mockResolvedValue([{ ...baseRow }]);

      const res = await service.list({ page: 1, pageSize: 25 } as any);

      expect(res.items[0]).toEqual({
        commandeId: 'aaaaaaaa-1111-2222-3333-444444444444',
        orderNumber: '#CMD-AAAAAAAA',
        date: '2026-09-20T10:00:00.000Z',
        clientName: 'Claire Dupont',
        repairerName: 'David Atelier',
        refundedCents: 8000,
        motif: 'CLIENT_CANCELLED',
        status: 'FULL',
        stripeRefundId: 're_1',
      });
    });

    it('shows null refundedCents for an Incomplet (PAID) row', async () => {
      prisma.commande.findMany.mockResolvedValue([
        { ...baseRow, status: 'PAID', refundedCents: null, refundedAt: null, stripeRefundId: 're_1' },
      ]);

      const res = await service.list({ page: 1, pageSize: 25 } as any);

      expect(res.items[0]?.refundedCents).toBeNull();
      expect(res.items[0]?.status).toBe('INCOMPLETE');
    });
  });
});
