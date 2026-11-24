import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CronService } from '../src/cron/cron.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { CommandesService } from '../src/commandes/commandes.service.js';
import type { PaymentsService } from '../src/payments/payments.service.js';
import type { ShipmentsService } from '../src/shipping/shipments.service.js';
import type { PushService } from '../src/push/push.service.js';
import type { UsersService } from '../src/users/users.service.js';
import type { QuoteRequestsService } from '../src/quote-requests/quote-requests.service.js';

describe('Task 15: P15 — Commandes à surveiller (/attention)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCronService(prisma: any): CronService {
    return new CronService(
      prisma as unknown as PrismaService,
      {} as CommandesService,
      {} as PaymentsService,
      {} as ShipmentsService,
      {} as PushService,
      {} as UsersService,
      {} as QuoteRequestsService,
      {} as never, // FiscalService (CMP-D3), unused here
      {} as never, // SetupRemindersService (V8 E1), unused here
    );
  }

  it('groups multiple anomaly reasons for the same commande into a single AdminAttentionItem with reasons[]', async () => {
    const cmdId = 'cmd-grouped-multi-anomaly';
    const autoReleaseDueAt = new Date('2026-10-10T10:00:00.000Z');
    const paidAt = new Date('2026-10-09T08:00:00.000Z');

    // Order has STALLED and CHARGE_MISSING
    const mockOrder = {
      id: cmdId,
      totalCents: 12000,
      status: 'PAID',
      step: 'REPAIR_STARTED',
      autoReleaseDueAt,
      paidAt,
      stripePaymentIntentId: 'pi_test_123',
      stripeSessionId: null,
      stripeChargeId: null,
      demande: { title: 'Réparation Switch' },
      client: { name: 'Alice Martin' },
      repairer: { name: 'Bob Réparateur' },
    };

    const mockPrisma = {
      commande: {
        findMany: vi.fn(async ({ where }: any) => {
          // Stalled query
          if (where?.autoReleaseDueAt?.lte) {
            return [mockOrder];
          }
          // Charge missing query
          if (where?.status === 'PAID' && where?.stripeChargeId === null) {
            return [mockOrder];
          }
          return [];
        }),
      },
      dispute: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      adminAuditLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = makeCronService(mockPrisma);
    const items = await service.attentionItems();

    const orderItems = items.filter((i) => i.commandeId === cmdId);
    expect(orderItems).toHaveLength(1);

    const item = orderItems[0]!;
    expect(item.reasons).toBeDefined();
    expect(item.reasons).toContain('STALLED');
    expect(item.reasons).toContain('CHARGE_MISSING');
    expect(item.reasons).toHaveLength(2);
    expect(item.clientName).toBe('Alice Martin');
    expect(item.repairerName).toBe('Bob Réparateur');
    // since should be the earliest anomaly timestamp (paidAt < autoReleaseDueAt)
    expect(item.since).toBe(paidAt.toISOString());
  });

  it('excludes terminal REFUNDED/ABANDONED orders and resolved disputes (RESOLVED_REFUNDED, RESOLVED_RELEASED, RESOLVED_DISMISSED)', async () => {
    const activeDisputedOrder = {
      id: 'cmd-active-dispute',
      totalCents: 15000,
      status: 'PAID',
      step: 'AWAITING_VALIDATION',
      disputedAt: new Date('2026-10-12T10:00:00.000Z'),
      demande: { title: 'Dispute En cours' },
      client: { name: 'Client A' },
      repairer: { name: 'Reparateur A' },
      dispute: { status: 'OPEN' },
    };

    const resolvedRefundedOrder = {
      id: 'cmd-resolved-refunded',
      totalCents: 10000,
      status: 'REFUNDED',
      step: null,
      disputedAt: new Date('2026-10-01T10:00:00.000Z'),
      demande: { title: 'Dispute Résolu Remboursé' },
      client: { name: 'Client B' },
      repairer: { name: 'Reparateur B' },
      dispute: { status: 'RESOLVED_REFUNDED' },
    };

    const closedDisputeOrder = {
      id: 'cmd-closed-dispute',
      totalCents: 8000,
      status: 'PAID',
      step: 'RELEASED',
      disputedAt: new Date('2026-10-02T10:00:00.000Z'),
      demande: { title: 'Dispute Clôturé' },
      client: { name: 'Client C' },
      repairer: { name: 'Reparateur C' },
      dispute: { status: 'RESOLVED_RELEASED' },
    };

    const abandonedOrder = {
      id: 'cmd-abandoned',
      totalCents: 5000,
      status: 'ABANDONED',
      step: null,
      cancellationRequestedAt: new Date('2026-10-05T10:00:00.000Z'),
      demande: { title: 'Commande Abandonnée' },
      client: { name: 'Client D' },
      repairer: { name: 'Reparateur D' },
    };

    const mockPrisma = {
      commande: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.disputedAt?.not === null) {
            return [activeDisputedOrder, resolvedRefundedOrder, closedDisputeOrder];
          }
          if (where?.cancellationRequestedAt?.not === null) {
            return [abandonedOrder];
          }
          return [];
        }),
      },
      dispute: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      adminAuditLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = makeCronService(mockPrisma);
    const items = await service.attentionItems();

    const ids = items.map((i) => i.commandeId);
    expect(ids).toContain('cmd-active-dispute');
    expect(ids).not.toContain('cmd-resolved-refunded');
    expect(ids).not.toContain('cmd-closed-dispute');
    expect(ids).not.toContain('cmd-abandoned');
  });

  it('detects PAYMENT_PENDING_STALE for orders in PENDING_PAYMENT older than 24 hours', async () => {
    const now = new Date('2026-10-14T12:00:00.000Z');
    const staleCreatedAt = new Date('2026-10-13T10:00:00.000Z'); // 26h ago (>24h)
    const freshCreatedAt = new Date('2026-10-14T10:00:00.000Z'); // 2h ago (<24h)

    const staleOrder = {
      id: 'cmd-stale-payment',
      totalCents: 7500,
      status: 'PENDING_PAYMENT',
      step: null,
      createdAt: staleCreatedAt,
      demande: { title: 'Paiement en attente depuis 26h' },
      client: { name: 'Client Stale' },
      repairer: { name: 'Reparateur Stale' },
    };

    const freshOrder = {
      id: 'cmd-fresh-payment',
      totalCents: 4500,
      status: 'PENDING_PAYMENT',
      step: null,
      createdAt: freshCreatedAt,
      demande: { title: 'Paiement récent' },
      client: { name: 'Client Fresh' },
      repairer: { name: 'Reparateur Fresh' },
    };

    const mockPrisma = {
      commande: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.status === 'PENDING_PAYMENT') {
            // Check if query filters by createdAt lt 24h
            if (where.createdAt?.lt || where.createdAt?.lte) {
              return [staleOrder];
            }
            return [staleOrder, freshOrder];
          }
          return [];
        }),
      },
      dispute: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      adminAuditLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = makeCronService(mockPrisma);
    const items = await service.attentionItems();

    const staleItem = items.find((i) => i.commandeId === 'cmd-stale-payment');
    expect(staleItem).toBeDefined();
    expect(staleItem?.reasons).toContain('PAYMENT_PENDING_STALE');

    const freshItem = items.find((i) => i.commandeId === 'cmd-fresh-payment');
    expect(freshItem).toBeUndefined();
  });

  it('detects PARCEL_BLOCKED and PARCEL_INCIDENT for parcel shipments in difficulty', async () => {
    const blockedOrder = {
      id: 'cmd-parcel-blocked',
      totalCents: 9000,
      status: 'PAID',
      step: 'PARCEL_SENT',
      delivery: 'PARCEL',
      updatedAt: new Date('2026-10-10T12:00:00.000Z'),
      demande: { title: 'Colis bloqué sans mouvement' },
      client: { name: 'Client Bloque' },
      repairer: { name: 'Reparateur Bloque' },
      shipments: [
        {
          leg: 'OUTBOUND',
          status: 'ORDERED',
          updatedAt: new Date('2026-10-10T12:00:00.000Z'), // 4 days ago
          events: [],
        },
      ],
    };

    const incidentOrder = {
      id: 'cmd-parcel-incident',
      totalCents: 11000,
      status: 'PAID',
      step: 'RETURN_SENT',
      delivery: 'PARCEL',
      updatedAt: new Date('2026-10-13T10:00:00.000Z'),
      demande: { title: 'Colis avarié en exception' },
      client: { name: 'Client Incident' },
      repairer: { name: 'Reparateur Incident' },
      shipments: [
        {
          leg: 'RETURN',
          status: 'IN_TRANSIT',
          updatedAt: new Date('2026-10-13T10:00:00.000Z'),
          events: [
            {
              status: 'EXCEPTION',
              occurredAt: new Date('2026-10-13T10:00:00.000Z'),
            },
          ],
        },
      ],
    };

    const mockPrisma = {
      commande: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.status === 'PAID' && (where?.OR || where?.shipments || where?.delivery === 'PARCEL')) {
            return [blockedOrder, incidentOrder];
          }
          return [];
        }),
      },
      dispute: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      adminAuditLog: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const service = makeCronService(mockPrisma);
    const items = await service.attentionItems();

    const blockedItem = items.find((i) => i.commandeId === 'cmd-parcel-blocked');
    expect(blockedItem).toBeDefined();
    expect(blockedItem?.reasons).toContain('PARCEL_BLOCKED');

    const incidentItem = items.find((i) => i.commandeId === 'cmd-parcel-incident');
    expect(incidentItem).toBeDefined();
    expect(incidentItem?.reasons).toContain('PARCEL_INCIDENT');
  });

  it('filters out dismissed items via AdminAuditLog (action: attention.dismiss) if item.since <= log.createdAt', async () => {
    const anomalySince = new Date('2026-10-12T10:00:00.000Z');
    const dismissalDate = new Date('2026-10-13T12:00:00.000Z'); // After anomaly (anomalySince <= dismissalDate)

    const dismissedOrder = {
      id: 'cmd-dismissed-order',
      totalCents: 8500,
      status: 'PAID',
      step: 'REPAIR_STARTED',
      autoReleaseDueAt: anomalySince,
      demande: { title: 'Commande Traitée et Classée' },
      client: { name: 'Client D' },
      repairer: { name: 'Reparateur D' },
    };

    const activeOrder = {
      id: 'cmd-active-new-anomaly',
      totalCents: 9500,
      status: 'PAID',
      step: 'REPAIR_STARTED',
      autoReleaseDueAt: new Date('2026-10-14T08:00:00.000Z'), // After dismissal!
      demande: { title: 'Commande Avec Nouvelle Anomalie' },
      client: { name: 'Client E' },
      repairer: { name: 'Reparateur E' },
    };

    const mockPrisma = {
      commande: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.autoReleaseDueAt?.lte) {
            return [dismissedOrder, activeOrder];
          }
          return [];
        }),
      },
      dispute: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      adminAuditLog: {
        findMany: vi.fn(async ({ where }: any) => {
          if (where?.action === 'attention.dismiss') {
            return [
              {
                targetId: 'cmd-dismissed-order',
                action: 'attention.dismiss',
                targetType: 'Commande',
                createdAt: dismissalDate,
              },
              {
                targetId: 'cmd-active-new-anomaly',
                action: 'attention.dismiss',
                targetType: 'Commande',
                createdAt: dismissalDate, // Was dismissed earlier, but new anomaly autoReleaseDueAt is after dismissal!
              },
            ];
          }
          return [];
        }),
      },
    };

    const service = makeCronService(mockPrisma);
    const items = await service.attentionItems();

    const ids = items.map((i) => i.commandeId);
    expect(ids).not.toContain('cmd-dismissed-order');
    expect(ids).toContain('cmd-active-new-anomaly');
  });
  describe('settled dossiers, money still owed and dismissal', () => {
    const reversalFailedOrder = {
      id: 'cmd-refunded-reversal-failed',
      totalCents: 9000,
      status: 'REFUNDED',
      step: null,
      refundedAt: new Date('2026-10-12T10:00:00.000Z'),
      repairCents: 6000,
      transferredCents: 6000,
      refundRepairCents: 6000,
      stripeTransferId: 'tr_1',
      stripeTransferReversalId: null,
      demande: { title: 'Remboursée, fonds à récupérer' },
      client: { name: 'Client R' },
      repairer: { name: 'Reparateur R' },
      dispute: { status: 'RESOLVED_REFUNDED' },
    };

    function prismaWith(rows: Record<string, any[]>, dismissals: any[] = []) {
      return {
        commande: {
          findMany: vi.fn(async ({ where }: any) => {
            if (where?.status === 'REFUNDED' && where?.stripeTransferId?.not === null) return rows.reversal ?? [];
            if (where?.status === 'PENDING_PAYMENT') return rows.pending ?? [];
            if (where?.autoReleaseDueAt?.lte) return rows.stalled ?? [];
            if (where?.cancellationRequestedAt?.not === null) return rows.cancelling ?? [];
            if (where?.status === 'PAID' && where?.stripeChargeId === null) return rows.chargeMissing ?? [];
            return [];
          }),
        },
        dispute: { findMany: vi.fn().mockResolvedValue([]) },
        adminAuditLog: { findMany: vi.fn().mockResolvedValue(dismissals) },
      };
    }

    it('keeps a refunded order whose clawback failed, even though its dispute is resolved', async () => {
      const items = await makeCronService(prismaWith({ reversal: [reversalFailedOrder] })).attentionItems();
      const item = items.find((i) => i.commandeId === 'cmd-refunded-reversal-failed');
      expect(item?.reasons).toEqual(['REVERSAL_FAILED']);
    });

    it('carries the Stripe ids of a stale pending payment so the row can be checked in Stripe', async () => {
      const order = {
        id: 'cmd-stale-with-session',
        totalCents: 7000,
        status: 'PENDING_PAYMENT',
        step: null,
        createdAt: new Date(Date.now() - 30 * 3600 * 1000),
        stripeSessionId: 'cs_live_1',
        stripePaymentIntentId: 'pi_1',
        demande: { title: 'Session ouverte' },
        client: { name: 'C' },
        repairer: { name: 'R' },
        dispute: null,
      };
      const items = await makeCronService(prismaWith({ pending: [order] })).attentionItems();
      const item = items.find((i) => i.commandeId === 'cmd-stale-with-session');
      expect(item?.stripeSessionId).toBe('cs_live_1');
      expect(item?.stripePaymentIntentId).toBe('pi_1');
    });

    it('brings a dismissed order back when a reason that arrived after the dismissal joins it', async () => {
      const dismissedAt = new Date('2026-10-13T12:00:00.000Z');
      const stalled = {
        id: 'cmd-two-reasons',
        totalCents: 5000,
        status: 'PAID',
        step: 'REPAIR_STARTED',
        autoReleaseDueAt: new Date('2026-10-12T10:00:00.000Z'), // before the dismissal
        demande: { title: 'Deux raisons' },
        client: { name: 'C' },
        repairer: { name: 'R' },
      };
      const chargeMissing = {
        ...stalled,
        paidAt: new Date('2026-10-14T09:00:00.000Z'), // after it
        createdAt: new Date('2026-10-14T09:00:00.000Z'),
        stripeChargeId: null,
        dispute: null,
      };
      const dismissals = [{ targetId: 'cmd-two-reasons', createdAt: dismissedAt }];

      const onlyOld = await makeCronService(prismaWith({ stalled: [stalled] }, dismissals)).attentionItems();
      expect(onlyOld.map((i) => i.commandeId)).not.toContain('cmd-two-reasons');

      const withNew = await makeCronService(prismaWith({ stalled: [stalled], chargeMissing: [chargeMissing] }, dismissals)).attentionItems();
      const item = withNew.find((i) => i.commandeId === 'cmd-two-reasons');
      expect(item?.reasons).toContain('CHARGE_MISSING');
    });

    it('lists a pending payment once it is 24 h old, the bound the abandon rule uses', async () => {
      const prisma = prismaWith({});
      await makeCronService(prisma).attentionItems();
      const call = prisma.commande.findMany.mock.calls.map(([a]: any) => a).find((a: any) => a.where?.status === 'PENDING_PAYMENT');
      const bound = call.where.createdAt.lt as Date;
      expect(Date.now() - bound.getTime()).toBeGreaterThanOrEqual(24 * 3600 * 1000 - 5000);
      expect(Date.now() - bound.getTime()).toBeLessThanOrEqual(24 * 3600 * 1000 + 5000);
    });

    it('never hides an order whose client is waiting on a cancellation decision, dismissed or not', async () => {
      const cancelling = {
        id: 'cmd-waiting-client',
        totalCents: 5000,
        status: 'PAID',
        step: 'REPAIR_STARTED',
        cancellationRequestedAt: new Date('2026-10-10T09:00:00.000Z'),
        demande: { title: 'Client en attente' },
        client: { name: 'C' },
        repairer: { name: 'R' },
        dispute: null,
      };
      const dismissals = [{ targetId: 'cmd-waiting-client', createdAt: new Date('2026-10-13T12:00:00.000Z') }];
      const items = await makeCronService(prismaWith({ cancelling: [cancelling] }, dismissals)).attentionItems();
      expect(items.map((i) => i.commandeId)).toContain('cmd-waiting-client');
    });
  });
});
