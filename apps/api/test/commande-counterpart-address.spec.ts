import { describe, expect, it, vi } from 'vitest';
import { CommandesService } from '../src/commandes/commandes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

// Module-scoped so the CF4-D refund/payoutCents describe block below can reuse it
// too (ruling R2) rather than duplicating the same findOne fixture a third time.
const baseRow = {
  id: 'comm-1',
  demandeId: 'dem-1',
  offerId: 'off-1',
  repairCents: 5000,
  shippingCents: 0,
  protectionCents: 200,
  totalCents: 5200,
  transferredCents: null,
    paidAt: new Date(),
    releaseRequestedAt: null,
    releasedAt: null,
    returnSentAt: null,
    refundedAt: null,
    refundedCents: null,
    // CF4-D task 8 (spec §5-6). Null by default - a legacy/never-refunded row.
    refundRepairCents: null,
    refundShippingCents: null,
    refundProtectionCents: null,
    disputedAt: null,
    outboundTrackingNumber: null,
    returnTrackingNumber: null,
    shippingAddresses: [],
    parcelOption: null,
    insuranceCents: 0,
    parcelWeightGrams: null,
    parcelLengthCm: null,
    parcelWidthCm: null,
    parcelHeightCm: null,
    parcelValueCents: null,
    shipments: [],
    clientUserId: 'client-1',
    repairerUserId: 'repairer-1',
    dispute: null,
    stepEvents: [],
    cancellationRequests: [],
    demande: { title: 'Écran cassé', description: null, locationLabel: '12 Rue de la Paix 75002 Paris', postalCode: '75002', photos: [] },
    review: null,
    client: {
      username: 'client_alice',
      profile: { avatarPath: null },
    },
    repairer: {
      username: 'repairer_bob',
      profile: { avatarPath: null },
      repairerProfile: { displayName: 'Bob Réparations', serviceAreaLabel: '10 Rue de l’Atelier 75011 Paris', postalCode: '75011' },
    },
};

describe('CommandesService.findOne - CF3-05 Post-Payment Address Revelation', () => {
  it('reveals client home address to repairer on paid HOME delivery', async () => {
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
          ...baseRow,
          delivery: 'HOME',
          status: 'PAID',
          step: 'PAID',
        }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const dto = await svc.findOne('repairer-1', 'comm-1');

    expect(dto.counterpartAddress).toBe('12 Rue de la Paix 75002 Paris');
  });

  it('reveals repairer workshop address to client on paid WORKSHOP delivery', async () => {
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
          ...baseRow,
          delivery: 'WORKSHOP',
          status: 'PAID',
          step: 'PAID',
        }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const dto = await svc.findOne('client-1', 'comm-1');

    expect(dto.counterpartAddress).toBe('10 Rue de l’Atelier 75011 Paris');
  });

  it('keeps counterpart address null before payment', async () => {
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
          ...baseRow,
          delivery: 'HOME',
          status: 'PENDING_PAYMENT',
          step: null,
        }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const dto = await svc.findOne('repairer-1', 'comm-1');

    expect(dto.counterpartAddress).toBeNull();
  });
});

/**
 * CF4-D task 8 (spec §5-6). `CommandeDto.refund` and the new `payoutCents` rule -
 * repair minus whatever of the repair line was refunded, on a row that carries a
 * recorded breakdown; unchanged (`transferredCents ?? repairCents`) on any other
 * status. `commande-counterpart-address.spec.ts`'s `baseRow` is the existing
 * fixture that already drives `findOne` through a fake prisma - reused here per
 * ruling R2 rather than a third copy of the same shape.
 */
