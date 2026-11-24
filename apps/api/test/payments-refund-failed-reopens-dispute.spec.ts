import { describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';

// B11. The refund transaction closes the dispute still open on the commande. When Stripe later
// reports that refund failed, `refund.updated` puts the commande back to PAID, and the dispute
// must not keep saying the client was refunded.
function harness(opts: { casCount?: number; reopenedCount?: number } = {}) {
  const { casCount = 1, reopenedCount = 1 } = opts;
  const prisma = {
    commande: {
      findFirst: vi.fn().mockResolvedValue({ id: 'cmd-1', demandeId: 'dem-1' }),
      updateMany: vi.fn().mockResolvedValue({ count: casCount }),
      update: vi.fn().mockResolvedValue({}),
    },
    demande: { update: vi.fn().mockResolvedValue({}) },
    dispute: { updateMany: vi.fn().mockResolvedValue({ count: reopenedCount }) },
  };
  const service = new PaymentsService(
    prisma as unknown as PrismaService,
    {} as NotificationsService,
    {} as ConversationsService,
  );
  return { prisma, sync: (status: string) => service['syncRefundState']({ id: 're_1', status }) };
}

describe('PaymentsService.syncRefundState: a failed refund reopens the dispute it closed (B11)', () => {
  it('puts a dispute closed as refunded back in review and restores the dispute flag', async () => {
    const { prisma, sync } = harness();

    await sync('failed');

    expect(prisma.dispute.updateMany).toHaveBeenCalledWith({
      where: { commandeId: 'cmd-1', status: 'RESOLVED_REFUNDED' },
      data: {
        status: 'IN_REVIEW',
        resolvedAt: null,
        resolvedByUserId: null,
        verdict: null,
        resolutionNote: null,
      },
    });
    expect(prisma.commande.update).toHaveBeenCalledWith({
      where: { id: 'cmd-1' },
      data: { disputedAt: expect.any(Date) },
    });
  });

  it('leaves the dispute flag alone when no dispute was closed by the refund', async () => {
    const { prisma, sync } = harness({ reopenedCount: 0 });

    await sync('canceled');

    expect(prisma.commande.update).not.toHaveBeenCalled();
  });

  it('touches nothing when the commande had already moved on', async () => {
    const { prisma, sync } = harness({ casCount: 0 });

    await sync('failed');

    expect(prisma.dispute.updateMany).not.toHaveBeenCalled();
  });

  it('leaves the dispute alone while the refund is pending or has succeeded', async () => {
    const { prisma, sync } = harness();

    await sync('pending');
    await sync('succeeded');

    expect(prisma.dispute.updateMany).not.toHaveBeenCalled();
  });
});
