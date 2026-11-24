import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RefundService } from '../src/commandes/refund.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { RefundBreakdownInput } from '@revime/shared';

// CF4-D task 4 (spec §3). The gateways are mocked at module level so
// `paymentsGateway()` / `connectGateway()` inside refund.service.ts resolve to
// the SAME fake object this file controls per test - there is no existing
// vi.mock of these gateways elsewhere in the repo, so this is the first.
const fakePayments = {
  createRefund: vi.fn(),
  retrieveRefund: vi.fn(),
  reverseTransfer: vi.fn(),
  createTransfer: vi.fn(),
};
const fakeConnect = {
  retrieveAccount: vi.fn(),
};
const opsMail = { sendRefundShareOpsMail: vi.fn().mockResolvedValue(undefined) };

vi.mock('../src/payments/gateway.js', () => ({
  paymentsGateway: () => fakePayments,
}));
vi.mock('../src/connect/gateway.js', () => ({
  connectGateway: () => fakeConnect,
}));
vi.mock('../src/commandes/ops-mail.js', () => ({
  sendRefundShareOpsMail: (...args: unknown[]) => opsMail.sendRefundShareOpsMail(...args),
}));

function makePrismaMock() {
  const mock = {
    commande: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    demande: {
      update: vi.fn().mockResolvedValue({}),
    },
    connectAccount: {
      findUnique: vi.fn(),
    },
    // CMP-D3: a réparateur whose fiscal information is complete, so existing cases are unaffected.
    repairerProfile: {
      findUnique: vi.fn().mockResolvedValue({
        kind: 'INDIVIDUAL',
        fiscalCompletedAt: new Date('2026-10-01T00:00:00Z'),
        user: { profile: { verificationLevel: 'IDENTITY' }, businessVerification: null },
      }),
    },
    // CF4-I. Every refund() call now closes a pending request in the same transaction;
    // default to "none pending" (count 0) so tests that do not care are unaffected.
    cancellationRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // B11. A refund settles the dispute still open on the commande: default to « none ».
    dispute: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: vi.fn((ops: any[]) => Promise.all(ops)),
  } as any;
  return mock;
}

const NOW_ROW_BASE = {
  id: 'c1',
  status: 'PAID' as const,
  demandeId: 'dem-1',
  totalCents: 8000,
  repairCents: 8000,
  shippingCents: 0,
  insuranceCents: 0,
  protectionCents: 0,
  stripeChargeId: 'ch_1',
  stripeTransferId: null as string | null,
  transferredCents: null as number | null,
  stripeTransferReversalId: null as string | null,
  stripeRefundId: null as string | null,
  clientUserId: 'usr-client',
  repairerUserId: 'usr-repairer',
  repairer: { banned: false },
  demande: { title: 'Écran cassé' },
};

const input = (over: Partial<RefundBreakdownInput> = {}): RefundBreakdownInput => ({
  motif: 'OTHER',
  note: 'Motif suffisant',
  repairCents: 0,
  shippingCents: 0,
  protectionCents: 0,
  ...over,
});

