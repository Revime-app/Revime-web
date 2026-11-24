import { describe, expect, it, vi } from 'vitest';
import { AdminCancellationsService } from '../src/admin/admin-cancellations.service.js';
import { RefundService } from '../src/commandes/refund.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * CF4-27 (spec §4.2, §4.4). Admin decisions: list, detail, refuse, approve. Style follows
 * `admin-disputes.service.spec.ts` - a stubbed Prisma, refund delegated to a stubbed
 * `RefundService`.
 */

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    commandeId: 'cmd-1',
    reason: 'TOO_SLOW',
    comment: 'Trop lent',
    status: 'PENDING',
    createdAt: new Date('2026-09-30T10:00:00.000Z'),
    decidedAt: null,
    refusalNote: null,
    commande: {
      id: 'cmd-1',
      step: 'REPAIR_STARTED',
      delivery: 'HOME',
      totalCents: 10000,
      repairCents: 9000,
      shippingCents: 0,
      insuranceCents: 0,
      protectionCents: 1000,
      stripeTransferId: null,
      demande: { title: 'iPhone 13, écran cassé' },
      client: { name: 'Alice' },
      repairer: { name: 'Bob' },
    },
    ...overrides,
  };
}

function harness() {
  const findMany = vi.fn().mockResolvedValue([row()]);
  const count = vi.fn().mockResolvedValue(1);
  const findFirst = vi.fn().mockResolvedValue(row());
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = { cancellationRequest: { updateMany }, commande: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) } };
  const prisma = {
    cancellationRequest: { findMany, count, findFirst, updateMany },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  const notifications = { emit: vi.fn().mockResolvedValue(undefined) };
  const refunds = { refund: vi.fn().mockResolvedValue({ refundCents: 9000, totalCents: 10000 }) };
  return {
    service: new AdminCancellationsService(prisma, notifications as never, refunds as unknown as RefundService),
    findMany,
    count,
    findFirst,
    updateMany,
    notifications,
    refunds,
    prisma,
  };
}

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected the call to reject with an AppException');
}

describe('AdminCancellationsService.list', () => {
  it('PENDING tab orders oldest first', async () => {
    const { service, findMany } = harness();
    await service.list({ status: 'PENDING' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    );
  });

  it('HISTORY tab orders newest first and excludes PENDING', async () => {
    const { service, findMany } = harness();
    await service.list({ status: 'HISTORY' });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { not: 'PENDING' } },
        orderBy: { createdAt: 'desc' },
      }),
    );
  });
});

describe('AdminCancellationsService.getDetail', () => {
  it('404s for an unknown id', async () => {
    const { service, findFirst } = harness();
    findFirst.mockResolvedValue(null);
    const error = await rejection(service.getDetail('unknown'));
    expect(error.getStatus()).toBe(404);
  });

  it('returns the detail shape including comment and refund suggestion', async () => {
    const { service } = harness();
    const detail = await service.getDetail('req-1');
    expect(detail.id).toBe('req-1');
    expect(detail.commandeId).toBe('cmd-1');
    expect(detail.comment).toBe('Trop lent');
    expect(detail.reason).toBe('TOO_SLOW');
    expect(detail.transferred).toBe(false);
  });

  // B11: the dispute linked from the drawer says what the refund says, never « Réparation reprise ».
  it('shows a dispute closed « Réparation reprise » as refunded once the order is refunded', async () => {
    const { service, findFirst } = harness();
    const base = row();
    findFirst.mockResolvedValue(
      row({
        commande: {
          ...base.commande,
          status: 'REFUNDED',
          refundedCents: 10000,
          dispute: { id: 'disp-6', number: 6, status: 'RESOLVED_DISMISSED', verdict: 'DISMISSED' },
        },
      }),
    );

    const detail = await service.getDetail('req-1');

    expect(detail.disputeNumber).toBe(6);
    expect(detail.disputeStatus).toBe('RESOLVED_REFUNDED');
  });

  it('keeps the dispute status while the order is not refunded', async () => {
    const { service, findFirst } = harness();
    const base = row();
    findFirst.mockResolvedValue(
      row({
        commande: {
          ...base.commande,
          status: 'PAID',
          refundedCents: null,
          dispute: { id: 'disp-6', number: 6, status: 'IN_REVIEW', verdict: null },
        },
      }),
    );

    const detail = await service.getDetail('req-1');

    expect(detail.disputeStatus).toBe('IN_REVIEW');
  });
});

describe('AdminCancellationsService.refuse', () => {
  it('409s when the row is not PENDING', async () => {
    const { service, findFirst } = harness();
    findFirst.mockResolvedValue(row({ status: 'REFUSED' }));
    const error = await rejection(service.refuse('admin-1', 'req-1', { note: 'Réparation déjà avancée.' }));
    expect(error.getStatus()).toBe(409);
  });

  it('writes REFUSED with the note and clears the flag, in one transaction, then notifies both', async () => {
    const { service, updateMany, notifications, prisma } = harness();

    await service.refuse('admin-1', 'req-1', { note: 'Réparation déjà avancée.' });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'req-1', status: 'PENDING' },
      data: {
        status: 'REFUSED',
        refusalNote: 'Réparation déjà avancée.',
        decidedAt: expect.any(Date),
        decidedByUserId: 'admin-1',
      },
    });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(notifications.emit).toHaveBeenCalledTimes(2);
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'CLIENT', type: 'CANCELLATION_REFUSED' }),
    );
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'REPAIRER', type: 'CANCELLATION_REFUSED' }),
    );
  });
});

describe('AdminCancellationsService.approve', () => {
  it('409s when the row is not PENDING, and RefundService.refund is NOT called', async () => {
    const { service, findFirst, refunds } = harness();
    findFirst.mockResolvedValue(row({ status: 'APPROVED' }));
    const error = await rejection(
      service.approve('admin-1', 'req-1', { motif: 'OTHER', note: 'x', repairCents: 0, shippingCents: 0, protectionCents: 0 }),
    );
    expect(error.getStatus()).toBe(409);
    expect(refunds.refund).not.toHaveBeenCalled();
  });

  it('calls RefundService.refund with the motif forced to CLIENT_CANCELLED and requirePendingCancellation true (Review Focus 1)', async () => {
    const { service, refunds } = harness();

    await service.approve('admin-1', 'req-1', {
      motif: 'OTHER',
      note: 'Remboursement suite annulation',
      repairCents: 9000,
      shippingCents: 0,
      protectionCents: 1000,
    });

    expect(refunds.refund).toHaveBeenCalledWith(
      'admin-1',
      'cmd-1',
      expect.objectContaining({ motif: 'CLIENT_CANCELLED', repairCents: 9000, protectionCents: 1000 }),
      'REFUNDED',
      true,
    );
  });

  it('a zero-total refund leaves the request PENDING (RefundService throws, propagated)', async () => {
    const { service, refunds } = harness();
    refunds.refund.mockRejectedValue(new AppException('UNPROCESSABLE_ENTITY', 'Le remboursement doit être supérieur à 0 €.'));

    await expect(
      service.approve('admin-1', 'req-1', { motif: 'OTHER', note: 'x', repairCents: 0, shippingCents: 0, protectionCents: 0 }),
    ).rejects.toThrow('Le remboursement doit être supérieur à 0 €.');
  });
});
