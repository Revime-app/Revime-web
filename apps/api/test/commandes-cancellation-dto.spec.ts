import { describe, expect, it, vi } from 'vitest';
import { CommandesService } from '../src/commandes/commandes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { CommandeAnnouncer } from '../src/commandes/commande-announcer.service.js';

/**
 * CF4-27. `findOne` gains `cancellationRequest` (I6: `comment` null for the réparateur); `list`
 * gains `cancellationPending`. Style: a stubbed Prisma, same shape as `demandes-cancel.spec.ts` -
 * the full-row shape `findOne` selects is large, so the harness fills every scalar with a
 * plausible default and lets each test override only what it asserts on.
 */

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const COMMANDE = '33333333-3333-4333-8333-333333333333';

function baseCommandeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMANDE,
    demandeId: 'd1',
    offerId: 'o1',
    delivery: 'HOME',
    repairCents: 10000,
    shippingCents: 0,
    protectionCents: 500,
    totalCents: 10500,
    transferredCents: null,
    status: 'PAID',
    step: 'REPAIR_STARTED',
    paidAt: new Date('2026-09-01T00:00:00.000Z'),
    releaseRequestedAt: null,
    releasedAt: null,
    returnSentAt: null,
    refundedAt: null,
    refundedCents: null,
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
    clientUserId: CLIENT,
    repairerUserId: REPAIRER,
    demande: {
      title: 'iPhone 13, écran cassé',
      description: null,
      locationLabel: null,
      postalCode: null,
      photos: [],
    },
    review: null,
    client: { username: 'client1', profile: { avatarPath: null } },
    repairer: {
      username: 'repairer1',
      repairerProfile: { displayName: null, serviceAreaLabel: null, postalCode: null },
      profile: { avatarPath: null },
    },
    dispute: null,
    stepEvents: [],
    cancellationRequests: [],
    ...overrides,
  };
}

function harness({ row = baseCommandeRow() }: { row?: ReturnType<typeof baseCommandeRow> | null } = {}) {
  const commandeFindFirst = vi.fn().mockResolvedValue(row);
  const prisma = {
    commande: { findFirst: commandeFindFirst, findMany: vi.fn().mockResolvedValue([]) },
    conversation: { findFirst: vi.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;
  const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
  const announcer = {} as CommandeAnnouncer;
  return { service: new CommandesService(prisma, notifications, announcer), commandeFindFirst };
}

describe('CommandesService.findOne cancellationRequest', () => {
  it('is null when no request has ever been made', async () => {
    const { service } = harness();
    const dto = await service.findOne(CLIENT, COMMANDE);
    expect(dto.cancellationRequest).toBeNull();
  });

  it('maps the latest request (by createdAt desc, already ordered by the select) for the client, comment included', async () => {
    const row = baseCommandeRow({
      cancellationRequests: [
        {
          id: 'req-1',
          status: 'PENDING',
          reason: 'TOO_SLOW',
          comment: 'Trop lent',
          refusalNote: null,
          createdAt: new Date('2026-09-30T12:00:00.000Z'),
        },
      ],
    });
    const { service } = harness({ row });
    const dto = await service.findOne(CLIENT, COMMANDE);
    expect(dto.cancellationRequest).toEqual({
      id: 'req-1',
      status: 'PENDING',
      reason: 'TOO_SLOW',
      comment: 'Trop lent',
      refusalNote: null,
      createdAt: '2026-09-30T12:00:00.000Z',
    });
  });

  it('nulls comment for the réparateur viewer (I6)', async () => {
    const row = baseCommandeRow({
      cancellationRequests: [
        {
          id: 'req-1',
          status: 'PENDING',
          reason: 'TOO_SLOW',
          comment: 'Trop lent',
          refusalNote: null,
          createdAt: new Date('2026-09-30T12:00:00.000Z'),
        },
      ],
    });
    const { service } = harness({ row });
    const dto = await service.findOne(REPAIRER, COMMANDE);
    expect(dto.cancellationRequest).toEqual({
      id: 'req-1',
      status: 'PENDING',
      reason: 'TOO_SLOW',
      comment: null,
      refusalNote: null,
      createdAt: '2026-09-30T12:00:00.000Z',
    });
  });
});

describe('CommandesService.list cancellationPending', () => {
  it('is derived from cancellationRequestedAt on each row', async () => {
    const rows = [
      {
        id: 'c1',
        demandeId: 'd1',
        delivery: 'HOME',
        step: 'REPAIR_STARTED',
        status: 'PAID',
        repairCents: 10000,
        transferredCents: null,
        totalCents: 10500,
        refundedCents: null,
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        releasedAt: null,
        cancellationRequestedAt: new Date('2026-09-30T00:00:00.000Z'),
        demande: { title: 'iPhone 13' },
        client: { username: 'client1' },
        repairer: { username: 'repairer1', repairerProfile: { displayName: null } },
        dispute: null,
      },
      {
        id: 'c2',
        demandeId: 'd2',
        delivery: 'HOME',
        step: 'REPAIR_STARTED',
        status: 'PAID',
        repairCents: 10000,
        transferredCents: null,
        totalCents: 10500,
        refundedCents: null,
        createdAt: new Date('2026-09-02T00:00:00.000Z'),
        releasedAt: null,
        cancellationRequestedAt: null,
        demande: { title: 'iPhone 14' },
        client: { username: 'client1' },
        repairer: { username: 'repairer1', repairerProfile: { displayName: null } },
        dispute: null,
      },
    ];
    const prisma = {
      commande: { findMany: vi.fn().mockResolvedValue(rows) },
    } as unknown as PrismaService;
    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const announcer = {} as CommandeAnnouncer;
    const service = new CommandesService(prisma, notifications, announcer);

    const list = await service.list(CLIENT, { role: 'client' });
    expect(list[0]!.cancellationPending).toBe(true);
    expect(list[1]!.cancellationPending).toBe(false);
  });
});