describe('RefundService.refund (CF4-D, spec §3)', () => {
  let prisma: any;
  let notifications: any;
  let shipments: any;
  let announcer: any;
  let service: RefundService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = makePrismaMock();
    notifications = { emit: vi.fn().mockResolvedValue(undefined) };
    shipments = { cancelUnshipped: vi.fn().mockResolvedValue(undefined) };
    announcer = { announce: vi.fn().mockResolvedValue(undefined) };
    service = new RefundService(prisma, notifications, shipments, announcer);

    fakePayments.createRefund.mockResolvedValue({ id: 're_1', status: 'succeeded' });
    fakePayments.retrieveRefund.mockResolvedValue({ id: 're_1', status: 'succeeded' });
    fakePayments.reverseTransfer.mockResolvedValue({ id: 'trr_1' });
    fakePayments.createTransfer.mockResolvedValue({ id: 'tr_share_1' });
    fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: true });
  });

  it('unpaid partial (X=3000,Y=0,Z=0): retrieveAccount -> createRefund(3000) -> CAS -> createTransfer(5000, refund-share:c1) -> transfer id written; réparateur COMMANDE_PARTIALLY_REFUNDED 5000; client COMMANDE_REFUNDED 3000; announce with 3000', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });

    const result = await service.refund('admin-1', 'c1', input({ repairCents: 3000 }));

    expect(result).toEqual({ refundCents: 3000, totalCents: 8000 });

    expect(fakeConnect.retrieveAccount).toHaveBeenCalledWith('acct_1');
    expect(fakePayments.createRefund).toHaveBeenCalledWith(
      { chargeId: 'ch_1', amountCents: 3000 },
      expect.any(String),
    );
    expect(fakePayments.createTransfer).toHaveBeenCalledWith(
      {
        amountCents: 5000,
        destination: 'acct_1',
        sourceTransaction: 'ch_1',
        transferGroup: 'c1',
      },
      'refund-share:c1',
    );
    expect(prisma.commande.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', stripeTransferId: null },
        data: expect.objectContaining({
          stripeTransferId: 'tr_share_1',
          transferredCents: 5000,
          transferredAt: expect.any(Date),
        }),
      }),
    );

    const retrieveOrder = fakeConnect.retrieveAccount.mock.invocationCallOrder[0]!;
    const refundOrder = fakePayments.createRefund.mock.invocationCallOrder[0]!;
    const txOrder = prisma.$transaction.mock.invocationCallOrder[0]!;
    const transferOrder = fakePayments.createTransfer.mock.invocationCallOrder[0]!;
    const transferWriteOrder = prisma.commande.updateMany.mock.invocationCallOrder.slice(-1)[0]!;
    expect(refundOrder).toBeGreaterThan(retrieveOrder);
    expect(txOrder).toBeGreaterThan(refundOrder);
    expect(transferOrder).toBeGreaterThan(txOrder);
    expect(transferWriteOrder).toBeGreaterThan(transferOrder);

    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-repairer', type: 'COMMANDE_PARTIALLY_REFUNDED', amountCents: 5000 }),
    );
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-client', type: 'COMMANDE_REFUNDED', amountCents: 3000 }),
    );
    expect(announcer.announce).toHaveBeenCalledWith('c1', 'REFUNDED', 3000);
  });

  it.each([
    ['banned', { repairer: { banned: true } }, undefined],
    ['no ConnectAccount', {}, null],
  ] as const)('payability fails (%s) -> exact message, no Stripe call', async (_label, rowOver, accountResult) => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE, ...rowOver });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    if (accountResult !== undefined) {
      prisma.connectAccount.findUnique.mockResolvedValue(accountResult);
    }

    await expect(service.refund('admin-1', 'c1', input({ repairCents: 3000 }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message:
        'Le réparateur ne peut pas recevoir de paiement : remboursez la totalité de la réparation ou réessayez plus tard.',
    });

    expect(fakePayments.createRefund).not.toHaveBeenCalled();
    expect(fakePayments.reverseTransfer).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('payability fails when transfersActive is false -> exact message, no Stripe call', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });
    fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: false });

    await expect(service.refund('admin-1', 'c1', input({ repairCents: 3000 }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message:
        'Le réparateur ne peut pas recevoir de paiement : remboursez la totalité de la réparation ou réessayez plus tard.',
    });
    expect(fakePayments.createRefund).not.toHaveBeenCalled();
  });

  it('payability fails when retrieveAccount rejects -> exact message, no Stripe call', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });
    fakeConnect.retrieveAccount.mockRejectedValue(new Error('network'));

    await expect(service.refund('admin-1', 'c1', input({ repairCents: 3000 }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message:
        'Le réparateur ne peut pas recevoir de paiement : remboursez la totalité de la réparation ou réessayez plus tard.',
    });
    expect(fakePayments.createRefund).not.toHaveBeenCalled();
  });

  it('full refund unpaid -> no retrieveAccount, no transfer; announce amount null; réparateur COMMANDE_REFUNDED', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });

    const result = await service.refund('admin-1', 'c1', input({ repairCents: 8000 }));

    expect(result).toEqual({ refundCents: 8000, totalCents: 8000 });
    expect(fakeConnect.retrieveAccount).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(announcer.announce).toHaveBeenCalledWith('c1', 'REFUNDED', null);
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-repairer', type: 'COMMANDE_REFUNDED', amountCents: 8000 }),
    );
  });

  // CF4-I (spec §4.2, Review Focus 1, 2). The final $transaction also closes a pending
  // cancellation request APPROVED and clears the flag - in the SAME transaction, with the
  // commande CAS write staying index 0.
  it('closes a pending cancellation request APPROVED and clears cancellationRequestedAt, index 0 stays the commande CAS', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.cancellationRequest = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };

    await service.refund('admin-1', 'c1', input({ repairCents: 8000 }));

    const opsArg = prisma.$transaction.mock.calls[0]![0] as unknown[];
    // The CAS, the demande, the cancellation request, and the dispute still open (B11).
    expect(opsArg).toHaveLength(4);
    expect(prisma.commande.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', status: 'PAID', stripeTransferId: null },
        data: expect.objectContaining({ status: 'REFUNDED', cancellationRequestedAt: null }),
      }),
    );
    expect(prisma.cancellationRequest.updateMany).toHaveBeenCalledWith({
      where: { commandeId: 'c1', status: 'PENDING' },
      data: { status: 'APPROVED', decidedAt: expect.any(Date), decidedByUserId: 'admin-1' },
    });
    // Index 0 is still the commande CAS - the array-form $transaction's first argument.
    expect(opsArg[0]).toBe(prisma.commande.updateMany.mock.results[0]!.value);
  });

  // Whole-branch review fix pass, Review Focus 1: approve()'s PENDING pre-check is not a
  // guard by itself - a client's withdraw can commit between that pre-check and this
  // transaction. `requirePendingCancellation = true` (the 5th argument `AdminCancellationsService.approve`
  // passes) closes that window by adding `cancellationRequestedAt: { not: null }` to the CAS.
  it('with requirePendingCancellation=true, the CAS also requires cancellationRequestedAt not null', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.cancellationRequest = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };

    await service.refund('admin-1', 'c1', input({ repairCents: 8000 }), 'REFUNDED', true);

    expect(prisma.commande.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', status: 'PAID', stripeTransferId: null, cancellationRequestedAt: { not: null } },
      }),
    );
  });

  it('without requirePendingCancellation (the default), the CAS carries no cancellationRequestedAt condition - a plain refund with no request must still succeed', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });

    await service.refund('admin-1', 'c1', input({ repairCents: 8000 }));

    const call = prisma.commande.updateMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(call.where).not.toHaveProperty('cancellationRequestedAt');
  });

  it('a withdrawn request (flag already cleared) loses the CAS and the refund is refused as STATE_CHANGED, when requirePendingCancellation=true', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    // The CAS itself is what decides the race, so the stub simulates its outcome directly:
    // a withdraw that committed first means this conditional write matches zero rows.
    prisma.commande.updateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.refund('admin-1', 'c1', input({ repairCents: 8000 }), 'REFUNDED', true),
    ).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY', message: "La commande a déjà changé d'état." });
  });

  it('paid partial X=3000 -> reverseTransfer(3000) before createRefund; no transfer', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...NOW_ROW_BASE,
      stripeTransferId: 'tr_1',
      transferredCents: 8000,
    });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: 'tr_1',
      transferredCents: 8000,
      stripeTransferReversalId: null,
    });

    const result = await service.refund('admin-1', 'c1', input({ repairCents: 3000 }));

    expect(result).toEqual({ refundCents: 3000, totalCents: 8000 });
    expect(fakePayments.reverseTransfer).toHaveBeenCalledWith(
      { transferId: 'tr_1', amountCents: 3000 },
      expect.any(String),
    );
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();

    const reversalOrder = fakePayments.reverseTransfer.mock.invocationCallOrder[0]!;
    const refundOrder = fakePayments.createRefund.mock.invocationCallOrder[0]!;
    expect(refundOrder).toBeGreaterThan(reversalOrder);
  });

  it('paid X=0 with a non-zero total -> no reversal; réparateur COMMANDE_PARTIALLY_REFUNDED for repairCents-owed', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...NOW_ROW_BASE,
      repairCents: 8000,
      protectionCents: 500,
      stripeTransferId: 'tr_1',
      transferredCents: 8000,
    });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: 'tr_1',
      transferredCents: 8000,
      stripeTransferReversalId: null,
    });

    const result = await service.refund(
      'admin-1',
      'c1',
      input({ repairCents: 0, shippingCents: 0, protectionCents: 500 }),
    );

    expect(result).toEqual({ refundCents: 500, totalCents: 8000 });
    expect(fakePayments.reverseTransfer).not.toHaveBeenCalled();
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'usr-repairer', type: 'COMMANDE_PARTIALLY_REFUNDED', amountCents: 8000 }),
    );
  });

  it('CMP-D3: a réparateur without fiscal information is refused BEFORE any Stripe write', async () => {
    prisma.repairerProfile.findUnique.mockResolvedValue({
      kind: 'INDIVIDUAL',
      fiscalCompletedAt: null,
      user: { profile: { verificationLevel: 'IDENTITY' }, businessVerification: null },
    });
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });

    // A partial refund leaves the réparateur a share to be paid; that share is a payout.
    await expect(service.refund('admin-1', 'c1', input({ repairCents: 3000 }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: expect.stringContaining('informations fiscales'),
    });
    expect(fakePayments.createRefund).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('refund pending -> no createTransfer; ops mail with remboursement en attente chez Stripe; still resolves', async () => {
    fakePayments.createRefund.mockResolvedValue({ id: 're_1', status: 'pending' });
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });

    const result = await service.refund('admin-1', 'c1', input({ repairCents: 3000 }));

    expect(result).toEqual({ refundCents: 3000, totalCents: 8000 });
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(opsMail.sendRefundShareOpsMail).toHaveBeenCalledWith(
      expect.objectContaining({
        commandeId: 'c1',
        shareCents: 5000,
        reason: 'remboursement en attente chez Stripe',
      }),
    );
  });

  it('createTransfer rejects -> resolves; row REFUNDED (CAS called); ops mail transfert échoué', async () => {
    fakePayments.createTransfer.mockRejectedValue(new Error('fake transfer failure'));
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });

    const result = await service.refund('admin-1', 'c1', input({ repairCents: 3000 }));

    expect(result).toEqual({ refundCents: 3000, totalCents: 8000 });
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(opsMail.sendRefundShareOpsMail).toHaveBeenCalledWith(
      expect.objectContaining({ commandeId: 'c1', shareCents: 5000, reason: 'transfert échoué' }),
    );
  });

  it('concurrent release: fresh.stripeTransferId = tr_9, transferredCents 8000 -> exactly one reverseTransfer(3000), no createTransfer', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: 'tr_9',
      transferredCents: 8000,
      stripeTransferReversalId: null,
    });
    // The first read still sees no transfer, so the initial plan needs the
    // payability check (transferCents > 0) before the re-read discovers the
    // concurrent release.
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });

    const result = await service.refund('admin-1', 'c1', input({ repairCents: 3000 }));

    expect(result).toEqual({ refundCents: 3000, totalCents: 8000 });
    expect(fakePayments.reverseTransfer).toHaveBeenCalledTimes(1);
    expect(fakePayments.reverseTransfer).toHaveBeenCalledWith(
      { transferId: 'tr_9', amountCents: 3000 },
      expect.any(String),
    );
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('over-ceiling amount -> AppException with the RefundPlanError message; no Stripe call', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });

    await expect(
      service.refund('admin-1', 'c1', input({ repairCents: 9000 })),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Le montant de la réparation dépasse le montant payé.',
    });
    expect(fakePayments.createRefund).not.toHaveBeenCalled();
    expect(fakePayments.reverseTransfer).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('CAS writes the breakdown, motif and note', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });

    await service.refund(
      'admin-1',
      'c1',
      input({ motif: 'REPAIR_NOT_DONE', note: 'Le réparateur a annulé.', repairCents: 3000 }),
    );

    expect(prisma.commande.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'c1', status: 'PAID', stripeTransferId: null },
        data: expect.objectContaining({
          status: 'REFUNDED',
          refundedCents: 3000,
          refundRepairCents: 3000,
          refundShippingCents: 0,
          refundProtectionCents: 0,
          refundMotif: 'REPAIR_NOT_DONE',
          refundReason: 'Le réparateur a annulé.',
        }),
      }),
    );
  });

  it('existing behaviour kept: recorded stripeRefundId with Stripe succeeded -> no second createRefund', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...NOW_ROW_BASE, stripeRefundId: 're_existing' });
    prisma.commande.findUniqueOrThrow.mockResolvedValue({
      stripeTransferId: null,
      transferredCents: null,
      stripeTransferReversalId: null,
    });
    fakePayments.retrieveRefund.mockResolvedValue({ id: 're_existing', status: 'succeeded' });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });

    const result = await service.refund('admin-1', 'c1', input({ repairCents: 3000 }));

    expect(result).toEqual({ refundCents: 3000, totalCents: 8000 });
    expect(fakePayments.retrieveRefund).toHaveBeenCalledWith('re_existing');
    expect(fakePayments.createRefund).not.toHaveBeenCalled();
  });

  it('Bug B2: rejects refund when order status is PENDING_PAYMENT with explicit explanatory error', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...NOW_ROW_BASE,
      status: 'PENDING_PAYMENT',
      stripeChargeId: null,
    });

    await expect(service.refund('admin-1', 'c1', input({ repairCents: 3000 }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Cette commande est en attente de paiement (non payée) et ne peut pas être remboursée.',
    });
    expect(fakePayments.createRefund).not.toHaveBeenCalled();
  });

  it('Bug B2: rejects refund when order status is ABANDONED', async () => {
    prisma.commande.findUnique.mockResolvedValue({
      ...NOW_ROW_BASE,
      status: 'ABANDONED',
      stripeChargeId: null,
    });

    await expect(service.refund('admin-1', 'c1', input({ repairCents: 3000 }))).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
    expect(fakePayments.createRefund).not.toHaveBeenCalled();
  });
});
