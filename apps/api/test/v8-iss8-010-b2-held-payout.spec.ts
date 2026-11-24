import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandesService } from '../src/commandes/commandes.service.js';
import { CronService } from '../src/cron/cron.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * V8 ISS8-010, the two B2 behaviours `AUD8-F6` found without a test (CLIENT_FEEDBACK_V8.md §4 B2
 * « Test coverage »):
 *
 *  (a) a NO-ACCOUNT held order is paid by `payoutStrandedCommandes` once the réparateur's Connect
 *      account exists and activates. `commandes-fiscal-payout.spec.ts` only pays held rows for a
 *      réparateur who already HAD an account; here the same row goes from « no account » through
 *      « account, not active » to « active », and is paid exactly at the last step. The trigger that
 *      calls it on the first activation is tested in `connect-service.spec.ts`.
 *  (b) the cron's `autoRelease` on a no-account réparateur: it holds the money instead of being
 *      refused (production order a5c6ceba, V8 FND8-015, would otherwise sit for ever).
 *
 * The row is ONE in-memory object that every write goes through, so the hold written by the release
 * is the row the payout later reads: the two halves are joined by state, not by two separate stubs.
 * Reads return copies (a shared reference would let a later write leak into an earlier read).
 */

const fakePayments = {
  createTransfer: vi.fn(),
  findTransferBySource: vi.fn(),
  retrieveRefund: vi.fn(),
};
const fakeConnect = { retrieveAccount: vi.fn() };

vi.mock('../src/payments/gateway.js', () => ({ paymentsGateway: () => fakePayments }));
vi.mock('../src/connect/gateway.js', () => ({ connectGateway: () => fakeConnect }));

// Every variable `arePaymentsEnabled()` and `isConnectEnabled()` read, set here. V8 ISS8-021: this spec
// first set only the two `_ENABLED` flags; locally `apps/api/.env` supplied the other three, CI has no
// `.env`, so `releaseInternal` returned 'skipped' there (the same trap as ISS8-015).
const KEYS = [
  'PAYMENTS_ENABLED',
  'CONNECT_ENABLED',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
  'STRIPE_DRIVER',
  'STRIPE_SECRET_KEY',
];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.CONNECT_ENABLED = 'true';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_test';
  process.env.PUBLIC_API_URL = 'http://localhost:3002';
  // The gateways are mocked below. Driver and key are cleared TOGETHER: a key without the `stripe`
  // driver is the « contradiction » both switches refuse, and that is what a local `.env` (driver
  // `stripe` + a test key) became when only the driver was cleared. With neither, the run is the same
  // locally and on CI.
  delete process.env.STRIPE_DRIVER;
  delete process.env.STRIPE_SECRET_KEY;
  vi.resetAllMocks();
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

/** Fiscal information complete, so the only thing holding the money is the Connect account. */
const FISCAL_COMPLETE = {
  kind: 'INDIVIDUAL',
  fiscalCompletedAt: new Date('2026-10-01T00:00:00Z'),
  user: { profile: { verificationLevel: 'IDENTITY' }, businessVerification: null },
};

type Row = Record<string, unknown> & { step: string; stripeTransferId: string | null };

/** Does `row` satisfy a flat Prisma `where` of equalities (the only shape these writes use)? */
function matches(row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => row[k] === v);
}

function harness() {
  const row: Row = {
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
  /** The réparateur's Connect row: null until he opens « Virements ». */
  let connectRow: { stripeAccountId: string } | null = null;

  const updateMany = vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
    if (!matches(row, where)) return { count: 0 };
    Object.assign(row, data);
    return { count: 1 };
  });
  const tx = { commande: { updateMany }, commandeStepEvent: { create: vi.fn() } };
  const prisma = {
    commande: {
      findUnique: vi.fn(async () => ({ ...row })),
      // Two readers: the cron's due query (AWAITING_VALIDATION) and the held-payout query (RELEASED,
      // no transfer). Each gets the row only when the row is in the state its `where` asks for.
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const { releaseRequestedAt: _ignored, ...equalities } = where;
        return matches(row, equalities) ? [{ ...row }] : [];
      }),
      updateMany,
    },
    connectAccount: { findUnique: vi.fn(async () => (connectRow ? { ...connectRow } : null)) },
    repairerProfile: { findUnique: vi.fn().mockResolvedValue(FISCAL_COMPLETE) },
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
  return {
    service,
    prisma,
    row,
    notifications,
    openVirements: (stripeAccountId: string) => {
      connectRow = { stripeAccountId };
    },
  };
}

