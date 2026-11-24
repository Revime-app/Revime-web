import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  __resetPaymentsGateway,
  FakePaymentsGateway,
  paymentsGateway,
} from '../src/payments/gateway.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

const SECRET = 'whsec_test_p1';
let eventSeq = 0;

describe('accept via payment', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  const createdEmails: string[] = [];
  const eventIds: string[] = [];
  const saved: Record<string, string | undefined> = {};

  const offerBody = (over: Record<string, unknown> = {}) => ({
    priceCents: 8900,
    delayHours: 24,
    // CF-31: « Aucune ». These réparateurs are at NONE and a garantie is refused below
    // BUSINESS - see `offers.service.ts`'s `assertWarrantyAllowed`.
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: false,
    ...over,
  });

  /** A demande with `count` SENT offers on it, from `count` distinct réparateurs. */
  async function aDemandeWithOffers(count: number): Promise<{
    demandeId: string;
    offerIds: string[];
    clientCookie: string;
  }> {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const demande = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send({
        categoryId,
        title: 'Écran iPhone 13 fissuré',
        description:
          "L'écran est fissuré en haut à droite et la batterie tient mal.",
        mode: 'OFFERS',
        locationLabel: 'Lyon 3e',
        postalCode: '69003',
      })
      .expect(201);

    const offerIds: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const repairer = await signUpRepairer(app);
      createdEmails.push(repairer.email);
      const offer = await request(app.getHttpServer())
        .post(`/api/v1/demandes/${demande.body.id}/offers`)
        .set('Cookie', repairer.cookie)
        .send(offerBody({ priceCents: 8000 + i * 500 }))
        .expect(201);
      offerIds.push(offer.body.id);
    }

    return {
      demandeId: demande.body.id,
      offerIds,
      clientCookie: client.cookie,
    };
  }

  /** Pays a commande the way Stripe would: complete the session, then deliver the event. */
  async function pay(commandeId: string): Promise<string> {
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    const sessionId = commande.stripeSessionId!;
    (paymentsGateway() as FakePaymentsGateway).markComplete(sessionId, {
      paymentIntentId: `pi_fake_${commandeId}`,
      chargeId: `ch_fake_${commandeId}`,
    });

    eventSeq += 1;
    const id = `evt_p1_accept_${eventSeq}`;
    eventIds.push(id);
    await deliver({
      id,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_intent: `pi_fake_${commandeId}`,
          metadata: { commandeId },
        },
      },
    });
    return id;
  }

  async function deliver(payload: object, expectStatus = 200): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = Stripe.webhooks.generateTestHeaderString({
      payload: body,
      secret: SECRET,
    });
    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set('stripe-signature', signature)
      .send(body)
      .expect(expectStatus);
  }

  async function checkout(offerId: string, cookie: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', cookie)
      .send({ delivery: 'WORKSHOP' })
      .expect(201);
    return res.body.commandeId;
  }

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
    const category = await prisma.category.findFirstOrThrow({
      where: { slug: 'smartphone' },
    });
    categoryId = category.id;
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

  it('accepts one offer, rejects the others, and moves the demande - counted, not trusted', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(3);
    const commandeId = await checkout(offerIds[1]!, clientCookie);

    await pay(commandeId);

    const offers = await prisma.offer.findMany({
      where: { demandeId },
      select: { id: true, status: true },
    });
    expect(
      offers.filter((o) => o.status === 'ACCEPTED').map((o) => o.id),
    ).toEqual([offerIds[1]!]);
    expect(offers.filter((o) => o.status === 'REJECTED')).toHaveLength(2);
    expect(offers.filter((o) => o.status === 'SENT')).toHaveLength(0);

    const demande = await prisma.demande.findUniqueOrThrow({
      where: { id: demandeId },
    });
    expect(demande.status).toBe('IN_PROGRESS');
  });

  it('stamps the commande with everything P3 will need', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);

    await pay(commandeId);

    const row = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    expect(row.status).toBe('PAID');
    expect(row.paidAt).not.toBeNull();
    expect(row.stripePaymentIntentId).toBe(`pi_fake_${commandeId}`);
    expect(row.stripeChargeId).toBe(`ch_fake_${commandeId}`);
    // 60 days from payment, the compliance backstop against the 90-day limit.
    expect(row.autoReleaseDueAt!.getTime() - row.paidAt!.getTime()).toBe(
      60 * 86_400_000,
    );
  });

  it('leaves a withdrawn sibling withdrawn rather than rejecting it', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(2);
    await prisma.offer.update({
      where: { id: offerIds[1]! },
      data: { status: 'WITHDRAWN' },
    });

    const commandeId = await checkout(offerIds[0]!, clientCookie);
    await pay(commandeId);

    const offers = await prisma.offer.findMany({
      where: { demandeId },
      select: { id: true, status: true },
    });
    expect(offers.find((o) => o.id === offerIds[1]!)?.status).toBe('WITHDRAWN');
    expect(offers.find((o) => o.id === offerIds[0]!)?.status).toBe('ACCEPTED');
    expect(offers.filter((o) => o.status === 'REJECTED')).toHaveLength(0);
  });

  it('is idempotent when Stripe redelivers the same event', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(2);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const eventId = await pay(commandeId);

    const before = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });

    // Reset to PENDING_PAYMENT to isolate the ledger layer: if the handler ran,
    // the status would change. The same event id must be refused by the ledger
    // before the handler ever sees it.
    await prisma.commande.update({
      where: { id: commandeId },
      data: { status: 'PENDING_PAYMENT' },
    });

    await deliver({
      id: eventId,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: before.stripeSessionId,
          payment_intent: `pi_fake_${commandeId}`,
          metadata: { commandeId },
        },
      },
    });

    const after = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    expect(after.status).toBe('PENDING_PAYMENT');
    expect(
      await prisma.offer.count({ where: { demandeId, status: 'ACCEPTED' } }),
    ).toBe(1);
    expect(
      await prisma.offer.count({ where: { demandeId, status: 'REJECTED' } }),
    ).toBe(1);
  });

  it('is idempotent for a DIFFERENT event describing an already-paid commande', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(2);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    await pay(commandeId);
    const before = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });

    // A fresh event id, so the ledger does not catch it. Only the PAID check can.
    eventSeq += 1;
    const id = `evt_p1_accept_dup_${eventSeq}`;
    eventIds.push(id);
    await deliver({
      id,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: before.stripeSessionId,
          payment_intent: `pi_fake_${commandeId}`,
          metadata: { commandeId },
        },
      },
    });

    const after = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    expect(after.paidAt?.getTime()).toBe(before.paidAt?.getTime());
    expect(
      await prisma.offer.count({ where: { demandeId, status: 'ACCEPTED' } }),
    ).toBe(1);
  });

  it('answers 200 for a session it has no commande for, so Stripe stops retrying', async () => {
    eventSeq += 1;
    const id = `evt_p1_orphan_${eventSeq}`;
    eventIds.push(id);
    await deliver({
      id,
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_fake_orphan', metadata: {} } },
    });

    expect(
      await prisma.stripeEvent.findUnique({ where: { id } }),
    ).not.toBeNull();
  });

  it('closes the loop: no further checkout is possible on an accepted demande', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(2);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    await pay(commandeId);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerIds[1]!}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'WORKSHOP' });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("Cette offre n'est plus disponible.");
    expect(
      (await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } }))
        .status,
    ).toBe('IN_PROGRESS');
    expect(await prisma.commande.count({ where: { demandeId } })).toBe(1);
  });

  it('bars a réparateur from offering again on an accepted demande', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    await pay(commandeId);

    const newcomer = await signUpRepairer(app);
    createdEmails.push(newcomer.email);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demandeId}/offers`)
      .set('Cookie', newcomer.cookie)
      .send(offerBody());

    // This is why Offer's partial unique index needs no widening: the demande
    // status guard already makes an accepted demande unofferable. See spec §4.3.
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      "Cette demande n'accepte plus d'offres.",
    );
  });

  it('does not swallow a paid event when the handler throws - the claim is released for the redelivery', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);

    // A session id the fake gateway never issued, so retrieveCheckoutSession
    // rejects inside the handler - the shape a real Stripe outage takes.
    const unknownSession = 'cs_fake_never_issued_by_the_gateway';
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeSessionId: unknownSession },
    });

    eventSeq += 1;
    const id = `evt_p1_thrower_${eventSeq}`;
    eventIds.push(id);
    const body = JSON.stringify({
      id,
      type: 'checkout.session.completed',
      data: { object: { id: unknownSession, metadata: { commandeId } } },
    });
    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set(
        'stripe-signature',
        Stripe.webhooks.generateTestHeaderString({
          payload: body,
          secret: SECRET,
        }),
      )
      .send(body)
      .expect(500);

    // The claim must be GONE, or Stripe's retry would be discarded as a duplicate
    // and this client's payment would never accept an offer.
    expect(await prisma.stripeEvent.findUnique({ where: { id } })).toBeNull();

    // And nothing may have been half-applied.
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    expect(commande.status).toBe('PENDING_PAYMENT');
    expect(
      await prisma.offer.count({ where: { demandeId, status: 'ACCEPTED' } }),
    ).toBe(0);
    expect(
      (await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } }))
        .status,
    ).toBe('OPEN');
  });

  it('refuses a completed event when the session itself is not complete - releases the claim for Stripe retry', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    const sessionId = commande.stripeSessionId!;

    // The session is open, not complete - no markComplete call. The event
    // claims payment happened, but Stripe's own record does not agree.
    eventSeq += 1;
    const id = `evt_p1_mismatch_${eventSeq}`;
    eventIds.push(id);
    const body = JSON.stringify({
      id,
      type: 'checkout.session.completed',
      data: {
        object: {
          id: sessionId,
          payment_intent: `pi_fake_${commandeId}`,
          metadata: { commandeId },
        },
      },
    });
    await request(app.getHttpServer())
      .post('/api/v1/stripe/webhook')
      .set('Content-Type', 'application/json')
      .set(
        'stripe-signature',
        Stripe.webhooks.generateTestHeaderString({
          payload: body,
          secret: SECRET,
        }),
      )
      .send(body)
      .expect(500);

    // The claim must be released, so Stripe's redelivery can try again.
    expect(await prisma.stripeEvent.findUnique({ where: { id } })).toBeNull();

    // The offer is still SENT, the demande is still OPEN, and the commande is
    // still PENDING_PAYMENT - no accept happened.
    expect(
      (await prisma.offer.findUniqueOrThrow({ where: { id: offerIds[0]! } }))
        .status,
    ).toBe('SENT');
    expect(
      (await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } }))
        .status,
    ).toBe('OPEN');
    expect(
      (await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } }))
        .status,
    ).toBe('PENDING_PAYMENT');
  });

  it('refuses a second checkout after a payment completes but before the webhook lands', async () => {
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });

    // Mark the session complete but do NOT deliver the webhook yet.
    (paymentsGateway() as FakePaymentsGateway).markComplete(
      commande.stripeSessionId!,
      {
        paymentIntentId: `pi_fake_${commandeId}`,
        chargeId: `ch_fake_${commandeId}`,
      },
    );

    // The client taps Payer again. The service should refuse, because the
    // session is already paid - allowing it would charge them twice.
    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerIds[0]!}/checkout`)
      .set('Cookie', clientCookie)
      .send({ delivery: 'WORKSHOP' });

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Ce paiement a déjà été effectué.');

    // Now deliver the webhook and confirm the accept succeeded.
    await pay(commandeId);

    expect(
      (await prisma.offer.findUniqueOrThrow({ where: { id: offerIds[0]! } }))
        .status,
    ).toBe('ACCEPTED');
    expect(
      (await prisma.demande.findUniqueOrThrow({ where: { id: demandeId } }))
        .status,
    ).toBe('IN_PROGRESS');
    expect(await prisma.commande.count({ where: { demandeId } })).toBe(1);
  });

  it('starts the lifecycle at PAID in the same transaction as the accept', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    await pay(commandeId);

    const row = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    expect(row.status).toBe('PAID');
    expect(row.step).toBe('PAID');
    // P3 stores the fact, not the policy: nothing has been requested yet.
    expect(row.releaseRequestedAt).toBeNull();
    // P1's 60-day compliance backstop is untouched by P3. Spec §4.5.
    expect(row.autoReleaseDueAt).not.toBeNull();
  });

  it('notifies the winner and EVERY loser when a session completes', async () => {
    // Three SENT offers on one demande; one is paid. Both losers must hear about it, which
    // is the test that fails if the pre-transaction read of the siblings is skipped -
    // updateMany returns a count, not rows, so after the flip they are indistinguishable
    // from anyone rejected by an earlier commande. Design §8.1.
    const { demandeId, offerIds, clientCookie } = await aDemandeWithOffers(3);

    // Get the réparateur user ids from the offers before checkout.
    const offers = await prisma.offer.findMany({
      where: { id: { in: offerIds } },
      select: { id: true, repairerUserId: true },
    });

    const commandeId = await checkout(offerIds[1]!, clientCookie);
    await pay(commandeId);

    const winnerUserId = offers.find((o) => o.id === offerIds[1]!)!.repairerUserId;
    const loserUserIds = offers
      .filter((o) => o.id !== offerIds[1]!)
      .map((o) => o.repairerUserId);

    const accepted = await prisma.notification.findFirstOrThrow({
      where: { userId: winnerUserId, type: 'OFFER_ACCEPTED' },
    });
    expect(accepted.mode).toBe('REPAIRER');
    expect(accepted.commandeId).toBeTruthy();

    const declined = await prisma.notification.findMany({
      where: { userId: { in: loserUserIds }, type: 'OFFER_DECLINED' },
    });
    expect(declined).toHaveLength(2);
    expect(declined.every((d) => d.mode === 'REPAIRER')).toBe(true);
    expect(declined.every((d) => d.demandeId === demandeId)).toBe(true);
  });
});
