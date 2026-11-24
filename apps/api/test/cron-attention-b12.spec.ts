import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CronService } from '../src/cron/cron.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { CommandesService } from '../src/commandes/commandes.service.js';
import type { PaymentsService } from '../src/payments/payments.service.js';
import type { ShipmentsService } from '../src/shipping/shipments.service.js';
import type { PushService } from '../src/push/push.service.js';
import type { UsersService } from '../src/users/users.service.js';

describe('CronService.attentionItems - Bug B12 DISPUTED consistency', () => {
  const DISPUTED_AT = new Date('2026-09-18T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCronService(prisma: any): CronService {
    return new CronService(
      { adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) }, ...prisma } as unknown as PrismaService,
      {} as CommandesService,
      {} as PaymentsService,
      {} as ShipmentsService,
      {} as PushService,
      {} as UsersService,
      {} as never,
      {} as never, // FiscalService (CMP-D3), unused here
      {} as never, // SetupRemindersService (V8 E1), unused here
    );
  }

  it('excludes REFUNDED orders with historical disputedAt from attentionItems DISPUTED list', async () => {
    const refundedOrderWithDisputedAt = {
      id: 'cmd-refunded-with-dispute',
      totalCents: 15000,
      status: 'REFUNDED',
      step: 'AWAITING_VALIDATION',
      disputedAt: DISPUTED_AT,
      demande: { title: 'Réparation MacBook' },
    };

    const activeDisputedOrder = {
      id: 'cmd-active-disputed',
      totalCents: 12000,
      status: 'PAID',
      step: 'AWAITING_VALIDATION',
      disputedAt: DISPUTED_AT,
      demande: { title: 'Réparation iPhone' },
    };

    const findMany = vi.fn(({ where }: any) => {
      // When querying disputed orders:
      if (where.disputedAt?.not === null) {
        // If the query does not filter out REFUNDED orders, it would return both.
        // We simulate returning both if where.status is missing, or only active if filtered.
        if (!where.status || !where.status.notIn?.includes('REFUNDED')) {
          return Promise.resolve([refundedOrderWithDisputedAt, activeDisputedOrder]);
        }
        return Promise.resolve([activeDisputedOrder]);
      }
      return Promise.resolve([]);
    });

    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    const mockPrisma = {
      commande: {
        findMany,
        updateMany,
      },
    };

    const service = makeCronService(mockPrisma);
    const items = await service.attentionItems();

    const disputedItems = items.filter((i) => i.reason === 'DISPUTED');
    const disputedIds = disputedItems.map((i) => i.commandeId);

    expect(disputedIds).toContain('cmd-active-disputed');
    expect(disputedIds).not.toContain('cmd-refunded-with-dispute');

    // Verification of the query predicate
    const disputedQueryCall = findMany.mock.calls.find(
      (c: any) => c[0]?.where?.disputedAt?.not === null,
    );
    expect(disputedQueryCall).toBeDefined();
    expect(disputedQueryCall![0].where.status).toEqual({ notIn: ['REFUNDED', 'ABANDONED'] });
  });
});