describe('V8 ISS8-010 (a): a no-account held order is paid once the Connect account exists and activates', () => {
  it('holds at validation, pays nothing while there is no account or it is inactive, then pays it once on activation', async () => {
    const { service, row, notifications, openVirements } = harness();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // 1. The client validates; the réparateur has never opened « Virements ». Held, not refused.
    expect(await service.releaseInternal(COMMANDE)).toBe('released');
    expect(row).toMatchObject({ step: 'RELEASED', stripeTransferId: null });
    expect(row).not.toHaveProperty('transferredAt');
    expect(notifications.emit.mock.calls.map(([e]) => [e.userId, e.type])).toEqual([
      [CLIENT, 'FUNDS_RELEASED'],
      [REPAIRER, 'PAYOUT_WAITING'],
    ]);
    notifications.emit.mockClear();

    // 2. A sweep while there is still no account: nothing paid, Stripe not even asked.
    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 0, failed: 0 });
    expect(fakeConnect.retrieveAccount).not.toHaveBeenCalled();

    // 3. He opens « Virements »: the account exists but Stripe has not activated transfers yet.
    openVirements('acct_new');
    fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: false });
    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 0, failed: 0 });
    expect(fakeConnect.retrieveAccount).toHaveBeenCalledWith('acct_new');

    // Nothing has moved so far, at any step.
    expect(fakePayments.findTransferBySource).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(row.stripeTransferId).toBeNull();
    expect(notifications.emit).not.toHaveBeenCalled();

    // 4. Stripe activates transfers: the held order is paid, to the new account, from the client's charge.
    fakeConnect.retrieveAccount.mockResolvedValue({ transfersActive: true });
    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 1, failed: 0 });
    expect(fakePayments.createTransfer).toHaveBeenCalledTimes(1);
    expect(fakePayments.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({ amountCents: 5000, destination: 'acct_new', sourceTransaction: 'ch_1' }),
      `release:${COMMANDE}`,
    );
    expect(row).toMatchObject({
      step: 'RELEASED',
      stripeTransferId: 'tr_new',
      transferredCents: 5000,
      transferredAt: expect.any(Date),
    });
    expect(notifications.emit.mock.calls.map(([e]) => [e.userId, e.type, e.amountCents, e.commandeId])).toEqual([
      [REPAIRER, 'FUNDS_RELEASED', 5000, COMMANDE],
    ]);

    // 5. A later sweep (the cron's `heldPayouts`, a second activation event) finds nothing left to pay.
    expect(await service.payoutStrandedCommandes(REPAIRER)).toEqual({ paid: 0, failed: 0 });
    expect(fakePayments.createTransfer).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});

describe('V8 ISS8-010 (b): the cron auto-release with a no-account réparateur', () => {
  function cronOver(commandes: CommandesService, prisma: unknown) {
    return new CronService(
      prisma as PrismaService,
      commandes,
      {} as never, // PaymentsService, unused by autoRelease
      {} as never, // ShipmentsService
      {} as never, // PushService
      {} as never, // UsersService
      {} as never, // QuoteRequestsService
      {} as never, // FiscalService (CMP-D3)
      {} as never, // SetupRemindersService (V8 E1)
    );
  }

  it('holds the money and counts the order as acted, not refused: no Stripe call, the réparateur told his payment waits', async () => {
    const { service, prisma, row, notifications } = harness();
    const cron = cronOver(service, prisma);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // Calling the private job directly, as cancellation-freeze.spec.ts does: run() drives every other
    // job too, each needing its own stubs, for no assertion this test makes.
    const result = await (cron as unknown as { autoRelease(): Promise<unknown> }).autoRelease();

    expect(result).toEqual({ scanned: 1, acted: 1, failed: 0 });
    // Before V8 B2 this was an AppException (« Le réparateur ne peut pas encore recevoir de
    // paiement. »), which the job logs as « auto-release refused » and leaves the order where it was.
    expect(warn.mock.calls.some(([msg]) => String(msg).includes('auto-release refused'))).toBe(false);
    expect(fakeConnect.retrieveAccount).not.toHaveBeenCalled();
    expect(fakePayments.findTransferBySource).not.toHaveBeenCalled();
    expect(fakePayments.createTransfer).not.toHaveBeenCalled();
    expect(row).toMatchObject({ step: 'RELEASED', stripeTransferId: null });
    expect(row).not.toHaveProperty('transferredAt');
    expect(notifications.emit.mock.calls.map(([e]) => [e.userId, e.type, e.amountCents])).toEqual([
      [CLIENT, 'FUNDS_RELEASED', 5000],
      [REPAIRER, 'PAYOUT_WAITING', 5000],
    ]);

    // The cron then finds nothing more to release on the next run: the order left AWAITING_VALIDATION.
    expect(await (cron as unknown as { autoRelease(): Promise<unknown> }).autoRelease()).toEqual({
      scanned: 0,
      acted: 0,
      failed: 0,
    });
    warn.mockRestore();
  });
});
