import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminPaymentsService } from '../src/admin/admin-payments.service.js';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { AppException } from '../src/common/app-exception.js';

describe('Bug B15: Short references return "Ressource introuvable" in search', () => {
  const fullOrderId = '86642ef2-1111-2222-3333-444444444444';
  const shortHex = '86642ef2';
  const orderNumber = '#CMD-86642EF2';

  const mockCommandeRow = {
    id: fullOrderId,
    demandeId: 'dem-1',
    clientUserId: 'u-1',
    repairerUserId: 'u-2',
    createdAt: new Date('2026-10-10T12:00:00.000Z'),
    updatedAt: new Date('2026-10-10T12:00:00.000Z'),
    paidAt: new Date('2026-10-10T12:05:00.000Z'),
    transferredAt: null,
    releasedAt: null,
    demande: {
      id: 'dem-1',
      title: 'Réparation écran iPhone',
      description: null,
      createdAt: new Date('2026-10-09T10:00:00.000Z'),
      category: { labelFr: 'Smartphones' },
      photos: [],
    },
    offer: {
      id: 'off-1',
      priceCents: 5000,
      partsLabel: 'Neuves',
      warrantyLabel: '3 mois',
      comment: null,
      createdAt: new Date('2026-10-09T12:00:00.000Z'),
    },
    client: { id: 'u-1', name: 'Alice Client', email: 'alice@example.com', phone: null },
    repairer: { id: 'u-2', name: 'Bob Réparateur', email: 'bob@example.com', phone: null },
    dispute: null,
    review: null,
    cancellationRequests: [],
    stepEvents: [],
    shippingAddresses: [
      { role: 'CLIENT', city: 'Paris' },
      { role: 'REPAIRER', city: 'Lyon' },
    ],
    shipments: [],
    delivery: 'PARCEL' as const,
    status: 'PAID' as const,
    step: 'DIAGNOSTIC' as const,
    repairCents: 5000,
    shippingCents: 1000,
    protectionCents: 500,
    totalCents: 6500,
    stripeTransferId: null,
    stripeRefundId: null,
    stripeChargeId: 'ch_test_123',
    stripeSessionId: null,
    stripePaymentIntentId: null,
    disputedAt: null,
    insuranceCents: 0,
    refundRepairCents: null,
    refundShippingCents: null,
  };

  describe('AdminController.summary (GET /admin/commandes/:id)', () => {
    let controller: AdminController;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        commande: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
        },
        conversation: { findFirst: vi.fn().mockResolvedValue(null) },
      };

      controller = new AdminController(
        mockPrisma,
        {} as any, // refunds
        {} as any, // cron
        {} as any, // catalog
        {} as any, // moderationAdmin
        {} as any, // overviewService
        {} as any, // auditService
        {} as any, // users
        {} as any, // usersWrite
        {} as any, // repairers
        {} as any, // repairersWrite
        {} as any, // demandes
        {} as any, // demandesWrite
        {} as any, // offres
        {} as any, // shipments
      );
    });

    it('resolves an order by exact full UUID', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(mockCommandeRow);

      const result = await controller.summary(fullOrderId);
      expect(result.commandeId).toBe(fullOrderId);
    });

    it('resolves an order by short reference with # prefix (#86642ef2)', async () => {
      // Direct findUnique('#86642ef2') returns null on existing code
      mockPrisma.commande.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === fullOrderId) return Promise.resolve(mockCommandeRow);
        return Promise.resolve(null);
      });
      mockPrisma.commande.findMany.mockImplementation(({ where }: any) => {
        if (where.id?.startsWith === shortHex)
          return Promise.resolve([{ id: fullOrderId }]);
        return Promise.resolve([]);
      });

      const result = await controller.summary('#86642ef2');
      expect(result.commandeId).toBe(fullOrderId);
    });

    it('resolves an order by order number (#CMD-86642EF2)', async () => {
      mockPrisma.commande.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === fullOrderId) return Promise.resolve(mockCommandeRow);
        return Promise.resolve(null);
      });
      mockPrisma.commande.findMany.mockImplementation(({ where }: any) => {
        if (where.id?.startsWith === shortHex)
          return Promise.resolve([{ id: fullOrderId }]);
        return Promise.resolve([]);
      });

      const result = await controller.summary(orderNumber);
      expect(result.commandeId).toBe(fullOrderId);
    });

    it('resolves an order by bare 8-char hex (86642ef2 or 86642EF2)', async () => {
      mockPrisma.commande.findUnique.mockImplementation(({ where }: any) => {
        if (where.id === fullOrderId) return Promise.resolve(mockCommandeRow);
        return Promise.resolve(null);
      });
      mockPrisma.commande.findMany.mockImplementation(({ where }: any) => {
        if (where.id?.startsWith === shortHex)
          return Promise.resolve([{ id: fullOrderId }]);
        return Promise.resolve([]);
      });

      const result = await controller.summary('86642EF2');
      expect(result.commandeId).toBe(fullOrderId);
    });

    it('throws 404 NOT_FOUND when reference cannot be resolved or does not exist', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(null);
      mockPrisma.commande.findMany.mockResolvedValue([]);

      await expect(controller.summary('#CMD-00000000')).rejects.toThrow(
        AppException,
      );
    });

    // The same resolver feeds refund, label and dispute POSTs: a prefix two orders share must
    // be refused, never settled by « the newest one ».
    it('refuses a prefix shared by two orders instead of picking one', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(null);
      mockPrisma.commande.findMany.mockResolvedValue([
        { id: fullOrderId },
        { id: '86642ef2-9999-4999-8999-999999999999' },
      ]);

      await expect(controller.summary('#86642ef2')).rejects.toMatchObject({
        code: 'CONFLICT',
      });
    });

    it('looks up at most two candidates, which is all it needs to tell unique from shared', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(null);
      mockPrisma.commande.findMany.mockResolvedValue([]);

      await expect(controller.summary('#86642ef2')).rejects.toThrow(AppException);
      expect(mockPrisma.commande.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ take: 2, where: { id: { startsWith: shortHex } } }),
      );
    });

    it('does not run a prefix lookup for a term that is not hex', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(null);

      await expect(controller.summary('Martin')).rejects.toThrow(AppException);
      expect(mockPrisma.commande.findMany).not.toHaveBeenCalled();
    });
  });

  describe('AdminPaymentsService.list (GET /admin/payments?q=...)', () => {
    let service: AdminPaymentsService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        commande: {
          findMany: vi.fn().mockResolvedValue([mockCommandeRow]),
          count: vi.fn().mockResolvedValue(1),
          aggregate: vi.fn().mockResolvedValue({
            _sum: {
              totalCents: 6500,
              protectionCents: 500,
              repairCents: 5000,
              refundedCents: 0,
            },
          }),
        },
        dispute: { count: vi.fn().mockResolvedValue(0) },
      };
      service = new AdminPaymentsService(mockPrisma);
    });

    it('includes startsWith prefix match when searching with #CMD-86642EF2', async () => {
      await service.list({ q: '#CMD-86642EF2' });

      const findManyCall = mockPrisma.commande.findMany.mock.calls[0][0];
      const orClauses = findManyCall.where.OR;
      const startsWithMatch = orClauses.some(
        (clause: any) => clause.id?.startsWith === shortHex,
      );
      expect(startsWithMatch).toBe(true);
    });

    it('includes startsWith prefix match when searching with #86642ef2', async () => {
      await service.list({ q: '#86642ef2' });

      const findManyCall = mockPrisma.commande.findMany.mock.calls[0][0];
      const orClauses = findManyCall.where.OR;
      const startsWithMatch = orClauses.some(
        (clause: any) => clause.id?.startsWith === shortHex,
      );
      expect(startsWithMatch).toBe(true);
    });

    it('does NOT inject startsWith prefix match when searching non-hex terms like "Martin"', async () => {
      await service.list({ q: 'Martin' });

      const findManyCall = mockPrisma.commande.findMany.mock.calls[0][0];
      const orClauses = findManyCall.where.OR;
      const startsWithMatch = orClauses.some(
        (clause: any) => clause.id?.startsWith !== undefined,
      );
      expect(startsWithMatch).toBe(false);
    });
  });

  describe('AdminDisputesService.list (GET /admin/disputes?q=...)', () => {
    let service: AdminDisputesService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        dispute: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
        },
      };
      service = new AdminDisputesService(mockPrisma, {} as any, {} as any);
    });

    it('includes startsWith prefix match on commandeId when searching with #CMD-86642EF2', async () => {
      await service.list({ q: '#CMD-86642EF2' });

      const findManyCall = mockPrisma.dispute.findMany.mock.calls[0][0];
      const orClauses = findManyCall.where.OR;
      expect(orClauses).toBeDefined();
      const startsWithMatch = orClauses.some(
        (clause: any) => clause.commandeId?.startsWith === shortHex,
      );
      expect(startsWithMatch).toBe(true);
    });

    it('includes startsWith prefix match on commandeId when searching with #86642ef2', async () => {
      await service.list({ q: '#86642ef2' });

      const findManyCall = mockPrisma.dispute.findMany.mock.calls[0][0];
      const orClauses = findManyCall.where.OR;
      expect(orClauses).toBeDefined();
      const startsWithMatch = orClauses.some(
        (clause: any) => clause.commandeId?.startsWith === shortHex,
      );
      expect(startsWithMatch).toBe(true);
    });

    it('does NOT inject startsWith prefix match on commandeId when searching non-hex terms like "Martin"', async () => {
      await service.list({ q: 'Martin' });

      const findManyCall = mockPrisma.dispute.findMany.mock.calls[0][0];
      const orClauses = findManyCall.where.OR;
      expect(orClauses).toBeDefined();
      const startsWithMatch = orClauses.some(
        (clause: any) => clause.commandeId?.startsWith !== undefined,
      );
      expect(startsWithMatch).toBe(false);
    });
  });
});
