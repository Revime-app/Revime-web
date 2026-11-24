import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import { paymentsGateway, __resetPaymentsGateway } from '../src/payments/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';

describe('PaymentsService.createCheckout isTestMode flag', () => {
  const CLIENT = '11111111-1111-4111-8111-111111111111';
  const REPAIRER = '22222222-2222-4222-8222-222222222222';
  const DEMANDE = '55555555-5555-4555-8555-555555555555';
  const OFFER = '33333333-3333-4333-8333-333333333333';
  const COMMANDE = '66666666-6666-4666-8666-666666666666';

  const KEYS = [
    'PAYMENTS_ENABLED',
    'STRIPE_DRIVER',
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'PUBLIC_API_URL',
  ] as const;

  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
    for (const k of KEYS) delete process.env[k];
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock';
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    __resetPaymentsGateway();
  });

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    __resetPaymentsGateway();
    vi.restoreAllMocks();
  });

  function createTestService() {
    const prisma = {
      offer: {
        findFirst: vi.fn().mockResolvedValue({
          id: OFFER,
          status: 'SENT',
          priceCents: 5000,
          acceptsParcel: false,
          repairerUserId: REPAIRER,
          demandeId: DEMANDE,
          demande: { status: 'OPEN', author: { email: 'client@example.test' } },
          repairer: { profile: { repairerSuspendedAt: null } },
        }),
      },
      commande: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: COMMANDE }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    const notifications = { emit: vi.fn() } as unknown as NotificationsService;
    const conversations = { openForPayment: vi.fn() } as unknown as ConversationsService;

    return new PaymentsService(prisma, notifications, conversations);
  }

  it('populates isTestMode as true when in test mode', async () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_123';

    const gateway = paymentsGateway();
    vi.spyOn(gateway, 'createPaymentIntent').mockResolvedValue({
      id: 'pi_test_123',
      clientSecret: 'pi_test_123_secret_xyz',
      status: 'requires_payment_method',
      chargeId: null,
    });

    const service = createTestService();
    const result = await service.createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });

    expect(result.isTestMode).toBe(true);
  });

  it('populates isTestMode as false when in live mode', async () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_mock_123';
    process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_mock_123';

    const gateway = paymentsGateway();
    vi.spyOn(gateway, 'createPaymentIntent').mockResolvedValue({
      id: 'pi_live_123',
      clientSecret: 'pi_live_123_secret_xyz',
      status: 'requires_payment_method',
      chargeId: null,
    });

    const service = createTestService();
    const result = await service.createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });

    expect(result.isTestMode).toBe(false);
  });

  describe('a retried checkout that reuses the still-open PaymentIntent', () => {
    function reuseService() {
      const prisma = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: OFFER,
            status: 'SENT',
            priceCents: 5000,
            acceptsParcel: false,
            repairerUserId: REPAIRER,
            demandeId: DEMANDE,
            demande: { status: 'OPEN', author: { email: 'client@example.test' } },
            repairer: { profile: { repairerSuspendedAt: null } },
          }),
        },
        commande: {
          findFirst: vi.fn().mockResolvedValue({
            id: COMMANDE,
            offerId: OFFER,
            stripePaymentIntentId: 'pi_open_1',
            stripeSessionId: null,
            delivery: 'WORKSHOP',
            executionDelayPreference: 'IMMEDIATE',
            parcelOption: null,
            insuranceCents: 0,
            shippingQuoteId: null,
            createdAt: new Date(),
          }),
        },
      } as unknown as PrismaService;
      return new PaymentsService(
        prisma,
        { emit: vi.fn() } as unknown as NotificationsService,
        { openForPayment: vi.fn() } as unknown as ConversationsService,
      );
    }

    function openIntent() {
      vi.spyOn(paymentsGateway(), 'retrievePaymentIntent').mockResolvedValue({
        id: 'pi_open_1',
        clientSecret: 'pi_open_1_secret_x',
        status: 'requires_payment_method',
        chargeId: null,
      });
    }

    it('still reports isTestMode: true under a test key', async () => {
      process.env.STRIPE_DRIVER = 'stripe';
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock_123';
      openIntent();

      const result = await reuseService().createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });

      expect(result.commandeId).toBe(COMMANDE);
      expect(result.isTestMode).toBe(true);
    });

    it('still reports isTestMode: false under a live key, so the app never trusts a build-time guess', async () => {
      process.env.STRIPE_DRIVER = 'stripe';
      process.env.STRIPE_SECRET_KEY = 'sk_live_mock_123';
      process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_mock_123';
      openIntent();

      const result = await reuseService().createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });

      expect(result.isTestMode).toBe(false);
    });
  });

  describe('a retried checkout that reuses a still-open hosted Checkout Session', () => {
    function sessionService() {
      const prisma = {
        offer: {
          findFirst: vi.fn().mockResolvedValue({
            id: OFFER,
            status: 'SENT',
            priceCents: 5000,
            acceptsParcel: false,
            repairerUserId: REPAIRER,
            demandeId: DEMANDE,
            demande: { status: 'OPEN', author: { email: 'client@example.test' } },
            repairer: { profile: { repairerSuspendedAt: null } },
          }),
        },
        commande: {
          findFirst: vi.fn().mockResolvedValue({
            id: COMMANDE,
            offerId: OFFER,
            stripePaymentIntentId: null,
            stripeSessionId: 'cs_open_1',
            delivery: 'WORKSHOP',
            executionDelayPreference: 'IMMEDIATE',
            parcelOption: null,
            insuranceCents: 0,
            shippingQuoteId: null,
            createdAt: new Date(),
          }),
        },
      } as unknown as PrismaService;
      return new PaymentsService(
        prisma,
        { emit: vi.fn() } as unknown as NotificationsService,
        { openForPayment: vi.fn() } as unknown as ConversationsService,
      );
    }

    function openSession() {
      vi.spyOn(paymentsGateway(), 'retrieveCheckoutSession').mockResolvedValue({
        id: 'cs_open_1',
        status: 'open',
        paymentIntentId: 'pi_open_1',
        url: 'https://checkout.stripe.test/cs_open_1',
      } as never);
    }

    it.each([
      ['sk_test_mock_123', true],
      ['sk_live_mock_123', false],
    ])('reports the mode of %s on the third response path too: isTestMode %s', async (key, expected) => {
      process.env.STRIPE_DRIVER = 'stripe';
      process.env.STRIPE_SECRET_KEY = key;
      if (key.startsWith('sk_live_')) process.env.STRIPE_PUBLISHABLE_KEY = 'pk_live_mock_123';
      openSession();

      const result = await sessionService().createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });

      expect(result.commandeId).toBe(COMMANDE);
      expect(result.isTestMode).toBe(expected);
    });
  });

  it('refuses a checkout under a live secret key with no live publishable key, before any intent is created', async () => {
    process.env.STRIPE_DRIVER = 'stripe';
    process.env.STRIPE_SECRET_KEY = 'sk_live_mock_123';
    const create = vi.spyOn(paymentsGateway(), 'createPaymentIntent');

    await expect(
      createTestService().createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' }),
    ).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });

  describe('the publishable key the app pays with', () => {
    it.each([
      ['a new intent', null],
      ['a reused intent', 'pi_open_1'],
    ])('is echoed on %s when STRIPE_PUBLISHABLE_KEY is set, and omitted when it is not', async (_label, reusedIntent) => {
      process.env.STRIPE_DRIVER = 'stripe';
      process.env.STRIPE_SECRET_KEY = 'sk_test_mock_123';
      const saved = process.env.STRIPE_PUBLISHABLE_KEY;
      try {
        const run = async () => {
          if (reusedIntent) {
            vi.spyOn(paymentsGateway(), 'retrievePaymentIntent').mockResolvedValue({
              id: 'pi_open_1',
              clientSecret: 'pi_open_1_secret_x',
              status: 'requires_payment_method',
              chargeId: null,
            });
            const prisma = {
              offer: {
                findFirst: vi.fn().mockResolvedValue({
                  id: OFFER,
                  status: 'SENT',
                  priceCents: 5000,
                  acceptsParcel: false,
                  repairerUserId: REPAIRER,
                  demandeId: DEMANDE,
                  demande: { status: 'OPEN', author: { email: 'client@example.test' } },
                  repairer: { profile: { repairerSuspendedAt: null } },
                }),
              },
              commande: {
                findFirst: vi.fn().mockResolvedValue({
                  id: COMMANDE,
                  offerId: OFFER,
                  stripePaymentIntentId: 'pi_open_1',
                  stripeSessionId: null,
                  delivery: 'WORKSHOP',
                  executionDelayPreference: 'IMMEDIATE',
                  parcelOption: null,
                  insuranceCents: 0,
                  shippingQuoteId: null,
                  createdAt: new Date(),
                }),
              },
            } as unknown as PrismaService;
            return new PaymentsService(
              prisma,
              { emit: vi.fn() } as unknown as NotificationsService,
              { openForPayment: vi.fn() } as unknown as ConversationsService,
            ).createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });
          }
          vi.spyOn(paymentsGateway(), 'createPaymentIntent').mockResolvedValue({
            id: 'pi_new_1',
            clientSecret: 'pi_new_1_secret_x',
            status: 'requires_payment_method',
            chargeId: null,
          });
          return createTestService().createCheckout(CLIENT, OFFER, { delivery: 'WORKSHOP' });
        };

        process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_mock_123';
        expect((await run()).publishableKey).toBe('pk_test_mock_123');

        delete process.env.STRIPE_PUBLISHABLE_KEY;
        // Absent, not present-and-undefined: the app tests `if (session.publishableKey)` today, but a
        // key that is there with no value is a different response shape.
        expect(Object.keys(await run())).not.toContain('publishableKey');
      } finally {
        if (saved === undefined) delete process.env.STRIPE_PUBLISHABLE_KEY;
        else process.env.STRIPE_PUBLISHABLE_KEY = saved;
      }
    });
  });
});
