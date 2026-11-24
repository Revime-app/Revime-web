import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AppException } from '../src/common/app-exception.js';

// CF4-19 (spec §4). Mocked at module level, same pattern as refund-service.spec.ts:
// AdminRefundsService.detail calls `paymentsGateway()` internally, and the test
// controls what that resolves to per-case (success, rejection for either call).
const fakePayments = {
  retrieveRefund: vi.fn(),
  retrieveChargePaymentMethod: vi.fn(),
};

vi.mock('../src/payments/gateway.js', () => ({
  paymentsGateway: () => fakePayments,
}));

const { AdminRefundsService } = await import('../src/admin/admin-refunds.service.js');

function makePrismaMock() {
  return {
    commande: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    adminAuditLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  } as any;
}

const baseRow = {
  id: 'aaaaaaaa-1111-2222-3333-444444444444',
  status: 'REFUNDED' as const,
  demande: { title: 'Écran cassé' },
  client: { id: 'usr-client-1', name: 'Claire Dupont' },
  repairer: { id: 'usr-repairer-1', name: 'David Atelier' },
  totalCents: 8000,
  repairCents: 5000,
  shippingCents: 2000,
  insuranceCents: 500,
  protectionCents: 500,
  refundedAt: new Date('2026-09-20T10:00:00.000Z'),
  refundedCents: 8000,
  refundRepairCents: 5000,
  refundShippingCents: 2000,
  refundProtectionCents: 500,
  refundMotif: 'CLIENT_CANCELLED' as const,
  refundReason: 'Le client a annulé.',
  refundedByUserId: 'usr-admin-1',
  stripeRefundId: 're_1',
  stripeChargeId: 'ch_1',
  stripePaymentIntentId: 'pi_1',
  stripeTransferReversalId: null,
  stripeTransferId: null,
};

