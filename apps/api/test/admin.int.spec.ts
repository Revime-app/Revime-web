import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';
import { FakeShippingGateway, __registerBoxtalGateway, __resetShippingGateway } from '../src/shipping/gateway.js';

describe('admin', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Explicit and scoped, before the cascade. Reports and blocks DO cascade from
    // User, but stating it here means a later FK change cannot silently strand rows,
    // and the standing constraint is that every cleanup DELETE names test data
    // whatever the table.
    const ids = (
      await prisma.user.findMany({ where: { email: { in: createdEmails } }, select: { id: true } })
    ).map((u) => u.id);
    if (ids.length > 0) {
      await prisma.block.deleteMany({
        where: { OR: [{ blockerUserId: { in: ids } }, { blockedUserId: { in: ids } }] },
      });
      await prisma.conversationReport.deleteMany({
        where: { OR: [{ reporterUserId: { in: ids } }, { reportedUserId: { in: ids } }] },
      });
    }
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('refuses a normal user', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const res = await request(app.getHttpServer()).get('/api/v1/admin/ping').set('Cookie', cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('allows a user whose role is admin', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    await prisma.user.update({ where: { email }, data: { role: 'admin' } });

    const res = await request(app.getHttpServer()).get('/api/v1/admin/ping').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('refuses an anonymous request', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/admin/ping');
    expect(res.status).toBe(401);
  });

  async function aPaidParcelCommande(): Promise<{ commandeId: string; clientCookie: string }> {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
    const demande = await prisma.demande.create({
      data: {
        authorUserId: (await prisma.user.findUniqueOrThrow({ where: { email: client.email } })).id,
        categoryId: category.id,
        title: 'Écran iPhone 13 fissuré',
        description: 'Pour le test admin colis.',
        locationLabel: 'Lyon 3e',
        postalCode: '69003',
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
        priceCents: 8000,
        delayHours: 24,
        warrantyLabel: '6 mois',
        partsLabel: "Pièce d'origine",
        travel: 'WORKSHOP',
        acceptsParcel: true,
        status: 'ACCEPTED',
      },
      select: { id: true },
    });
    const commande = await prisma.commande.create({
      data: {
        demandeId: demande.id,
        offerId: offer.id,
        clientUserId: demande.authorUserId,
        repairerUserId: repairerUser.id,
        delivery: 'PARCEL',
        repairCents: 8000,
        shippingCents: 1900,
        protectionCents: 650,
        totalCents: 10550,
        status: 'PAID',
        step: 'PAID',
        paidAt: new Date(),
      },
      select: { id: true },
    });
    return { commandeId: commande.id, clientCookie: client.cookie };
  }

  async function anAdmin(): Promise<string> {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    await prisma.user.update({ where: { email }, data: { role: 'admin' } });
    return cookie;
  }

  const bothAddresses = async (commandeId: string) => {
    for (const role of ['CLIENT', 'REPAIRER'] as const) {
      await prisma.shippingAddress.create({
        data: {
          commandeId,
          role,
          line1: '12 rue de la Paix',
          postalCode: '75002',
          city: 'Paris',
          phone: '+33612345678',
        },
      });
    }
  };

  const issue = (commandeId: string, cookie: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/admin/commandes/${commandeId}/parcel`)
      .set('Cookie', cookie)
      .send(body);

  describe('issuing colis labels', () => {
    const numbers = { outboundTrackingNumber: '6C 1111 2222', returnTrackingNumber: '6C 3333 4444' };

    it('records both numbers', async () => {
      const { commandeId } = await aPaidParcelCommande();
      await bothAddresses(commandeId);
      const cookie = await anAdmin();

      await issue(commandeId, cookie, numbers).expect(200);
      const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId } });
      expect(row.outboundTrackingNumber).toBe('6C 1111 2222');
      expect(row.returnTrackingNumber).toBe('6C 3333 4444');
    });

    it('refuses a non-admin', async () => {
      const { commandeId } = await aPaidParcelCommande();
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);
      const res = await issue(commandeId, cookie, numbers);
      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe("Accès réservé à l'équipe Revime.");
    });

    it('refuses before both addresses are in', async () => {
      const { commandeId } = await aPaidParcelCommande();
      const cookie = await anAdmin();
      const res = await issue(commandeId, cookie, numbers);
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe('Les deux adresses ne sont pas encore renseignées.');
    });

    it('refuses a second issue', async () => {
      const { commandeId } = await aPaidParcelCommande();
      await bothAddresses(commandeId);
      const cookie = await anAdmin();
      await issue(commandeId, cookie, numbers).expect(200);

      const res = await issue(commandeId, cookie, numbers);
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe('Les étiquettes ont déjà été émises.');
    });

    it('refuses a punctuated tracking number with 400', async () => {
      const { commandeId } = await aPaidParcelCommande();
      await bothAddresses(commandeId);
      const cookie = await anAdmin();
      const res = await issue(commandeId, cookie, {
        ...numbers,
        outboundTrackingNumber: '6C-1111-2222',
      });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });

    it('refuses a nonexistent commande with 404', async () => {
      const cookie = await anAdmin();
      const res = await issue('00000000-0000-0000-0000-000000000000', cookie, numbers);
      expect(res.status).toBe(404);
      expect(res.body.error.message).toBe('Ressource introuvable.');
    });

    it('refuses a WORKSHOP commande with 422', async () => {
      const client = await signUp(app);
      createdEmails.push(client.email);
      const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
      const demande = await prisma.demande.create({
        data: {
          authorUserId: (await prisma.user.findUniqueOrThrow({ where: { email: client.email } })).id,
          categoryId: category.id,
          title: 'Écran iPhone 13 fissuré',
          description: 'Pour le test admin workshop.',
          locationLabel: 'Lyon 3e',
          postalCode: '69003',
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
          priceCents: 8000,
          delayHours: 24,
          warrantyLabel: '6 mois',
          partsLabel: "Pièce d'origine",
          travel: 'WORKSHOP',
          acceptsParcel: false,
          status: 'ACCEPTED',
        },
        select: { id: true },
      });
      const commande = await prisma.commande.create({
        data: {
          demandeId: demande.id,
          offerId: offer.id,
          clientUserId: demande.authorUserId,
          repairerUserId: repairerUser.id,
          delivery: 'WORKSHOP',
          repairCents: 8000,
          shippingCents: 0,
          protectionCents: 650,
          totalCents: 8650,
          status: 'PAID',
          step: 'PAID',
          paidAt: new Date(),
        },
        select: { id: true },
      });
      const cookie = await anAdmin();
      const res = await issue(commande.id, cookie, numbers);
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Cette commande n'est pas un envoi par colis.");
    });

    it('refuses a commande that is not yet PAID with 422', async () => {
      const client = await signUp(app);
      createdEmails.push(client.email);
      const category = await prisma.category.findFirstOrThrow({ where: { active: true } });
      const demande = await prisma.demande.create({
        data: {
          authorUserId: (await prisma.user.findUniqueOrThrow({ where: { email: client.email } })).id,
          categoryId: category.id,
          title: 'Écran iPhone 13 fissuré',
          description: 'Pour le test admin unpaid.',
          locationLabel: 'Lyon 3e',
          postalCode: '69003',
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
          priceCents: 8000,
          delayHours: 24,
          warrantyLabel: '6 mois',
          partsLabel: "Pièce d'origine",
          travel: 'WORKSHOP',
          acceptsParcel: true,
          status: 'ACCEPTED',
        },
        select: { id: true },
      });
      const commande = await prisma.commande.create({
        data: {
          demandeId: demande.id,
          offerId: offer.id,
          clientUserId: demande.authorUserId,
          repairerUserId: repairerUser.id,
          delivery: 'PARCEL',
          repairCents: 8000,
          shippingCents: 1900,
          protectionCents: 650,
          totalCents: 10550,
          status: 'PENDING_PAYMENT',
          step: null,
        },
        select: { id: true },
      });
      const cookie = await anAdmin();
      const res = await issue(commande.id, cookie, numbers);
      expect(res.status).toBe(422);
      expect(res.body.error.message).toBe("Cette commande n'est pas encore payée.");
    });
  });

  describe('refunding commandes', () => {
    it('refuses a refund to a non-admin', async () => {
      const { commandeId, clientCookie } = await aPaidParcelCommande();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/commandes/${commandeId}/refund`)
        .set('Cookie', clientCookie)
        .send({ reason: 'Je veux mon argent.' });
      expect(res.status).toBe(403);
    });
  });

  describe('reading commande summaries and attention items', () => {
    it('lists the attention rows at a path that is not swallowed by :id', async () => {
      const cookie = await anAdmin();
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/commandes/attention')
        .set('Cookie', cookie)
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('echoes back what a refund is about to touch, so a mis-keyed id is self-evident', async () => {
      const { commandeId } = await aPaidParcelCommande();
      const cookie = await anAdmin();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/commandes/${commandeId}`)
        .set('Cookie', cookie)
        .expect(200);

      expect(res.body.demandeTitle).toBe('Écran iPhone 13 fissuré');
      expect(res.body.clientName).toBeTruthy();
      expect(res.body.repairerName).toBeTruthy();
      expect(res.body.delivery).toBe('PARCEL');
      expect(res.body.totalCents).toBe(res.body.repairCents + res.body.shippingCents + res.body.protectionCents);
      expect(res.body.transferred).toBe(false);
      expect(res.body.refunded).toBe(false);
      expect(res.body.disputed).toBe(false);

      // Both flipped on the row, then re-read: a false/false assertion on a clean
      // row would also pass against two hard-coded `false`s.
      await prisma.commande.update({
        where: { id: commandeId },
        data: { stripeRefundId: `re_summary_${commandeId}`, disputedAt: new Date() },
      });
      const after = await request(app.getHttpServer())
        .get(`/api/v1/admin/commandes/${commandeId}`)
        .set('Cookie', cookie)
        .expect(200);
      expect(after.body.refunded).toBe(true);
      expect(after.body.disputed).toBe(true);
    });

    it('refuses both reads to a non-admin', async () => {
      const { commandeId, clientCookie } = await aPaidParcelCommande();
      await request(app.getHttpServer())
        .get(`/api/v1/admin/commandes/${commandeId}`)
        .set('Cookie', clientCookie)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/admin/commandes/attention')
        .set('Cookie', clientCookie)
        .expect(403);
    });
  });

  describe('moderation: the report queue', () => {
    /** An admin cookie, and a reported conversation to act on. */
    async function aReportedConversation(): Promise<{
      adminCookie: string;
      conversationId: string;
      reportId: string;
      messageId: string;
      clientUserId: string;
      repairerUserId: string;
    }> {
      const admin = await signUp(app);
      createdEmails.push(admin.email);
      await prisma.user.update({ where: { email: admin.email }, data: { role: 'admin' } });

      const client = await signUp(app);
      createdEmails.push(client.email);
      const repairer = await signUp(app);
      createdEmails.push(repairer.email);
      const clientUser = await prisma.user.findUniqueOrThrow({ where: { email: client.email } });
      const repairerUser = await prisma.user.findUniqueOrThrow({
        where: { email: repairer.email },
      });
      const category = await prisma.category.findFirstOrThrow({ where: { active: true } });

      const demande = await prisma.demande.create({
        data: {
          authorUserId: clientUser.id,
          categoryId: category.id,
          title: 'Écran iPhone 13 fissuré',
          description: 'Pour le test admin signalements.',
          locationLabel: 'Lyon 3e',
          postalCode: '69003',
        },
        select: { id: true },
      });
      const conversation = await prisma.conversation.create({
        data: {
          demandeId: demande.id,
          clientUserId: clientUser.id,
          repairerUserId: repairerUser.id,
          lastMessageAt: new Date(),
        },
        select: { id: true },
      });
      const message = await prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderUserId: repairerUser.id,
          body: 'Payez-moi en direct, hors Revime.',
        },
        select: { id: true },
      });
      const report = await prisma.conversationReport.create({
        data: {
          conversationId: conversation.id,
          reporterUserId: clientUser.id,
          reportedUserId: repairerUser.id,
          reason: 'OFF_PLATFORM',
        },
        select: { id: true },
      });

      return {
        adminCookie: admin.cookie,
        conversationId: conversation.id,
        reportId: report.id,
        messageId: message.id,
        clientUserId: clientUser.id,
        repairerUserId: repairerUser.id,
      };
    }

    it('refuses every moderation route to a normal user', async () => {
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);
      for (const path of ['/api/v1/admin/reports', '/api/v1/admin/conversations/x']) {
        const res = await request(app.getHttpServer()).get(path).set('Cookie', cookie);
        expect(res.status).toBe(403);
      }
    });

    it('lists the open report with both names and the demande title', async () => {
      const f = await aReportedConversation();
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports')
        .set('Cookie', f.adminCookie)
        .expect(200);

      const row = res.body.find((r: { reportId: string }) => r.reportId === f.reportId);
      expect(row).toBeDefined();
      expect(row.reason).toBe('OFF_PLATFORM');
      expect(row.demandeTitle).toBe('Écran iPhone 13 fissuré');
      expect(row.conversationId).toBe(f.conversationId);
      expect(row.conversationClosed).toBe(false);
      expect(typeof row.reporterName).toBe('string');
      expect(row.reporterName.length).toBeGreaterThan(0);
      expect(typeof row.reportedName).toBe('string');
    });

    it('shows the operator the thread before he acts, including soft-deleted messages', async () => {
      const f = await aReportedConversation();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/conversations/${f.conversationId}`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      expect(res.body.closed).toBe(false);
      expect(res.body.demandeTitle).toBe('Écran iPhone 13 fissuré');
      expect(res.body.messages).toHaveLength(1);
      expect(res.body.messages[0].body).toBe('Payez-moi en direct, hors Revime.');
      expect(res.body.messages[0].deleted).toBe(false);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/messages/${f.messageId}/delete`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/admin/conversations/${f.conversationId}`)
        .set('Cookie', f.adminCookie)
        .expect(200);
      // STILL PRESENT, flagged. An operator reviewing a second report must see what he
      // already removed, or he cannot tell whether he acted.
      expect(after.body.messages).toHaveLength(1);
      expect(after.body.messages[0].deleted).toBe(true);
    });

    it('soft-deleting a message hides it from the PARTIES but keeps the row', async () => {
      const f = await aReportedConversation();
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/messages/${f.messageId}/delete`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      const row = await prisma.message.findUniqueOrThrow({ where: { id: f.messageId } });
      expect(row.deletedAt).not.toBeNull();
      expect(row.body).toBe('Payez-moi en direct, hors Revime.');
    });

    it('closes a conversation, and the parties can no longer reach it', async () => {
      const f = await aReportedConversation();
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${f.conversationId}/close`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      const row = await prisma.conversation.findUniqueOrThrow({
        where: { id: f.conversationId },
      });
      expect(row.deletedAt).not.toBeNull();
    });

    it('REOPENS a closed conversation', async () => {
      const f = await aReportedConversation();
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${f.conversationId}/close`)
        .set('Cookie', f.adminCookie)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${f.conversationId}/reopen`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      const row = await prisma.conversation.findUniqueOrThrow({
        where: { id: f.conversationId },
      });
      expect(row.deletedAt).toBeNull();
    });

    /**
     * The two assertions a plausible implementation fails, because "restore everything"
     * is the tempting shape. Spec §8.1.
     */
    it('reopening does NOT unblock and does NOT clear resolvedAt', async () => {
      const f = await aReportedConversation();
      await prisma.block.create({
        data: { blockerUserId: f.clientUserId, blockedUserId: f.repairerUserId },
      });
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/reports/${f.reportId}/resolve`)
        .set('Cookie', f.adminCookie)
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${f.conversationId}/close`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${f.conversationId}/reopen`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      // The block is the USER'S decision. An operator must not undo it.
      expect(
        await prisma.block.count({
          where: { blockerUserId: f.clientUserId, blockedUserId: f.repairerUserId },
        }),
      ).toBe(1);
      // Resolving and closing are separate acts, kept orthogonal.
      const report = await prisma.conversationReport.findUniqueOrThrow({
        where: { id: f.reportId },
      });
      expect(report.resolvedAt).not.toBeNull();
    });

    it('resolving takes the report out of the queue', async () => {
      const f = await aReportedConversation();
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/reports/${f.reportId}/resolve`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/reports')
        .set('Cookie', f.adminCookie)
        .expect(200);
      expect(
        res.body.find((r: { reportId: string }) => r.reportId === f.reportId),
      ).toBeUndefined();
    });

    it('answers 404 for an unknown id on every write, rather than silently succeeding', async () => {
      const f = await aReportedConversation();
      const missing = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/reports/${missing}/resolve`)
        .set('Cookie', f.adminCookie)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${missing}/close`)
        .set('Cookie', f.adminCookie)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${missing}/reopen`)
        .set('Cookie', f.adminCookie)
        .expect(404);
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/messages/${missing}/delete`)
        .set('Cookie', f.adminCookie)
        .expect(404);
      await request(app.getHttpServer())
        .get(`/api/v1/admin/conversations/${missing}`)
        .set('Cookie', f.adminCookie)
        .expect(404);
    });

    it('keeps a closed conversation READABLE to the operator, so reopen is not decided blind', async () => {
      const f = await aReportedConversation();
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/conversations/${f.conversationId}/close`)
        .set('Cookie', f.adminCookie)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/conversations/${f.conversationId}`)
        .set('Cookie', f.adminCookie)
        .expect(200);
      expect(res.body.closed).toBe(true);
      expect(res.body.messages).toHaveLength(1);
    });
  });

  /**
   * Livraison Boxtal (spec §7.8). Extended by reading on 2026-09-05 for Livraison Boxtal; not run,
   * because this suite writes to the production database.
   */
  describe('Boxtal shipments: the summary and the retry', () => {
    const fake = new FakeShippingGateway();
    const quoteIds: string[] = [];
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

    beforeAll(() => {
      for (const [k, v] of Object.entries(SHIPPING_ENV)) {
        savedShipping[k] = process.env[k];
        process.env[k] = v;
      }
      __registerBoxtalGateway(() => fake);
      __resetShippingGateway();
    });

    afterAll(async () => {
      // ShippingQuote has no cascade from User, and Commande.shippingQuoteId points at it.
      await prisma.commande.updateMany({ where: { shippingQuoteId: { in: quoteIds } }, data: { shippingQuoteId: null } });
      await prisma.shippingQuote.deleteMany({ where: { id: { in: quoteIds } } });
      for (const [k, v] of Object.entries(savedShipping)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      __resetShippingGateway();
    });

    /**
     * A PAID HOME parcel with its quote, both addresses and two legs - OUTBOUND FAILED (Boxtal refused),
     * RETURN PENDING. Rows are written directly: the ordering path is `commandes.int.spec.ts`'s subject.
     */
    async function aParcelWithAFailedLeg(): Promise<{ commandeId: string; outboundId: string }> {
      const { commandeId } = await aPaidParcelCommande();
      const row = await prisma.commande.findUniqueOrThrow({ where: { id: commandeId }, select: { offerId: true, clientUserId: true } });
      const quote = await prisma.shippingQuote.create({
        data: {
          offerId: row.offerId,
          clientUserId: row.clientUserId,
          parcelWeightGrams: 500,
          parcelLengthCm: 20,
          parcelWidthCm: 12,
          parcelHeightCm: 8,
          parcelValueCents: 30_000,
          homeShippingCents: 1090,
          legs: {},
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });
      quoteIds.push(quote.id);
      await prisma.commande.update({
        where: { id: commandeId },
        data: {
          parcelOption: 'HOME',
          parcelWeightGrams: 500,
          parcelLengthCm: 20,
          parcelWidthCm: 12,
          parcelHeightCm: 8,
          parcelValueCents: 30_000,
          insuranceCents: 0,
          shippingQuoteId: quote.id,
        },
      });
      await bothAddresses(commandeId);
      const leg = (l: 'OUTBOUND' | 'RETURN', status: 'FAILED' | 'PENDING') => ({
        commandeId,
        leg: l,
        status,
        carrierCode: 'POFR',
        serviceCode: 'ColissimoAccess',
        carrierLabel: 'La Poste',
        quotedCostExclTaxCents: 669,
        quotedCostInclTaxCents: 803,
        failureReason: status === 'FAILED' ? 'InvalidPaymentException: sandbox refused the order' : null,
      });
      const outbound = await prisma.shipment.create({ data: leg('OUTBOUND', 'FAILED') });
      await prisma.shipment.create({ data: leg('RETURN', 'PENDING') });
      return { commandeId, outboundId: outbound.id };
    }

    const retry = (commandeId: string, leg: string, cookie: string) =>
      request(app.getHttpServer()).post(`/api/v1/admin/commandes/${commandeId}/shipments/${leg}/retry`).set('Cookie', cookie);

    it('the summary carries both legs: quoted versus billed, the label state and the failure reason', async () => {
      const { commandeId } = await aParcelWithAFailedLeg();
      const res = await request(app.getHttpServer())
        .get(`/api/v1/admin/commandes/${commandeId}`)
        .set('Cookie', await anAdmin())
        .expect(200);
      expect(res.body.shipments).toHaveLength(2);
      const failed = res.body.shipments.find((s: { leg: string }) => s.leg === 'OUTBOUND');
      expect(failed.status).toBe('FAILED');
      expect(failed.carrierLabel).toBe('La Poste');
      expect(failed.quotedCostExclTaxCents).toBe(669);
      expect(failed.billedExclTaxCents).toBeNull();
      expect(failed.boxtalOrderId).toBeNull();
      expect(failed.labelReady).toBe(false);
      expect(failed.failureReason).toContain('InvalidPaymentException');
      expect(res.body.insuranceCents).toBe(0);
    });

    it('retries a FAILED leg through the guarded ordering path: 200, the leg is ORDERED, one new Boxtal order', async () => {
      const { commandeId, outboundId } = await aParcelWithAFailedLeg();
      const before = fake.orders().length;
      await retry(commandeId, 'OUTBOUND', await anAdmin()).expect(200);
      expect(fake.orders()).toHaveLength(before + 1);
      expect(fake.orders()[fake.orders().length - 1]!.externalId).toBe(outboundId);
      const after = await prisma.shipment.findUniqueOrThrow({ where: { id: outboundId } });
      expect(after.status).toBe('ORDERED');
      expect(after.failureReason).toBeNull();
      expect(after.boxtalOrderId).not.toBeNull();
      // The audit row the coverage gate promised.
      expect(
        await prisma.adminAuditLog.count({ where: { action: 'commande.shipment.retry', targetId: commandeId } }),
      ).toBe(1);
    });

    it('refuses a retry on a leg that is not FAILED, by message, and an unknown leg with 400', async () => {
      const { commandeId } = await aParcelWithAFailedLeg();
      const cookie = await anAdmin();
      const pending = await retry(commandeId, 'RETURN', cookie);
      expect(pending.status).toBe(422);
      expect(pending.body.error.message).toBe("Cette expédition n'est pas en échec.");
      const bad = await retry(commandeId, 'SIDEWAYS', cookie);
      expect(bad.status).toBe(400);
      expect(bad.body.error.message).toBe('Trajet invalide.');
    });

    it('refuses the retry to a non-admin', async () => {
      const { commandeId } = await aParcelWithAFailedLeg();
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);
      await retry(commandeId, 'OUTBOUND', cookie).expect(403);
    });
  });
});
