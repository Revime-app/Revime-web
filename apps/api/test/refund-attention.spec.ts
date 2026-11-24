import { describe, expect, it, vi, beforeEach } from 'vitest';
import { CronService } from '../src/cron/cron.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { CommandesService } from '../src/commandes/commandes.service.js';
import type { PaymentsService } from '../src/payments/payments.service.js';
import type { ShipmentsService } from '../src/shipping/shipments.service.js';
import type { PushService } from '../src/push/push.service.js';
import type { UsersService } from '../src/users/users.service.js';

/**
 * CF4-D task 5 (spec §3, §7). `attentionItems` REVERSAL_FAILED / SHARE_OWED. Constructed
 * the same way test/cron-photo-orphans.spec.ts builds a `CronService`: a fake prisma plus
 * empty stand-ins for the sibling services this method never touches.
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
    {} as never, // QuoteRequestsService (CF4-25), unused here
    {} as never, // FiscalService (CMP-D3), unused here
    {} as never, // SetupRemindersService (V8 E1), unused here
  );
}

describe('CronService.attentionItems - REVERSAL_FAILED and SHARE_OWED (CF4-D task 5)', () => {
  const REFUNDED_AT = new Date('2026-09-20T10:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('REVERSAL_FAILED: keeps a legacy row (refundRepairCents/transferredCents null), drops a pre-release partial with a reconciled transfer, keeps SHARE_OWED for an owed row, and skips a legacy refunded row with no transfer', async () => {
    const legacyReversalFailed = {
      id: 'c-legacy-reversal',
      totalCents: 8000,
      status: 'REFUNDED',
      step: 'RELEASED',
      refundedAt: REFUNDED_AT,
      repairCents: 8000,
      transferredCents: null,
      refundRepairCents: null,
      stripeTransferId: 'tr_1',
      stripeTransferReversalId: null,
      demande: { title: 'Écran cassé' },
    };
    const reconciledPartial = {
      id: 'c-reconciled',
      totalCents: 8000,
      status: 'REFUNDED',
      step: 'RELEASED',
      refundedAt: REFUNDED_AT,
      repairCents: 8000,
      transferredCents: 8000,
      refundRepairCents: 0,
      stripeTransferId: 'tr_2',
      stripeTransferReversalId: null,
      demande: { title: 'Batterie' },
    };
    const owedShare = {
      id: 'c-owed',
      totalCents: 8000,
      status: 'REFUNDED',
      step: 'RELEASED',
      refundedAt: REFUNDED_AT,
      repairCents: 8000,
      refundRepairCents: 3000,
      stripeTransferId: null,
      demande: { title: 'Coque' },
    };
    const legacyNoTransfer = {
      id: 'c-legacy-no-transfer',
      totalCents: 8000,
      status: 'REFUNDED',
      step: 'RELEASED',
      refundedAt: REFUNDED_AT,
      repairCents: 8000,
      refundRepairCents: null,
      stripeTransferId: null,
      demande: { title: 'Vitre' },
    };

    const findMany = vi.fn(({ where }: any) => {
      // REVERSAL_FAILED query: status REFUNDED, stripeTransferId not null, reversal null.
      if (where.status === 'REFUNDED' && where.stripeTransferId?.not === null) {
        return Promise.resolve([legacyReversalFailed, reconciledPartial]);
      }
      // SHARE_OWED query: status REFUNDED, stripeTransferId null, refundRepairCents not null.
      if (where.status === 'REFUNDED' && where.stripeTransferId === null) {
        return Promise.resolve([owedShare, legacyNoTransfer]);
      }
      // Every other attentionItems query (STALLED, DISPUTED, CHARGE_MISSING, REFUND_INCOMPLETE,
      // RELEASE_FAILING, SHIPMENT_*) - none apply to this scenario.
      return Promise.resolve([]);
    });

    const service = makeCronService(findMany);
    const items = await service.attentionItems();

    const reversalFailedIds = items.filter((i) => i.reason === 'REVERSAL_FAILED').map((i) => i.commandeId);
    const shareOwedIds = items.filter((i) => i.reason === 'SHARE_OWED').map((i) => i.commandeId);

    // Legacy row (both halves missing) keeps the old, unconditional predicate - reversalExpected(R4).
    expect(reversalFailedIds).toContain('c-legacy-reversal');
    // Reconciled partial: transferredCents(8000) + refundRepairCents(0) == repairCents(8000), not >.
    expect(reversalFailedIds).not.toContain('c-reconciled');

    // Owed row: shareOwedCents = 8000 - 3000 = 5000 > 0.
    expect(shareOwedIds).toEqual(['c-owed']);
    // Legacy refunded row with refundRepairCents null: shareOwedCents returns 0 (no breakdown).
    expect(shareOwedIds).not.toContain('c-legacy-no-transfer');

    const owedItem = items.find((i) => i.commandeId === 'c-owed')!;
    expect(owedItem).toMatchObject({
      commandeId: 'c-owed',
      demandeTitle: 'Coque',
      reason: 'SHARE_OWED',
      status: 'REFUNDED',
      step: 'RELEASED',
      totalCents: 8000,
      since: REFUNDED_AT.toISOString(),
    });
  });
});
