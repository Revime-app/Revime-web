import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import { PaymentsService } from '../src/payments/payments.service.js';
import { paymentsGateway, __resetPaymentsGateway } from '../src/payments/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const LOSER_REPAIRER = '33333333-3333-4333-8333-333333333333';
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

describe('PaymentsService - PaymentIntent checkout and webhooks', () => {
  it('createCheckout generates a PaymentIntent via gateway, stores stripePaymentIntentId on the Commande, and returns paymentIntentClientSecret', async () => {
    const gateway = paymentsGateway();
    const createPaymentIntentSpy = vi.spyOn(gateway, 'createPaymentIntent');

    const offerFindFirst = vi.fn().mockResolvedValue({
      id: OFFER,
      status: 'SENT',
      priceCents: 5000,
      acceptsParcel: false,
      repairerUserId: REPAIRER,
      demandeId: DEMANDE,
      demande: { status: 'OPEN', author: { email: 'client@example.test' } },
      repairer: { profile: { repairerSuspendedAt: null } },
    });

    const commandeFindFirst = vi.fn().mockResolvedValue(null);
    const commandeCreate = vi.fn().mockResolvedValue({ id: COMMANDE });
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

    const result = await service.createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });

    expect(createPaymentIntentSpy).toHaveBeenCalledTimes(1);
    expect(createPaymentIntentSpy).toHaveBeenCalledWith({
      commandeId: COMMANDE,
      demandeId: DEMANDE,
      offerId: OFFER,
      customerEmail: 'client@example.test',
      amountCents: 5515,
      metadata: {
        commandeId: COMMANDE,
        demandeId: DEMANDE,
        offerId: OFFER,
      },
    });

    expect(commandeCreate).toHaveBeenCalledTimes(1);
    expect(commandeUpdateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE, status: 'PENDING_PAYMENT' },
      data: { stripePaymentIntentId: expect.stringMatching(/^pi_fake_/) },
    });

    expect(result).toMatchObject({
      paymentIntentClientSecret: expect.stringMatching(/^pi_fake_.*_secret_/),
      commandeId: COMMANDE,
    });
  });

  it('includes publishableKey when STRIPE_PUBLISHABLE_KEY env var is present', async () => {
    const prevKey = process.env.STRIPE_PUBLISHABLE_KEY;
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_sample_key';
    try {
      const offerFindFirst = vi.fn().mockResolvedValue({
        id: OFFER,
        status: 'SENT',
        priceCents: 5000,
        acceptsParcel: false,
        repairerUserId: REPAIRER,
        demandeId: DEMANDE,
        demande: { status: 'OPEN', author: { email: 'client@example.test' } },
        repairer: { profile: { repairerSuspendedAt: null } },
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

      const result = await service.createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });
      expect(result.publishableKey).toBe('pk_test_sample_key');
    } finally {
      if (prevKey === undefined) {
        delete process.env.STRIPE_PUBLISHABLE_KEY;
      } else {
        process.env.STRIPE_PUBLISHABLE_KEY = prevKey;
      }
    }
  });

  it('resolvePending reuses open stripePaymentIntentId if amounts and delivery match', async () => {
    const gateway = paymentsGateway();
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
      repairer: { profile: { repairerSuspendedAt: null } },
    });

    const commandeFindFirst = vi.fn().mockResolvedValue({
      id: COMMANDE,
      offerId: OFFER,
      stripePaymentIntentId: seededIntent.id,
      stripeSessionId: null,
      delivery: 'WORKSHOP',
      parcelOption: null,
      insuranceCents: 0,
      shippingQuoteId: null,
      createdAt: new Date(),
    });

    const commandeCreate = vi.fn();
    const prisma = {
      offer: { findFirst: offerFindFirst },
      commande: {
        findFirst: commandeFindFirst,
        create: commandeCreate,
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;

    const service = new PaymentsService(prisma, notifications, conversations);

    const result = await service.createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });

    expect(commandeCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      paymentIntentClientSecret: seededIntent.clientSecret,
      commandeId: COMMANDE,
    });
  });

  it('handleWebhook on payment_intent.succeeded marks Commande as PAID, Demande as IN_PROGRESS, offer as ACCEPTED, losers as DECLINED, and emits notifications', async () => {
    const gateway = paymentsGateway();
    const seeded = await gateway.createPaymentIntent({
      commandeId: COMMANDE,
      demandeId: DEMANDE,
      offerId: OFFER,
      customerEmail: 'client@example.test',
      amountCents: 5515,
      metadata: { commandeId: COMMANDE, demandeId: DEMANDE, offerId: OFFER },
    });
    const intentId = seeded.id;
    const chargeId = 'ch_charge_1';
    (gateway as any).markPaymentIntentSucceeded(intentId, chargeId);

    const stripeEventCreate = vi.fn().mockResolvedValue({ id: 'evt_pi_succ', type: 'payment_intent.succeeded' });

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
    });

    const losersFindMany = vi.fn().mockResolvedValue([{ repairerUserId: LOSER_REPAIRER }]);
    const demandeFindFirst = vi.fn().mockResolvedValue({
      title: 'Reparation Trottinette',
      author: { username: 'client_user' },
    });

    const txCommandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const txOfferUpdate = vi.fn().mockResolvedValue({});
    const txOfferUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
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
        create: stripeEventCreate,
        delete: vi.fn().mockResolvedValue({}),
      },
      commande: { findFirst: commandeFindFirst },
      offer: { findMany: losersFindMany },
      demande: { findFirst: demandeFindFirst },
      $transaction,
    } as unknown as PrismaService;

    const emit = vi.fn().mockResolvedValue(undefined);
    const notifications = { emit } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn().mockResolvedValue(undefined) } as unknown as ConversationsService;

    const service = new PaymentsService(prisma, notifications, conversations);

    const { raw, signature } = buildSignedEvent({
      id: 'evt_pi_succ',
      type: 'payment_intent.succeeded',
      object: {
        id: intentId,
        latest_charge: chargeId,
      },
    });

    await service.handleWebhook(raw, signature);

    expect(txCommandeUpdateMany).toHaveBeenCalledWith({
      where: { id: COMMANDE, status: 'PENDING_PAYMENT' },
      data: expect.objectContaining({
        status: 'PAID',
        step: 'PAID',
        stripePaymentIntentId: intentId,
        stripeChargeId: chargeId,
      }),
    });

    expect(txOfferUpdate).toHaveBeenCalledWith({
      where: { id: OFFER },
      data: { status: 'ACCEPTED' },
    });

    expect(txOfferUpdateMany).toHaveBeenCalledWith({
      where: {
        demandeId: DEMANDE,
        status: 'SENT',
        id: { not: OFFER },
      },
      data: { status: 'REJECTED' },
    });

    expect(txDemandeUpdate).toHaveBeenCalledWith({
      where: { id: DEMANDE },
      data: { status: 'IN_PROGRESS' },
    });

    // Notifications: 1 for client (COMMANDE_STEP), 1 for winner (OFFER_ACCEPTED), 1 for loser (OFFER_DECLINED)
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CLIENT,
        mode: 'CLIENT',
        type: 'COMMANDE_STEP',
        step: 'PAID',
        demandeId: DEMANDE,
        commandeId: COMMANDE,
      }),
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: REPAIRER,
        mode: 'REPAIRER',
        type: 'OFFER_ACCEPTED',
        demandeId: DEMANDE,
        commandeId: COMMANDE,
      }),
    );

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: LOSER_REPAIRER,
        mode: 'REPAIRER',
        type: 'OFFER_DECLINED',
        demandeId: DEMANDE,
      }),
    );
  });

  it('completeByPaymentIntent that LOSES the PENDING_PAYMENT compare-and-swap writes nothing more and notifies nobody (CF6-04)', async () => {
    // The poll-time reconciliation in CommandesService.findOne and the payment_intent.succeeded
    // webhook can both reach finalizePaidCommande for the same order. Whichever commits second
    // matches zero rows; it must not open a conversation or emit a second round of notifications.
    const gateway = paymentsGateway();
    const seeded = await gateway.createPaymentIntent({
      commandeId: COMMANDE,
      demandeId: DEMANDE,
      offerId: OFFER,
      customerEmail: 'client@example.test',
      amountCents: 5515,
      metadata: { commandeId: COMMANDE, demandeId: DEMANDE, offerId: OFFER },
    });
    (gateway as any).markPaymentIntentSucceeded(seeded.id, 'ch_charge_race');

    const txCommandeUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
    const txOfferUpdate = vi.fn().mockResolvedValue({});
    const txDemandeUpdate = vi.fn().mockResolvedValue({});
    const txPrisma = {
      commande: { updateMany: txCommandeUpdateMany },
      offer: { update: txOfferUpdate, updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      demande: { update: txDemandeUpdate },
      commandeStepEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      commande: {
        findFirst: vi.fn().mockResolvedValue({
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
        }),
      },
      offer: { findMany: vi.fn().mockResolvedValue([{ repairerUserId: LOSER_REPAIRER }]) },
      demande: {
        findFirst: vi.fn().mockResolvedValue({ title: 'Reparation Trottinette', author: { username: 'client_user' } }),
      },
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(txPrisma)),
    } as unknown as PrismaService;

    const emit = vi.fn().mockResolvedValue(undefined);
    const openForPayment = vi.fn().mockResolvedValue(undefined);
    const service = new PaymentsService(
      prisma,
      { emit } as unknown as NotificationsService,
      { openForPayment } as unknown as ConversationsService,
    );

    await service.completeByPaymentIntent(seeded.id, 'ch_charge_race');

    expect(txCommandeUpdateMany).toHaveBeenCalledTimes(1);
    expect(txOfferUpdate).not.toHaveBeenCalled();
    expect(txDemandeUpdate).not.toHaveBeenCalled();
    expect(openForPayment).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('handleWebhook on payment_intent.canceled marks Commande as ABANDONED and notifies client', async () => {
    const intentId = 'pi_webhook_canceled_1';

    const stripeEventCreate = vi.fn().mockResolvedValue({ id: 'evt_pi_canc', type: 'payment_intent.canceled' });

    const commandeUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const commandeFindFirst = vi.fn().mockResolvedValue({
      id: COMMANDE,
      demandeId: DEMANDE,
      clientUserId: CLIENT,
      demande: { title: 'Reparation Trottinette' },
    });

    const prisma = {
      stripeEvent: { create: stripeEventCreate },
      commande: {
        updateMany: commandeUpdateMany,
        findFirst: commandeFindFirst,
      },
    } as unknown as PrismaService;

    const emit = vi.fn().mockResolvedValue(undefined);
    const notifications = { emit } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;

    const service = new PaymentsService(prisma, notifications, conversations);

    const { raw, signature } = buildSignedEvent({
      id: 'evt_pi_canc',
      type: 'payment_intent.canceled',
      object: {
        id: intentId,
      },
    });

    await service.handleWebhook(raw, signature);

    expect(commandeUpdateMany).toHaveBeenCalledWith({
      where: { stripePaymentIntentId: intentId, status: 'PENDING_PAYMENT' },
      data: { status: 'ABANDONED' },
    });

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: CLIENT,
        mode: 'CLIENT',
        type: 'PAYMENT_ABANDONED',
        demandeId: DEMANDE,
        commandeId: COMMANDE,
      }),
    );
  });
});
