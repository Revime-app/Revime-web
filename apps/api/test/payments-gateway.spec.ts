import { beforeEach, describe, expect, it } from 'vitest';
import { lineItems, summarise, FakePaymentsGateway, type CreateSessionInput, type CreateTransferInput } from '../src/payments/gateway.js';
import type Stripe from 'stripe';

describe('lineItems', () => {
  const baseInput: CreateSessionInput = {
    commandeId: 'cmd_1',
    demandeId: 'dem_1',
    offerId: 'off_1',
    customerEmail: 'client@example.com',
    repairCents: 2500,
    shippingCents: 600,
    protectionCents: 150,
    insuranceCents: 0,
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };

  it('returns exactly three line items when shippingCents is non-zero', () => {
    const items = lineItems(baseInput);
    expect(items).toHaveLength(3);
  });

  it('returns exactly two line items when shippingCents is 0, omitting Livraison', () => {
    const items = lineItems({ ...baseInput, shippingCents: 0 });
    expect(items).toHaveLength(2);
    const names = items.map((item) => item.price_data?.product_data?.name);
    expect(names).toEqual(['Réparation', 'Protection Revime']);
  });

  it('sets currency to eur on every line', () => {
    const items = lineItems(baseInput);
    for (const item of items) {
      expect(item.price_data?.currency).toBe('eur');
    }
  });

  it('uses the correct French names for each line', () => {
    const items = lineItems(baseInput);
    const names = items.map((item) => item.price_data?.product_data?.name);
    expect(names).toEqual(['Réparation', 'Livraison aller-retour', 'Protection Revime']);
  });

  it('sets each unit_amount to match its input', () => {
    const items = lineItems(baseInput);
    expect(items).toHaveLength(3);
    expect(items[0]!.price_data?.unit_amount).toBe(2500); // repairCents
    expect(items[1]!.price_data?.unit_amount).toBe(600); // shippingCents
    expect(items[2]!.price_data?.unit_amount).toBe(150); // protectionCents
  });

  it('sets quantity to 1 on every line', () => {
    const items = lineItems(baseInput);
    for (const item of items) {
      expect(item.quantity).toBe(1);
    }
  });

  it('Livraison Boxtal: names the shipping line « Livraison aller-retour » and adds « Assurance transport » only when insured', () => {
    const withInsurance = lineItems({ ...baseInput, shippingCents: 780, insuranceCents: 1520 });
    expect(withInsurance.map((i) => i.price_data?.product_data?.name)).toEqual(['Réparation', 'Livraison aller-retour', 'Protection Revime', 'Assurance transport']);
    expect(withInsurance[3]!.price_data?.unit_amount).toBe(1520);
    const without = lineItems({ ...baseInput, shippingCents: 780, insuranceCents: 0 });
    expect(without).toHaveLength(3);
  });
});

describe('summarise', () => {
  it('extracts paymentIntentId when payment_intent is a string', () => {
    const session = {
      id: 'cs_test_1',
      url: 'https://checkout.stripe.com/test',
      status: 'open',
      payment_intent: 'pi_test_123',
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.paymentIntentId).toBe('pi_test_123');
    expect(result.chargeId).toBeNull();
  });

  it('extracts paymentIntentId and chargeId when payment_intent is expanded with a string latest_charge', () => {
    const session = {
      id: 'cs_test_2',
      url: 'https://checkout.stripe.com/test',
      status: 'complete',
      payment_intent: {
        id: 'pi_test_456',
        latest_charge: 'ch_test_789',
      },
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.paymentIntentId).toBe('pi_test_456');
    expect(result.chargeId).toBe('ch_test_789');
  });

  it('extracts paymentIntentId and chargeId when payment_intent is expanded with an expanded latest_charge', () => {
    const session = {
      id: 'cs_test_3',
      url: 'https://checkout.stripe.com/test',
      status: 'complete',
      payment_intent: {
        id: 'pi_test_999',
        latest_charge: {
          id: 'ch_test_111',
        },
      },
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.paymentIntentId).toBe('pi_test_999');
    expect(result.chargeId).toBe('ch_test_111');
  });

  it('returns null for both ids when payment_intent is null', () => {
    const session = {
      id: 'cs_test_4',
      url: 'https://checkout.stripe.com/test',
      status: 'open',
      payment_intent: null,
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.paymentIntentId).toBeNull();
    expect(result.chargeId).toBeNull();
  });

  it('maps status complete to complete', () => {
    const session = {
      id: 'cs_test_5',
      url: 'https://checkout.stripe.com/test',
      status: 'complete',
      payment_intent: null,
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.status).toBe('complete');
  });

  it('maps status expired to expired', () => {
    const session = {
      id: 'cs_test_6',
      url: 'https://checkout.stripe.com/test',
      status: 'expired',
      payment_intent: null,
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.status).toBe('expired');
  });

  it('maps status open to open', () => {
    const session = {
      id: 'cs_test_7',
      url: 'https://checkout.stripe.com/test',
      status: 'open',
      payment_intent: null,
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.status).toBe('open');
  });

  it('maps unknown status to open (safe direction)', () => {
    const session = {
      id: 'cs_test_8',
      url: 'https://checkout.stripe.com/test',
      status: null,
      payment_intent: null,
    } as unknown as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.status).toBe('open');
  });

  it('handles missing url by returning empty string', () => {
    const session = {
      id: 'cs_test_9',
      url: null,
      status: 'open',
      payment_intent: null,
    } as Stripe.Checkout.Session;

    const result = summarise(session);
    expect(result.url).toBe('');
  });
});