describe('CommandesService.findOne - refund breakdown and payoutCents (CF4-D)', () => {
  it('returns the refund breakdown and repair-minus-refunded payoutCents for a partially refunded row', async () => {
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
          ...baseRow,
          delivery: 'HOME',
          status: 'REFUNDED',
          step: 'REPAIR_STARTED',
          repairCents: 5000,
          shippingCents: 0,
          protectionCents: 200,
          totalCents: 5200,
          refundedAt: new Date(),
          refundedCents: 2200,
          refundRepairCents: 2000,
          refundShippingCents: 0,
          refundProtectionCents: 200,
        }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const dto = await svc.findOne('client-1', 'comm-1');

    expect(dto.refund).toEqual({
      repairCents: 2000,
      shippingCents: 0,
      protectionCents: 200,
      totalCents: 2200,
    });
    // repairCents (5000) - refundRepairCents (2000).
    expect(dto.payoutCents).toBe(3000);
    // CF4-15 / spec §6 (fix round 1): refundedCents (2200) < totalCents (5200).
    expect(dto.partialRefund).toBe(true);
  });

  it('returns refund: null and payoutCents: 0 for a legacy refunded row with no recorded breakdown', async () => {
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
          ...baseRow,
          delivery: 'HOME',
          status: 'REFUNDED',
          step: 'REPAIR_STARTED',
          repairCents: 5000,
          shippingCents: 0,
          protectionCents: 200,
          totalCents: 5200,
          refundedAt: new Date(),
          refundedCents: 5200,
          // refundRepairCents/refundShippingCents/refundProtectionCents stay null -
          // this refund predates the breakdown columns.
        }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const dto = await svc.findOne('client-1', 'comm-1');

    expect(dto.refund).toBeNull();
    expect(dto.payoutCents).toBe(0);
    // CF4-15 / spec §6 (fix round 1): a FULL refund (refundedCents === totalCents),
    // legacy or not, is never "partial".
    expect(dto.partialRefund).toBe(false);
  });

  it('leaves a PAID row unchanged: refund null, payoutCents = transferredCents ?? repairCents', async () => {
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
          ...baseRow,
          delivery: 'HOME',
          status: 'PAID',
          step: 'PAID',
          repairCents: 5000,
          transferredCents: null,
        }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const dto = await svc.findOne('client-1', 'comm-1');

    expect(dto.refund).toBeNull();
    expect(dto.payoutCents).toBe(5000);
    // CF4-15 / spec §6 (fix round 1): a non-REFUNDED row is never "partial".
    expect(dto.partialRefund).toBe(false);
  });

  it('a RELEASED PAID row still reports the transferred amount as payoutCents', async () => {
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
          ...baseRow,
          delivery: 'HOME',
          status: 'PAID',
          step: 'RELEASED',
          repairCents: 5000,
          transferredCents: 5000,
        }),
      },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const dto = await svc.findOne('repairer-1', 'comm-1');

    expect(dto.refund).toBeNull();
    expect(dto.payoutCents).toBe(5000);
  });
});

/**
 * CF4-15 / spec §6 (fix round 1, controller ruling R7). `CommandesService.list()`'s
 * `CommandeListItem.partialRefund` - no existing spec drove `list()` through a fake
 * prisma before this fix (grepped `test/` for `.list(`), so this is a new describe
 * block rather than an extension.
 */
describe('CommandesService.list - CF4-15 partialRefund', () => {
  const listRow = {
    id: 'comm-2',
    demandeId: 'dem-2',
    delivery: 'HOME' as const,
    step: 'REPAIR_STARTED' as const,
    status: 'REFUNDED' as const,
    repairCents: 5000,
    transferredCents: null,
    totalCents: 5200,
    refundedCents: 2200,
    createdAt: new Date(),
    releasedAt: null,
    demande: { title: 'Écran cassé' },
    client: { username: 'client_alice' },
    repairer: { username: 'repairer_bob', repairerProfile: { displayName: 'Bob Réparations' } },
    dispute: null,
  };

  it('reports partialRefund: true for a partially refunded row', async () => {
    const prisma = {
      commande: { findMany: vi.fn().mockResolvedValue([listRow]) },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const rows = await svc.list('client-1', { role: 'client' });

    expect(rows[0]?.partialRefund).toBe(true);
  });

  it('reports partialRefund: false for a full refund', async () => {
    const prisma = {
      commande: {
        findMany: vi.fn().mockResolvedValue([{ ...listRow, refundedCents: 5200 }]),
      },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const rows = await svc.list('client-1', { role: 'client' });

    expect(rows[0]?.partialRefund).toBe(false);
  });

  it('reports partialRefund: false for a PAID row', async () => {
    const prisma = {
      commande: {
        findMany: vi
          .fn()
          .mockResolvedValue([{ ...listRow, status: 'PAID' as const, refundedCents: null }]),
      },
    } as unknown as PrismaService;

    const svc = new CommandesService(prisma, {} as NotificationsService, {
      postSystemMessage: vi.fn(),
      announce: vi.fn(),
    } as never);
    const rows = await svc.list('client-1', { role: 'client' });

    expect(rows[0]?.partialRefund).toBe(false);
  });
});
