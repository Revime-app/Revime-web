import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RefundService } from '../src/commandes/refund.service.js';

// CF4-D task 5 (spec §3, §7). Same vi.mock pattern as test/refund-service.spec.ts: the
// gateways are mocked at module level so `paymentsGateway()` / `connectGateway()` inside
// refund.service.ts resolve to the SAME fake object this file controls per test.
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
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
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
  } as any;
  return mock;
}

// Owed-share row: REFUNDED, a breakdown was recorded, and no transfer has moved money
// for it yet - shareOwedCents(row) = repairCents - refundRepairCents = 8000 - 3000 = 5000.
const OWED_ROW = {
  id: 'c1',
  status: 'REFUNDED' as const,
  repairCents: 8000,
  refundRepairCents: 3000,
  stripeTransferId: null as string | null,
  stripeChargeId: 'ch_1',
  stripeRefundId: 're_1',
  repairerUserId: 'usr-repairer',
  repairer: { banned: false },
};

describe('RefundService.payShare (CF4-D task 5, spec §3, §7)', () => {
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

    fakePayments.retrieveRefund.mockResolvedValue({ id: 're_1', status: 'succeeded' });
    fakePayments.createTransfer.mockResolvedValue({ id: 'tr_share_1' });
    fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: true });
    prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_1' });
  });

  it('refuses when shareOwedCents is 0 (already paid: stripeTransferId set)', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW, stripeTransferId: 'tr_existing' });

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Aucune part due pour cette commande.',
    });
    expect(fakePayments.retrieveRefund).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('refuses when shareOwedCents is 0 (no breakdown recorded: refundRepairCents null)', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW, refundRepairCents: null });

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Aucune part due pour cette commande.',
    });
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('refuses when the row is NOT_FOUND', async () => {
    prisma.commande.findUnique.mockResolvedValue(null);

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it("refuses when Stripe's refund status is not succeeded", async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW });
    fakePayments.retrieveRefund.mockResolvedValue({ id: 're_1', status: 'pending' });

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: "Le remboursement n'est pas encore confirmé par Stripe.",
    });
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('CMP-D3: refuses to pay the share of a réparateur without fiscal information, moving no money', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW });
    prisma.repairerProfile.findUnique.mockResolvedValue({
      kind: 'INDIVIDUAL',
      fiscalCompletedAt: null,
      user: { profile: { verificationLevel: 'IDENTITY' }, businessVerification: null },
    });

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: expect.stringContaining('informations fiscales'),
    });
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('refuses when the réparateur is not payable (banned)', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW, repairer: { banned: true } });

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message:
        'Le réparateur ne peut pas recevoir de paiement : remboursez la totalité de la réparation ou réessayez plus tard.',
    });
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('success: retrieveRefund -> assertRepairerPayable -> createTransfer(5000, refund-share:c1) -> CAS write', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW });

    const result = await service.payShare('admin-1', 'c1');

    expect(result).toEqual({ transferredCents: 5000 });
    expect(fakePayments.retrieveRefund).toHaveBeenCalledWith('re_1');
    expect(fakeConnect.retrieveAccount).toHaveBeenCalledWith('acct_1');
    expect(fakePayments.createTransfer).toHaveBeenCalledWith(
      {
        amountCents: 5000,
        destination: 'acct_1',
        sourceTransaction: 'ch_1',
        transferGroup: 'c1',
      },
      'refund-share:c1',
    );
    expect(prisma.commande.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', stripeTransferId: null },
      data: { stripeTransferId: 'tr_share_1', transferredCents: 5000, transferredAt: expect.any(Date) },
    });

    const retrieveOrder = fakePayments.retrieveRefund.mock.invocationCallOrder[0]!;
    const payableOrder = fakeConnect.retrieveAccount.mock.invocationCallOrder[0]!;
    const transferOrder = fakePayments.createTransfer.mock.invocationCallOrder[0]!;
    const writeOrder = prisma.commande.updateMany.mock.invocationCallOrder[0]!;
    expect(payableOrder).toBeGreaterThan(retrieveOrder);
    expect(transferOrder).toBeGreaterThan(payableOrder);
    expect(writeOrder).toBeGreaterThan(transferOrder);
  });

  it('zero-row CAS (concurrent write already set stripeTransferId) -> "La commande a déjà changé d\'état."', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW });
    prisma.commande.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: "La commande a déjà changé d'état.",
    });
  });

  it('createTransfer failure -> AppException with the retry message, no CAS write', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW });
    fakePayments.createTransfer.mockRejectedValue(new Error('fake transfer failure'));

    await expect(service.payShare('admin-1', 'c1')).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Le versement au réparateur a échoué. Réessayez dans quelques minutes.',
    });
    expect(prisma.commande.updateMany).not.toHaveBeenCalled();
  });

  it('reuses the same idempotency key as refund() (refund-share:<id>) so a lost-response retry replays', async () => {
    prisma.commande.findUnique.mockResolvedValue({ ...OWED_ROW });

    await service.payShare('admin-1', 'c1');

    expect(fakePayments.createTransfer).toHaveBeenCalledWith(expect.anything(), 'refund-share:c1');
  });
});