describe('AdminRefundsService.detail', () => {
  let prisma: any;
  let service: InstanceType<typeof AdminRefundsService>;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    service = new AdminRefundsService(prisma);
    fakePayments.retrieveRefund.mockResolvedValue({ id: 're_1', status: 'succeeded' });
    fakePayments.retrieveChargePaymentMethod.mockResolvedValue({ brand: 'visa', last4: '4242' });
  });

  // B11: the dispute linked from the refund says what the refund says.
  it('shows a dispute closed « Réparation reprise » as refunded', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...baseRow,
      dispute: { id: 'disp-6', number: 6, status: 'RESOLVED_DISMISSED', verdict: 'DISMISSED' },
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(res.disputeNumber).toBe(6);
    expect(res.disputeStatus).toBe('RESOLVED_REFUNDED');
  });

  it('NOT_FOUND for a commande that is neither REFUNDED nor PAID-with-attempt', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow, status: 'PAID', stripeRefundId: null, stripeTransferReversalId: null });

    await expect(service.detail(baseRow.id)).rejects.toThrow(AppException);
  });

  it('NOT_FOUND when the commande does not exist', async () => {
    prisma.commande.findUnique.mockResolvedValue(null);

    await expect(service.detail(baseRow.id)).rejects.toThrow(AppException);
  });

  it('builds lines for a partial refund: paid vs refunded per component, shipping folds in insurance', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow, refundShippingCents: 1000 });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(res.lines.repair).toEqual({ paid: 5000, refunded: 5000 });
    expect(res.lines.shipping).toEqual({ paid: 2500, refunded: 1000, insuranceCents: 500 });
    expect(res.lines.protection).toEqual({ paid: 500, refunded: 500 });
    expect(res.refundableCents).toBe(8000);
    expect(res.refundedCents).toBe(8000);
    expect(res.shareCents).toBe(0); // refundRepairCents(5000) === repairCents(5000)
  });

  // Fix round 1: the case above always has refundRepairCents === repairCents,
  // so shareCents is 0 in every existing detail test - the réparateur-share
  // arithmetic (repairCents - refundRepairCents, and its interaction with
  // stripeTransferId per refund-plan.ts's shareOwedCents) was never exercised
  // at the detail layer. These three cases cover a real repair-partial
  // (X < repairCents) before and after the share was paid, and the X = 0 case.
  it('partial repair refund before release: shareCents > 0, shareOwedCents equal (not yet paid)', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...baseRow,
      repairCents: 8000,
      refundRepairCents: 3000,
      stripeTransferId: null,
      transferredCents: null,
      status: 'REFUNDED',
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(res.lines.repair).toEqual({ paid: 8000, refunded: 3000 });
    expect(res.shareCents).toBe(5000);
    expect(res.shareOwedCents).toBe(5000);
  });

  it('same partial repair refund but the share was already paid: shareCents stays, shareOwedCents drops to 0', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...baseRow,
      repairCents: 8000,
      refundRepairCents: 3000,
      stripeTransferId: 'tr_1',
      transferredCents: 5000,
      status: 'REFUNDED',
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(res.lines.repair).toEqual({ paid: 8000, refunded: 3000 });
    expect(res.shareCents).toBe(5000);
    expect(res.shareOwedCents).toBe(0);
  });

  it('paid réparateur with X = 0 (no repair refund at all): full share already transferred, shareOwedCents 0', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...baseRow,
      repairCents: 8000,
      refundRepairCents: 0,
      stripeTransferId: 'tr_1',
      transferredCents: 8000,
      status: 'REFUNDED',
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(res.lines.repair).toEqual({ paid: 8000, refunded: 0 });
    expect(res.shareCents).toBe(8000);
    expect(res.shareOwedCents).toBe(0);
  });

  it('legacy REFUNDED row (null breakdown): refunded lines = paid amounts, shareCents 0', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...baseRow,
      refundRepairCents: null,
      refundShippingCents: null,
      refundProtectionCents: null,
      refundMotif: null,
      stripeRefundId: null,
      stripeChargeId: null,
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(res.lines.repair).toEqual({ paid: 5000, refunded: 5000 });
    expect(res.lines.shipping).toEqual({ paid: 2500, refunded: 2500, insuranceCents: 500 });
    expect(res.lines.protection).toEqual({ paid: 500, refunded: 500 });
    expect(res.shareCents).toBe(0);
    expect(res.motif).toBeNull();
  });

  it('admin name resolved from refundedByUserId, null-safe when the user lookup finds nothing', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow });
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await service.detail(baseRow.id);

    expect(res.adminName).toBeNull();
  });

  it('admin name null when refundedByUserId itself is null (no user lookup attempted)', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow, refundedByUserId: null });

    const res = await service.detail(baseRow.id);

    expect(res.adminName).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('history: only Commande-targeted AdminAuditLog rows for this id, oldest first', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });
    prisma.adminAuditLog.findMany.mockResolvedValue([
      { createdAt: new Date('2026-09-19T00:00:00.000Z'), action: 'commande.refund', actorEmail: 'admin@revime.fr', statusCode: 200 },
    ]);

    const res = await service.detail(baseRow.id);

    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: { targetType: 'Commande', targetId: baseRow.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(res.history).toEqual([
      { at: '2026-09-19T00:00:00.000Z', action: 'commande.refund', actorEmail: 'admin@revime.fr', statusCode: 200 },
    ]);
  });

  it('Stripe fields populated when the gateway answers for both calls', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(fakePayments.retrieveRefund).toHaveBeenCalledWith('re_1');
    expect(fakePayments.retrieveChargePaymentMethod).toHaveBeenCalledWith('ch_1');
    expect(res.stripe).toEqual({
      refundStatus: 'succeeded',
      cardBrand: 'visa',
      cardLast4: '4242',
      available: true,
    });
  });

  it('available: false with nulls when retrieveRefund rejects, retrieveChargePaymentMethod still populates', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });
    fakePayments.retrieveRefund.mockRejectedValue(new Error('stripe down'));

    const res = await service.detail(baseRow.id);

    expect(res.stripe.refundStatus).toBeNull();
    expect(res.stripe.cardBrand).toBe('visa');
    expect(res.stripe.cardLast4).toBe('4242');
    expect(res.stripe.available).toBe(false);
  });

  it('available: false with nulls when retrieveChargePaymentMethod rejects, retrieveRefund still populates', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...baseRow });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });
    fakePayments.retrieveChargePaymentMethod.mockRejectedValue(new Error('stripe down'));

    const res = await service.detail(baseRow.id);

    expect(res.stripe.refundStatus).toBe('succeeded');
    expect(res.stripe.cardBrand).toBeNull();
    expect(res.stripe.cardLast4).toBeNull();
    expect(res.stripe.available).toBe(false);
  });

  it('available: true and both fields null when neither id exists (no call was needed)', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...baseRow,
      stripeRefundId: null,
      stripeChargeId: null,
    });
    prisma.user.findUnique.mockResolvedValue({ id: 'usr-admin-1', name: 'Admin Alice' });

    const res = await service.detail(baseRow.id);

    expect(fakePayments.retrieveRefund).not.toHaveBeenCalled();
    expect(fakePayments.retrieveChargePaymentMethod).not.toHaveBeenCalled();
    expect(res.stripe).toEqual({
      refundStatus: null,
      cardBrand: null,
      cardLast4: null,
      available: true,
    });
  });

  it('accepts a PAID-with-attempt commande (REFUND_INCOMPLETE), not only REFUNDED', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...baseRow,
      status: 'PAID',
      stripeRefundId: 're_1',
      stripeTransferReversalId: null,
      refundedAt: null,
      refundedCents: null,
      refundRepairCents: null,
      refundShippingCents: null,
      refundProtectionCents: null,
      refundMotif: null,
    });
    prisma.user.findUnique.mockResolvedValue(null);

    const res = await service.detail(baseRow.id);

    expect(res.commandeId).toBe(baseRow.id);
  });
});
