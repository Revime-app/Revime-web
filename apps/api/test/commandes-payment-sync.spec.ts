import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandesService, RECONCILE_BUDGET_MS } from '../src/commandes/commandes.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { CommandeAnnouncer } from '../src/commandes/commande-announcer.service.js';
import type { PaymentsService } from '../src/payments/payments.service.js';
import { paymentsGateway, __resetPaymentsGateway } from '../src/payments/gateway.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const DEMANDE = '55555555-5555-4555-8555-555555555555';
const COMMANDE = '66666666-6666-4666-8666-666666666666';
const INTENT = 'pi_test_sync_123';

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

function baseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMANDE,
    demandeId: DEMANDE,
    offerId: 'offer-1',
    delivery: 'WORKSHOP',
    repairCents: 5000,
    shippingCents: 0,
    protectionCents: 515,
    totalCents: 5515,
    transferredCents: 0,
    status: 'PENDING_PAYMENT',
    step: null,
    executionDelayPreference: 'IMMEDIATE',
    withdrawalWaiverAcceptedAt: null,
    withdrawalPeriodEndsAt: null,
    paidAt: null,
    releaseRequestedAt: null,
    releasedAt: null,
    returnSentAt: null,
    refundedAt: null,
    refundedCents: 0,
    refundRepairCents: null,
    refundShippingCents: null,
    refundProtectionCents: null,
    disputedAt: null,
    outboundTrackingNumber: null,
    returnTrackingNumber: null,
    shippingAddresses: [],
    parcelOption: null,
    insuranceCents: 0,
    parcelWeightGrams: null,
    parcelLengthCm: null,
    parcelWidthCm: null,
    parcelHeightCm: null,
    parcelValueCents: null,
    shipments: [],
    clientUserId: CLIENT,
    repairerUserId: REPAIRER,
    demande: {
      title: 'Mon vélo',
      description: 'Pneu crevé',
      locationLabel: 'Paris',
      postalCode: '75001',
      photos: [],
    },
    review: null,
    client: { username: 'client_user', profile: { avatarPath: null } },
    repairer: {
      username: 'repairer_user',
      repairerProfile: { displayName: 'Atelier Vélo', serviceAreaLabel: 'Paris', postalCode: '75001' },
      profile: { avatarPath: null },
    },
    dispute: null,
    stepEvents: [],
    cancellationRequests: [],
    stripePaymentIntentId: INTENT,
    ...overrides,
  };
}

/** One CommandesService over a mocked prisma whose `commande.findFirst` yields `rows` in order (the last repeats). */
function build(rows: unknown[], { conversation = null }: { conversation?: { id: string } | null } = {}) {
  const findFirst = vi.fn();
  rows.forEach((r, i) => (i < rows.length - 1 ? findFirst.mockResolvedValueOnce(r) : findFirst.mockResolvedValue(r)));
  const prisma = {
    commande: { findFirst },
    conversation: { findFirst: vi.fn().mockResolvedValue(conversation) },
  } as unknown as PrismaService;
  const notifications = { emit: vi.fn() } as unknown as NotificationsService;
  const announcer = { postSystemMessage: vi.fn(), announce: vi.fn() } as unknown as CommandeAnnouncer;
  const payments = {
    completeByPaymentIntent: vi.fn().mockResolvedValue(undefined),
    abandonByPaymentIntentId: vi.fn().mockResolvedValue(undefined),
  } as unknown as PaymentsService;
  return { service: new CommandesService(prisma, notifications, announcer, payments), payments, findFirst };
}

async function seedIntent() {
  const gateway = paymentsGateway();
  const seeded = await gateway.createPaymentIntent({
    commandeId: COMMANDE,
    demandeId: DEMANDE,
    offerId: 'offer-1',
    customerEmail: 'client@example.test',
    amountCents: 5515,
    metadata: { commandeId: COMMANDE, demandeId: DEMANDE, offerId: 'offer-1' },
  });
  return { gateway, seeded };
}