describe('FakePaymentsGateway', () => {
  const baseInput: CreateSessionInput = {
    commandeId: 'cmd_1',
    demandeId: 'dem_1',
    offerId: 'off_1',
    customerEmail: 'client@example.com',
    repairCents: 2500,
    shippingCents: 600,
    protectionCents: 150,
    insuranceCents: 0,
    successUrl: 'https://example.com/success',
    cancelUrl: 'https://example.com/cancel',
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };

  it('expireCheckoutSession marks an open session as expired', async () => {
    const gateway = new FakePaymentsGateway();
    const session = await gateway.createCheckoutSession(baseInput);
    expect(session.status).toBe('open');

    await gateway.expireCheckoutSession(session.id);

    const retrieved = await gateway.retrieveCheckoutSession(session.id);
    expect(retrieved.status).toBe('expired');
  });

  it('expireCheckoutSession throws on an unknown session id', () => {
    const gateway = new FakePaymentsGateway();
    expect(() => gateway.expireCheckoutSession('cs_fake_unknown')).toThrow('No such fake session: cs_fake_unknown');
  });
});

describe('createTransfer (fake driver)', () => {
  it('creates one transfer and returns its id', async () => {
    const gw = new FakePaymentsGateway();
    const res = await gw.createTransfer(
      {
        amountCents: 8000,
        destination: 'acct_fake_1',
        sourceTransaction: 'ch_fake_1',
        transferGroup: 'cmd-1',
      },
      'release:cmd-1',
    );
    expect(res.id).toMatch(/^tr_fake_/);
    expect(gw.transferCount()).toBe(1);
    expect(gw.transferFor('release:cmd-1')).toMatchObject({
      amountCents: 8000,
      destination: 'acct_fake_1',
      sourceTransaction: 'ch_fake_1',
      transferGroup: 'cmd-1',
    });
  });

  it('replays the same transfer for a repeated idempotency key', async () => {
    const gw = new FakePaymentsGateway();
    const first = await gw.createTransfer(
      { amountCents: 8000, destination: 'a', sourceTransaction: 'c', transferGroup: 'g' },
      'release:cmd-1',
    );
    const second = await gw.createTransfer(
      { amountCents: 8000, destination: 'a', sourceTransaction: 'c', transferGroup: 'g' },
      'release:cmd-1',
    );
    expect(second.id).toBe(first.id);
    expect(gw.transferCount()).toBe(1);
  });

  it('creates a distinct transfer for a distinct key', async () => {
    const gw = new FakePaymentsGateway();
    await gw.createTransfer(
      { amountCents: 1, destination: 'a', sourceTransaction: 'c', transferGroup: 'g1' },
      'release:cmd-1',
    );
    await gw.createTransfer(
      { amountCents: 1, destination: 'a', sourceTransaction: 'c', transferGroup: 'g2' },
      'release:cmd-2',
    );
    expect(gw.transferCount()).toBe(2);
  });

  it('can be made to fail once, for the release recovery test', async () => {
    const gw = new FakePaymentsGateway();
    gw.failNextTransferOnce();
    await expect(
      gw.createTransfer(
        { amountCents: 1, destination: 'a', sourceTransaction: 'c', transferGroup: 'g' },
        'release:cmd-1',
      ),
    ).rejects.toThrow();
    expect(gw.transferCount()).toBe(0);
    // And the next call works again.
    await gw.createTransfer(
      { amountCents: 1, destination: 'a', sourceTransaction: 'c', transferGroup: 'g' },
      'release:cmd-1',
    );
    expect(gw.transferCount()).toBe(1);
  });
});

