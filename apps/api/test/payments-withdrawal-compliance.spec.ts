import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { LEGAL_WITHDRAWAL_WAIVER_TEXT } from '@revime/shared';
import { PaymentsService } from '../src/payments/payments.service.js';
import { paymentsGateway, __resetPaymentsGateway } from '../src/payments/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';
import { AppException } from '../src/common/app-exception.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const OFFER = '44444444-4444-4444-8444-444444444444';
const DEMANDE = '55555555-5555-4555-8555-555555555555';
const COMMANDE = '66666666-6666-4666-8666-666666666666';

const KEYS = [
  'PAYMENTS_ENABLED',
  'STRIPE_DRIVER',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'PUBLIC_API_URL',
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  process.env.PAYMENTS_ENABLED = 'true';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  process.env.PUBLIC_API_URL = 'http://localhost:3002';
  __resetPaymentsGateway();
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  __resetPaymentsGateway();
});

function buildSignedEvent(event: {
  id: string;
  type: string;
  object: Record<string, unknown>;
}): { raw: Buffer; signature: string } {
  const payload = JSON.stringify({
    id: event.id,
    type: event.type,
    data: { object: event.object },
  });
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload,
    secret: 'whsec_test',
  });
  return { raw: Buffer.from(payload), signature };
}