describe('CommandesService - active payment reconciliation on findOne (CF6-04)', () => {
  it('reconciles PENDING_PAYMENT commande with succeeded PaymentIntent on findOne', async () => {
    const { gateway, seeded } = await seedIntent();
    (gateway as any).markPaymentIntentSucceeded(seeded.id, 'ch_test_charge_1');
    const { service, payments, findFirst } = build(
      [
        baseRow({ stripePaymentIntentId: seeded.id, status: 'PENDING_PAYMENT' }),
        baseRow({ stripePaymentIntentId: seeded.id, status: 'PAID', step: 'PAID', paidAt: new Date() }),
      ],
      { conversation: { id: 'conv-1' } },
    );

    const result = await service.findOne(CLIENT, COMMANDE);

    expect(payments.completeByPaymentIntent).toHaveBeenCalledTimes(1);
    expect(payments.completeByPaymentIntent).toHaveBeenCalledWith(seeded.id, 'ch_test_charge_1');
    // The row is re-read once after reconciling, with the same access filter as the first read.
    expect(findFirst).toHaveBeenCalledTimes(2);
    expect(findFirst.mock.calls[1]?.[0].where).toEqual(findFirst.mock.calls[0]?.[0].where);
    // These two assertions only echo the second mocked read: they prove the refetch is wired,
    // not that PaymentsService moves the order (payments-payment-intent.spec.ts covers that).
    expect(result.status).toBe('PAID');
    expect(result.step).toBe('PAID');
  });

  it('reconciles PENDING_PAYMENT commande with canceled PaymentIntent on findOne', async () => {
    const { gateway, seeded } = await seedIntent();
    await gateway.cancelPaymentIntent(seeded.id);
    const { service, payments } = build([
      baseRow({ stripePaymentIntentId: seeded.id, status: 'PENDING_PAYMENT' }),
      baseRow({ stripePaymentIntentId: seeded.id, status: 'ABANDONED', step: null }),
    ]);

    const result = await service.findOne(CLIENT, COMMANDE);

    expect(payments.abandonByPaymentIntentId).toHaveBeenCalledTimes(1);
    expect(payments.abandonByPaymentIntentId).toHaveBeenCalledWith(seeded.id);
    expect(result.status).toBe('ABANDONED');
  });

  it('leaves PENDING_PAYMENT commande intact if PaymentIntent is still requires_payment_method', async () => {
    const { seeded } = await seedIntent();
    const { service, payments, findFirst } = build([
      baseRow({ stripePaymentIntentId: seeded.id, status: 'PENDING_PAYMENT' }),
    ]);

    const result = await service.findOne(CLIENT, COMMANDE);

    expect(payments.completeByPaymentIntent).not.toHaveBeenCalled();
    expect(payments.abandonByPaymentIntentId).not.toHaveBeenCalled();
    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('PENDING_PAYMENT');
  });

  it('does not query Stripe or call reconciliation if commande is already PAID', async () => {
    const retrieveSpy = vi.spyOn(paymentsGateway(), 'retrievePaymentIntent');
    const { service, payments } = build(
      [baseRow({ status: 'PAID', step: 'PAID', stripePaymentIntentId: 'pi_already_paid', paidAt: new Date() })],
      { conversation: { id: 'conv-1' } },
    );

    const result = await service.findOne(CLIENT, COMMANDE);

    expect(retrieveSpy).not.toHaveBeenCalled();
    expect(payments.completeByPaymentIntent).not.toHaveBeenCalled();
    expect(result.status).toBe('PAID');
  });

  it('gracefully degrades, and names the commande in the warning, when the gateway throws', async () => {
    vi.spyOn(paymentsGateway(), 'retrievePaymentIntent').mockRejectedValueOnce(new Error('Stripe network down'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { service, payments } = build([baseRow({ stripePaymentIntentId: INTENT, status: 'PENDING_PAYMENT' })]);

      const result = await service.findOne(CLIENT, COMMANDE);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(`[commandes] active payment reconciliation failed on findOne: ${COMMANDE}`),
        expect.any(Error),
      );
      expect(payments.completeByPaymentIntent).not.toHaveBeenCalled();
      expect(result.status).toBe('PENDING_PAYMENT');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not let a SLOW Stripe call hold the GET: after the budget it answers with the pending order', async () => {
    // The previous test only proves a rejection is caught. A hung socket never rejects, and the
    // Stripe client has no timeout of its own, so without a budget this GET (polled every 2 s by
    // the app) would wait for as long as Stripe does.
    vi.useFakeTimers();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vi.spyOn(paymentsGateway(), 'retrievePaymentIntent').mockReturnValue(new Promise(() => {}));
      const { service, payments } = build([baseRow({ stripePaymentIntentId: INTENT, status: 'PENDING_PAYMENT' })]);

      const pending = service.findOne(CLIENT, COMMANDE);
      await vi.advanceTimersByTimeAsync(RECONCILE_BUDGET_MS + 1);
      const result = await pending;

      expect(payments.completeByPaymentIntent).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(result.status).toBe('PENDING_PAYMENT');
    } finally {
      warnSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
