import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { __resetPaymentsGateway, paymentsGateway, FakePaymentsGateway } from '../src/payments/gateway.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

const SECRET = 'whsec_test_p1';

/** A really-signed body, so the signature check under test is the real one. */
function signed(payload: object): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  return {
    body,
    signature: Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: SECRET,
    }),
  };
}

describe('stripe webhook', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const eventIds: string[] = [];
  const createdEmails: string[] = [];
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const k of [
      'PAYMENTS_ENABLED',
      'STRIPE_WEBHOOK_SECRET',
      'PUBLIC_API_URL',
      'STRIPE_DRIVER',
      'STRIPE_SECRET_KEY',
    ]) {
      saved[k] = process.env[k];
    }
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
    __resetPaymentsGateway();

    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.stripeEvent.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    __resetPaymentsGateway();
  });

  it('rejects a body with no signature header, writing nothing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send(
        JSON.stringify({
          id: 'evt_unsigned',
          type: 'checkout.session.completed',
        }),
      );

    expect(res.status).toBe(400);
    expect(
      await prisma.stripeEvent.findUnique({ where: { id: 'evt_unsigned' } }),
    ).toBeNull();
  });

  it('rejects a forged signature', async () => {
    const body = JSON.stringify({
      id: 'evt_forged',
      type: 'checkout.session.completed',
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', 't=1,v1=deadbeef')
      .send(body);

    expect(res.status).toBe(400);
    expect(
      await prisma.stripeEvent.findUnique({ where: { id: 'evt_forged' } }),
    ).toBeNull();
  });

  it('rejects a correctly-signed body whose payload was then altered', async () => {
    const { signature } = signed({
      id: 'evt_original',
      type: 'checkout.session.completed',
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(
        JSON.stringify({
          id: 'evt_tampered',
          type: 'checkout.session.completed',
        }),
      );

    expect(res.status).toBe(400);
    expect(
      await prisma.stripeEvent.findUnique({ where: { id: 'evt_tampered' } }),
    ).toBeNull();
    expect(
      await prisma.stripeEvent.findUnique({ where: { id: 'evt_original' } }),
    ).toBeNull();
  });

  it('accepts a properly signed event and records it once', async () => {
    eventIds.push('evt_p1_ledger');
    const { body, signature } = signed({
      id: 'evt_p1_ledger',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_fake_nonexistent' } },
    });

    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body)
      .expect(200);

    const row = await prisma.stripeEvent.findUniqueOrThrow({
      where: { id: 'evt_p1_ledger' },
    });
    expect(row.type).toBe('checkout.session.expired');
  });

  it('answers 200 to a redelivery without writing a second ledger row', async () => {
    eventIds.push('evt_p1_redelivered');
    const { body, signature } = signed({
      id: 'evt_p1_redelivered',
      type: 'checkout.session.expired',
      data: { object: { id: 'cs_fake_nonexistent' } },
    });

    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body)
      .expect(200);

    const firstDelivery = await prisma.stripeEvent.findUniqueOrThrow({
      where: { id: 'evt_p1_redelivered' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body)
      .expect(200);

    const afterRedelivery = await prisma.stripeEvent.findUniqueOrThrow({
      where: { id: 'evt_p1_redelivered' },
    });

    expect(afterRedelivery.receivedAt).toEqual(firstDelivery.receivedAt);
  });

  it('ignores an event type it does not handle, rather than 500ing Stripe into retrying forever', async () => {
    eventIds.push('evt_p1_unknown');
    const { body, signature } = signed({
      id: 'evt_p1_unknown',
      type: 'payment_intent.created',
      data: { object: {} },
    });

    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body)
      .expect(200);
  });

  /** Creates a minimal paid commande for P5 webhook tests. */
  async function aPaidCommande(): Promise<{ commandeId: string; chargeId: string; demandeId: string }> {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
    const demande = await prisma.demande.create({
      data: {
        authorUserId: (await prisma.user.findUniqueOrThrow({ where: { email: client.email } })).id,
        categoryId: category.id,
        title: 'Test webhook',
        description: 'Test P5 webhook handlers.',
        locationLabel: 'Paris 5e',
        postalCode: '75005',
        status: 'IN_PROGRESS',
      },
      select: { id: true, authorUserId: true },
    });
    const repairer = await signUp(app);
    createdEmails.push(repairer.email);
    const repairerUser = await prisma.user.findUniqueOrThrow({ where: { email: repairer.email } });
    const offer = await prisma.offer.create({
      data: {
        demandeId: demande.id,
        repairerUserId: repairerUser.id,
        priceCents: 5000,
        delayHours: 24,
        warrantyLabel: '6 mois',
        partsLabel: "Pièce d'origine",
        travel: 'WORKSHOP',
        status: 'ACCEPTED',
      },
      select: { id: true },
    });
    const chargeId = `ch_fake_${demande.id}`;
    const commande = await prisma.commande.create({
      data: {
        demandeId: demande.id,
        offerId: offer.id,
        clientUserId: demande.authorUserId,
        repairerUserId: repairerUser.id,
        delivery: 'WORKSHOP',
        repairCents: 5000,
        shippingCents: 0,
        protectionCents: 400,
        totalCents: 5400,
        status: 'PAID',
        step: 'PAID',
        paidAt: new Date(),
        stripeChargeId: chargeId,
      },
      select: { id: true },
    });
    return { commandeId: commande.id, chargeId, demandeId: demande.id };
  }

  function postEvent(type: string, data: Record<string, unknown>): request.Test {
    const eventId = `evt_${type.replace(/\./g, '_')}_${Date.now()}`;
    eventIds.push(eventId);
    const { body, signature } = signed({
      id: eventId,
      type,
      data: { object: data },
    });
    return request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body);
  }

  it('freezes a commande when its charge is disputed', async () => {
    const { commandeId, chargeId } = await aPaidCommande();
    await postEvent('charge.dispute.created', { id: 'dp_1', charge: chargeId }).expect(200);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.disputedAt).not.toBeNull();
  });

  it('ignores a dispute for a charge that is not ours, without retrying forever', async () => {
    await postEvent('charge.dispute.created', { id: 'dp_2', charge: 'ch_not_ours' }).expect(200);
  });

  it('records a refund that settles later', async () => {
    const { commandeId } = await aPaidCommande();
    (paymentsGateway() as FakePaymentsGateway).setNextRefundStatus('pending');

    // Simulate refund via admin (not calling the actual endpoint, just creating the state)
    const refundId = `re_fake_${randomUUID()}`;
    await prisma.commande.update({
      where: { id: commandeId },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundedCents: 5400,
        stripeRefundId: refundId,
      },
    });
    await prisma.demande.update({
      where: { id: (await prisma.commande.findUniqueOrThrow({ where: { id: commandeId }, select: { demandeId: true } })).demandeId },
      data: { status: 'CANCELLED' },
    });

    await postEvent('refund.updated', { id: refundId, status: 'succeeded' }).expect(200);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.refundedAt).not.toBeNull();
    expect(row.refundedCents).toBe(5400);
  });

  it('does not leave the row claiming the client was repaid when a refund fails', async () => {
    const { commandeId, demandeId } = await aPaidCommande();
    (paymentsGateway() as FakePaymentsGateway).setNextRefundStatus('pending');

    // Simulate pending refund
    const refundId = `re_fake_${randomUUID()}`;
    await prisma.commande.update({
      where: { id: commandeId },
      data: {
        status: 'REFUNDED',
        refundedAt: new Date(),
        refundedCents: 5400,
        stripeRefundId: refundId,
      },
    });
    await prisma.demande.update({
      where: { id: demandeId },
      data: { status: 'CANCELLED' },
    });

    await postEvent('refund.updated', { id: refundId, status: 'failed' }).expect(200);

    const after = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(after.refundedAt).toBeNull();
    expect(after.refundedCents).toBeNull();
    expect(after.status).toBe('PAID');
    expect(after.stripeRefundId).toBe(refundId);

    const demande = await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } });
    expect(demande.status).toBe('IN_PROGRESS');
  });

  it('answers 200 to a redelivery of an event already processed', async () => {
    const { commandeId, chargeId } = await aPaidCommande();
    const eventId = `evt_redelivery_${Date.now()}`;
    eventIds.push(eventId);
    const { body, signature } = signed({
      id: eventId,
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_redelivery', charge: chargeId } },
    });

    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body)
      .expect(200);

    const firstDispute = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(firstDispute.disputedAt).not.toBeNull();
    const firstDisputedAt = firstDispute.disputedAt;

    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body)
      .expect(200);

    const afterRedelivery = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(afterRedelivery.disputedAt).toEqual(firstDisputedAt);
  });
});
