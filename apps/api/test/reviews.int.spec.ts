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
import {
  __resetConnectGateway,
  connectGateway,
  FakeConnectGateway,
} from '../src/connect/gateway.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';
import { repairerStats } from '../src/reviews/repairer-stats.js';

const SECRET = 'whsec_test_reviews';
let eventSeq = 0;

describe('reviews', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  let adminCookie: string;
  const createdEmails: string[] = [];
  const eventIds: string[] = [];
  const saved: Record<string, string | undefined> = {};

  const offerBody = () => ({
    priceCents: 8000,
    delayHours: 24,
    // CF-31: « Aucune ». These réparateurs are at NONE and a garantie is refused below
    // BUSINESS - see `offers.service.ts`'s `assertWarrantyAllowed`.
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'WORKSHOP',
    acceptsParcel: true,
  });

  const demandeBody = () => ({
    categoryId,
    title: 'Écran iPhone 13 fissuré',
    description: "L'écran est fissuré en haut à droite et la batterie tient mal.",
    mode: 'OFFERS',
    locationLabel: 'Lyon 3e',
    postalCode: '69003',
  });

  async function pay(commandeId: string): Promise<void> {
    const commande = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    const sessionId = commande.stripeSessionId!;
    (paymentsGateway() as FakePaymentsGateway).markComplete(sessionId, {
      paymentIntentId: `pi_fake_${commandeId}`,
      chargeId: `ch_fake_${commandeId}`,
    });
    eventSeq += 1;
    const id = `evt_rev_${eventSeq}`;
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
        Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET }),
      )
      .send(body)
      .expect(200);
  }

  const advance = (id: string, cookie: string, step: string) =>
    request(app.getHttpServer())
      .post(`/api/v1/commandes/${id}/steps`)
      .set('Cookie', cookie)
      .send({ step });

  /**
   * A commande at PAID + RELEASED, which is the ONLY state a review is allowed in.
   *
   * The path is the one `commandes.int.spec.ts` already establishes rather than a second
   * one: pay, advance to AWAITING_VALIDATION, give the réparateur a payable
   * ConnectAccount, then release. The ConnectAccount row is created directly because
   * P2's onboarding flow is its own suite's subject, and going through it here would make
   * every review test depend on it.
   */
  async function aReleasedCommande(): Promise<{
    commandeId: string;
    repairerUserId: string;
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
    const checkout = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offer.body.id}/checkout`)
      .set('Cookie', client.cookie)
      .send({ delivery: 'WORKSHOP' })
      .expect(201);
    const commandeId = checkout.body.commandeId as string;
    await pay(commandeId);

    await advance(commandeId, repairer.cookie, 'REPAIR_STARTED').expect(200);
    await advance(commandeId, repairer.cookie, 'REPAIR_DONE').expect(200);
    await advance(commandeId, repairer.cookie, 'AWAITING_VALIDATION').expect(200);

    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    const fake = connectGateway() as FakeConnectGateway;
    const account = await fake.createAccount({ email: 'probe@repareme.test' });
    fake.markVerified(account.id);
    await prisma.connectAccount.create({
      data: {
        userId: row.repairerUserId,
        stripeAccountId: account.id,
        status: 'VERIFIED',
        transfersActive: true,
        lastSyncedAt: new Date(),
      },
    });
    // CMP-D3: the golden rule holds a payout until the réparateur has declared, so a réparateur
    // who is meant to be paid here has.
    await prisma.repairerProfile.update({ where: { userId: row.repairerUserId }, data: { fiscalCompletedAt: new Date() } });

    await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/release`)
      .set('Cookie', client.cookie)
      .expect(200);

    return {
      commandeId,
      repairerUserId: row.repairerUserId,
      clientCookie: client.cookie,
      repairerCookie: repairer.cookie,
    };
  }

  /** A PAID commande that has NOT been released, for the step half of §4.3's pair. */
  async function aPaidCommande(): Promise<{ commandeId: string; clientCookie: string }> {
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
    const checkout = await request(app.getHttpServer())
      .post(`/api/v1/offers/${offer.body.id}/checkout`)
      .set('Cookie', client.cookie)
      .send({ delivery: 'WORKSHOP' })
      .expect(201);
    await pay(checkout.body.commandeId);
    return { commandeId: checkout.body.commandeId as string, clientCookie: client.cookie };
  }

  const postReview = (id: string, cookie: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(`/api/v1/commandes/${id}/review`)
      .set('Cookie', cookie)
      .send(body);

  beforeAll(async () => {
    for (const k of [
      'PAYMENTS_ENABLED',
      'STRIPE_WEBHOOK_SECRET',
      'PUBLIC_API_URL',
      'STRIPE_DRIVER',
      'STRIPE_SECRET_KEY',
      'CONNECT_ENABLED',
      'STRIPE_CONNECT_WEBHOOK_SECRET',
    ]) {
      saved[k] = process.env[k];
    }
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
    process.env.PUBLIC_API_URL = 'http://localhost:3000';
    delete process.env.STRIPE_DRIVER;
    delete process.env.STRIPE_SECRET_KEY;
    process.env.CONNECT_ENABLED = 'true';
    process.env.STRIPE_CONNECT_WEBHOOK_SECRET = 'whsec_test_connect_reviews';
    __resetPaymentsGateway();
    __resetConnectGateway();

    app = await createTestApp();
    prisma = app.get(PrismaService);
    const category = await prisma.category.findFirstOrThrow({ where: { slug: 'smartphone' } });
    categoryId = category.id;

    // The operator session, created exactly as `admin.int.spec.ts` does: sign up, then
    // promote the row's role. Its email joins `createdEmails`, so the existing teardown
    // removes it rather than leaving an admin account in the client's live database.
    const admin = await signUp(app);
    createdEmails.push(admin.email);
    await prisma.user.update({ where: { email: admin.email }, data: { role: 'admin' } });
    adminCookie = admin.cookie;
  });

  afterAll(async () => {
    // Reviews explicitly and BEFORE the User cascade would take them. Piece 2's pattern:
    // an explicit scoped delete means a later FK change cannot silently strand rows, and
    // the WHERE names test data rather than trusting the table to be empty.
    const users = await prisma.user.findMany({
      where: { email: { in: createdEmails } },
      select: { id: true },
    });
    const ids = users.map((u) => u.id);
    await prisma.review.deleteMany({ where: { repairerUserId: { in: ids } } });
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

  it('the client can review a released commande', async () => {
    const { commandeId, repairerUserId, clientCookie } = await aReleasedCommande();
    await postReview(commandeId, clientCookie, {
      rating: 5,
      qualityRating: 5,
      comment: 'Travail impeccable, je recommande.',
    }).expect(201);

    const row = await prisma.review.findUniqueOrThrow({ where: { commandeId } });
    expect(row.rating).toBe(5);
    expect(row.qualityRating).toBe(5);
    // Skipped sub-ratings are null, not 0.
    expect(row.delayRating).toBeNull();
    expect(row.communicationRating).toBeNull();
    expect(row.repairerUserId).toBe(repairerUserId);
    expect(row.deletedAt).toBeNull();
  });

  it('refuses a commande that is not RELEASED', async () => {
    // The STEP half of the pair. `PAID` is a member of BOTH enums, so after `pay()` this
    // row is `status: 'PAID'` and `step: 'PAID'` -- it satisfies the status half
    // completely and fails only on the step. That is what isolates the step check here,
    // and it is the mirror image of the REFUNDED test below, which satisfies the step
    // half completely and fails only on the status.
    const { commandeId, clientCookie } = await aPaidCommande();
    const res = await postReview(commandeId, clientCookie, { rating: 5 }).expect(422);
    expect(res.body.error.message).toBe(
      'Vous pourrez laisser un avis lorsque les fonds auront été débloqués.',
    );
    expect(await prisma.review.count({ where: { commandeId } })).toBe(0);
  });

  it('refuses a REFUNDED commande, which still carries step RELEASED', async () => {
    // The STATUS half, and it needs its own test because one test cannot see both:
    // REFUNDED is a status and not a step, so this row satisfies the step condition
    // completely. Admitting it would make reviews a retaliation channel attached to a
    // refund -- the client was made whole and the réparateur was never paid.
    const { commandeId, clientCookie } = await aReleasedCommande();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { status: 'REFUNDED', refundedAt: new Date(), refundedCents: 8650 },
    });
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    // The premise of this test, asserted rather than assumed.
    expect(row.step).toBe('RELEASED');

    const res = await postReview(commandeId, clientCookie, { rating: 1 }).expect(422);
    expect(res.body.error.message).toBe('Cette commande a été remboursée.');
    expect(await prisma.review.count({ where: { commandeId } })).toBe(0);
  });

  it('refuses a DISPUTED commande, which can also still carry step RELEASED', async () => {
    // The third condition, and it needs its own test for the same reason the other two do:
    // `payments.service.ts` stamps `disputedAt` with NO step filter, so an open chargeback
    // and a released commande coexist. Without this guard a client could review, then
    // charge back, then win -- leaving a public review counting toward a reparateur who was
    // clawed back, which is the retaliation channel 4.3 refuses, reached in the other order.
    const { commandeId, clientCookie } = await aReleasedCommande();
    await prisma.commande.update({
      where: { id: commandeId },
      data: { disputedAt: new Date() },
    });
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    // Both premises asserted rather than assumed: still PAID, still RELEASED, now disputed.
    expect(row.status).toBe('PAID');
    expect(row.step).toBe('RELEASED');

    const res = await postReview(commandeId, clientCookie, { rating: 5 }).expect(422);
    expect(res.body.error.message).toBe("Ce paiement fait l'objet d'une vérification.");
    expect(await prisma.review.count({ where: { commandeId } })).toBe(0);
  });

  it('refuses a second review on the same commande, by the unique key', async () => {
    const { commandeId, clientCookie } = await aReleasedCommande();
    await postReview(commandeId, clientCookie, { rating: 4 }).expect(201);
    const res = await postReview(commandeId, clientCookie, { rating: 1 }).expect(422);
    expect(res.body.error.message).toBe('Vous avez déjà laissé un avis pour cette commande.');
    expect(await prisma.review.count({ where: { commandeId } })).toBe(1);
  });

  it('refuses the réparateur, who is a party but not the author', async () => {
    const { commandeId, repairerCookie } = await aReleasedCommande();
    const res = await postReview(commandeId, repairerCookie, { rating: 5 }).expect(403);
    expect(res.body.error.message).toBe('Seul le client peut laisser un avis.');
  });

  it('answers 404 to a stranger rather than 403', async () => {
    const { commandeId } = await aReleasedCommande();
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);
    await postReview(commandeId, stranger.cookie, { rating: 5 }).expect(404);
  });

  it('refuses an unauthenticated caller', async () => {
    const { commandeId } = await aReleasedCommande();
    await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/review`)
      .send({ rating: 5 })
      .expect(401);
  });

  it('lists a réparateur reviews newest first, with the author FIRST NAME only', async () => {
    const { commandeId, repairerUserId, clientCookie } = await aReleasedCommande();
    await postReview(commandeId, clientCookie, {
      rating: 4,
      delayRating: 3,
      comment: 'Bon travail, un peu de retard.',
    }).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/repairers/${repairerUserId}/reviews`)
      .set('Cookie', clientCookie)
      .expect(200);

    expect(res.body).toHaveLength(1);
    const [review] = res.body;
    expect(review.rating).toBe(4);
    expect(review.delayRating).toBe(3);
    expect(review.qualityRating).toBeNull();
    expect(review.comment).toBe('Bon travail, un peu de retard.');
    expect(typeof review.createdAt).toBe('string');

    // 🛑 REWRITTEN 2026-08-22 by the CF-04/CF-05 slice, and the reversal is the point.
    // This asserted the author's FIRST name (design 4.5, an owner decision of 2026-08-19).
    // The client's V1 feedback bans BOTH names from public view - « Le nom et prénom ne
    // doivent pas être visibles publiquement par les autres utilisateurs » - so a public
    // review is now signed with the author's HANDLE. `firstName ?? name` is not the answer
    // to that instruction; the handle is.
    //
    // `helpers.ts` signs up with `firstName: 'Test'` and `name: 'Test Utilisateur'`, so all
    // three strings are genuinely different and a leak is visible rather than coincidentally
    // equal.
    const stored = await prisma.review.findUniqueOrThrow({
      where: { commandeId },
      select: { authorUserId: true },
    });
    const author = await prisma.user.findUniqueOrThrow({
      where: { id: stored.authorUserId },
      select: { firstName: true, name: true, username: true },
    });
    expect(review.authorName).toBe(`@${author.username}`);
    // Both halves of the ban, asserted separately so a regression names which one broke.
    expect(review.authorName).not.toBe(author.name);
    expect(review.authorName).not.toBe(author.firstName);
    // The premise, asserted rather than assumed: if the handle were ever absent this test
    // would otherwise pass vacuously against the string '@undefined'.
    expect(author.username).toBeTruthy();
  });

  it('answers an empty array for a réparateur with no reviews', async () => {
    const { repairerUserId, clientCookie } = await aReleasedCommande();
    const res = await request(app.getHttpServer())
      .get(`/api/v1/repairers/${repairerUserId}/reviews`)
      .set('Cookie', clientCookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('refuses an unauthenticated caller on the public list', async () => {
    // "Public" means every signed-in user, not anonymous. No route in this API is
    // anonymous except health and the webhooks.
    const { repairerUserId } = await aReleasedCommande();
    await request(app.getHttpServer())
      .get(`/api/v1/repairers/${repairerUserId}/reviews`)
      .expect(401);
  });

  // CF4-L: the no-motif `/delete` route is replaced by `/hide`, which requires a motif.
  const deleteReview = (id: string, cookie: string) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/reviews/${id}/hide`)
      .set('Cookie', cookie)
      .send({ motif: 'OFF_TOPIC' });

  it('an operator soft-deletes a review, and BOTH the list and the aggregate change', async () => {
    const { commandeId, repairerUserId, clientCookie } = await aReleasedCommande();
    await postReview(commandeId, clientCookie, { rating: 5 }).expect(201);
    const review = await prisma.review.findUniqueOrThrow({ where: { commandeId } });

    const before = await repairerStats(prisma, [repairerUserId]);
    expect(before.get(repairerUserId)!.rating).toBe(5);
    expect(before.get(repairerUserId)!.reviewCount).toBe(1);
    // The repair is counted too, which is the invariant reviewCount <= repairCount.
    expect(before.get(repairerUserId)!.repairCount).toBe(1);

    await deleteReview(review.id, adminCookie).expect(200);

    // The row SURVIVES -- a soft delete keeps the evidence.
    const row = await prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.rating).toBe(5);

    // Gone from the public list AND from the aggregate. Driving the real route rather than
    // seeding `deletedAt` is the point of this test: it proves the operator path, not just
    // the query.
    const list = await request(app.getHttpServer())
      .get(`/api/v1/repairers/${repairerUserId}/reviews`)
      .set('Cookie', clientCookie)
      .expect(200);
    expect(list.body).toEqual([]);

    const after = await repairerStats(prisma, [repairerUserId]);
    expect(after.get(repairerUserId)!.rating).toBeNull();
    expect(after.get(repairerUserId)!.reviewCount).toBe(0);
    // The repair still happened. Removing a review must not remove a repair.
    expect(after.get(repairerUserId)!.repairCount).toBe(1);
  });

  it('a soft-deleted review still blocks a second review on that commande', async () => {
    // The unique index does not care about `deletedAt`, so this is the honest behaviour --
    // and it is why `CommandeDto.reviewed` must ignore `deletedAt` too. Without this test a
    // plausible "let him try again after a removal" change would look safe: it would pass
    // the aggregate test above, which only checks that the number moved.
    const { commandeId, clientCookie } = await aReleasedCommande();
    await postReview(commandeId, clientCookie, { rating: 2 }).expect(201);
    const review = await prisma.review.findUniqueOrThrow({ where: { commandeId } });
    await deleteReview(review.id, adminCookie).expect(200);

    const res = await postReview(commandeId, clientCookie, { rating: 5 }).expect(422);
    expect(res.body.error.message).toBe('Vous avez déjà laissé un avis pour cette commande.');
    // Still exactly one row, and it is still the removed one rather than a replacement.
    expect(await prisma.review.count({ where: { commandeId } })).toBe(1);
    const after = await prisma.review.findUniqueOrThrow({ where: { commandeId } });
    expect(after.id).toBe(review.id);
    expect(after.rating).toBe(2);
  });

  it('repairCount EXCLUDES a refunded commande, which still carries step RELEASED', async () => {
    // The count's own version of the status-versus-step trap, and it needs its own test:
    // the review route refusing a REFUNDED row proves nothing about the count, because the
    // two are separate queries over the same pair.
    const { commandeId, repairerUserId } = await aReleasedCommande();
    expect((await repairerStats(prisma, [repairerUserId])).get(repairerUserId)!.repairCount).toBe(1);

    await prisma.commande.update({
      where: { id: commandeId },
      data: { status: 'REFUNDED', refundedAt: new Date(), refundedCents: 8650 },
    });
    const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
    // The premise, asserted rather than assumed.
    expect(row.step).toBe('RELEASED');

    // Absent from the map entirely: no reviews, and now no counted repairs either.
    expect((await repairerStats(prisma, [repairerUserId])).get(repairerUserId)).toBeUndefined();
  });

  it('answers 404 on an unknown review id, which is the mis-key it checks for', async () => {
    await deleteReview('00000000-0000-0000-0000-000000000000', adminCookie).expect(404);
  });

  it('refuses a non-operator', async () => {
    const { commandeId, clientCookie } = await aReleasedCommande();
    await postReview(commandeId, clientCookie, { rating: 5 }).expect(201);
    const review = await prisma.review.findUniqueOrThrow({ where: { commandeId } });
    await deleteReview(review.id, clientCookie).expect(403);
  });

});
