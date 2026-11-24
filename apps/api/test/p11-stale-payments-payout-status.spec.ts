import { describe, expect, it, vi } from 'vitest';
import { CronService } from '../src/cron/cron.service.js';
import { payoutStatusOf } from '../src/admin/payout-status.js';
import { staleUnstartedPaymentWhere } from '../src/payments/stale-payment.js';

describe('P11 payoutStatusOf', () => {
  const row = { status: 'PAID', step: 'PARCEL_SENT', stripeTransferId: null, stripeTransferReversalId: null };

  it('reads a transfer id as the only proof the money left', () => {
    expect(payoutStatusOf({ ...row, stripeTransferId: 'tr_1' })).toBe('TRANSFERRED');
  });

  it('reads a reversal before the transfer it reverses', () => {
    expect(payoutStatusOf({ ...row, stripeTransferId: 'tr_1', stripeTransferReversalId: 'trr_1' })).toBe('REVERSED');
  });

  it('calls a released order with no transfer FAILED, and one still in escrow PENDING', () => {
    expect(payoutStatusOf({ ...row, step: 'RELEASED' })).toBe('FAILED');
    expect(payoutStatusOf(row)).toBe('PENDING');
  });

  it('does not call a refunded order FAILED just because its step reads RELEASED', () => {
    expect(payoutStatusOf({ ...row, status: 'REFUNDED', step: 'RELEASED' })).toBe('PENDING');
  });
});

describe('P11 automatic abandonment of checkouts nobody started', () => {
  it('builds a where that cannot match a row carrying a Stripe id', () => {
    const now = Date.parse('2026-10-20T12:00:00Z');
    const where = staleUnstartedPaymentWhere(now);

    expect(where).toEqual({
      status: 'PENDING_PAYMENT',
      stripeSessionId: null,
      stripePaymentIntentId: null,
      createdAt: { lte: new Date('2026-10-19T12:00:00Z') },
    });
  });

  it('the hourly settle job abandons them and counts them, without asking Stripe', async () => {
    const prisma = {
      commande: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
    };
    const cron = new CronService(
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never, {} as never,
    );

    const result = await (cron as unknown as { settleOrphanSessions(): Promise<{ scanned: number; acted: number; failed: number }> }).settleOrphanSessions();

    const call = prisma.commande.updateMany.mock.calls[0]![0];
    expect(call.where.stripeSessionId).toBeNull();
    expect(call.where.stripePaymentIntentId).toBeNull();
    expect(call.data).toEqual({ status: 'ABANDONED' });
    expect(result).toEqual({ scanned: 3, acted: 3, failed: 0 });
  });
});
