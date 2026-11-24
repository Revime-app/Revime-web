import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('Dispute Messaging Integration (CF5-02)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];
  const cleanups: (() => Promise<unknown>)[] = [];

  let clientCookie: string;
  let repairerCookie: string;
  let strangerCookie: string;
  let commandeId: string;
  let disputeId: string;

  beforeAll(async () => {
    process.env.STORAGE_DRIVER = 'fake';
    app = await createTestApp();
    prisma = app.get(PrismaService);

    // 1. Create client, repairer, stranger
    const client = await signUp(app);
    clientCookie = client.cookie;
    createdEmails.push(client.email);
    const clientUser = await prisma.user.findUniqueOrThrow({ where: { email: client.email } });

    const repairer = await signUpRepairer(app);
    repairerCookie = repairer.cookie;
    createdEmails.push(repairer.email);
    const repairerUser = await prisma.user.findUniqueOrThrow({ where: { email: repairer.email } });

    const stranger = await signUp(app);
    strangerCookie = stranger.cookie;
    createdEmails.push(stranger.email);

    // 2. Category
    const cat = await prisma.category.findFirstOrThrow({ where: { active: true } });

    // 3. Demande
    const demande = await prisma.demande.create({
      data: {
        authorUserId: clientUser.id,
        categoryId: cat.id,
        title: 'Demande pour litige',
        description: 'Description pour tester messagerie litige',
        status: 'OPEN',
        parts: 'UNKNOWN',
        mode: 'OFFERS',
        locationLabel: 'Paris',
        postalCode: '75001',
      },
    });
    cleanups.push(() => prisma.demande.delete({ where: { id: demande.id } }));

    // 4. Offer
    const offer = await prisma.offer.create({
      data: {
        demande: { connect: { id: demande.id } },
        repairer: { connect: { id: repairerUser.id } },
        priceCents: 6000,
        delayHours: 48,
        warrantyLabel: '3 mois',
        partsLabel: 'Originales',
        travel: 'WORKSHOP',
        status: 'ACCEPTED',
      },
    });
    cleanups.push(() => prisma.offer.delete({ where: { id: offer.id } }));

    // 5. Commande
    const commande = await prisma.commande.create({
      data: {
        demande: { connect: { id: demande.id } },
        offer: { connect: { id: offer.id } },
        client: { connect: { id: clientUser.id } },
        repairer: { connect: { id: repairerUser.id } },
        status: 'PAID',
        delivery: 'WORKSHOP',
        step: 'REPAIR_STARTED',
        repairCents: 6000,
        protectionCents: 600,
        shippingCents: 0,
        totalCents: 6600,
        disputedAt: new Date(),
      },
    });
    commandeId = commande.id;
    cleanups.push(() => prisma.commande.delete({ where: { id: commande.id } }));

    // 6. Dispute
    const dispute = await prisma.dispute.create({
      data: {
        commande: { connect: { id: commande.id } },
        status: 'IN_REVIEW',
        initiator: 'REPAIRER',
        openedByUserId: repairerUser.id,
        motif: 'SERVICE_DISAGREEMENT',
        reason: 'Désaccord sur la prestation',
        description: 'Explication du litige',
      },
    });
    disputeId = dispute.id;
    cleanups.push(() => prisma.dispute.delete({ where: { id: dispute.id } }));
  });

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      try {
        await cleanup();
      } catch {
        // ignore
      }
    }
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } }).catch(() => null);
    }
    await app.close();
  });

  it('allows the repairer to send a message into their confidential dispute space', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/dispute/messages`)
      .set('Cookie', repairerCookie)
      .send({ body: 'Message réparateur pour REVIME' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      author: 'me',
      body: 'Message réparateur pour REVIME',
      photoUrl: null,
      document: null,
    });

    const inDb = await prisma.disputeMessage.findUnique({ where: { id: res.body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.space).toBe('REPAIRER');
    expect(inDb?.author).toBe('PARTY');
  });

  it('allows the client to send a message into their confidential dispute space', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/dispute/messages`)
      .set('Cookie', clientCookie)
      .send({ body: 'Message client pour REVIME' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      author: 'me',
      body: 'Message client pour REVIME',
      photoUrl: null,
      document: null,
    });

    const inDb = await prisma.disputeMessage.findUnique({ where: { id: res.body.id } });
    expect(inDb).not.toBeNull();
    expect(inDb?.space).toBe('CLIENT');
    expect(inDb?.author).toBe('PARTY');
  });

  it('rejects unauthenticated message sending with 401', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/dispute/messages`)
      .send({ body: 'Unauthenticated message' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('rejects a stranger (not in order) with 404', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/dispute/messages`)
      .set('Cookie', strangerCookie)
      .send({ body: 'Stranger message' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects empty message body with 400 validation error', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/dispute/messages`)
      .set('Cookie', repairerCookie)
      .send({ body: '   ' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects sending when dispute is resolved / closed with 422', async () => {
    await prisma.dispute.update({
      where: { id: disputeId },
      data: { status: 'RESOLVED_DISMISSED' },
    });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/commandes/${commandeId}/dispute/messages`)
      .set('Cookie', repairerCookie)
      .send({ body: 'Litige clos attempt' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    expect(res.body.error.message).toBe('Ce litige est clos.');
  });
});
