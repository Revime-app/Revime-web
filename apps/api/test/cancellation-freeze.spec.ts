import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandesService } from '../src/commandes/commandes.service.js';
import { CronService } from '../src/cron/cron.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * CF4-27 (spec §4.3, Review Focus 3). The freeze: while `Commande.cancellationRequestedAt` is
 * set, `advance` (both roles), `submitShippingAddress` and `release()`/`releaseInternal` all
 * refuse with `CANCELLATION_PENDING`; `autoRelease`'s query excludes flagged rows;
 * `advanceBySystem` still advances. Env-var setup follows `payments-checkout-suspension.spec.ts`
 * / `connect-config.spec.ts` for `arePaymentsEnabled()` / `isConnectEnabled()`.
 */

const KEYS = [
  'PAYMENTS_ENABLED',
  'STRIPE_DRIVER',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
  'CONNECT_ENABLED',
  'STRIPE_CONNECT_WEBHOOK_SECRET',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'http://localhost:3002';
  process.env.CONNECT_ENABLED = 'true';
  process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_connect_test';
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

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected the call to reject with an AppException');
}

function bodyOf(error: AppException): { message: string } {
  return error.getResponse() as { message: string };
}

const CANCELLATION_PENDING = "Une demande d'annulation est en cours.";

describe('CommandesService.advance - frozen while a cancellation is pending', () => {
  function harness(cancellationRequestedAt: Date | null) {
    const row = {
      id: COMMANDE,
      demandeId: 'd1',
      status: 'PAID',
      step: 'PARCEL_RECEIVED',
      delivery: 'PARCEL',
      clientUserId: CLIENT,
      repairerUserId: REPAIRER,
      outboundTrackingNumber: 'TRACK1',
      returnTrackingNumber: null,
      returnSentAt: null,
      cancellationRequestedAt,
      disputedAt: null,
    };
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { commande: { updateMany: commandeUpdateMany }, commandeStepEvent: { create: vi.fn() } };
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue(row),
        updateMany: commandeUpdateMany,
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const announcer = { postSystemMessage: vi.fn(), announce: vi.fn() } as never;
    return { service: new CommandesService(prisma, notifications, announcer), commandeUpdateMany, notifications };
  }

  it('422s CANCELLATION_PENDING for the réparateur claiming the next step, no write, no notification', async () => {
    const { service, commandeUpdateMany, notifications } = harness(new Date());
    const error = await rejection(
      service.advance(REPAIRER, COMMANDE, { step: 'REPAIR_STARTED' }),
    );
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe(CANCELLATION_PENDING);
    expect(commandeUpdateMany).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
  });

  it('422s CANCELLATION_PENDING for the client too', async () => {
    const { service, commandeUpdateMany } = harness(new Date());
    const error = await rejection(service.advance(CLIENT, COMMANDE, { step: 'REPAIR_STARTED' }));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe(CANCELLATION_PENDING);
    expect(commandeUpdateMany).not.toHaveBeenCalled();
  });

  it('the write path still runs when the flag is null (guard does not misfire)', async () => {
    const { service, commandeUpdateMany } = harness(null);
    // A notification lookup follows the write; not asserted here, only that the CAS
    // write itself was reached and ran - the freeze guard's negative case.
    await service.advance(REPAIRER, COMMANDE, { step: 'REPAIR_STARTED' }).catch(() => {});
    expect(commandeUpdateMany).toHaveBeenCalledTimes(1);
  });
});

// Whole-branch review fix pass, Issue 2 (regression guard for Review Focus 3's own claim):
// the plan states `advanceBySystem(PARCEL_SENT)` still advances while a cancellation is
// pending - carrier scans are unaffected by the freeze. `advanceBySystem` never reads
// `cancellationRequestedAt` at all, confirmed by reading it; this pins that as a behaviour
// rather than an absence of a guard nobody added yet.
describe('CommandesService.advanceBySystem - NOT frozen by a pending cancellation', () => {
  it('still advances PARCEL_SENT while cancellationRequestedAt is set', async () => {
    const row = {
      id: COMMANDE,
      demandeId: 'd1',
      status: 'PAID',
      step: 'PAID',
      delivery: 'PARCEL',
      clientUserId: CLIENT,
      repairerUserId: REPAIRER,
      outboundTrackingNumber: 'TRACK1',
      returnTrackingNumber: null,
      // The freeze flag is set, and the write below still succeeds - the point of the test.
      cancellationRequestedAt: new Date(),
    };
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { commande: { updateMany: commandeUpdateMany }, commandeStepEvent: { create: vi.fn() } };
    const prisma = {
      commande: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce(row)
          .mockResolvedValueOnce({ demande: { title: 'iPhone 13' } }),
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const announcer = { postSystemMessage: vi.fn(), announce: vi.fn() } as never;
    const service = new CommandesService(prisma, notifications, announcer);

    const result = await service.advanceBySystem(COMMANDE, 'PARCEL_SENT');

    expect(result).toBe('advanced');
    expect(commandeUpdateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE, status: 'PAID', step: 'PAID' },
      data: { step: 'PARCEL_SENT' },
    });
  });
});

