import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandesService } from '../src/commandes/commandes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * CMP-D3, the golden rule: « aucun versement à un réparateur tant que ses informations fiscales ne sont
 * pas complètes ». `releaseInternal` holds the money, `payoutStrandedCommandes` pays it once the
 * declaration lands, and `payoutHeldCommandes` is the cron's safety net. RU-27 review: none of this had a
 * unit test, and the stranded payout had no double-pay guard.
 */

const fakePayments = {
  createTransfer: vi.fn(),
  findTransferBySource: vi.fn(),
  retrieveRefund: vi.fn(),
};
const fakeConnect = { retrieveAccount: vi.fn() };

vi.mock('../src/payments/gateway.js', () => ({ paymentsGateway: () => fakePayments }));
vi.mock('../src/connect/gateway.js', () => ({ connectGateway: () => fakeConnect }));

const KEYS = ['PAYMENTS_ENABLED', 'CONNECT_ENABLED', 'STRIPE_WEBHOOK_SECRET', 'PUBLIC_API_URL', 'STRIPE_CONNECT_WEBHOOK_SECRET'];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.CONNECT_ENABLED = 'true';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'http://localhost:3002';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_test';
  vi.resetAllMocks();
  fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: true });
  fakePayments.findTransferBySource.mockResolvedValue(null);
  fakePayments.createTransfer.mockResolvedValue({ id: 'tr_new' });
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const COMMANDE = '33333333-3333-4333-8333-333333333333';

type FiscalProfileRow = {
  kind: string;
  fiscalCompletedAt: Date | null;
  user: { profile: { verificationLevel: string }; businessVerification: null };
};
const INCOMPLETE: FiscalProfileRow = {
  kind: 'INDIVIDUAL',
  fiscalCompletedAt: null,
  user: { profile: { verificationLevel: 'IDENTITY' }, businessVerification: null },
};
const COMPLETE: FiscalProfileRow = { ...INCOMPLETE, fiscalCompletedAt: new Date('2026-10-01T00:00:00Z') };

