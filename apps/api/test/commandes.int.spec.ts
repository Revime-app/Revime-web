import { INestApplication } from '@nestjs/common';
import Stripe from 'stripe';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  __resetPaymentsGateway,
  FakePaymentsGateway,
  paymentsGateway,
} from '../src/payments/gateway.js';
import {
  __resetConnectGateway,
  connectGateway,
  FakeConnectGateway,
} from '../src/connect/gateway.js';
import { __setMailSender } from '../src/mail/mail.service.js';
import {
  __registerBoxtalGateway,
  __resetShippingGateway,
  FakeShippingGateway,
  type BoxtalWebhookEvent,
  type LegOffer,
  type PackageTracking,
} from '../src/shipping/gateway.js';
import { CronService } from '../src/cron/cron.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

const SECRET = 'whsec_test_p1';
let eventSeq = 0;

describe('commandes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let cronService: CronService;
  let categoryId: string;
  const createdEmails: string[] = [];
  const eventIds: string[] = [];
  const saved: Record<string, string | undefined> = {};

  const offerBody = (over: Record<string, unknown> = {}) => ({
    priceCents: 8000,
    delayHours: 24,
    // CF-31: « Aucune ». These réparateurs are at NONE and a garantie is refused below
    // BUSINESS - see `offers.service.ts`'s `assertWarrantyAllowed`.
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: true,
    ...over,
  });

  const demandeBody = () => ({
    categoryId,
    title: 'Écran iPhone 13 fissuré',
    description:
      "L'écran est fissuré en haut à droite et la batterie tient mal.",
    mode: 'OFFERS',
    locationLabel: 'Lyon 3e',
    postalCode: '69003',
  });

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
      .send(demandeBody())
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

  async function checkout(offerId: string, cookie: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offerId}/checkout`)
      .set('Cookie', cookie)
      .send({ delivery: 'WORKSHOP' })
      .expect(201);
    return res.body.commandeId;
  }

  async function aPaidCommande(
    delivery: 'WORKSHOP' | 'PARCEL' = 'WORKSHOP',
  ): Promise<{
    commandeId: string;
    clientCookie: string;
    repairerCookie: string;
  }> {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const demande = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send(demandeBody())
      .expect(201);
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);
    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.body.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offer.body.id}/checkout`)
      .set('Cookie', client.cookie)
      .send({ delivery })
      .expect(201);
    await pay(res.body.commandeId);

    return {
      commandeId: res.body.commandeId,
      clientCookie: client.cookie,
      repairerCookie: repairer.cookie,
    };
  }

  const advance = (id: string, cookie: string, step: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/commandes/${id}/steps`)
      .set('Cookie', cookie)
      .send({ step });

  const addressBody = (over: Record<string, unknown> = {}) => ({
    line1: '12 rue de la Paix',
    postalCode: '75002',
    city: 'Paris',
    phone: '0612345678',
    ...over,
  });

  const putAddress = (id: string, cookie: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/commandes/${id}/shipping-address`)
      .set('Cookie', cookie)
      .send(body);

  async function pay(commandeId: string): Promise<void> {
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });
    const sessionId = commande.stripeSessionId!;
    (paymentsGateway() as FakePaymentsGateway).markComplete(sessionId, {
      paymentIntentId: `pi_fake_${commandeId}`,
      chargeId: `ch_fake_${commandeId}`,
    });

    eventSeq += 1;
    const id = `evt_p1_cmd_${eventSeq}`;
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
      .expect(200);
  }

  /**
   * A commande at AWAITING_VALIDATION whose réparateur has a payable
   * ConnectAccount. The row is created directly rather than through onboarding:
   * P2's onboarding flow is its own suite's subject, and going through it here
   * would make every release test depend on it.
   */
  async function aCommandeAwaitingValidation(): Promise<{
    commandeId: string;
    clientCookie: string;
    repairerCookie: string;
    accountId: string;
  }> {
    const { commandeId, clientCookie, repairerCookie } = await aPaidCommande('WORKSHOP');
    await advance(commandeId, repairerCookie, 'REPAIR_STARTED').expect(200);
    await advance(commandeId, repairerCookie, 'REPAIR_DONE').expect(200);
    await advance(commandeId, repairerCookie, 'AWAITING_VALIDATION').expect(200);

    const commande = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    const fake = connectGateway() as FakeConnectGateway;
    const account = await fake.createAccount({ email: 'probe@repareme.test' });
    fake.markVerified(account.id);
    await prisma.connectAccount.create({
      data: {
        userId: commande.repairerUserId,
        stripeAccountId: account.id,
        status: 'VERIFIED',
        transfersActive: true,
        lastSyncedAt: new Date(),
      },
    });
    // CMP-D3: the golden rule holds a payout until the réparateur has declared, so a réparateur
    // who is meant to be paid here has.
    await prisma.repairerProfile.update({ where: { userId: commande.repairerUserId }, data: { fiscalCompletedAt: new Date() } });

    return { commandeId, clientCookie, repairerCookie, accountId: account.id };
  }

  /**
   * A PARCEL commande at RETURN_SENT, with both addresses and both labels, so the
   * réparateur has genuinely done everything he can and is waiting on the client.
   * `returnSentAt` is then back-dated directly, because the alternative is waiting
   * seven days.
   */
  async function aParcelAtReturnSent(daysAgo: number): Promise<{
    commandeId: string;
    clientCookie: string;
    repairerCookie: string;
  }> {
    const { commandeId, clientCookie, repairerCookie } = await aPaidCommande('PARCEL');
    await putAddress(commandeId, clientCookie, addressBody()).expect(200);
    await putAddress(commandeId, repairerCookie, addressBody({ city: 'Lyon' })).expect(200);
    await prisma.commande.update({
      where: { id: commandeId },
      data: { outboundTrackingNumber: '6A11111111111', returnTrackingNumber: '6A22222222222' },
    });
    await advance(commandeId, clientCookie, 'PARCEL_SENT').expect(200);
    await advance(commandeId, repairerCookie, 'PARCEL_RECEIVED').expect(200);
    await advance(commandeId, repairerCookie, 'REPAIR_STARTED').expect(200);
    await advance(commandeId, repairerCookie, 'REPAIR_DONE').expect(200);
    await advance(commandeId, repairerCookie, 'RETURN_SENT').expect(200);

    await prisma.commande.update({
      where: { id: commandeId },
      data: { returnSentAt: new Date(Date.now() - daysAgo * 86_400_000) },
    });

    return { commandeId, clientCookie, repairerCookie };
  }

  const release = (id: string, cookie: string) =>
    request(app.getHttpServer()).post(`/api/v1/commandes/${id}/release`).set('Cookie', cookie);

  const run = (secret: string) =>
    request(app.getHttpServer())
      .post('/api/v1/internal/cron/run')
      .set('x-cron-secret', secret);

  beforeAll(async () => {
    for (const k of [
      'PAYMENTS_ENABLED',
      'STRIPE_WEBHOOK_SECRET',
      'PUBLIC_API_URL',
      'STRIPE_DRIVER',
      'STRIPE_SECRET_KEY',
      'CONNECT_ENABLED',
      'STRIPE_CONNECT_WEBHOOK_SECRET',
      'CRON_SECRET',
    ]) {
      saved[k] = process.env[k];
    }
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
    process.env.CONNECT_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect_p3';
    process.env.CRON_SECRET = 'cron_secret_for_test';
    __resetPaymentsGateway();
    __resetConnectGateway();

    app = await createTestApp();
    prisma = app.get(PrismaService);
    cronService = app.get(CronService);
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
    __resetConnectGateway();
  });

  it('gives the client the full breakdown', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    await pay(commandeId);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body).toMatchObject({
      id: commandeId,
      offerId: offerIds[0],
      delivery: 'WORKSHOP',
      repairCents: 8000,
      shippingCents: 0,
      protectionCents: 650, // protectionCentsFor(8000): 290 + 4,5 % of 8000
      totalCents: 8650,
      status: 'PAID',
      demandeTitle: 'Écran iPhone 13 fissuré',
    });
    expect(typeof res.body.repairerName).toBe('string');
    expect(res.body.paidAt).not.toBeNull();
  });

  it('lets the réparateur read the commande they won', async () => {
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
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);
    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.body.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);

    const commandeId = await checkout(offer.body.id, client.cookie);
    await pay(commandeId);

    await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', repairer.cookie)
      .expect(200);
  });

  it('404s for a stranger', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', stranger.cookie);

    expect(res.status).toBe(404);
  });

  it('redirects a successful return into the app', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/payments/return?commande=${commandeId}&r=ok`)
      .expect(302);

    expect(res.headers.location).toBe(
      `revime://demande/${commande.demandeId}/acceptee?c=${commandeId}`,
    );
  });

  it('redirects a cancelled return to the failure screen', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/payments/return?commande=${commandeId}&r=cancel`)
      .expect(302);

    expect(res.headers.location).toBe(
      `revime://demande/${commande.demandeId}/echec?offerId=${offerIds[0]!}`,
    );
  });

  it('redirects an unknown commande to the app root rather than leaking anything', async () => {
    const res = await request(app.getHttpServer())
      .get(
        '/api/v1/payments/return?commande=00000000-0000-0000-0000-000000000000&r=ok',
      )
      .expect(302);

    expect(res.headers.location).toBe('revime://');
  });

  it('reports the lifecycle and the payout on a paid commande', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    await pay(commandeId);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body).toMatchObject({
      status: 'PAID',
      step: 'PAID',
      viewerRole: 'CLIENT',
      repairCents: 8000,
      totalCents: 8650,
      // 100% of the quote: « Protection Revime » is the platform's only revenue.
      payoutCents: 8000,
    });
    expect(res.body.releaseRequestedAt).toBeNull();
    expect(res.body.releasedAt).toBeNull();
  });

  it('carries a null step on an unpaid commande rather than claiming PAID', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body.status).toBe('PENDING_PAYMENT');
    expect(res.body.step).toBeNull();
  });

  it('tells the réparateur he is the réparateur', async () => {
    const { demandeId, clientCookie } = await aDemandeWithOffers(0);
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);
    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demandeId}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);
    const commandeId = await checkout(offer.body.id, clientCookie);
    await pay(commandeId);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', repairer.cookie)
      .expect(200);

    expect(res.body.viewerRole).toBe('REPAIRER');
    expect(res.body.payoutCents).toBe(8000);
  });

  it('never exposes the dispute date, only that the payment is under review', async () => {
    const { commandeId, clientCookie } = await aPaidCommande();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { disputedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body.paymentUnderReview).toBe(true);
    // A date would tell the client we are watching his chargeback clock.
    expect(res.body).not.toHaveProperty('disputedAt');
  });

  it('reports the refund on the DTO once it has happened', async () => {
    const { commandeId, clientCookie } = await aPaidCommande();
    const refundRes = await refundAsAdmin(commandeId, 'Annulation.');
    expect(refundRes.status).toBe(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body.status).toBe('REFUNDED');
    expect(res.body.refundedCents).toBe(res.body.totalCents);
    expect(res.body.refundedAt).not.toBeNull();
  });

  it('lists a réparateur his own commandes and a client his own', async () => {
    const { demandeId, clientCookie } = await aDemandeWithOffers(0);
    const repairer = await signUpRepairer(app);
    createdEmails.push(repairer.email);
    const offer = await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demandeId}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);
    const commandeId = await checkout(offer.body.id, clientCookie);
    await pay(commandeId);

    // Set a distinct displayName so the two roles produce distinguishable
    // counterpartyNames. Without this both read 'Test Utilisateur' and a swapped
    // mapping would pass.
    const commande = await prisma.commande.findUniqueOrThrow({
      where: { id: commandeId },
      select: { repairerUserId: true },
    });
    await prisma.repairerProfile.update({
      where: { userId: commande.repairerUserId },
      data: { displayName: 'Atelier Contrepartie' },
    });

    const mine = await request(app.getHttpServer())
      .get('/api/v1/commandes?role=repairer')
      .set('Cookie', repairer.cookie)
      .expect(200);
    const repairerRow = mine.body.find((c: { id: string }) => c.id === commandeId);
    expect(repairerRow).toBeDefined();
    expect(repairerRow).toMatchObject({ step: 'PAID', payoutCents: 8000 });
    // The réparateur's list carries the client's account name.
    expect(repairerRow.counterpartyName).toBe('Test Utilisateur');

    const asClient = await request(app.getHttpServer())
      .get('/api/v1/commandes?role=client')
      .set('Cookie', clientCookie)
      .expect(200);
    const clientRow = asClient.body.find((c: { id: string }) => c.id === commandeId);
    expect(clientRow).toBeDefined();
    // The client's list carries the réparateur's display name.
    expect(clientRow.counterpartyName).toBe('Atelier Contrepartie');

    // Same user, wrong mode: his own other-role list, which is empty here.
    const wrongRole = await request(app.getHttpServer())
      .get('/api/v1/commandes?role=client')
      .set('Cookie', repairer.cookie)
      .expect(200);
    expect(wrongRole.body.map((c: { id: string }) => c.id)).not.toContain(commandeId);
  });

  it('excludes an unpaid commande from the list', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);

    const res = await request(app.getHttpServer())
      .get('/api/v1/commandes?role=client')
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body.map((c: { id: string }) => c.id)).not.toContain(commandeId);
  });

  it('refuses a missing or invalid role with 400 and a French message', async () => {
    const client = await signUp(app);
    createdEmails.push(client.email);

    for (const qs of ['', '?role=', '?role=admin']) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/commandes${qs}`)
        .set('Cookie', client.cookie);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
      expect(res.body.error.message).toBeTruthy();
    }
  });

  it('walks a workshop commande from PAID to AWAITING_VALIDATION', async () => {
    const { commandeId, repairerCookie } = await aPaidCommande('WORKSHOP');

    for (const step of ['REPAIR_STARTED', 'REPAIR_DONE', 'AWAITING_VALIDATION']) {
      const res = await advance(commandeId, repairerCookie, step).expect(200);
      expect(res.body.step).toBe(step);
    }

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.releaseRequestedAt).not.toBeNull();
  });

  it('makes the CLIENT mark « Colis envoyé » and the réparateur mark « Colis reçu »', async () => {
    const { commandeId, clientCookie, repairerCookie } = await aPaidCommande('PARCEL');

    // The réparateur cannot claim the client's shipment.
    const refused = await advance(commandeId, repairerCookie, 'PARCEL_SENT');
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('FORBIDDEN');
    // Note the 403 lands BEFORE any label exists: the claimant check runs ahead of
    // the label guard, so the wrong party is told the truer thing.

    // P4 requires a label before a parcel can be marked as sent - a client cannot
    // post a parcel Revime has not sent him an étiquette for. Written straight to
    // the row because issuing labels is the admin route's job, and this test's
    // subject is the claimant rule rather than issuance.
    await prisma.commande.update({
      where: { id: commandeId },
      data: { outboundTrackingNumber: '6C11112222' },
    });

    await advance(commandeId, clientCookie, 'PARCEL_SENT').expect(200);

    // And the client cannot claim receipt.
    const refused2 = await advance(commandeId, clientCookie, 'PARCEL_RECEIVED');
    expect(refused2.status).toBe(403);

    const ok = await advance(commandeId, repairerCookie, 'PARCEL_RECEIVED').expect(200);
    expect(ok.body.step).toBe('PARCEL_RECEIVED');
  });

  it('refuses a parcel step on a workshop commande', async () => {
    const { commandeId, clientCookie } = await aPaidCommande('WORKSHOP');

    const res = await advance(commandeId, clientCookie, 'PARCEL_SENT');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('PAID');
  });

  it('refuses a skipped step', async () => {
    const { commandeId, repairerCookie } = await aPaidCommande('WORKSHOP');

    const res = await advance(commandeId, repairerCookie, 'AWAITING_VALIDATION');
    expect(res.status).toBe(422);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('PAID');
  });

  it('refuses RELEASED on the tracking route and does not touch the row', async () => {
    const { commandeId, clientCookie, repairerCookie } = await aPaidCommande('WORKSHOP');
    await advance(commandeId, repairerCookie, 'REPAIR_STARTED').expect(200);
    await advance(commandeId, repairerCookie, 'REPAIR_DONE').expect(200);
    await advance(commandeId, repairerCookie, 'AWAITING_VALIDATION').expect(200);

    // RELEASED is the genuine successor here and the client is the party who
    // causes it, so this is the one claim that would slip past a naive guard.
    const res = await advance(commandeId, clientCookie, 'RELEASED');
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('validation');

    // Assert the ROW, not only the status: a status-only assertion passes even
    // when the write went through, which is how four of P2's nine breaks hid.
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('AWAITING_VALIDATION');
    expect(row.stripeTransferId).toBeNull();
    expect(row.releasedAt).toBeNull();
  });

  it('serialises a double tap into exactly one advance', async () => {
    const { commandeId, repairerCookie } = await aPaidCommande('WORKSHOP');

    const [a, b] = await Promise.all([
      advance(commandeId, repairerCookie, 'REPAIR_STARTED'),
      advance(commandeId, repairerCookie, 'REPAIR_STARTED'),
    ]);

    // WHICH response wins the race is not ours to pin, and pinning it is how this
    // test becomes flaky. The loser answers 200 if it read before the winner's
    // write (its CAS simply matched no row) and 422 if it read after (the step it
    // claimed is no longer next). Both are honest; a 5xx never is.
    for (const res of [a, b]) {
      expect([200, 422]).toContain(res.status);
    }
    expect([a.status, b.status]).toContain(200);

    // If one got 422, verify it's the NOT_NEXT_STEP guard that fired.
    const loser = [a, b].find((res) => res.status === 422);
    if (loser) {
      expect(loser.body.error.code).toBe('UNPROCESSABLE_ENTITY');
      expect(loser.body.error.message).toBe(
        "Cette étape n'est pas la prochaine de la commande.",
      );
    }

    // The invariant that matters: exactly ONE advance happened, not two.
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('REPAIR_STARTED');
  });

  it('refuses to advance an unpaid commande', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const unpaid = await checkout(offerIds[0]!, clientCookie);

    const res = await advance(unpaid, clientCookie, 'REPAIR_STARTED');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
  });

  it("404s a stranger trying to advance someone else's commande", async () => {
    const { commandeId } = await aPaidCommande('WORKSHOP');
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);

    const res = await advance(commandeId, stranger.cookie, 'REPAIR_STARTED');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('refuses every step with PAYMENTS_ENABLED off', async () => {
    const { commandeId, repairerCookie } = await aPaidCommande('WORKSHOP');
    delete process.env.PAYMENTS_ENABLED;
    try {
      const res = await advance(commandeId, repairerCookie, 'REPAIR_STARTED');
      expect(res.status).toBe(422);
      // But the READ still works - P2's M8 principle.
      await request(app.getHttpServer())
        .get(`/api/v1/commandes/${commandeId}`)
        .set('Cookie', repairerCookie)
        .expect(200);
    } finally {
      process.env.PAYMENTS_ENABLED = 'true';
    }
  });

  it('transfers the repair price and only the repair price', async () => {
    const { commandeId, clientCookie, accountId } = await aCommandeAwaitingValidation();
    const gw = paymentsGateway() as FakePaymentsGateway;
    const before = gw.transferCount();

    const res = await release(commandeId, clientCookie).expect(200);

    expect(res.body.step).toBe('RELEASED');
    expect(res.body.releasedAt).not.toBeNull();
    expect(gw.transferCount()).toBe(before + 1);

    const sent = gw.transferFor(`release:${commandeId}`);
    // 8000, NOT 8650. The protection line (2,90 € + 4,5 %, here 650) is Revime's revenue
    // and the shipping line funds P4's label; neither is the réparateur's money.
    expect(sent).toMatchObject({
      amountCents: 8000,
      destination: accountId,
      sourceTransaction: `ch_fake_${commandeId}`,
      transferGroup: commandeId,
    });

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.transferredCents).toBe(8000);
    expect(row.stripeTransferId).toMatch(/^tr_fake_/);
    // And the payout the réparateur is shown now reads the recorded figure.
    expect(res.body.payoutCents).toBe(8000);
  });

  // V8 B2 (amended 2026-11-17, read by hand: `test:unit` cannot run this file). It asserted a 422
  // « Le réparateur ne peut pas encore recevoir de paiement. », which stopped being true when CMP-D3
  // made an inactive account a HOLD; nothing ran it, so it went stale unseen. V8 B2 removes that
  // refusal entirely. What stays the point of the test: Stripe's answer wins over the cached row, so
  // no money moves to an account Stripe says cannot take it.
  it('holds the payout when Stripe says the account is no longer payable, even when the cached row says VERIFIED', async () => {
    const { commandeId, clientCookie, accountId } = await aCommandeAwaitingValidation();
    // Stripe's answer changes; our row still says VERIFIED / transfersActive.
    (connectGateway() as FakeConnectGateway).markTransfersInactive(accountId);
    const cached = await prisma.connectAccount.findFirstOrThrow({
      where: { stripeAccountId: accountId },
    });
    expect(cached.transfersActive).toBe(true);

    const res = await release(commandeId, clientCookie).expect(200);
    expect(res.body.step).toBe('RELEASED');

    const gw = paymentsGateway() as FakePaymentsGateway;
    expect(gw.transferFor(`release:${commandeId}`)).toBeUndefined();
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('RELEASED');
    expect(row.stripeTransferId).toBeNull();
  });

  it('lets only the client release', async () => {
    const { commandeId, repairerCookie } = await aCommandeAwaitingValidation();
    const res = await release(commandeId, repairerCookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).toBeNull();
  });

  it('refuses before the work is awaiting validation', async () => {
    const { commandeId, clientCookie } = await aPaidCommande('WORKSHOP');
    const res = await release(commandeId, clientCookie);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe("La réparation n'est pas encore terminée.");
  });

  it('refuses a second release and creates no second transfer', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await release(commandeId, clientCookie).expect(200);
    const gw = paymentsGateway() as FakePaymentsGateway;
    const after = gw.transferCount();

    const second = await release(commandeId, clientCookie);
    expect(second.status).toBe(422);
    expect(second.body.error.message).toBe('Les fonds ont déjà été débloqués.');
    expect(gw.transferCount()).toBe(after);
  });

  it('refuses when the PAID row has no charge id', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    // P1 logs rather than throws on a missing charge id, so this row is reachable.
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeChargeId: null },
    });

    const res = await release(commandeId, clientCookie);
    expect(res.status).toBe(422);
    // No transfer was attempted, which is the point: the charge id IS the
    // source_transaction, so there is nothing to transfer against.
    const gw = paymentsGateway() as FakePaymentsGateway;
    expect(gw.transferFor(`release:${commandeId}`)).toBeUndefined();
  });

  it('refuses when the réparateur has no ConnectAccount at all', async () => {
    const { commandeId, clientCookie, repairerCookie } = await aPaidCommande('WORKSHOP');
    // Walk it to AWAITING_VALIDATION through the real route, then release without
    // ever having created a ConnectAccount for the réparateur.
    await advance(commandeId, repairerCookie, 'REPAIR_STARTED').expect(200);
    await advance(commandeId, repairerCookie, 'REPAIR_DONE').expect(200);
    await advance(commandeId, repairerCookie, 'AWAITING_VALIDATION').expect(200);

    const res = await release(commandeId, clientCookie);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');

    const gw = paymentsGateway() as FakePaymentsGateway;
    expect(gw.transferFor(`release:${commandeId}`)).toBeUndefined();
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('AWAITING_VALIDATION');
  });

  it('self-heals when the transfer succeeds and the write is lost', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    const gw = paymentsGateway() as FakePaymentsGateway;

    // Simulate the crash between transfer and write: create the transfer with the
    // exact key the route uses, then leave the row untouched.
    const first = await gw.createTransfer(
      {
        amountCents: 8000,
        destination: (
          await prisma.connectAccount.findFirstOrThrow({
            where: { user: { commandesAsRepairer: { some: { id: commandeId } } } },
          })
        ).stripeAccountId,
        sourceTransaction: `ch_fake_${commandeId}`,
        transferGroup: commandeId,
      },
      `release:${commandeId}`,
    );
    const count = gw.transferCount();

    // The client retries. P5's findTransferBySource lookup finds the existing
    // transfer, so the row is HEALED rather than re-created via key replay.
    const res = await release(commandeId, clientCookie).expect(200);

    expect(gw.transferCount()).toBe(count);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).toBe(first.id);
    expect(row.step).toBe('RELEASED');
    expect(res.body.step).toBe('RELEASED');
  });

  it('self-heals via idempotency key replay when the lookup misses', async () => {
    const { commandeId, clientCookie, accountId } = await aCommandeAwaitingValidation();
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    const gw = paymentsGateway() as FakePaymentsGateway;

    // Seed a transfer with the SAME idempotency key but a DIFFERENT destination,
    // so findTransferBySource() misses (wrong destination) but createTransfer()
    // hits the key and replays the existing transfer.
    const first = await gw.createTransfer(
      {
        amountCents: 8000,
        destination: 'acct_different_reparateur',
        sourceTransaction: row.stripeChargeId!,
        transferGroup: commandeId,
      },
      `release:${commandeId}`,
    );
    const count = gw.transferCount();

    // The client retries. The lookup misses, but the key replays.
    const res = await release(commandeId, clientCookie).expect(200);

    expect(gw.transferCount()).toBe(count);
    const released = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(released.stripeTransferId).toBe(first.id);
    expect(released.step).toBe('RELEASED');
  });

  it('refuses release with CONNECT_ENABLED off while the read still answers', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    delete process.env.CONNECT_ENABLED;
    try {
      const res = await release(commandeId, clientCookie);
      expect(res.status).toBe(422);
      await request(app.getHttpServer())
        .get(`/api/v1/commandes/${commandeId}`)
        .set('Cookie', clientCookie)
        .expect(200);
    } finally {
      process.env.CONNECT_ENABLED = 'true';
    }
  });

  it('refuses release when the transfer fails and does not write the row', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    (paymentsGateway() as FakePaymentsGateway).failNextTransferOnce();

    const res = await release(commandeId, clientCookie);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Le déblocage a échoué. Réessayez dans quelques minutes.');

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('AWAITING_VALIDATION');
    expect(row.stripeTransferId).toBeNull();
    expect(row.releasedAt).toBeNull();
  });

  it('refuses release when the account read fails with a distinct transient message', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    (connectGateway() as FakeConnectGateway).failNextRetrieveOnce();

    const res = await release(commandeId, clientCookie);
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      'Vérification du compte du réparateur impossible pour le moment. Réessayez.',
    );

    const gw = paymentsGateway() as FakePaymentsGateway;
    expect(gw.transferFor(`release:${commandeId}`)).toBeUndefined();
  });

  it('heals a stranded release instead of paying a second time', async () => {
    const { commandeId, clientCookie, accountId } = await aCommandeAwaitingValidation();
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    const fake = paymentsGateway() as FakePaymentsGateway;
    const before = fake.transferCount();

    // The stranded state the 24-hour idempotency-key expiry creates: the transfer
    // exists on Stripe's side and our row never recorded it. P3 shipped a documented
    // query for this; if release simply transferred again it would pay twice.
    // Seed a deliberately different amount to pin that we record STRIPE's figure.
    fake.seedTransfer({
      id: 'tr_already_made',
      destination: accountId,
      sourceTransaction: row.stripeChargeId!,
      amountCents: 7500,
    });

    const res = await release(commandeId, clientCookie).expect(200);

    expect(res.body.step).toBe('RELEASED');
    const healed = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(healed.stripeTransferId).toBe('tr_already_made');
    expect(healed.transferredCents).toBe(7500);
    // THE assertion of this task. A 200 alone would pass against the broken code.
    expect(fake.transferCount()).toBe(before + 1);
  });

  it('still releases normally when no transfer exists yet', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    const res = await release(commandeId, clientCookie).expect(200);
    expect(res.body.step).toBe('RELEASED');
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).toMatch(/^tr_fake_/);
  });

  it('refuses to release a disputed commande', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { disputedAt: new Date() },
    });
    const res = await release(commandeId, clientCookie).expect(422);
    expect(res.body.error.message).toBe("Ce paiement fait l'objet d'une vérification.");
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).toBeNull();
  });

  it('refuses to release a disputed commande even when the step would also fail, pinning the check ordering', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { disputedAt: new Date(), status: 'REFUNDED' },
    });
    const res = await release(commandeId, clientCookie).expect(422);
    expect(res.body.error.message).toBe("Ce paiement fait l'objet d'une vérification.");
  });

  it('releases a commande whose recorded refund FAILED at Stripe - no money moved, so the escrow is intact', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    const gw = paymentsGateway() as FakePaymentsGateway;
    const before = gw.transferCount();

    // The state `syncRefundState` leaves behind: back to PAID, id kept. Without
    // this fix such a row is unreleasable AND unrefundable - the client is never
    // repaid and the réparateur is never paid, with no in-app action left.
    const failedId = `re_failed_release_${commandeId}`;
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeRefundId: failedId },
    });
    gw.seedRefundStatus(failedId, 'failed');

    const res = await release(commandeId, clientCookie).expect(200);
    expect(res.body.step).toBe('RELEASED');
    expect(gw.transferCount()).toBe(before + 1);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).not.toBeNull();
  });

  it('still refuses release when the recorded refund SUCCEEDED at Stripe', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    const gw = paymentsGateway() as FakePaymentsGateway;
    const succeededId = `re_succeeded_release_${commandeId}`;
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeRefundId: succeededId },
    });
    gw.seedRefundStatus(succeededId, 'succeeded');

    const res = await release(commandeId, clientCookie).expect(422);
    expect(res.body.error.message).toBe('Ce paiement a déjà été remboursé.');
    expect(gw.transferFor(`release:${commandeId}`)).toBeUndefined();
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).toBeNull();
  });

  it('refuses release with a distinct transient message when the recorded refund cannot be read', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    const gw = paymentsGateway() as FakePaymentsGateway;
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeRefundId: `re_unreadable_release_${commandeId}` },
    });
    gw.failNextRetrieveRefundOnce();

    const res = await release(commandeId, clientCookie).expect(422);
    // Distinct from ALREADY_REFUNDED: an outage is retryable and must not read as
    // a settled fact about the client's money.
    expect(res.body.error.message).toBe(
      "L'état du remboursement n'a pas pu être vérifié. Réessayez dans quelques minutes.",
    );
    expect(gw.transferFor(`release:${commandeId}`)).toBeUndefined();
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).toBeNull();
  });

  it('releases a parcel commande and transfers repairCents only, not the 1900 shipping', async () => {
    const c = await aPaidCommande('PARCEL');
    await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);
    await putAddress(c.commandeId, c.repairerCookie, addressBody()).expect(200);
    await prisma.commande.update({
      where: { id: c.commandeId },
      data: {
        outboundTrackingNumber: '6C11112222',
        returnTrackingNumber: '6C33334444',
      },
    });

    // Walk all nine steps
    await advance(c.commandeId, c.clientCookie, 'PARCEL_SENT').expect(200);
    await advance(c.commandeId, c.repairerCookie, 'PARCEL_RECEIVED').expect(200);
    await advance(c.commandeId, c.repairerCookie, 'REPAIR_STARTED').expect(200);
    await advance(c.commandeId, c.repairerCookie, 'REPAIR_DONE').expect(200);
    await advance(c.commandeId, c.repairerCookie, 'RETURN_SENT').expect(200);
    await advance(c.commandeId, c.clientCookie, 'RETURN_RECEIVED').expect(200);
    await advance(c.commandeId, c.repairerCookie, 'AWAITING_VALIDATION').expect(200);

    // Create payable ConnectAccount for the réparateur
    const commande = await prisma.commande.findUniqueOrThrow({ where: { id: c.commandeId } });
    const fake = connectGateway() as FakeConnectGateway;
    const account = await fake.createAccount({ email: 'parcel-release@repareme.test' });
    createdEmails.push('parcel-release@repareme.test');
    fake.markVerified(account.id);
    await prisma.connectAccount.create({
      data: {
        userId: commande.repairerUserId,
        stripeAccountId: account.id,
        status: 'VERIFIED',
        transfersActive: true,
        lastSyncedAt: new Date(),
      },
    });
    // CMP-D3: the golden rule holds a payout until the réparateur has declared, so a réparateur
    // who is meant to be paid here has.
    await prisma.repairerProfile.update({ where: { userId: commande.repairerUserId }, data: { fiscalCompletedAt: new Date() } });

    // Release
    const res = await release(c.commandeId, c.clientCookie).expect(200);
    expect(res.body.step).toBe('RELEASED');

    // Assert the transfer amount equals repairCents only
    const gw = paymentsGateway() as FakePaymentsGateway;
    const sent = gw.transferFor(`release:${c.commandeId}`);
    expect(sent?.amountCents).toBe(8000);

    // Explicitly assert what it is NOT
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: c.commandeId } });
    expect(row.shippingCents).toBe(1900); // Prove this is a parcel
    expect(sent?.amountCents).not.toBe(row.totalCents); // Not the whole total (10550 on this 8000 parcel commande)
    expect(sent?.amountCents).not.toBe(row.totalCents - row.protectionCents); // Not 9900
  });

  it('reports reviewed on the detail DTO, and keeps reporting it after a soft delete', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await release(commandeId, clientCookie).expect(200);

    const before = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);
    expect(before.body.step).toBe('RELEASED');
    expect(before.body.reviewed).toBe(false);

    await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/review`)
      .set('Cookie', clientCookie)
      .send({ rating: 5 })
      .expect(201);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);
    expect(after.body.reviewed).toBe(true);

    // The load-bearing half. `reviewed` must IGNORE deletedAt: the unique index does
    // not see it, so if an operator's removal flipped this back to false the button
    // would return and the next tap would 422. Seeded directly rather than through the
    // admin route, because this file has no operator session and that route has its own
    // test in reviews.int.spec.ts.
    await prisma.review.updateMany({
      where: { commandeId },
      data: { deletedAt: new Date() },
    });
    const afterDelete = await request(app.getHttpServer())
      .get(`/api/v1/commandes/${commandeId}`)
      .set('Cookie', clientCookie)
      .expect(200);
    expect(afterDelete.body.reviewed).toBe(true);

    await prisma.review.deleteMany({ where: { commandeId } });
  });

  describe('shipping addresses', () => {
    it('stores the client address and reports it back to him only', async () => {
      const c = await aPaidCommande('PARCEL');

      const mine = await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);
      expect(mine.body.myAddressSubmitted).toBe(true);
      expect(mine.body.counterpartyAddressSubmitted).toBe(false);

      // The same row, seen from the other side: his counterparty has answered
      // and he has not. Proves the flags are viewer-relative, not global.
      const theirs = await request(app.getHttpServer())
        .get(`/api/v1/commandes/${c.commandeId}`)
        .set('Cookie', c.repairerCookie)
        .expect(200);
      expect(theirs.body.myAddressSubmitted).toBe(false);
      expect(theirs.body.counterpartyAddressSubmitted).toBe(true);
    });

    it('derives the role from the session, whatever the body says', async () => {
      const c = await aPaidCommande('PARCEL');
      // A body that tries to claim the other party's slot.
      await putAddress(c.commandeId, c.repairerCookie, {
        ...addressBody({ city: 'Lyon' }),
        role: 'CLIENT',
      }).expect(200);

      const rows = await prisma.shippingAddress.findMany({
        where: { commandeId: c.commandeId },
        select: { role: true, city: true },
      });
      expect(rows).toEqual([{ role: 'REPAIRER', city: 'Lyon' }]);
    });

    it('updates rather than duplicating on a second submit', async () => {
      const c = await aPaidCommande('PARCEL');
      await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);
      await putAddress(c.commandeId, c.clientCookie, addressBody({ city: 'Marseille' })).expect(200);

      const rows = await prisma.shippingAddress.findMany({
        where: { commandeId: c.commandeId, role: 'CLIENT' },
        select: { city: true },
      });
      expect(rows).toEqual([{ city: 'Marseille' }]);
    });

    it('normalises the phone to E.164 and keeps an absent complement null', async () => {
      const c = await aPaidCommande('PARCEL');
      await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);
      const row = await prisma.shippingAddress.findFirstOrThrow({
        where: { commandeId: c.commandeId, role: 'CLIENT' },
      });
      expect(row.phone).toBe('+33612345678');
      expect(row.line2).toBeNull();
    });

    it('accepts a landline, which frPhoneSchema would have refused', async () => {
      const c = await aPaidCommande('PARCEL');
      await putAddress(c.commandeId, c.clientCookie, addressBody({ phone: '0142123456' }))
        .expect(200);
    });

    it('refuses a commande that is not a parcel', async () => {
      const c = await aPaidCommande('WORKSHOP');
      const res = await putAddress(c.commandeId, c.clientCookie, addressBody());
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Cette commande n'est pas un envoi par colis.");
    });

    it('404s a stranger, indistinguishably from a missing commande', async () => {
      const c = await aPaidCommande('PARCEL');
      const stranger = await signUp(app);
      createdEmails.push(stranger.email);
      const res = await putAddress(c.commandeId, stranger.cookie, addressBody());
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Ressource introuvable.');
    });

    it('refuses a four-digit postal code with 400 and a field message', async () => {
      const c = await aPaidCommande('PARCEL');
      const res = await putAddress(c.commandeId, c.clientCookie, addressBody({ postalCode: '750' }));
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('refuses an unpaid commande', async () => {
      const { offerIds, clientCookie } = await aDemandeWithOffers(1);
      // Inline checkout with PARCEL delivery, adapted from the checkout helper.
      const checkout = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offerIds[0]!}/checkout`)
        .set('Cookie', clientCookie)
        .send({ delivery: 'PARCEL' })
        .expect(201);
      const commandeId = checkout.body.commandeId;

      const res = await putAddress(commandeId, clientCookie, addressBody());
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Cette commande n'est pas encore payée.");
    });

    it('refuses with PAYMENTS_ENABLED off', async () => {
      const c = await aPaidCommande('PARCEL');
      const saved = process.env.PAYMENTS_ENABLED;
      delete process.env.PAYMENTS_ENABLED;
      try {
        const res = await putAddress(c.commandeId, c.clientCookie, addressBody());
        expect(res.status).toBe(422);
        expect(res.body.error.message).toBe("Le suivi de commande n'est pas encore disponible.");
      } finally {
        if (saved !== undefined) process.env.PAYMENTS_ENABLED = saved;
        else delete process.env.PAYMENTS_ENABLED;
      }
    });

    it('refuses an address edit once the labels have been issued', async () => {
      const c = await aPaidCommande('PARCEL');
      await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);

      // Written straight to the row: issuing labels is the admin route's job and
      // that route does not exist yet. The subject here is the guard, not issuance.
      await prisma.commande.update({
        where: { id: c.commandeId },
        data: { outboundTrackingNumber: '6C11112222' },
      });

      const res = await putAddress(c.commandeId, c.clientCookie, addressBody({ city: 'Nantes' }));
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe('Les étiquettes ont déjà été émises.');

      // And the stored address is unchanged, which is the property that matters.
      const row = await prisma.shippingAddress.findFirstOrThrow({
        where: { commandeId: c.commandeId, role: 'CLIENT' },
      });
      expect(row.city).toBe('Paris');
    });
  });

  describe('the ops notification', () => {
    const sent: { to: string; subject: string; text: string }[] = [];

    beforeAll(() => {
      __setMailSender({
        send: async (mail) => {
          sent.push(mail);
        },
      });
      process.env.OPS_EMAIL = 'ops@revime.test';
    });

    afterAll(() => {
      __setMailSender(undefined);
      delete process.env.OPS_EMAIL;
    });

    it('fires once, on the write that completes the pair, and not on the first', async () => {
      sent.length = 0;
      const c = await aPaidCommande('PARCEL');

      await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);
      // The first address is not actionable: nobody can buy a label with one end.
      expect(sent).toHaveLength(0);

      await putAddress(c.commandeId, c.repairerCookie, addressBody({ city: 'Lyon' })).expect(200);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.to).toBe('ops@revime.test');
      expect(sent[0]?.subject).toContain('Colis à préparer');
      // Both ends, so the labels can be bought without opening the database.
      expect(sent[0]?.text).toContain('12 rue de la Paix');
      expect(sent[0]?.text).toContain('Lyon');
      expect(sent[0]?.text).toContain(c.commandeId);
    });

    it('fires again when an address is corrected before the labels are issued', async () => {
      sent.length = 0;
      const c = await aPaidCommande('PARCEL');
      await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);
      await putAddress(c.commandeId, c.repairerCookie, addressBody()).expect(200);
      expect(sent).toHaveLength(1);

      await putAddress(c.commandeId, c.clientCookie, addressBody({ city: 'Nantes' })).expect(200);
      expect(sent).toHaveLength(2);
      // The second mail must contain the corrected value - that is the property that
      // matters: the operator buys labels from the last mail, not the first.
      expect(sent[1]?.text).toContain('Nantes');
    });
  });

  describe('the label gates the two shipping steps', () => {
    it('refuses « Colis envoyé » before the outbound label exists', async () => {
      const c = await aPaidCommande('PARCEL');
      const res = await advance(c.commandeId, c.clientCookie, 'PARCEL_SENT');
      expect(res.status).toBe(422);
      // A MESSAGE assertion, not a status one. NOT_NEXT_STEP and NOT_PAID both
      // answer 422 on this route, so a status-only test cannot tell them apart.
      expect(res.body.error.message).toBe("Votre étiquette n'a pas encore été émise.");
    });

    it('allows the whole nine-step journey once the labels are issued', async () => {
      const c = await aPaidCommande('PARCEL');
      await putAddress(c.commandeId, c.clientCookie, addressBody()).expect(200);
      await putAddress(c.commandeId, c.repairerCookie, addressBody()).expect(200);
      await prisma.commande.update({
        where: { id: c.commandeId },
        data: {
          outboundTrackingNumber: '6C11112222',
          returnTrackingNumber: '6C33334444',
        },
      });

      await advance(c.commandeId, c.clientCookie, 'PARCEL_SENT').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'PARCEL_RECEIVED').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'REPAIR_STARTED').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'REPAIR_DONE').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'RETURN_SENT').expect(200);
      const back = await advance(c.commandeId, c.clientCookie, 'RETURN_RECEIVED').expect(200);
      expect(back.body.step).toBe('RETURN_RECEIVED');
      const asked = await advance(c.commandeId, c.repairerCookie, 'AWAITING_VALIDATION')
        .expect(200);
      expect(asked.body.releaseRequestedAt).not.toBeNull();
    });

    it('refuses the return leg when only the outbound label exists', async () => {
      const c = await aPaidCommande('PARCEL');
      await prisma.commande.update({
        where: { id: c.commandeId },
        data: { outboundTrackingNumber: '6C11112222' },
      });
      await advance(c.commandeId, c.clientCookie, 'PARCEL_SENT').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'PARCEL_RECEIVED').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'REPAIR_STARTED').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'REPAIR_DONE').expect(200);

      const res = await advance(c.commandeId, c.repairerCookie, 'RETURN_SENT');
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Votre étiquette n'a pas encore été émise.");
    });

    it('gives the client the return receipt and refuses it to the réparateur', async () => {
      const c = await aPaidCommande('PARCEL');
      await prisma.commande.update({
        where: { id: c.commandeId },
        data: { outboundTrackingNumber: '6C1', returnTrackingNumber: '6C2', step: 'RETURN_SENT' },
      });
      const wrong = await advance(c.commandeId, c.repairerCookie, 'RETURN_RECEIVED');
      expect(wrong.status).toBe(403);
      expect(wrong.body.error.message).toBe("Cette étape doit être confirmée par l'autre partie.");
      await advance(c.commandeId, c.clientCookie, 'RETURN_RECEIVED').expect(200);
    });

    it('never asks a local commande for a return leg', async () => {
      const c = await aPaidCommande('WORKSHOP');
      const res = await advance(c.commandeId, c.repairerCookie, 'RETURN_SENT');
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Cette étape n'est pas la prochaine de la commande.");
    });
  });

  it('stamps returnSentAt when the réparateur posts the device back', async () => {
    const { commandeId } = await aParcelAtReturnSent(0);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.returnSentAt).not.toBeNull();
  });

  it('lets the réparateur ask for release once the client has been silent for seven days', async () => {
    const { commandeId, repairerCookie } = await aParcelAtReturnSent(7);
    const res = await advance(commandeId, repairerCookie, 'AWAITING_VALIDATION').expect(200);

    expect(res.body.step).toBe('AWAITING_VALIDATION');
    expect(res.body.releaseRequestedAt).not.toBeNull();
  });

  it('refuses the skip before seven days', async () => {
    const { commandeId, repairerCookie } = await aParcelAtReturnSent(6);
    const res = await advance(commandeId, repairerCookie, 'AWAITING_VALIDATION').expect(422);
    expect(res.body.error.message).toBe("Vous ne pouvez pas encore demander le déblocage.");
  });

  it('refuses the skip to the client, who may only confirm receipt', async () => {
    const { commandeId, clientCookie } = await aParcelAtReturnSent(30);
    await advance(commandeId, clientCookie, 'AWAITING_VALIDATION').expect(403);
  });

  it('never records RETURN_RECEIVED when the skip is used, because nobody confirmed it', async () => {
    const { commandeId, repairerCookie } = await aParcelAtReturnSent(7);
    await advance(commandeId, repairerCookie, 'AWAITING_VALIDATION').expect(200);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('AWAITING_VALIDATION');
  });

  it('leaves the client able to confirm receipt normally inside the window', async () => {
    const { commandeId, clientCookie } = await aParcelAtReturnSent(1);
    const res = await advance(commandeId, clientCookie, 'RETURN_RECEIVED').expect(200);
    expect(res.body.step).toBe('RETURN_RECEIVED');
  });

  it('keeps a refunded commande visible to both parties, with its status', async () => {
    const { commandeId, clientCookie, repairerCookie } = await aPaidCommande('WORKSHOP');
    await prisma.commande.update({
      where: { id: commandeId },
      data: { status: 'REFUNDED', refundedAt: new Date(), refundedCents: 8650 },
    });

    for (const [role, cookie] of [
      ['client', clientCookie],
      ['repairer', repairerCookie],
    ] as const) {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/commandes?role=${role}`)
        .set('Cookie', cookie)
        .expect(200);
      const row = res.body.find((r: { id: string }) => r.id === commandeId);
      expect(row, `commande missing from the ${role} list`).toBeTruthy();
      expect(row.status).toBe('REFUNDED');
    }
  });

  it('says a refunded commande was refunded, not that it is not yet paid', async () => {
    const { commandeId, clientCookie, repairerCookie } = await aPaidCommande('PARCEL');
    await prisma.commande.update({
      where: { id: commandeId },
      data: { status: 'REFUNDED', refundedAt: new Date() },
    });

    // Both routes are reachable from a screen loaded before the refund landed, and
    // both used to answer "pas encore payée" - false about a row that was paid and
    // then repaid. The step here is also the wrong step and the wrong claimant, so
    // this pins the ordering too: the refund answer comes first.
    const step = await advance(commandeId, repairerCookie, 'REPAIR_STARTED');
    expect(step.status).toBe(422);
    expect(step.body.error.message).toBe('Ce paiement a déjà été remboursé.');

    const address = await putAddress(commandeId, clientCookie, addressBody());
    expect(address.status).toBe(422);
    expect(address.body.error.message).toBe('Ce paiement a déjà été remboursé.');
  });

  async function refundAsAdmin(commandeId: string, reason: string) {
    const admin = await signUp(app);
    createdEmails.push(admin.email);
    await prisma.user.update({ where: { email: admin.email }, data: { role: 'admin' } });
    return await request(app.getHttpServer())
      .post(`/api/v1/admin/commandes/${commandeId}/refund`)
      .set('Cookie', admin.cookie)
      .send({ reason });
  }

  it('refunds a commande before release with one call and no reversal', async () => {
    const { commandeId } = await aPaidCommande();
    const fake = paymentsGateway() as FakePaymentsGateway;
    const reversalsBefore = fake.reversalCount();

    const admin = await signUp(app);
    createdEmails.push(admin.email);
    const adminUser = await prisma.user.update({
      where: { email: admin.email },
      data: { role: 'admin' },
      select: { id: true },
    });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/admin/commandes/${commandeId}/refund`)
      .set('Cookie', admin.cookie)
      .send({ reason: "Client injoignable, réparation annulée." });
    expect(res.status).toBe(200);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.refundedCents).toBe(row.totalCents);
    expect(row.stripeRefundId).not.toBeNull();
    expect(row.stripeTransferReversalId).toBeNull();
    expect(row.refundReason).toBe("Client injoignable, réparation annulée.");
    expect(row.refundedByUserId).toBe(adminUser.id);
    expect(fake.reversalCount()).toBe(reversalsBefore);

    const demande = await prisma.demande.findUniqueOrThrow({ where: { id: row.demandeId } });
    expect(demande.status).toBe('CANCELLED');
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: row.offerId } });
    // Left ACCEPTED on purpose: it WAS accepted, and rewriting it to REJECTED would
    // tell a réparateur he lost a bid he won. See the P5 spec §6.3.
    expect(offer.status).toBe('ACCEPTED');
  });

  it('reverses the transfer BEFORE refunding once money has moved', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await release(commandeId, clientCookie).expect(200);

    const fake = paymentsGateway() as FakePaymentsGateway;
    const from = fake.calls().length;

    const res = await refundAsAdmin(commandeId, 'Litige résolu en faveur du client.');
    expect(res.status).toBe(200);

    // The ORDER is the assertion. Asserting both calls happened cannot catch them
    // happening the wrong way round, and the wrong way round means the platform
    // funds the refund out of its own balance.
    expect(fake.calls().slice(from)).toEqual(['reverseTransfer', 'createRefund']);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.stripeTransferReversalId).not.toBeNull();
    expect(row.reversedCents).toBe(row.transferredCents);

    // F4: Assert the amounts and objects actually sent to Stripe. Without this,
    // sending plan.refundCents as the reversal amount (over-debiting the
    // réparateur) or plan.reverseCents as the refund amount (under-refunding the
    // client) would pass all tests green.
    const reversal = fake.reversalFor(`reverse:${commandeId}`);
    expect(reversal).toBeDefined();
    expect(reversal!.amountCents).toBe(row.reversedCents);
    expect(reversal!.transferId).toBe(row.stripeTransferId);

    const refund = fake.refundFor(`refund:${commandeId}`);
    expect(refund).toBeDefined();
    expect(refund!.amountCents).toBe(row.refundedCents);
    expect(refund!.chargeId).toBe(row.stripeChargeId);
  });

  it('still refunds the client when the clawback fails', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await release(commandeId, clientCookie).expect(200);

    const fake = paymentsGateway() as FakePaymentsGateway;
    fake.failNextReversalOnce();

    const res = await refundAsAdmin(commandeId, 'Remboursement commercial.');
    expect(res.status).toBe(200);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    // The client's money is NOT held hostage to our clawback.
    expect(row.status).toBe('REFUNDED');
    expect(row.stripeRefundId).not.toBeNull();
    // And the failure is legible, so J5 can surface it.
    expect(row.stripeTransferReversalId).toBeNull();
  });

  it('refuses to refund twice', async () => {
    const { commandeId } = await aPaidCommande();
    const first = await refundAsAdmin(commandeId, 'Premier remboursement.');
    expect(first.status).toBe(200);
    const res = await refundAsAdmin(commandeId, 'Deuxième tentative.');
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Cette commande a déjà été remboursée.');
  });

  it('refuses to refund a commande that was never paid', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const res = await refundAsAdmin(commandeId, 'Tentative.');
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Cette commande ne peut pas être remboursée.');
  });

  it('retries only the refund when the reversal was persisted but the refund threw', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await release(commandeId, clientCookie).expect(200);

    const fake = paymentsGateway() as FakePaymentsGateway;
    fake.failNextRefundOnce();

    // First attempt: reversal succeeds and is persisted, but refund throws.
    const first = await refundAsAdmin(commandeId, 'Première tentative.');
    expect(first.status).toBe(422);

    // Reversal was persisted despite the refund failing.
    const mid = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(mid.stripeTransferReversalId).not.toBeNull();
    expect(mid.status).toBe('PAID');

    const reversalsBefore = fake.reversalCount();

    // Second attempt: only the refund is performed, no second reversal.
    const second = await refundAsAdmin(commandeId, 'Deuxième tentative.');
    expect(second.status).toBe(200);

    expect(fake.reversalCount()).toBe(reversalsBefore);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.stripeRefundId).not.toBeNull();
  });

  it('refuses to mark a commande refunded when Stripe reports the refund failed', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await release(commandeId, clientCookie).expect(200);

    const fake = paymentsGateway() as FakePaymentsGateway;
    fake.setNextRefundStatus('failed');

    const res = await refundAsAdmin(commandeId, 'Tentative de remboursement.');
    expect(res.status).toBe(422);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('PAID');
    expect(row.refundedAt).toBeNull();
    expect(row.stripeRefundId).toBeNull();

    const demande = await prisma.demande.findUniqueOrThrow({ where: { id: row.demandeId } });
    expect(demande.status).toBe('IN_PROGRESS');
  });

  it('marks a commande refunded when Stripe reports the refund pending', async () => {
    const { commandeId } = await aPaidCommande();
    const fake = paymentsGateway() as FakePaymentsGateway;
    fake.setNextRefundStatus('pending');

    const res = await refundAsAdmin(commandeId, 'Remboursement en attente.');
    expect(res.status).toBe(200);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.stripeRefundId).not.toBeNull();
  });

  it('creates a NEW refund when the recorded one failed at Stripe', async () => {
    const { commandeId } = await aPaidCommande();
    const fake = paymentsGateway() as FakePaymentsGateway;

    // Exactly what `syncRefundState` leaves behind on a failed refund: the row is
    // back to PAID and it KEEPS the id. No column records that the refund failed,
    // so only Stripe can tell this row apart from a successfully refunded one
    // whose final transaction was lost.
    const failedId = `re_failed_${commandeId}`;
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeRefundId: failedId },
    });
    fake.seedRefundStatus(failedId, 'failed');
    const before = fake.refundCount();

    const res = await refundAsAdmin(commandeId, "Reprise après un refus de Stripe.");
    expect(res.status).toBe(200);

    // THE assertion: a real second refund was created. Before this fix the retry
    // skipped createRefund entirely and wrote REFUNDED with the client never repaid.
    expect(fake.refundCount()).toBe(before + 1);
    // Under a distinct key, because reusing `refund:<id>` inside Stripe's 24-hour
    // window replays the SAME failed refund object.
    const sent = fake.refundFor(`refund:${commandeId}:after:${failedId}`);
    expect(sent).toBeDefined();

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.stripeRefundId).not.toBe(failedId);
    expect(row.refundedCents).toBe(row.totalCents);
    expect(sent!.amountCents).toBe(row.refundedCents);
  });

  it('finishes the disposition with no second refund when the recorded one succeeded at Stripe', async () => {
    const { commandeId } = await aPaidCommande();
    const fake = paymentsGateway() as FakePaymentsGateway;

    // C-1's finish-the-job path: the refund really happened and only the final
    // transaction was lost. Refunding again here is money we cannot get back.
    const succeededId = `re_succeeded_${commandeId}`;
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeRefundId: succeededId },
    });
    fake.seedRefundStatus(succeededId, 'succeeded');
    const before = fake.refundCount();

    const res = await refundAsAdmin(commandeId, "Reprise après une transaction perdue.");
    expect(res.status).toBe(200);

    expect(fake.refundCount()).toBe(before);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('REFUNDED');
    expect(row.stripeRefundId).toBe(succeededId);
    expect(row.refundedCents).toBe(row.totalCents);
  });

  it('refuses rather than refunding blind when the recorded refund cannot be read', async () => {
    const { commandeId } = await aPaidCommande();
    const fake = paymentsGateway() as FakePaymentsGateway;

    const unreadableId = `re_unreadable_${commandeId}`;
    await prisma.commande.update({
      where: { id: commandeId },
      data: { stripeRefundId: unreadableId },
    });
    fake.failNextRetrieveRefundOnce();
    const before = fake.refundCount();

    const res = await refundAsAdmin(commandeId, "Tentative pendant une panne Stripe.");
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe(
      'Le remboursement a échoué. Réessayez dans quelques minutes.',
    );

    // Zero refunds created. A second refund against an already-refunded charge is
    // money we cannot get back, so an unreadable state must refuse, not guess.
    expect(fake.refundCount()).toBe(before);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.status).toBe('PAID');
    expect(row.refundedAt).toBeNull();
    expect(row.stripeRefundId).toBe(unreadableId);
  });

  // ============================================================================
  // 🛑 CRON TESTS: TABLE-WIDE, MONEY-MOVING
  //
  // These are the first tests in this repo to invoke a TABLE-WIDE, MONEY-MOVING
  // job against the shared database. J1 will stamp RELEASED + a tr_fake_* id +
  // releasedAt on ANY pre-existing due row, irrecoverably. The fake gateway means
  // no real Stripe call, but the row damage is real.
  //
  // DO NOT point this suite at a database holding real orders.
  // ============================================================================

  it('releases a commande the client has ignored for seven days', async () => {
    const { commandeId } = await aCommandeAwaitingValidation();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { releaseRequestedAt: new Date(Date.now() - 7 * 86_400_000) },
    });

    const res = await run('cron_secret_for_test').expect(200);
    const job = res.body.jobs.find((j: { job: string }) => j.job === 'autoRelease');
    expect(job.acted).toBeGreaterThanOrEqual(1);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('RELEASED');
    expect(row.stripeTransferId).not.toBeNull();
  });

  it('leaves a commande one day short of the window alone', async () => {
    const { commandeId } = await aCommandeAwaitingValidation();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { releaseRequestedAt: new Date(Date.now() - 6 * 86_400_000) },
    });

    await run('cron_secret_for_test').expect(200);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.step).toBe('AWAITING_VALIDATION');
    expect(row.stripeTransferId).toBeNull();
  });

  it('never auto-releases a disputed commande', async () => {
    // I-5: Capture baseline before the test row, so `failed: 0` asserts over
    // THIS test's data rather than the whole table. Test 9 leaves a
    // permanently-failing due row, so any reordering or pre-existing failure
    // would break this spuriously without the delta.
    const baseline = await run('cron_secret_for_test').expect(200);
    const baselineFailed = baseline.body.jobs.find((j: { job: string }) => j.job === 'autoRelease').failed;

    const { commandeId } = await aCommandeAwaitingValidation();
    await prisma.commande.update({
      where: { id: commandeId },
      data: {
        releaseRequestedAt: new Date(Date.now() - 30 * 86_400_000),
        disputedAt: new Date(),
      },
    });

    const res = await run('cron_secret_for_test').expect(200);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    // Two layers refuse a disputed commande, and this test pins BOTH of them
    // separately. `stripeTransferId` staying null is the OUTCOME, which
    // releaseInternal's own guard also guarantees -- so it cannot tell the two
    // apart. `failed: 0` is what pins J1's `disputedAt: null` FILTER: a disputed
    // row that reaches releaseInternal always throws and is counted as failed, so
    // a zero here means the row was never selected at all.
    expect(row.stripeTransferId).toBeNull();
    const job = res.body.jobs.find((j: { job: string }) => j.job === 'autoRelease');
    expect(job.failed).toBe(baselineFailed);
  });

  it('does not auto-release an earlier step whose 60-day backstop has passed - it reports it', async () => {
    const baseline = await run('cron_secret_for_test').expect(200);
    const baselineFailed = baseline.body.jobs.find((j: { job: string }) => j.job === 'autoRelease').failed;

    const { commandeId } = await aPaidCommande();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { autoReleaseDueAt: new Date(Date.now() - 86_400_000), step: 'REPAIR_STARTED' },
    });

    const res = await run('cron_secret_for_test').expect(200);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    // Paying for a repair nobody finished is worse than the stall.
    expect(row.step).toBe('REPAIR_STARTED');
    expect(row.stripeTransferId).toBeNull();
    // `failed: 0` proves the row was never SELECTED: a row that reached
    // releaseInternal would throw on its step check and be counted. What excludes
    // it is J1's `releaseRequestedAt: { lte: cutoff }` condition -- this row has a
    // null releaseRequestedAt (it is stamped only on reaching AWAITING_VALIDATION),
    // and Prisma's `lte` does not match nulls. NOT the `step` filter, which this
    // fixture never reaches.
    const job = res.body.jobs.find((j: { job: string }) => j.job === 'autoRelease');
    expect(job.failed).toBe(baselineFailed);
    const attention = res.body.jobs.find((j: { job: string }) => j.job === 'attention');
    expect(attention.scanned).toBeGreaterThanOrEqual(1);
  });

  it('backfills a missing charge id and makes the row releasable again', async () => {
    const { commandeId } = await aPaidCommande();
    await prisma.commande.update({ where: { id: commandeId }, data: { stripeChargeId: null } });

    const res = await run('cron_secret_for_test').expect(200);
    const job = res.body.jobs.find((j: { job: string }) => j.job === 'backfillChargeIds');
    expect(job.acted).toBeGreaterThanOrEqual(1);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeChargeId).toBe(`ch_fake_${commandeId}`);
  });

  it('settles an orphan paid session - a real card charged with no order behind it', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });

    // Paid at Stripe, and the completed event never arrived. Backdated past the
    // one-hour session TTL so the job considers it.
    (paymentsGateway() as FakePaymentsGateway).markComplete(row.stripeSessionId!, {
      paymentIntentId: `pi_orphan_${commandeId}`,
      chargeId: `ch_orphan_${commandeId}`,
    });
    await prisma.commande.update({
      where: { id: commandeId },
      data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
    });

    await run('cron_secret_for_test').expect(200);

    const healed = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(healed.status).toBe('PAID');
    expect(healed.step).toBe('PAID');
    expect(healed.stripeChargeId).toBe(`ch_orphan_${commandeId}`);
    const offer = await prisma.offer.findUniqueOrThrow({ where: { id: healed.offerId } });
    expect(offer.status).toBe('ACCEPTED');
    const demande = await prisma.demande.findUniqueOrThrow({ where: { id: healed.demandeId } });
    expect(demande.status).toBe('IN_PROGRESS');
  });

  it('abandons an orphan expired session', async () => {
    const { offerIds, clientCookie } = await aDemandeWithOffers(1);
    const commandeId = await checkout(offerIds[0]!, clientCookie);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    (paymentsGateway() as FakePaymentsGateway).markExpired(row.stripeSessionId!);
    await prisma.commande.update({
      where: { id: commandeId },
      data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
    });

    await run('cron_secret_for_test').expect(200);
    const after = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(after.status).toBe('ABANDONED');
  });

  it('reports a failed clawback so the operator knows the money is gone', async () => {
    const { commandeId, clientCookie } = await aCommandeAwaitingValidation();
    await release(commandeId, clientCookie).expect(200);
    (paymentsGateway() as FakePaymentsGateway).failNextReversalOnce();
    const refundRes = await refundAsAdmin(commandeId, 'Geste commercial.');
    expect(refundRes.status).toBe(200);

    const res = await run('cron_secret_for_test').expect(200);
    const attention = res.body.jobs.find((j: { job: string }) => j.job === 'attention');
    expect(attention.scanned).toBeGreaterThanOrEqual(1);
  });

  it('surfaces a PAID row carrying only a refund id, which no other J5 query can see', async () => {
    // Two rows, one for each arm of the OR: a pre-release refund whose disposition
    // never settled (only a refund id) and a post-release clawback whose refund did
    // not land (only a reversal id). Asserting both is what stops the added arm from
    // silently REPLACING the original one - the failure mode a single-row test
    // could not tell apart from a pass.
    const onlyRefund = await aPaidCommande();
    await prisma.commande.update({
      where: { id: onlyRefund.commandeId },
      data: { stripeRefundId: `re_unsettled_${onlyRefund.commandeId}` },
    });
    const onlyReversal = await aPaidCommande();
    await prisma.commande.update({
      where: { id: onlyReversal.commandeId },
      data: { stripeTransferReversalId: `trr_unsettled_${onlyReversal.commandeId}` },
    });

    const items = await cronService.attentionItems();
    for (const id of [onlyRefund.commandeId, onlyReversal.commandeId]) {
      const reasons = items.filter((i) => i.commandeId === id).map((i) => i.reason);
      expect(reasons, `commande ${id} reached no operator at all`).toContain(
        'REFUND_INCOMPLETE',
      );
    }
  });

  it('keeps going when one row fails, and says how many did', async () => {
    // A due row whose réparateur has no ConnectAccount cannot be released. It must
    // be counted as failed rather than stopping the batch.
    const { commandeId } = await aPaidCommande();
    await prisma.commande.update({
      where: { id: commandeId },
      data: {
        step: 'AWAITING_VALIDATION',
        releaseRequestedAt: new Date(Date.now() - 10 * 86_400_000),
      },
    });

    const res = await run('cron_secret_for_test').expect(200);
    const job = res.body.jobs.find((j: { job: string }) => j.job === 'autoRelease');
    expect(job.failed).toBeGreaterThanOrEqual(1);
    expect(job.error).toBeNull();
    // R3: This row is J1-eligible but fails on every run - the single state where
    // escrowed money is stuck and a human must act. J5 reports it as RELEASE_FAILING.
    // Assert that THIS commande appears in the attention list with RELEASE_FAILING
    // reason, not just that the list has items. The old assertion (scanned > 0)
    // would pass if any row appeared for any reason.
    const items = await cronService.attentionItems();
    const thisItem = items.find((i) => i.commandeId === commandeId);
    expect(thisItem).toBeDefined();
    expect(thisItem?.reason).toBe('RELEASE_FAILING');
  });

  it('never auto-releases a commande in the refund intermediate state', async () => {
    // C-1: `refund.service.ts` persists `stripeRefundId` BEFORE the $transaction
    // that flips status to REFUNDED. If that transaction fails, the row is left
    // status PAID + refundId SET + all criteria met. The client's money has
    // already gone back. What prevents it today is Stripe arithmetic, not our
    // code. J1 and releaseInternal both refuse it.
    const baseline = await run('cron_secret_for_test').expect(200);
    const baselineFailed = baseline.body.jobs.find((j: { job: string }) => j.job === 'autoRelease').failed;

    const { commandeId } = await aCommandeAwaitingValidation();
    await prisma.commande.update({
      where: { id: commandeId },
      data: {
        releaseRequestedAt: new Date(Date.now() - 10 * 86_400_000),
        stripeRefundId: 're_fake_intermediate',
      },
    });

    const res = await run('cron_secret_for_test').expect(200);
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    expect(row.stripeTransferId).toBeNull();
    const job = res.body.jobs.find((j: { job: string }) => j.job === 'autoRelease');
    expect(job.failed).toBe(baselineFailed);
  });

  it('never auto-pays a banned réparateur', async () => {
    // I-7: A réparateur banned for fraud after the repair is auto-paid seven days
    // later, and J1 removes the last human who might have noticed.
    const { commandeId } = await aCommandeAwaitingValidation();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { releaseRequestedAt: new Date(Date.now() - 10 * 86_400_000) },
    });

    // Ban the exact réparateur from this commande's row, not by looking up a test
    // user by pattern. `repairerUserId` is denormalised onto Commande precisely so
    // the payee is identifiable without a join. A `findFirst` with email pattern
    // and `orderBy: { createdAt }` would pick "the most recently created test user",
    // not necessarily this commande's réparateur, and the test would pass for the
    // wrong reason.
    const before = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    await prisma.user.update({ where: { id: before.repairerUserId }, data: { banned: true } });

    const res = await run('cron_secret_for_test').expect(200);
    const after = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    // Not released: no transfer, step unchanged.
    expect(after.stripeTransferId).toBeNull();
    expect(after.step).toBe('AWAITING_VALIDATION');
    // J1 counts it as failed because releaseInternal throws on the banned check.
    const job = res.body.jobs.find((j: { job: string }) => j.job === 'autoRelease');
    expect(job.failed).toBeGreaterThanOrEqual(1);
    // Bonus: the row appears in the attention list as RELEASE_FAILING.
    const attention = res.body.jobs.find((j: { job: string }) => j.job === 'attention');
    expect(attention.scanned).toBeGreaterThanOrEqual(1);
  });

  it('notifies the NON-CLAIMANT on each step, with the claimant as the actor', async () => {
    const journey = await aPaidCommande('PARCEL');
    await putAddress(journey.commandeId, journey.clientCookie, addressBody()).expect(200);
    await putAddress(journey.commandeId, journey.repairerCookie, addressBody({ city: 'Lyon' })).expect(200);
    await prisma.commande.update({
      where: { id: journey.commandeId },
      data: { outboundTrackingNumber: '6A11111111111', returnTrackingNumber: '6A22222222222' },
    });

    // Query user IDs for assertions
    const commande = await prisma.commande.findFirstOrThrow({
      where: { id: journey.commandeId },
      select: { clientUserId: true, repairerUserId: true },
    });

    // PARCEL_SENT is claimed by the CLIENT, so the RÉPARATEUR hears about it.
    await advance(journey.commandeId, journey.clientCookie, 'PARCEL_SENT').expect(200);
    const sent = await prisma.notification.findFirstOrThrow({
      where: { commandeId: journey.commandeId, step: 'PARCEL_SENT' },
    });
    expect(sent.userId).toBe(commande.repairerUserId);
    expect(sent.mode).toBe('REPAIRER');

    // REPAIR_STARTED is claimed by the RÉPARATEUR, so the CLIENT hears about it.
    await advance(journey.commandeId, journey.repairerCookie, 'PARCEL_RECEIVED').expect(200);
    await advance(journey.commandeId, journey.repairerCookie, 'REPAIR_STARTED').expect(200);
    const started = await prisma.notification.findFirstOrThrow({
      where: { commandeId: journey.commandeId, step: 'REPAIR_STARTED' },
    });
    expect(started.userId).toBe(commande.clientUserId);
    expect(started.mode).toBe('CLIENT');
    expect(started.type).toBe('COMMANDE_STEP');
    expect(started.actorName).toBeTruthy();
  });

  it('notifies BOTH parties when funds release', async () => {
    const journey = await aCommandeAwaitingValidation();
    const commande = await prisma.commande.findFirstOrThrow({
      where: { id: journey.commandeId },
      select: { clientUserId: true, repairerUserId: true },
    });

    await release(journey.commandeId, journey.clientCookie).expect(200);

    const rows = await prisma.notification.findMany({
      where: { commandeId: journey.commandeId, type: 'FUNDS_RELEASED' },
    });
    expect(rows).toHaveLength(2);

    const client = rows.find((r) => r.userId === commande.clientUserId);
    const repairer = rows.find((r) => r.userId === commande.repairerUserId);
    expect(client?.mode).toBe('CLIENT');
    expect(repairer?.mode).toBe('REPAIRER');
    // Both carry the amount, and the copy is what makes them read differently: the client
    // gets « débloqués pour votre réparateur » (V8 `Q8-08`; was « versés à »), the réparateur
    // « versés sur votre compte ».
    expect(client?.amountCents).toBeGreaterThan(0);
    expect(repairer?.amountCents).toBe(client?.amountCents);
  });

  it('notifies BOTH parties on a refund', async () => {
    const journey = await aPaidCommande();
    const commande = await prisma.commande.findFirstOrThrow({
      where: { id: journey.commandeId },
      select: { clientUserId: true, repairerUserId: true },
    });

    const refundRes = await refundAsAdmin(journey.commandeId, 'Annulation.');
    expect(refundRes.status).toBe(200);

    const rows = await prisma.notification.findMany({
      where: { commandeId: journey.commandeId, type: 'COMMANDE_REFUNDED' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.mode).sort()).toEqual(['CLIENT', 'REPAIRER']);
  });

  afterEach(() => {
    const fake = paymentsGateway() as FakePaymentsGateway;
    fake.resetRefundStatus();
  });

  /**
   * Livraison Boxtal (spec §8). Extended by reading on 2026-09-05 for Livraison Boxtal; not run,
   * because this suite writes to the production database. The quote step also reaches BAN through
   * GeocodeService. The five-step HOME journey above is unchanged: under the Boxtal driver the
   * carrier's scans move the two SENDING steps and the parties keep the receiving ones.
   */
  describe('Livraison Boxtal journey', () => {
    const fake = new FakeShippingGateway();
    const quoteIds: string[] = [];
    const boxtalEventIds: string[] = [];
    let boxtalSeq = 0;
    const savedShipping: Record<string, string | undefined> = {};
    const SHIPPING_ENV: Record<string, string> = {
      SHIPPING_DRIVER: 'boxtal',
      BOXTAL_V1_ACCESS_KEY: 'k',
      BOXTAL_V1_SECRET_KEY: 's',
      BOXTAL_V3_ACCESS_KEY: 'k',
      BOXTAL_V3_SECRET_KEY: 's',
      BOXTAL_WEBHOOK_SECRET: 'w',
      STORAGE_DRIVER: 'fake',
    };
    const relay = (over: Partial<LegOffer>): LegOffer => ({
      carrierCode: 'MONR',
      serviceCode: 'CpourToi',
      carrierLabel: 'Mondial Relay',
      serviceLabel: 'Points Relais',
      costExclTaxCents: 314,
      costInclTaxCents: 378,
      insuranceInclTaxCents: 734,
      collectionType: 'DROPOFF_POINT',
      deliveryType: 'PICKUP_POINT',
      estimatedDeliveryDate: '2026-09-10',
      ...over,
    });
    const PARCEL = { weightGrams: 500, lengthCm: 20, widthCm: 12, heightCm: 8, valueCents: 30_000 };
    /** The fake's own parcel-point fixtures (gateway.ts), so the codes match what a picker would return. */
    const CLIENT_RELAY = { code: '99439', network: 'MONR', name: 'Tabac de la Gare', address: '3 place Fixture, 69003 Lyon' };
    const REPAIRER_RELAY = { code: '99440', network: 'MONR', name: 'Pressing du Centre', address: '8 rue Exemple, 69003 Lyon' };
    const tracking = (status: string, trackingNumber: string, at: string): PackageTracking => ({
      status,
      isFinal: status === 'DELIVERED',
      message: null,
      trackingNumber,
      trackingDateTime: at,
      packageTrackingUrl: null,
      history: [],
    });
    const LABEL = { url: 'https://fake.boxtal.local/label.pdf', type: 'LABEL', format: 'PDF_A4' };

    beforeAll(() => {
      for (const [k, v] of Object.entries(SHIPPING_ENV)) {
        savedShipping[k] = process.env[k];
        process.env[k] = v;
      }
      fake.seedOffers('OUTBOUND', [relay({})]);
      fake.seedOffers('RETURN', [relay({ carrierCode: 'CHRP', serviceCode: 'ChronoShoptoShop', carrierLabel: 'Chronopost', costInclTaxCents: 372 })]);
      __registerBoxtalGateway(() => fake);
      __resetShippingGateway();
    });

    afterAll(async () => {
      await prisma.boxtalEvent.deleteMany({ where: { id: { in: boxtalEventIds } } });
      // ShippingQuote has no cascade from User, and Commande.shippingQuoteId points at it.
      await prisma.commande.updateMany({ where: { shippingQuoteId: { in: quoteIds } }, data: { shippingQuoteId: null } });
      await prisma.shippingQuote.deleteMany({ where: { id: { in: quoteIds } } });
      for (const [k, v] of Object.entries(savedShipping)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      __resetShippingGateway();
    });

    /** A PAID insured relay parcel bought against a real quote, with its two PENDING legs. */
    async function aPaidBoxtalCommande(): Promise<{ commandeId: string; clientCookie: string; repairerCookie: string }> {
      const client = await signUp(app);
      createdEmails.push(client.email);
      const demande = await request(app.getHttpServer())
        .post('/api/v1/demandes')
        .set('Cookie', client.cookie)
        .send(demandeBody())
        .expect(201);
      const repairer = await signUpRepairer(app);
      createdEmails.push(repairer.email);
      // The quote needs the réparateur's postal code; sign-up sets none.
      const repairerUser = await prisma.user.findUniqueOrThrow({ where: { email: repairer.email }, select: { id: true } });
      await prisma.repairerProfile.update({ where: { userId: repairerUser.id }, data: { postalCode: '75011' } });
      const offer = await request(app.getHttpServer())
        .post(`/api/v1/demandes/${demande.body.id}/offers`)
        .set('Cookie', repairer.cookie)
        .send(offerBody())
        .expect(201);
      const quote = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offer.body.id}/shipping-quote`)
        .set('Cookie', client.cookie)
        .send({ parcel: PARCEL })
        .expect(200);
      quoteIds.push(quote.body.id);
      const res = await request(app.getHttpServer())
        .post(`/api/v1/offers/${offer.body.id}/checkout`)
        .set('Cookie', client.cookie)
        .send({ delivery: 'PARCEL', quoteId: quote.body.id, parcelOption: 'RELAY', insured: true })
        .expect(201);
      await pay(res.body.commandeId);
      return { commandeId: res.body.commandeId, clientCookie: client.cookie, repairerCookie: repairer.cookie };
    }

    const nextEventId = () => {
      boxtalSeq += 1;
      return `evt_bx_int_${Date.now()}_${boxtalSeq}`;
    };
    /** Boxtal's POST, signed by the fake with its own secret - the route verifies for real. */
    const postWebhook = (event: BoxtalWebhookEvent) => {
      boxtalEventIds.push(event.id);
      const { raw, signature } = fake.signedBody(event);
      return request(app.getHttpServer())
        .post('/api/v1/shipping/webhook')
        .set('Content-Type', 'application/json')
        .set('x-bxt-signature', signature)
        .send(raw.toString('utf8'));
    };
    const read = (id: string, cookie: string) => request(app.getHttpServer()).get(`/api/v1/commandes/${id}`).set('Cookie', cookie);
    const legRow = (commandeId: string, leg: 'OUTBOUND' | 'RETURN') =>
      prisma.shipment.findUniqueOrThrow({ where: { commandeId_leg: { commandeId, leg } } });

    it('walks the journey: two PENDING legs, the addresses order the outbound to the réparateur relay, the label and the scans drive the sending steps, REPAIR_DONE orders the return to the client relay, release pays repairCents only', async () => {
      const c = await aPaidBoxtalCommande();
      const legs = await prisma.shipment.findMany({ where: { commandeId: c.commandeId } });
      expect(legs.map((s) => `${s.leg}:${s.status}`).sort()).toEqual(['OUTBOUND:PENDING', 'RETURN:PENDING']);
      const ordersBefore = fake.orders().length;

      // Client: a mobile and a relay → 200; one address is not orderable, so no order yet.
      await putAddress(c.commandeId, c.clientCookie, addressBody({ parcelPoint: CLIENT_RELAY })).expect(200);
      expect((await read(c.commandeId, c.clientCookie).expect(200)).body.myParcelPointRequired).toBe(false);
      expect(fake.orders()).toHaveLength(ordersBefore);

      // Réparateur without a relay → 422 by message; with one → 200 and ONE order, for the outbound leg,
      // collected at HIS relay.
      const missing = await putAddress(c.commandeId, c.repairerCookie, addressBody({ city: 'Lyon' }));
      expect(missing.status).toBe(422);
      expect(missing.body.error.message).toBe('Choisissez un point relais.');
      await putAddress(c.commandeId, c.repairerCookie, addressBody({ city: 'Lyon', parcelPoint: REPAIRER_RELAY })).expect(200);
      const outbound = await legRow(c.commandeId, 'OUTBOUND');
      expect(outbound.status).toBe('ORDERED');
      expect(outbound.boxtalOrderId).not.toBeNull();
      const outboundOrders = fake.orders().filter((o) => o.externalId === outbound.id);
      expect(outboundOrders).toHaveLength(1);
      expect(fake.orders()).toHaveLength(ordersBefore + 1);
      expect(outboundOrders[0]!.pickupPointCode).toBe(REPAIRER_RELAY.code);
      expect(outboundOrders[0]!.insured).toBe(true);
      expect(outboundOrders[0]!.shippingOfferCode).toBe('MONR-CpourToi');

      // DOCUMENT_CREATED: the label is stored and the tracking number read back with it.
      fake.seedTracking(outbound.boxtalOrderId!, [tracking('ANNOUNCED', 'T-OUT-1', '2026-09-05T08:00:00Z')]);
      await postWebhook({
        id: nextEventId(),
        type: 'DOCUMENT_CREATED',
        shippingOrderId: outbound.boxtalOrderId!,
        shipmentExternalId: outbound.id,
        payload: { documents: [LABEL] },
      }).expect(200);
      const labelled = await read(c.commandeId, c.clientCookie).expect(200);
      const outDto = labelled.body.shipments.find((s: { leg: string }) => s.leg === 'OUTBOUND');
      expect(outDto.labelReady).toBe(true);
      expect(outDto.status).toBe('LABEL_READY');
      expect(labelled.body.outboundTrackingNumber).toBe('T-OUT-1');
      expect(labelled.body.step).toBe('PAID');

      // The label URL: the client sends the outbound parcel; the réparateur is 404, like a stranger.
      const url = await request(app.getHttpServer())
        .get(`/api/v1/commandes/${c.commandeId}/label?leg=OUTBOUND`)
        .set('Cookie', c.clientCookie)
        .expect(200);
      expect(typeof url.body.url).toBe('string');
      await request(app.getHttpServer())
        .get(`/api/v1/commandes/${c.commandeId}/label?leg=OUTBOUND`)
        .set('Cookie', c.repairerCookie)
        .expect(404);

      // SHIPPED: the carrier's first scan moves the step, without any tap.
      await postWebhook({
        id: nextEventId(),
        type: 'TRACKING_CHANGED',
        shippingOrderId: outbound.boxtalOrderId!,
        shipmentExternalId: outbound.id,
        payload: { trackings: [tracking('SHIPPED', 'T-OUT-1', '2026-09-05T09:00:00Z')] },
      }).expect(200);
      const shipped = await read(c.commandeId, c.repairerCookie).expect(200);
      expect(shipped.body.step).toBe('PARCEL_SENT');
      expect(shipped.body.shipments.find((s: { leg: string }) => s.leg === 'OUTBOUND').latestStatus).toBe('SHIPPED');

      // The réparateur's three claims; REPAIR_DONE orders the return, collected at the CLIENT's relay.
      await advance(c.commandeId, c.repairerCookie, 'PARCEL_RECEIVED').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'REPAIR_STARTED').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'REPAIR_DONE').expect(200);
      const ret = await legRow(c.commandeId, 'RETURN');
      expect(ret.status).toBe('ORDERED');
      const returnOrders = fake.orders().filter((o) => o.externalId === ret.id);
      expect(returnOrders).toHaveLength(1);
      expect(returnOrders[0]!.pickupPointCode).toBe(CLIENT_RELAY.code);
      expect(returnOrders[0]!.shippingOfferCode).toBe('CHRP-ChronoShoptoShop');

      // The return's first scan: tracking number filled, RETURN_SENT and returnSentAt stamped by the system.
      await postWebhook({
        id: nextEventId(),
        type: 'TRACKING_CHANGED',
        shippingOrderId: ret.boxtalOrderId!,
        shipmentExternalId: ret.id,
        payload: { trackings: [tracking('SHIPPED', 'T-RET-1', '2026-09-07T09:00:00Z')] },
      }).expect(200);
      const row = await prisma.commande.findUniqueOrThrow({ where: { id: c.commandeId } });
      expect(row.step).toBe('RETURN_SENT');
      expect(row.returnTrackingNumber).toBe('T-RET-1');
      expect(row.returnSentAt).not.toBeNull();

      // Client receipt, validation request, release: the transfer is repairCents, not the parcel money.
      await advance(c.commandeId, c.clientCookie, 'RETURN_RECEIVED').expect(200);
      await advance(c.commandeId, c.repairerCookie, 'AWAITING_VALIDATION').expect(200);
      const connect = connectGateway() as FakeConnectGateway;
      const account = await connect.createAccount({ email: 'boxtal-release@repareme.test' });
      connect.markVerified(account.id);
      await prisma.connectAccount.create({
        data: { userId: row.repairerUserId, stripeAccountId: account.id, status: 'VERIFIED', transfersActive: true, lastSyncedAt: new Date() },
      });
      // CMP-D3: the golden rule holds a payout until the réparateur has declared, so a réparateur
      // who is meant to be paid here has.
      await prisma.repairerProfile.update({ where: { userId: row.repairerUserId }, data: { fiscalCompletedAt: new Date() } });
      const released = await release(c.commandeId, c.clientCookie).expect(200);
      expect(released.body.step).toBe('RELEASED');
      const sent = (paymentsGateway() as FakePaymentsGateway).transferFor(`release:${c.commandeId}`);
      expect(row.shippingCents).toBe(780);
      expect(row.insuranceCents).toBe(1520);
      expect(sent?.amountCents).toBe(row.repairCents);
      expect(sent?.amountCents).not.toBe(row.totalCents);
    });

    it('a redelivered webhook is a no-op, and a refund cancels a label the carrier has not scanned', async () => {
      const c = await aPaidBoxtalCommande();
      await putAddress(c.commandeId, c.clientCookie, addressBody({ parcelPoint: CLIENT_RELAY })).expect(200);
      await putAddress(c.commandeId, c.repairerCookie, addressBody({ city: 'Lyon', parcelPoint: REPAIRER_RELAY })).expect(200);
      const outbound = await legRow(c.commandeId, 'OUTBOUND');
      const event: BoxtalWebhookEvent = {
        id: nextEventId(),
        type: 'DOCUMENT_CREATED',
        shippingOrderId: outbound.boxtalOrderId!,
        shipmentExternalId: outbound.id,
        payload: { documents: [LABEL] },
      };
      await postWebhook(event).expect(200);
      // Boxtal retries on any non-2xx; the same event again is 200 and changes nothing.
      await postWebhook(event).expect(200);
      expect((await legRow(c.commandeId, 'OUTBOUND')).status).toBe('LABEL_READY');
      expect(await prisma.boxtalEvent.count({ where: { id: event.id } })).toBe(1);

      const refunded = await refundAsAdmin(c.commandeId, 'Annulation.');
      expect(refunded.status).toBe(200);
      expect(fake.cancelled()).toContain(outbound.boxtalOrderId);
      expect((await legRow(c.commandeId, 'OUTBOUND')).status).toBe('CANCELLED');
      // The return leg was never ordered, so there was nothing to cancel at Boxtal for it.
      expect((await legRow(c.commandeId, 'RETURN')).status).toBe('PENDING');
    });

    it('refuses a wrong webhook signature with 400 and records nothing', async () => {
      const before = await prisma.boxtalEvent.count();
      const { raw } = fake.signedBody({ id: nextEventId(), type: 'TRACKING_CHANGED', shippingOrderId: 'o-none', shipmentExternalId: null, payload: {} });
      const res = await request(app.getHttpServer())
        .post('/api/v1/shipping/webhook')
        .set('Content-Type', 'application/json')
        .set('x-bxt-signature', 'deadbeef')
        .send(raw.toString('utf8'));
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Signature invalide.');
      expect(await prisma.boxtalEvent.count()).toBe(before);
    });
  });
});