describe('CommandesService.submitShippingAddress - frozen while a cancellation is pending', () => {
  function harness(cancellationRequestedAt: Date | null) {
    const row = {
      id: COMMANDE,
      status: 'PAID',
      step: 'PAID',
      delivery: 'PARCEL',
      clientUserId: CLIENT,
      outboundTrackingNumber: null,
      parcelOption: null,
      cancellationRequestedAt,
    };
    const upsert = vi.fn().mockResolvedValue(undefined);
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue(row),
        findUnique: vi.fn().mockResolvedValue({
          demande: { title: 'iPhone 13' },
          client: { name: 'Alice', firstName: null, lastName: null },
          repairer: { name: 'Bob', firstName: null, lastName: null },
          shippingAddresses: [],
          outboundTrackingNumber: null,
        }),
      },
      shippingAddress: { upsert },
      conversation: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const announcer = {} as never;
    return { service: new CommandesService(prisma, notifications, announcer), upsert };
  }

  const input = {
    line1: '1 rue Test',
    postalCode: '75001',
    city: 'Paris',
    phone: '+33612345678',
  };

  it('422s CANCELLATION_PENDING before any write (so the controller never reaches afterAddressWrite)', async () => {
    const { service, upsert } = harness(new Date());
    const error = await rejection(service.submitShippingAddress(CLIENT, COMMANDE, input));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe(CANCELLATION_PENDING);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('behaves as today when the flag is null', async () => {
    const { service, upsert } = harness(null);
    // NOT_PARCEL etc. guards run after; PARCEL delivery here reaches the write.
    await service.submitShippingAddress(CLIENT, COMMANDE, input).catch(() => {});
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});

describe('CommandesService.release / releaseInternal - frozen while a cancellation is pending', () => {
  function harness(cancellationRequestedAt: Date | null) {
    const row = {
      id: COMMANDE,
      status: 'PAID',
      step: 'AWAITING_VALIDATION',
      repairCents: 5000,
      stripeChargeId: 'ch_1',
      stripeTransferId: null,
      disputedAt: null,
      stripeRefundId: null,
      stripeTransferReversalId: null,
      clientUserId: CLIENT,
      repairerUserId: REPAIRER,
      demandeId: 'd1',
      repairer: { banned: false },
      demande: { title: 'iPhone 13' },
      cancellationRequestedAt,
    };
    const owner = { clientUserId: CLIENT };
    const findFirst = vi.fn().mockResolvedValue(owner);
    const findUnique = vi.fn().mockResolvedValue(row);
    // V8 B2: with no Connect account the release now HOLDS the payout instead of refusing, so the
    // stub carries what that path writes (the step, its event) and reads (the fiscal profile).
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { commande: { updateMany }, commandeStepEvent: { create: vi.fn() } };
    const prisma = {
      commande: { findFirst, findUnique },
      connectAccount: { findUnique: vi.fn().mockResolvedValue(null) },
      repairerProfile: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const announcer = { announce: vi.fn() } as never;
    return { service: new CommandesService(prisma, notifications, announcer), updateMany };
  }

  it('release() 422s CANCELLATION_PENDING, checked beside disputedAt, no Stripe call', async () => {
    const { service } = harness(new Date());
    const error = await rejection(service.release(CLIENT, COMMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe(CANCELLATION_PENDING);
  });

  it('releaseInternal 422s CANCELLATION_PENDING directly', async () => {
    const { service } = harness(new Date());
    const error = await rejection(service.releaseInternal(COMMANDE));
    expect(error.getStatus()).toBe(422);
    expect(bodyOf(error).message).toBe(CANCELLATION_PENDING);
  });

  // V8 B2 (amended): « no Connect account » used to 422 REPAIRER_NOT_PAYABLE here, which is what
  // proved the cancellation guard had not fired. That refusal is gone; without a pending
  // cancellation the release now goes through and HOLDS the payout, which proves the same thing.
  it('behaves as today when the flag is null: not frozen, the release goes through (held: no Connect account)', async () => {
    const { service, updateMany } = harness(null);
    expect(await service.releaseInternal(COMMANDE)).toBe('released');
    expect(updateMany).toHaveBeenCalledTimes(1);
  });
});

describe('CronService.autoRelease - excludes a frozen commande', () => {
  it("the findMany where includes cancellationRequestedAt: null", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { commande: { findMany } } as unknown as PrismaService;
    const commandes = { releaseInternal: vi.fn() } as unknown as CommandesService;
    const service = new CronService(
      prisma,
      commandes,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never, // FiscalService (CMP-D3), unused here
      {} as never, // SetupRemindersService (V8 E1), unused here
    );

    // Calling the private method directly (cast) is deliberate: run() drives every other
    // job too, each needing its own stubs and adding seconds for no assertion this test
    // makes. autoRelease is the one job whose query this task changes.
    await (service as unknown as { autoRelease(): Promise<unknown> }).autoRelease();

    expect(findMany).toHaveBeenCalledTimes(1);
    const call = findMany.mock.calls[0]![0] as { where: Record<string, unknown> };
    expect(call.where.cancellationRequestedAt).toBe(null);
  });
});