function harness(fiscalProfile: FiscalProfileRow | null) {
  const releasedRow = {
    id: COMMANDE,
    status: 'PAID',
    step: 'AWAITING_VALIDATION',
    repairCents: 5000,
    stripeChargeId: 'ch_1',
    stripeTransferId: null,
    disputedAt: null,
    cancellationRequestedAt: null,
    stripeRefundId: null,
    stripeTransferReversalId: null,
    clientUserId: CLIENT,
    repairerUserId: REPAIRER,
    demandeId: 'd1',
    repairer: { banned: false },
    demande: { title: 'iPhone 13' },
  };
  const txCommandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const tx = { commande: { updateMany: txCommandeUpdateMany }, commandeStepEvent: { create: vi.fn() } };
  const prisma = {
    commande: {
      findUnique: vi.fn().mockResolvedValue(releasedRow),
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    connectAccount: { findUnique: vi.fn().mockResolvedValue({ stripeAccountId: 'acct_1' }) },
    repairerProfile: { findUnique: vi.fn().mockResolvedValue(fiscalProfile) },
    user: { findUnique: vi.fn().mockResolvedValue({ banned: false }) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const notifications = { emit: vi.fn().mockResolvedValue(undefined) };
  const announcer = { announce: vi.fn().mockResolvedValue(undefined) };
  const service = new CommandesService(
    prisma as unknown as PrismaService,
    notifications as unknown as NotificationsService,
    announcer as never,
  );
  return { service, prisma, tx, txCommandeUpdateMany, notifications };
}

describe('CommandesService.releaseInternal, fiscal hold (CMP-D3)', () => {
  it('holds the money when the réparateur has not declared: no Stripe call, row RELEASED without a transfer', async () => {
    const { service, txCommandeUpdateMany } = harness(INCOMPLETE);

    expect(await service.releaseInternal(COMMANDE)).toBe('released');

    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(fakePayments.findTransferBySource).not.toHaveBeenCalled();
    const [{ data }] = txCommandeUpdateMany.mock.calls[0]!;
    expect(data.step).toBe('RELEASED');
    expect(data).not.toHaveProperty('stripeTransferId');
    // No money moved, so there is no transfer date: the DAC7 file must not count this order yet.
    expect(data).not.toHaveProperty('transferredAt');
  });

  it('tells the client the funds left escrow, and the réparateur what to do instead of « paid »', async () => {
    const { service, notifications } = harness(INCOMPLETE);

    await service.releaseInternal(COMMANDE);

    const emitted = notifications.emit.mock.calls.map(([e]) => [e.userId, e.type]);
    // V8 B2 (amended): every hold now tells the réparateur « votre paiement vous attend » and opens the
    // setup page, which lists the fiscal step; it was FISCAL_DECLARATION_REQUIRED.
    expect(emitted).toEqual([
      [CLIENT, 'FUNDS_RELEASED'],
      [REPAIRER, 'PAYOUT_WAITING'],
    ]);
  });

  it('pays normally once the declaration is complete, and the réparateur is told he was paid', async () => {
    const { service, notifications, txCommandeUpdateMany } = harness(COMPLETE);

    await service.releaseInternal(COMMANDE);

    // The row records WHEN the money moved, which is what the DAC7 file dates a payout by.
    const [{ data }] = txCommandeUpdateMany.mock.calls[0]!;
    expect(data).toMatchObject({ step: 'RELEASED', stripeTransferId: expect.any(String), transferredAt: expect.any(Date) });

    expect(fakePayments.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 5000, destination: 'acct_1', sourceTransaction: 'ch_1' }),
      `release:${COMMANDE}`,
    );
    expect(notifications.emit.mock.calls.map(([e]) => [e.userId, e.type])).toEqual([
      [CLIENT, 'FUNDS_RELEASED'],
      [REPAIRER, 'FUNDS_RELEASED'],
    ]);
  });

  it('heals a release whose transfer Stripe already holds, and dates it too', async () => {
    fakePayments.findTransferBySource.mockResolvedValueOnce({ id: 'tr_old', amountCents: 5000 });
    const { service, txCommandeUpdateMany } = harness(COMPLETE);

    await service.releaseInternal(COMMANDE);

    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    const [{ data }] = txCommandeUpdateMany.mock.calls[0]!;
    expect(data).toMatchObject({ stripeTransferId: 'tr_old', transferredCents: 5000, transferredAt: expect.any(Date) });
  });

  it('a réparateur with no profile at all is held, not paid', async () => {
    const { service } = harness(null);

    await service.releaseInternal(COMMANDE);

    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });
});

/**
 * V8 B2. The client could not validate (« Le réparateur ne peut pas encore recevoir de paiement. »)
 * when the réparateur had never opened « Virements »: no Connect account was a REFUSAL, while an
 * inactive account or missing fiscal info was already a HOLD. Production order a5c6ceba was exactly
 * this case (V8 FND8-015). The auto-release goes through the same method, so it is covered too.
 */
describe('CommandesService.releaseInternal, no Connect account yet (V8 B2)', () => {
  it('holds the money instead of refusing: no Stripe call at all, row RELEASED without a transfer', async () => {
    const { service, prisma, txCommandeUpdateMany } = harness(COMPLETE);
    prisma.connectAccount.findUnique.mockResolvedValue(null);

    expect(await service.releaseInternal(COMMANDE)).toBe('released');

    expect(fakeConnect.retrieveAccount).not.toHaveBeenCalled();
    expect(fakePayments.findTransferBySource).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    const [{ where, data }] = txCommandeUpdateMany.mock.calls[0]!;
    expect(where).toMatchObject({ id: COMMANDE, step: 'AWAITING_VALIDATION', stripeTransferId: null, status: 'PAID' });
    expect(data.step).toBe('RELEASED');
    expect(data).not.toHaveProperty('stripeTransferId');
    expect(data).not.toHaveProperty('transferredAt');
  });

  it('tells the réparateur his payment is waiting, never that he was paid', async () => {
    const { service, prisma, notifications } = harness(COMPLETE);
    prisma.connectAccount.findUnique.mockResolvedValue(null);

    await service.releaseInternal(COMMANDE);

    expect(notifications.emit.mock.calls.map(([e]) => [e.userId, e.type, e.amountCents])).toEqual([
      [CLIENT, 'FUNDS_RELEASED', 5000],
      [REPAIRER, 'PAYOUT_WAITING', 5000],
    ]);
  });

  it('is held, not paid, when there is neither an account nor a declaration', async () => {
    const { service, prisma, notifications } = harness(INCOMPLETE);
    prisma.connectAccount.findUnique.mockResolvedValue(null);

    expect(await service.releaseInternal(COMMANDE)).toBe('released');
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(notifications.emit.mock.calls.map(([e]) => e.type)).toEqual(['FUNDS_RELEASED', 'PAYOUT_WAITING']);
  });
});

describe('CommandesService.releaseInternal, account not active yet (V8 B2)', () => {
  it('tells the réparateur his payment is waiting: it used to send FUNDS_RELEASED, « versés sur votre compte »', async () => {
    fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: false });
    const { service, notifications } = harness(COMPLETE);

    expect(await service.releaseInternal(COMMANDE)).toBe('released');

    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(notifications.emit.mock.calls.map(([e]) => [e.userId, e.type])).toEqual([
      [CLIENT, 'FUNDS_RELEASED'],
      [REPAIRER, 'PAYOUT_WAITING'],
    ]);
  });
});