describe('PaymentsService - right of withdrawal compliance', () => {
  it('BUSINESS repairer + delayPreference: IMMEDIATE without waiver throws 422 UNPROCESSABLE_ENTITY', async () => {
    const offerFindFirst = vi.fn().mockResolvedValue({
      id: OFFER,
      status: 'SENT',
      priceCents: 5000,
      acceptsParcel: false,
      repairerUserId: REPAIRER,
      demandeId: DEMANDE,
      demande: { status: 'OPEN', author: { email: 'client@example.test' } },
      repairer: {
        profile: {
          verificationLevel: 'BUSINESS',
          repairerSuspendedAt: null,
        },
      },
    });

    const commandeCreate = vi.fn().mockResolvedValue({ id: COMMANDE });
    const prisma = {
      offer: { findFirst: offerFindFirst },
      commande: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: commandeCreate,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;
    const service = new PaymentsService(prisma, notifications, conversations);

    await expect(
      service.createCheckout(CLIENT, OFFER, {
        delivery: 'WORKSHOP',
        delayPreference: 'IMMEDIATE',
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      message:
        "L'accord préalable et exprès de renonciation au droit de rétractation est obligatoire pour démarrer la réparation immédiatement auprès d'un professionnel.",
    });

    expect(commandeCreate).not.toHaveBeenCalled();
  });

  it('BUSINESS repairer + delayPreference: IMMEDIATE with altered waiver text throws 422 UNPROCESSABLE_ENTITY', async () => {
    const offerFindFirst = vi.fn().mockResolvedValue({
      id: OFFER,
      status: 'SENT',
      priceCents: 5000,
      acceptsParcel: false,
      repairerUserId: REPAIRER,
      demandeId: DEMANDE,
      demande: { status: 'OPEN', author: { email: 'client@example.test' } },
      repairer: {
        profile: {
          verificationLevel: 'BUSINESS',
          repairerSuspendedAt: null,
        },
      },
    });

    const commandeCreate = vi.fn().mockResolvedValue({ id: COMMANDE });
    const prisma = {
      offer: { findFirst: offerFindFirst },
      commande: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: commandeCreate,
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;
    const service = new PaymentsService(prisma, notifications, conversations);

    await expect(
      service.createCheckout(CLIENT, OFFER, {
        delivery: 'WORKSHOP',
        delayPreference: 'IMMEDIATE',
        withdrawalWaiver: {
          accepted: true,
          acceptedAt: new Date().toISOString(),
          acceptedText: 'Altered waiver text that does not match the legal requirement',
        } as any,
      }),
    ).rejects.toMatchObject({
      status: 422,
      code: 'UNPROCESSABLE_ENTITY',
      message:
        "L'accord préalable et exprès de renonciation au droit de rétractation est obligatoire pour démarrer la réparation immédiatement auprès d'un professionnel.",
    });

    expect(commandeCreate).not.toHaveBeenCalled();
  });

  it('BUSINESS repairer + delayPreference: IMMEDIATE with valid waiver creates commande with persisted waiver proof', async () => {
    const offerFindFirst = vi.fn().mockResolvedValue({
      id: OFFER,
      status: 'SENT',
      priceCents: 5000,
      acceptsParcel: false,
      repairerUserId: REPAIRER,
      demandeId: DEMANDE,
      demande: { status: 'OPEN', author: { email: 'client@example.test' } },
      repairer: {
        profile: {
          verificationLevel: 'BUSINESS',
          repairerSuspendedAt: null,
        },
      },
    });

    const acceptedAtStr = '2026-10-06T12:00:00.000Z';
    const commandeCreate = vi.fn().mockResolvedValue({ id: COMMANDE });
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      offer: { findFirst: offerFindFirst },
      commande: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: commandeCreate,
        updateMany: commandeUpdateMany,
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;
    const service = new PaymentsService(prisma, notifications, conversations);

    const result = await service.createCheckout(CLIENT, OFFER, {
      delivery: 'WORKSHOP',
      delayPreference: 'IMMEDIATE',
      withdrawalWaiver: {
        accepted: true,
        acceptedAt: acceptedAtStr,
        acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      },
    });

    expect(result.commandeId).toBe(COMMANDE);
    expect(commandeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionDelayPreference: 'IMMEDIATE',
        withdrawalWaiverAcceptedAt: new Date(acceptedAtStr),
        withdrawalWaiverText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      }),
      select: { id: true },
    });
  });

  it('BUSINESS repairer + delayPreference: WAIT_14_DAYS without waiver creates commande with executionDelayPreference: WAIT_14_DAYS and null waiver proof', async () => {
    const offerFindFirst = vi.fn().mockResolvedValue({
      id: OFFER,
      status: 'SENT',
      priceCents: 5000,
      acceptsParcel: false,
      repairerUserId: REPAIRER,
      demandeId: DEMANDE,
      demande: { status: 'OPEN', author: { email: 'client@example.test' } },
      repairer: {
        profile: {
          verificationLevel: 'BUSINESS',
          repairerSuspendedAt: null,
        },
      },
    });

    const commandeCreate = vi.fn().mockResolvedValue({ id: COMMANDE });
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      offer: { findFirst: offerFindFirst },
      commande: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: commandeCreate,
        updateMany: commandeUpdateMany,
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;
    const service = new PaymentsService(prisma, notifications, conversations);

    const result = await service.createCheckout(CLIENT, OFFER, {
      delivery: 'WORKSHOP',
      delayPreference: 'WAIT_14_DAYS',
      withdrawalWaiver: null,
    });

    expect(result.commandeId).toBe(COMMANDE);
    expect(commandeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionDelayPreference: 'WAIT_14_DAYS',
        withdrawalWaiverAcceptedAt: null,
        withdrawalWaiverText: null,
      }),
      select: { id: true },
    });
  });

  it('IDENTITY / non-pro repairer creates commande without requiring waiver', async () => {
    const offerFindFirst = vi.fn().mockResolvedValue({
      id: OFFER,
      status: 'SENT',
      priceCents: 5000,
      acceptsParcel: false,
      repairerUserId: REPAIRER,
      demandeId: DEMANDE,
      demande: { status: 'OPEN', author: { email: 'client@example.test' } },
      repairer: {
        profile: {
          verificationLevel: 'IDENTITY',
          repairerSuspendedAt: null,
        },
      },
    });

    const commandeCreate = vi.fn().mockResolvedValue({ id: COMMANDE });
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const prisma = {
      offer: { findFirst: offerFindFirst },
      commande: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: commandeCreate,
        updateMany: commandeUpdateMany,
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;
    const service = new PaymentsService(prisma, notifications, conversations);

    const result = await service.createCheckout(CLIENT, OFFER, {
      delivery: 'WORKSHOP',
      delayPreference: 'IMMEDIATE',
    });

    expect(result.commandeId).toBe(COMMANDE);
    expect(commandeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionDelayPreference: 'IMMEDIATE',
        withdrawalWaiverAcceptedAt: null,
        withdrawalWaiverText: null,
      }),
      select: { id: true },
    });
  });

  it('payment_intent.succeeded webhook sets withdrawalPeriodEndsAt to paidAt + 14 days if executionDelayPreference === WAIT_14_DAYS', async () => {
    const gateway = paymentsGateway();
    const seededIntent = await gateway.createPaymentIntent({
      commandeId: COMMANDE,
      demandeId: DEMANDE,
      offerId: OFFER,
      customerEmail: 'client@example.test',
      amountCents: 5515,
      metadata: { commandeId: COMMANDE, demandeId: DEMANDE, offerId: OFFER },
    });
    const intentId = seededIntent.id;
    const chargeId = 'ch_test_wait_14_days';
    (gateway as any).markPaymentIntentSucceeded(intentId, chargeId);

    const commandeFindFirst = vi.fn().mockResolvedValue({
      id: COMMANDE,
      status: 'PENDING_PAYMENT',
      demandeId: DEMANDE,
      offerId: OFFER,
      repairerUserId: REPAIRER,
      clientUserId: CLIENT,
      repairCents: 5000,
      delivery: 'WORKSHOP',
      parcelOption: null,
      insuranceCents: 0,
      shippingQuoteId: null,
      shippingQuote: null,
      executionDelayPreference: 'WAIT_14_DAYS',
    });

    const txCommandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txOfferUpdate = vi.fn().mockResolvedValue({});
    const txOfferUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const txDemandeUpdate = vi.fn().mockResolvedValue({});
    const txCommandeStepEventCreate = vi.fn().mockResolvedValue({});

    const txPrisma = {
      commande: { updateMany: txCommandeUpdateMany },
      offer: { update: txOfferUpdate, updateMany: txOfferUpdateMany },
      demande: { update: txDemandeUpdate },
      commandeStepEvent: { create: txCommandeStepEventCreate },
    };

    const $transaction = vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txPrisma));

    const prisma = {
      stripeEvent: {
        create: vi.fn().mockResolvedValue({ id: 'evt_wait_14', type: 'payment_intent.succeeded' }),
        delete: vi.fn().mockResolvedValue({}),
      },
      commande: { findFirst: commandeFindFirst },
      offer: { findMany: vi.fn().mockResolvedValue([]) },
      demande: { findFirst: vi.fn().mockResolvedValue({ title: 'Demande Test', author: { username: 'client1' } }) },
      $transaction,
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn().mockResolvedValue(undefined) } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn().mockResolvedValue(undefined) } as unknown as ConversationsService;
    const service = new PaymentsService(prisma, notifications, conversations);

    const { raw, signature } = buildSignedEvent({
      id: 'evt_wait_14',
      type: 'payment_intent.succeeded',
      object: {
        id: intentId,
        latest_charge: chargeId,
      },
    });

    const beforeTime = Date.now();
    await service.handleWebhook(raw, signature);
    const afterTime = Date.now();

    expect(txCommandeUpdateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE, status: 'PENDING_PAYMENT' },
      data: expect.objectContaining({
        status: 'PAID',
        step: 'PAID',
        stripePaymentIntentId: intentId,
        stripeChargeId: chargeId,
        withdrawalPeriodEndsAt: expect.any(Date),
      }),
    });

    const updateCall = txCommandeUpdateMany.mock.calls[0]![0];
    const withdrawalPeriodEndsAt = (updateCall.data as any).withdrawalPeriodEndsAt as Date;
    const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
    expect(withdrawalPeriodEndsAt.getTime()).toBeGreaterThanOrEqual(beforeTime + fourteenDaysMs - 1000);
    expect(withdrawalPeriodEndsAt.getTime()).toBeLessThanOrEqual(afterTime + fourteenDaysMs + 1000);
  });

  it('resolvePending invalidates pending intent and creates a new commande when delayPreference changes', async () => {
    const gateway = paymentsGateway();
    const cancelPaymentIntentSpy = vi.spyOn(gateway, 'cancelPaymentIntent');
    const seededIntent = await gateway.createPaymentIntent({
      commandeId: COMMANDE,
      demandeId: DEMANDE,
      offerId: OFFER,
      customerEmail: 'client@example.test',
      amountCents: 5515,
      metadata: { commandeId: COMMANDE, demandeId: DEMANDE, offerId: OFFER },
    });

    const offerFindFirst = vi.fn().mockResolvedValue({
      id: OFFER,
      status: 'SENT',
      priceCents: 5000,
      acceptsParcel: false,
      repairerUserId: REPAIRER,
      demandeId: DEMANDE,
      demande: { status: 'OPEN', author: { email: 'client@example.test' } },
      repairer: {
        profile: {
          verificationLevel: 'BUSINESS',
          repairerSuspendedAt: null,
        },
      },
    });

    // Stale pending commande was WAIT_14_DAYS
    const commandeFindFirst = vi.fn().mockResolvedValue({
      id: COMMANDE,
      offerId: OFFER,
      stripePaymentIntentId: seededIntent.id,
      stripeSessionId: null,
      delivery: 'WORKSHOP',
      parcelOption: null,
      insuranceCents: 0,
      shippingQuoteId: null,
      executionDelayPreference: 'WAIT_14_DAYS',
      createdAt: new Date(),
    });

    const NEW_COMMANDE = '77777777-7777-4777-8777-777777777777';
    const commandeCreate = vi.fn().mockResolvedValue({ id: NEW_COMMANDE });
    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });

    const prisma = {
      offer: { findFirst: offerFindFirst },
      commande: {
        findFirst: commandeFindFirst,
        create: commandeCreate,
        updateMany: commandeUpdateMany,
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;
    const service = new PaymentsService(prisma, notifications, conversations);

    // Client switches to IMMEDIATE with waiver
    const acceptedAtStr = '2026-10-06T12:00:00.000Z';
    const result = await service.createCheckout(CLIENT, OFFER, {
      delivery: 'WORKSHOP',
      delayPreference: 'IMMEDIATE',
      withdrawalWaiver: {
        accepted: true,
        acceptedAt: acceptedAtStr,
        acceptedText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      },
    });

    // Must cancel stale intent and abandon stale commande
    expect(cancelPaymentIntentSpy).toHaveBeenCalledWith(seededIntent.id);
    expect(commandeUpdateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });

    // Must create new commande with updated preference and waiver
    expect(commandeCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        executionDelayPreference: 'IMMEDIATE',
        withdrawalWaiverAcceptedAt: new Date(acceptedAtStr),
        withdrawalWaiverText: LEGAL_WITHDRAWAL_WAIVER_TEXT,
      }),
      select: { id: true },
    });
    expect(result.commandeId).toBe(NEW_COMMANDE);
  });
});
