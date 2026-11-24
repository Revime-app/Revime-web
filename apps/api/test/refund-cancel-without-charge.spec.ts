import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RefundService } from '../src/commandes/refund.service.js';

// RU-12 / B3 review. `cancelWithoutCharge` is the « Annuler la commande » remedy for a CHARGE_MISSING
// row. The first version flipped `status` and nothing else, on the strength of a null
// `stripeChargeId` alone, so a card that Stripe HAD charged (the row only lacked the charge id
// that `backfillChargeIds` fills in later) ended up ABANDONED with the client's money taken.
const fakePayments = {
  retrievePaymentIntent: vi.fn(),
  retrieveCheckoutSession: vi.fn(),
};
vi.mock('../src/payments/gateway.js', () => ({
  paymentsGateway: () => fakePayments,
}));
vi.mock('../src/connect/gateway.js', () => ({ connectGateway: () => ({}) }));

const ROW = {
  id: 'c1',
  status: 'PAID' as const,
  demandeId: 'dem-1',
  stripeChargeId: null as string | null,
  stripePaymentIntentId: null as string | null,
  stripeSessionId: null as string | null,
};

function makePrisma() {
  const tx = {
    commande: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    demande: { update: vi.fn().mockResolvedValue({}) },
    cancellationRequest: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = {
    commande: {
      findUnique: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { prisma, tx };
}

describe('RefundService.cancelWithoutCharge (RU-12 / B3)', () => {
  let prisma: ReturnType<typeof makePrisma>['prisma'];
  let tx: ReturnType<typeof makePrisma>['tx'];
  let shipments: { cancelUnshipped: ReturnType<typeof vi.fn> };
  let service: RefundService;

  beforeEach(() => {
    fakePayments.retrievePaymentIntent.mockReset();
    fakePayments.retrieveCheckoutSession.mockReset();
    ({ prisma, tx } = makePrisma());
    shipments = { cancelUnshipped: vi.fn().mockResolvedValue(undefined) };
    service = new RefundService(prisma as never, { emit: vi.fn() } as never, shipments as never, {} as never);
  });

  it('cancels a PAID order that has no Stripe id at all, in one CAS transaction that also cancels the demande', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW });

    await service.cancelWithoutCharge('c1');

    expect(tx.commande.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'PAID', stripeChargeId: null },
      data: { status: 'ABANDONED' },
    });
    expect(tx.demande.update).toHaveBeenCalledWith({ where: { id: 'dem-1' }, data: { status: 'CANCELLED' } });
    expect(tx.cancellationRequest.updateMany).toHaveBeenCalled();
    expect(shipments.cancelUnshipped).toHaveBeenCalledWith('c1');
    expect(fakePayments.retrievePaymentIntent).not.toHaveBeenCalled();
  });

  it('REFUSES when the PaymentIntent has a charge, and attaches the charge id so the refund form works', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW, stripePaymentIntentId: 'pi_1' });
    fakePayments.retrievePaymentIntent.mockResolvedValue({ id: 'pi_1', status: 'succeeded', chargeId: 'ch_9', clientSecret: '' });

    await expect(service.cancelWithoutCharge('c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: expect.stringContaining('formulaire de remboursement'),
    });

    expect(prisma.commande.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', stripeChargeId: null },
      data: { stripeChargeId: 'ch_9' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('REFUSES a succeeded PaymentIntent even when Stripe returns no charge id (money was taken)', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW, stripePaymentIntentId: 'pi_1' });
    fakePayments.retrievePaymentIntent.mockResolvedValue({ id: 'pi_1', status: 'succeeded', chargeId: null, clientSecret: '' });

    await expect(service.cancelWithoutCharge('c1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('REFUSES when the checkout session completed with a charge (session-only row)', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW, stripeSessionId: 'cs_1' });
    fakePayments.retrieveCheckoutSession.mockResolvedValue({
      id: 'cs_1', url: '', status: 'complete', paymentIntentId: 'pi_1', chargeId: 'ch_3',
    });

    await expect(service.cancelWithoutCharge('c1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    expect(prisma.commande.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', stripeChargeId: null },
      data: { stripeChargeId: 'ch_3' },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cancels when Stripe confirms the PaymentIntent never charged anything', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW, stripePaymentIntentId: 'pi_1' });
    fakePayments.retrievePaymentIntent.mockResolvedValue({ id: 'pi_1', status: 'requires_payment_method', chargeId: null, clientSecret: '' });

    await service.cancelWithoutCharge('c1');

    expect(tx.commande.updateMany).toHaveBeenCalled();
  });

  it('REFUSES when Stripe cannot be read: it never cancels blind', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW, stripePaymentIntentId: 'pi_1' });
    fakePayments.retrievePaymentIntent.mockRejectedValueOnce(new Error('network'));

    await expect(service.cancelWithoutCharge('c1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each(['PENDING_PAYMENT', 'ABANDONED', 'REFUNDED'] as const)('REFUSES a %s order (only a PAID one can be CHARGE_MISSING)', async (status) => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW, status });

    await expect(service.cancelWithoutCharge('c1')).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('REFUSES a PAID order that already carries a charge id', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW, stripeChargeId: 'ch_1' });

    await expect(service.cancelWithoutCharge('c1')).rejects.toMatchObject({
      message: expect.stringContaining('formulaire de remboursement'),
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws STATE_CHANGED and rolls the demande back when the CAS loses a race', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...ROW });
    tx.commande.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(service.cancelWithoutCharge('c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: expect.stringContaining('déjà changé'),
    });
    // The throw inside the callback is what makes Prisma roll the transaction back, and the
    // shipments are only touched after a commit.
    expect(shipments.cancelUnshipped).not.toHaveBeenCalled();
  });

  it('404s on an unknown order', async () => {
    prisma.commande.findUnique.mockResolvedValue(null);
    await expect(service.cancelWithoutCharge('nope')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
