import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandesService } from '../src/commandes/commandes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { CommandeAnnouncer } from '../src/commandes/commande-announcer.service.js';

describe('CommandesService - Dispute DTO mapping', () => {
  let service: CommandesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      commande: {
        findFirst: vi.fn(),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };
    const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const announcer = {} as CommandeAnnouncer;
    service = new CommandesService(prisma as PrismaService, notifications, announcer);
  });

  it('maps dispute resolution fields and reference when dispute exists', async () => {
    const openedDate = new Date('2026-10-02T11:40:00.000Z');
    const assignedDate = new Date('2026-10-02T14:00:00.000Z');
    const resolvedDate = new Date('2026-10-03T10:30:00.000Z');

    prisma.commande.findFirst.mockResolvedValue({
      id: 'cmd-1',
      demandeId: 'dem-1',
      clientId: 'user-client',
      clientUserId: 'user-client',
      repairerId: 'repairer-1',
      repairerUserId: 'repairer-1',
      status: 'PAID',
      step: 'REPAIR_STARTED',
      delivery: 'HAND_DELIVERY',
      paidAt: openedDate,
      totalCents: 10000,
      payoutCents: 8500,
      repairCents: 10000,
      shippingCents: 0,
      protectionCents: 500,
      transferredCents: null,
      releaseRequestedAt: null,
      releasedAt: null,
      returnSentAt: null,
      refundedAt: null,
      refundedCents: null,
      refundRepairCents: null,
      refundShippingCents: null,
      refundProtectionCents: null,
      disputedAt: openedDate,
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
      review: null,
      cancellationRequests: [],
      stepEvents: [],
      client: { id: 'user-client', username: 'Client', profile: null },
      repairer: { id: 'user-repairer', username: 'Repairer', profile: null, repairerProfile: null },
      demande: { title: 'Broken Screen', description: null, locationLabel: null, postalCode: null, photos: [] },
      dispute: {
        id: 'disp-1',
        number: 6,
        motif: 'WORK_UNSATISFACTORY',
        reason: 'Issue',
        status: 'RESOLVED_DISMISSED',
        initiator: 'CLIENT',
        createdAt: openedDate,
        assignedAt: assignedDate,
        resolvedAt: resolvedDate,
        verdict: 'DISMISSED',
        resolutionNote: 'Repair resumes',
        messages: [],
      },
      conversations: [],
    });

    const result = await service.findOne('user-client', 'cmd-1');
    expect(result.dispute).toBeDefined();
    expect(result.dispute?.reference).toBe('#LIT-0006');
    expect(result.dispute?.openedAt).toBe(openedDate.toISOString());
    expect(result.dispute?.assignedAt).toBe(assignedDate.toISOString());
    expect(result.dispute?.resolvedAt).toBe(resolvedDate.toISOString());
    expect(result.dispute?.verdict).toBe('DISMISSED');
    expect(result.dispute?.resolutionNote).toBe('Repair resumes');
  });

  it('handles null assignedAt, resolvedAt, verdict, and resolutionNote when dispute is open', async () => {
    const openedDate = new Date('2026-10-02T11:40:00.000Z');

    prisma.commande.findFirst.mockResolvedValue({
      id: 'cmd-1',
      demandeId: 'dem-1',
      clientId: 'user-client',
      clientUserId: 'user-client',
      repairerId: 'repairer-1',
      repairerUserId: 'repairer-1',
      status: 'PAID',
      step: 'REPAIR_STARTED',
      delivery: 'HAND_DELIVERY',
      paidAt: openedDate,
      totalCents: 10000,
      payoutCents: 8500,
      repairCents: 10000,
      shippingCents: 0,
      protectionCents: 500,
      transferredCents: null,
      releaseRequestedAt: null,
      releasedAt: null,
      returnSentAt: null,
      refundedAt: null,
      refundedCents: null,
      refundRepairCents: null,
      refundShippingCents: null,
      refundProtectionCents: null,
      disputedAt: openedDate,
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
      review: null,
      cancellationRequests: [],
      stepEvents: [],
      client: { id: 'user-client', username: 'Client', profile: null },
      repairer: { id: 'user-repairer', username: 'Repairer', profile: null, repairerProfile: null },
      demande: { title: 'Broken Screen', description: null, locationLabel: null, postalCode: null, photos: [] },
      dispute: {
        id: 'disp-2',
        number: 42,
        motif: 'WORK_UNSATISFACTORY',
        reason: 'Issue',
        status: 'OPEN',
        initiator: 'CLIENT',
        createdAt: openedDate,
        assignedAt: null,
        resolvedAt: null,
        verdict: null,
        resolutionNote: null,
        messages: [],
      },
      conversations: [],
    });

    const result = await service.findOne('user-client', 'cmd-1');
    expect(result.dispute).toBeDefined();
    expect(result.dispute?.reference).toBe('#LIT-0042');
    expect(result.dispute?.openedAt).toBe(openedDate.toISOString());
    expect(result.dispute?.assignedAt).toBeNull();
    expect(result.dispute?.resolvedAt).toBeNull();
    expect(result.dispute?.verdict).toBeNull();
    expect(result.dispute?.resolutionNote).toBeNull();
  });
});