describe('FakePaymentsGateway refunds and reversals', () => {
  let g: FakePaymentsGateway;
  beforeEach(() => {
    g = new FakePaymentsGateway();
  });

  it('replays a refund under the same idempotency key rather than creating a second', async () => {
    const a = await g.createRefund({ chargeId: 'ch_1', amountCents: 9591 }, 'refund:cmd_1');
    const b = await g.createRefund({ chargeId: 'ch_1', amountCents: 9591 }, 'refund:cmd_1');
    expect(b.id).toBe(a.id);
    expect(g.refundCount()).toBe(1);
  });

  it('records the ORDER of calls, because reversal-before-refund is a money property', async () => {
    await g.reverseTransfer({ transferId: 'tr_1', amountCents: 8000 }, 'reverse:cmd_1');
    await g.createRefund({ chargeId: 'ch_1', amountCents: 9591 }, 'refund:cmd_1');
    expect(g.calls()).toEqual(['reverseTransfer', 'createRefund']);
  });

  it('can be made to fail a reversal once, which is a designed-for outcome', async () => {
    g.failNextReversalOnce();
    await expect(
      g.reverseTransfer({ transferId: 'tr_1', amountCents: 8000 }, 'reverse:cmd_1'),
    ).rejects.toThrow();
    await expect(
      g.reverseTransfer({ transferId: 'tr_1', amountCents: 8000 }, 'reverse:cmd_1'),
    ).resolves.toHaveProperty('id');
  });

  it('can report a pending refund, which a transfer never does', async () => {
    g.setNextRefundStatus('pending');
    const r = await g.createRefund({ chargeId: 'ch_1', amountCents: 9591 }, 'refund:cmd_1');
    expect(r.status).toBe('pending');
  });

  it('finds a transfer by destination and source charge, and nothing else', async () => {
    g.seedTransfer({
      id: 'tr_seeded',
      destination: 'acct_1',
      sourceTransaction: 'ch_1',
      amountCents: 8000,
    });

    await expect(
      g.findTransferBySource({ destination: 'acct_1', sourceTransaction: 'ch_1' }),
    ).resolves.toEqual({ id: 'tr_seeded', amountCents: 8000 });

    // Same charge, different réparateur - must NOT match, or one réparateur's
    // transfer would authorise skipping another's.
    await expect(
      g.findTransferBySource({ destination: 'acct_2', sourceTransaction: 'ch_1' }),
    ).resolves.toBeNull();

    await expect(
      g.findTransferBySource({ destination: 'acct_1', sourceTransaction: 'ch_other' }),
    ).resolves.toBeNull();
  });

  it('finds a transfer it created itself, not only a seeded one', async () => {
    await g.createTransfer(
      {
        amountCents: 8000,
        destination: 'acct_1',
        sourceTransaction: 'ch_1',
        transferGroup: 'cmd_1',
      },
      'release:cmd_1',
    );
    const found = await g.findTransferBySource({
      destination: 'acct_1',
      sourceTransaction: 'ch_1',
    });
    expect(found?.amountCents).toBe(8000);
  });

  // The default here is load-bearing and was only covered indirectly. Every
  // hand-written fixture that sets stripeRefundId without seeding a status relies
  // on it, and both callers of retrieveRefund treat 'succeeded' as "the client was
  // repaid" - so a default of 'failed' would silently turn those fixtures into
  // refund-again and release-anyway cases.
  it('resolves an unseeded refund id to succeeded, the conservative answer', async () => {
    await expect(g.retrieveRefund('re_never_created')).resolves.toEqual({
      id: 're_never_created',
      status: 'succeeded',
    });
  });

  it('reports the seeded status, and remembers what createRefund returned', async () => {
    g.seedRefundStatus('re_seeded', 'failed');
    await expect(g.retrieveRefund('re_seeded')).resolves.toEqual({
      id: 're_seeded',
      status: 'failed',
    });

    // No seeding: retrieveRefund must agree with the refund createRefund produced,
    // or a test could see a refund fail on creation and succeed on lookup.
    const created = await g.createRefund({ chargeId: 'ch_1', amountCents: 5000 }, 'refund:cmd_1');
    await expect(g.retrieveRefund(created.id)).resolves.toEqual({
      id: created.id,
      status: created.status,
    });
  });

  it('fails the lookup exactly once when asked to', async () => {
    g.failNextRetrieveRefundOnce();
    await expect(g.retrieveRefund('re_x')).rejects.toThrow();
    // Once, not forever: the retry-after-outage path depends on this.
    await expect(g.retrieveRefund('re_x')).resolves.toEqual({
      id: 're_x',
      status: 'succeeded',
    });
  });
});

