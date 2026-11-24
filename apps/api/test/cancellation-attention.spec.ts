import { describe, expect, it, vi } from 'vitest';
import { CronService } from '../src/cron/cron.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { CommandesService } from '../src/commandes/commandes.service.js';
import type { PaymentsService } from '../src/payments/payments.service.js';
import type { ShipmentsService } from '../src/shipping/shipments.service.js';
import type { PushService } from '../src/push/push.service.js';
import type { UsersService } from '../src/users/users.service.js';

/**
 * CF4-27 (spec §4.3). `attentionItems` gains CANCELLATION_REQUESTED, listed FIRST (before
 * STALLED). Style follows `refund-attention.spec.ts` - a `findMany` router keyed on `where`.
 */
function makeCronService(commandeFindMany: ReturnType<typeof vi.fn>): CronService {
  const mockPrisma = {
    commande: { findMany: commandeFindMany },
    adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
  } as unknown as PrismaService;

  return new CronService(
    mockPrisma,
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

describe('CronService.attentionItems - CANCELLATION_REQUESTED (CF4-27)', () => {
  it('lists a pending cancellation first, with since = cancellationRequestedAt', async () => {
    const REQUESTED_AT = new Date('2026-09-30T09:00:00.000Z');
    const cancelling = {
      id: 'c-cancel',
      totalCents: 9500,
      status: 'PAID',
      step: 'REPAIR_STARTED',
      cancellationRequestedAt: REQUESTED_AT,
      demande: { title: 'iPhone 13' },
    };

    const findMany = vi.fn(({ where }: any) => {
      if (where.cancellationRequestedAt?.not === null) {
        return Promise.resolve([cancelling]);
      }
      return Promise.resolve([]);
    });

    const service = makeCronService(findMany);
    const items = await service.attentionItems();

    expect(items[0]).toMatchObject({
      commandeId: 'c-cancel',
      demandeTitle: 'iPhone 13',
      reason: 'CANCELLATION_REQUESTED',
      status: 'PAID',
      step: 'REPAIR_STARTED',
      totalCents: 9500,
      since: REQUESTED_AT.toISOString(),
    });
  });

  it('is absent when no commande has a pending cancellation', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = makeCronService(findMany);
    const items = await service.attentionItems();
    expect(items.some((i) => i.reason === 'CANCELLATION_REQUESTED')).toBe(false);
  });
});
