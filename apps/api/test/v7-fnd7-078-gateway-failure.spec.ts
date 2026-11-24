/**
 * V7 FND7-078 (ISS7-042). On 2026-11-16 the client tapped « Payer » on Android. The commande row was
 * created, then Stripe refused the PaymentIntent (`StripeAuthenticationError: Expired API Key`). The
 * row stayed PENDING_PAYMENT with no intent id, so for the next two minutes (`GATEWAY_GRACE_MS`) every
 * retry was told « Un paiement est déjà en cours pour cette demande. » instead of the real failure.
 *
 * A gateway failure must abandon the row it created before the error propagates, exactly as a
 * consent-proof failure already does, so a retry sees the real error (or succeeds once it is fixed).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import { paymentsGateway, __resetPaymentsGateway } from '../src/payments/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';

const CLIENT = '11111111-1111-4111-8111-111111111111';
const REPAIRER = '22222222-2222-4222-8222-222222222222';
const OFFER = '44444444-4444-4444-8444-444444444444';
const DEMANDE = '55555555-5555-4555-8555-555555555555';
const COMMANDE = '66666666-6666-4666-8666-666666666666';
const ALREADY_PAYING = 'Un paiement est déjà en cours pour cette demande.';

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
  vi.restoreAllMocks();
});

/**
 * A one-table in-memory Commande store, so the second tap reads what the first tap left behind
 * rather than a canned mock answer.
 */
function setup() {
  type Row = {
    id: string;
    demandeId: string;
    offerId: string;
    status: string;
    stripePaymentIntentId: string | null;
    stripeSessionId: string | null;
    delivery: string;
    executionDelayPreference: string | null;
    parcelOption: string | null;
    insuranceCents: number;
    shippingQuoteId: string | null;
    createdAt: Date;
  };
  const rows: Row[] = [];
  let next = 0;

  const prisma = {
    offer: {
      findFirst: vi.fn().mockResolvedValue({
        id: OFFER,
        status: 'SENT',
        priceCents: 100,
        acceptsParcel: true,
        repairerUserId: REPAIRER,
        demandeId: DEMANDE,
        demande: { status: 'OPEN', author: { email: 'client@example.test' } },
        repairer: { profile: { verificationLevel: 'NONE', repairerSuspendedAt: null } },
      }),
    },
    commande: {
      findFirst: vi.fn(async ({ where }: { where: { demandeId: string; status: string } }) =>
        rows.find((r) => r.demandeId === where.demandeId && r.status === where.status) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row: Row = {
          id: next++ === 0 ? COMMANDE : `${COMMANDE.slice(0, -1)}${next}`,
          demandeId: data.demandeId as string,
          offerId: data.offerId as string,
          status: 'PENDING_PAYMENT',
          stripePaymentIntentId: null,
          stripeSessionId: null,
          delivery: data.delivery as string,
          executionDelayPreference: (data.executionDelayPreference as string) ?? null,
          parcelOption: null,
          insuranceCents: (data.insuranceCents as number) ?? 0,
          shippingQuoteId: null,
          createdAt: new Date(),
        };
        rows.push(row);
        return { id: row.id };
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string; status: string }; data: Partial<Row> }) => {
          const hit = rows.filter((r) => r.id === where.id && r.status === where.status);
          for (const r of hit) Object.assign(r, data);
          return { count: hit.length };
        },
      ),
    },
  } as unknown as PrismaService;

  const service = new PaymentsService(
    prisma,
    { emit: vi.fn() } as unknown as NotificationsService,
    { openForPayment: vi.fn() } as unknown as ConversationsService,
  );
  return { service, rows };
}

const expiredKey = Object.assign(new Error('Expired API Key provided: sk_test_***'), {
  type: 'StripeAuthenticationError',
});

describe('V7 FND7-078: a gateway failure does not lock the client out with « paiement déjà en cours »', () => {
  it('abandons the commande it created when the PaymentIntent cannot be created, and rethrows the gateway error', async () => {
    const { service, rows } = setup();
    vi.spyOn(paymentsGateway(), 'createPaymentIntent').mockRejectedValue(expiredKey);

    await expect(service.createCheckout(CLIENT, OFFER, { delivery: 'HOME' })).rejects.toBe(expiredKey);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('ABANDONED');
  });

  it('a retry right after a gateway failure gets the real error, not ALREADY_PAYING', async () => {
    const { service } = setup();
    vi.spyOn(paymentsGateway(), 'createPaymentIntent').mockRejectedValue(expiredKey);

    await expect(service.createCheckout(CLIENT, OFFER, { delivery: 'HOME' })).rejects.toBe(expiredKey);
    const retry = service.createCheckout(CLIENT, OFFER, { delivery: 'HOME' });

    await expect(retry).rejects.not.toThrow(ALREADY_PAYING);
    await expect(retry).rejects.toBe(expiredKey);
  });

  it('a retry once the gateway works again creates a fresh payable intent', async () => {
    const { service, rows } = setup();
    const spy = vi.spyOn(paymentsGateway(), 'createPaymentIntent').mockRejectedValueOnce(expiredKey);

    await expect(service.createCheckout(CLIENT, OFFER, { delivery: 'HOME' })).rejects.toBe(expiredKey);
    const ok = await service.createCheckout(CLIENT, OFFER, { delivery: 'HOME' });

    expect(spy).toHaveBeenCalledTimes(2);
    expect(ok.paymentIntentClientSecret).toBeTruthy();
    expect(rows.map((r) => r.status)).toEqual(['ABANDONED', 'PENDING_PAYMENT']);
    expect(rows[1]!.stripePaymentIntentId).toBeTruthy();
  });
});