describe('FakePaymentsGateway - PaymentIntents', () => {
  let gateway: FakePaymentsGateway;

  beforeEach(() => {
    gateway = new FakePaymentsGateway();
  });

  it('creates a PaymentIntent and returns clientSecret', async () => {
    const summary = await gateway.createPaymentIntent({
      commandeId: 'cmd_1',
      demandeId: 'dem_1',
      offerId: 'off_1',
      customerEmail: 'test@example.com',
      amountCents: 4500,
      metadata: { commandeId: 'cmd_1', demandeId: 'dem_1', offerId: 'off_1' },
    });

    expect(summary.id).toMatch(/^pi_fake_/);
    expect(summary.clientSecret).toMatch(/^pi_fake_.*_secret_/);
    expect(summary.status).toBe('requires_payment_method');
  });

  it('retrieves an existing PaymentIntent', async () => {
    const created = await gateway.createPaymentIntent({
      commandeId: 'cmd_2',
      demandeId: 'dem_2',
      offerId: 'off_2',
      customerEmail: 'test2@example.com',
      amountCents: 6000,
      metadata: { commandeId: 'cmd_2', demandeId: 'dem_2', offerId: 'off_2' },
    });

    const retrieved = await gateway.retrievePaymentIntent(created.id);
    expect(retrieved.id).toBe(created.id);
    expect(retrieved.clientSecret).toBe(created.clientSecret);
  });

  it('cancels an existing PaymentIntent', async () => {
    const created = await gateway.createPaymentIntent({
      commandeId: 'cmd_3',
      demandeId: 'dem_3',
      offerId: 'off_3',
      customerEmail: 'test3@example.com',
      amountCents: 3000,
      metadata: { commandeId: 'cmd_3', demandeId: 'dem_3', offerId: 'off_3' },
    });

    await gateway.cancelPaymentIntent(created.id);
    const retrieved = await gateway.retrievePaymentIntent(created.id);
    expect(retrieved.status).toBe('canceled');
  });

  it('returns synthetic PaymentIntent for unseeded id', async () => {
    const retrieved = await gateway.retrievePaymentIntent('pi_fake_unseeded');
    expect(retrieved.id).toBe('pi_fake_unseeded');
    expect(retrieved.status).toBe('requires_payment_method');
    expect(retrieved.clientSecret).toMatch(/^pi_fake_unseeded_secret_/);
  });

  it('marks PaymentIntent succeeded and records chargeId', async () => {
    const created = await gateway.createPaymentIntent({
      commandeId: 'cmd_4',
      demandeId: 'dem_4',
      offerId: 'off_4',
      customerEmail: 'test4@example.com',
      amountCents: 5000,
      metadata: { commandeId: 'cmd_4', demandeId: 'dem_4', offerId: 'off_4' },
    });

    gateway.markPaymentIntentSucceeded(created.id, 'ch_test_123');
    const retrieved = await gateway.retrievePaymentIntent(created.id);
    expect(retrieved.status).toBe('succeeded');
    expect(retrieved.chargeId).toBe('ch_test_123');
  });

  it('stores and retrieves PaymentIntent input via paymentIntentFor', async () => {
    const input = {
      commandeId: 'cmd_5',
      demandeId: 'dem_5',
      offerId: 'off_5',
      customerEmail: 'test5@example.com',
      amountCents: 7500,
      metadata: { commandeId: 'cmd_5', demandeId: 'dem_5', offerId: 'off_5' },
    };
    const created = await gateway.createPaymentIntent(input);
    const stored = gateway.paymentIntentFor(created.id);
    expect(stored?.input).toEqual(input);
    expect(stored?.summary.id).toBe(created.id);
  });
});

