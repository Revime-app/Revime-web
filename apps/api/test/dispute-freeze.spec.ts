import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandesService } from '../src/commandes/commandes.service.js';
import { AppException } from '../src/common/app-exception.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

/**
 * CF5-04. Production `#CMD-A9DB011E`: three steps were claimed while `#LIT-0006` was open.
 * While `Commande.disputedAt` is set (app dispute or Stripe chargeback), `advance` refuses for
 * both roles, and the CAS write itself carries `disputedAt: null` so a dispute opened between
 * the read and the write still blocks it. `advanceBySystem` (carrier scans) keeps recording -
 * the proposal sent to the client as Q1. Harness shape follows `cancellation-freeze.spec.ts`.
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
const DISPUTE_OPEN = "Un litige est en cours : l'étape de la commande ne peut pas être modifiée.";

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppException) return error;
    throw error;
  }
  throw new Error('expected the call to reject with an AppException');
}

const message = (e: AppException) => (e.getResponse() as { message: string }).message;

describe('CommandesService.advance - frozen while a dispute is open (CF5-04)', () => {
  function harness(disputedAt: Date | null, step = 'PARCEL_RECEIVED') {
    const row = {
      id: COMMANDE,
      demandeId: 'd1',
      status: 'PAID',
      step,
      delivery: 'PARCEL',
      clientUserId: CLIENT,
      repairerUserId: REPAIRER,
      outboundTrackingNumber: 'TRACK1',
      returnTrackingNumber: 'TRACK2',
      returnSentAt: null,
      cancellationRequestedAt: null,
      disputedAt,
    };
    const findFirst = vi.fn().mockResolvedValue(row);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { commande: { updateMany }, commandeStepEvent: { create: vi.fn() } };
    const prisma = {
      commande: { findFirst, updateMany },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    } as unknown as PrismaService;
    const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const announcer = { postSystemMessage: vi.fn(), announce: vi.fn() } as never;
    return { service: new CommandesService(prisma, notifications, announcer), findFirst, updateMany, notifications, announcer };
  }

  it('reads disputedAt', async () => {
    const { service, findFirst } = harness(null);
    await service.advance(REPAIRER, COMMANDE, { step: 'REPAIR_STARTED' }).catch(() => {});
    expect(findFirst.mock.calls[0]![0].select.disputedAt).toBe(true);
  });

  it('422s for the réparateur claiming the next step: no write, no notification, no chat line', async () => {
    const { service, updateMany, notifications, announcer } = harness(new Date());
    const error = await rejection(service.advance(REPAIRER, COMMANDE, { step: 'REPAIR_STARTED' }));
    expect(error.getStatus()).toBe(422);
    expect(message(error)).toBe(DISPUTE_OPEN);
    expect(updateMany).not.toHaveBeenCalled();
    expect(notifications.emit).not.toHaveBeenCalled();
    expect((announcer as { postSystemMessage: ReturnType<typeof vi.fn> }).postSystemMessage).not.toHaveBeenCalled();
  });

  it('422s with the same message for the client (a client-claimed step)', async () => {
    const { service, updateMany } = harness(new Date(), 'RETURN_SENT');
    const error = await rejection(service.advance(CLIENT, COMMANDE, { step: 'RETURN_RECEIVED' }));
    expect(error.getStatus()).toBe(422);
    expect(message(error)).toBe(DISPUTE_OPEN);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('the CAS write requires disputedAt: null, so a dispute opened mid-request still blocks it', async () => {
    const { service, updateMany } = harness(null);
    await service.advance(REPAIRER, COMMANDE, { step: 'REPAIR_STARTED' }).catch(() => {});
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0]![0].where).toEqual({
      id: COMMANDE,
      status: 'PAID',
      step: 'PARCEL_RECEIVED',
      disputedAt: null,
    });
  });
});

describe('CommandesService.advanceBySystem - carrier scans still recorded during a dispute (CF5-04, Q1)', () => {
  it('advances PARCEL_SENT while disputedAt is set', async () => {
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
      disputedAt: new Date(),
    };
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { commande: { updateMany }, commandeStepEvent: { create: vi.fn() } };
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

    expect(await service.advanceBySystem(COMMANDE, 'PARCEL_SENT')).toBe('advanced');
  });
});