describe('CommandesService.payoutStrandedCommandes (CMP-D3)', () => {
  const held = { id: COMMANDE, repairCents: 5000, stripeChargeId: 'ch_1', demande: { title: 'iPhone 13' } };

  it('selects only orders nothing forbids paying: not disputed, not frozen by a cancellation, not refunded', async () => {
    const { service, prisma } = harness(COMPLETE);

    await service.payoutStrandedCommandes(REPAIRER);

    expect(prisma.commande.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          repairerUserId: REPAIRER,
          status: 'PAID',
          step: 'RELEASED',
          stripeTransferId: null,
          disputedAt: null,
          cancellationRequestedAt: null,
          stripeRefundId: null,
          stripeTransferReversalId: null,
        },
      }),
    );
  });

  it('pays nothing while the declaration is incomplete, and does not even ask Stripe', async () => {
    const { service, prisma } = harness(INCOMPLETE);
    prisma.commande.findMany.mockResolvedValue([held]);

    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 0, failed: 0 });

    expect(fakePayments.findTransferBySource).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
  });

  it('pays a held order once, writes it with a compare-and-set and tells the réparateur', async () => {
    const { service, prisma, notifications } = harness(COMPLETE);
    prisma.commande.findMany.mockResolvedValue([held]);

    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 1, failed: 0 });

    expect(fakePayments.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 5000, sourceTransaction: 'ch_1' }),
      `release:${COMMANDE}`,
    );
    expect(prisma.commande.updateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE, status: 'PAID', step: 'RELEASED', stripeTransferId: null },
      data: { stripeTransferId: 'tr_new', transferredCents: 5000, transferredAt: expect.any(Date) },
    });
    expect(notifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({ userId: REPAIRER, type: 'FUNDS_RELEASED', amountCents: 5000, commandeId: COMMANDE }),
    );
  });

  it('does NOT create a second transfer when Stripe already holds one for the charge (the key expires after 24 h)', async () => {
    const { service, prisma } = harness(COMPLETE);
    prisma.commande.findMany.mockResolvedValue([held]);
    fakePayments.findTransferBySource.mockResolvedValue({ id: 'tr_old', amountCents: 5000 });

    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 1, failed: 0 });

    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(prisma.commande.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { stripeTransferId: 'tr_old', transferredCents: 5000, transferredAt: expect.any(Date) },
      }),
    );
  });

  it('stays silent when a concurrent sweep already wrote the row (compare-and-set matched nothing)', async () => {
    const { service, prisma, notifications } = harness(COMPLETE);
    prisma.commande.findMany.mockResolvedValue([held]);
    prisma.commande.updateMany.mockResolvedValue({ count: 0 });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 0, failed: 0 });

    expect(notifications.emit).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('counts a Stripe failure and carries on with the next order', async () => {
    const { service, prisma } = harness(COMPLETE);
    prisma.commande.findMany.mockResolvedValue([held, { ...held, id: 'other' }]);
    fakePayments.createTransfer.mockRejectedValueOnce(new Error('stripe down')).mockResolvedValueOnce({ id: 'tr_2' });
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 1, failed: 1 });
    error.mockRestore();
  });
});

describe('CommandesService.payoutHeldCommandes, the cron sweep (CMP-D3)', () => {
  it('visits each réparateur with a held order once, and sums what was paid', async () => {
    const { service, prisma } = harness(COMPLETE);
    prisma.commande.findMany
      .mockResolvedValueOnce([{ repairerUserId: 'rep-a' }, { repairerUserId: 'rep-b' }])
      // the two per-réparateur lookups inside payoutStrandedCommandes
      .mockResolvedValueOnce([{ id: 'o1', repairCents: 100, stripeChargeId: 'ch_1', demande: { title: 'A' } }])
      .mockResolvedValueOnce([]);

    const res = await service.payoutHeldCommandes();

    expect(prisma.commande.findMany.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ distinct: ['repairerUserId'], select: { repairerUserId: true } }),
    );
    expect(res).toEqual({ scanned: 2, acted: 1, failed: 0 });
  });

  it('one réparateur throwing does not stop the others', async () => {
    const { service, prisma } = harness(COMPLETE);
    prisma.commande.findMany
      .mockResolvedValueOnce([{ repairerUserId: 'rep-a' }, { repairerUserId: 'rep-b' }])
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce([]);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await service.payoutHeldCommandes();

    expect(res).toEqual({ scanned: 2, acted: 0, failed: 1 });
    expect(prisma.commande.findMany).toHaveBeenCalledTimes(3);
    error.mockRestore();
  });
});
