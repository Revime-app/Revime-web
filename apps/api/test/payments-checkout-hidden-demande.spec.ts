import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentsService } from '../src/payments/payments.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';
import type { ConversationsService } from '../src/conversations/conversations.service.js';

const ME = '11111111-1111-4111-8111-111111111111';
const OFFER_ID = '22222222-2222-4222-8222-222222222222';

/**
 * Environment setup following `payments-checkout-suspension.spec.ts`. `arePaymentsEnabled()` reads
 * five variables; all must be set explicitly to enable payments for the test.
 */
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
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function harness() {
  const offerFindFirst = vi.fn().mockResolvedValue(null);
  const prisma = { offer: { findFirst: offerFindFirst } } as unknown as PrismaService;
  const notifications = {} as unknown as NotificationsService;
  const conversations = {} as unknown as ConversationsService;
  return { service: new PaymentsService(prisma, notifications, conversations), offerFindFirst };
}

describe('PaymentsService.createCheckout, hidden demande guard', () => {
  /**
   * THE MONEY-PATH GUARD. `createCheckout` reaches the demande through its OFFER read's
   * nested `demande: { authorUserId, ...VISIBLE_DEMANDE_WHERE }`. This test pins that
   * filter - without it, reverting the nested filter to `demande: { authorUserId, deletedAt: null }`
   * produces zero test failures and a clean `tsc`.
   *
   * Asserted on the WHERE rather than on outcome, because the Prisma here is a stub: it
   * returns `null`, so the method throws `NOT_FOUND` before payments are touched. The query
   * is the behaviour being tested.
   */
  it('refuses checkout on a hidden demande via the nested offer filter', async () => {
    const { service, offerFindFirst } = harness();

    await expect(
      service.createCheckout(ME, OFFER_ID, { delivery: 'WORKSHOP' }),
    ).rejects.toThrow();

    expect(offerFindFirst).toHaveBeenCalledTimes(1);
    const where = offerFindFirst.mock.calls[0]?.[0]?.where;
    expect(where).toMatchObject({
      id: OFFER_ID,
      deletedAt: null,
      demande: { authorUserId: ME, deletedAt: null, hiddenAt: null },
    });
  });
});
