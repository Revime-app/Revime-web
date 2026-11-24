import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('conversations', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let categoryId: string;
  const createdEmails: string[] = [];
  const originalFlag = process.env.MESSAGING_ENABLED;

  const demandeBody = () => ({
    categoryId,
    brand: 'Apple',
    model: 'iPhone 13',
    title: 'Écran iPhone 13 fissuré',
    description: "L'écran est fissuré en haut à droite et la batterie tient mal.",
    mode: 'OFFERS',
    locationLabel: 'Lyon 3e',
    postalCode: '69003',
  });

  const offerBody = (over: Record<string, unknown> = {}) => ({
    priceCents: 8900,
    delayHours: 24,
    // CF-31: « Aucune ». These réparateurs are at NONE and a garantie is refused below
    // BUSINESS. Note this file's recap ALSO suppresses on read (`offerRecap`), so a row
    // forced to « 6 mois » in the DB would still come back « Aucune » here.
    warrantyLabel: 'Aucune',
    partsLabel: "Pièce d'origine",
    travel: 'HOME',
    acceptsParcel: false,
    ...over,
  });

  /**
   * A client with an OPEN demande and a réparateur who has offered on it - the
   * minimum state in which a conversation may exist at all.
   */
  async function aPair(): Promise<{
    demandeId: string;
    clientCookie: string;
    repairerCookie: string;
    repairerUserId: string;
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
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${demande.body.id}/offers`)
      .set('Cookie', repairer.cookie)
      .send(offerBody())
      .expect(201);

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', repairer.cookie)
      .expect(200);
    expect(me.body.messagingEnabled).toBe(true);

    return {
      demandeId: demande.body.id,
      clientCookie: client.cookie,
      repairerCookie: repairer.cookie,
      repairerUserId: me.body.id,
    };
  }

  async function openThread(
    pair: Awaited<ReturnType<typeof aPair>>,
    cookie: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Cookie', cookie)
      .send({ demandeId: pair.demandeId, repairerUserId: pair.repairerUserId })
      .expect(201);
    return res.body.id as string;
  }

  /** The réparateur's own newest offer id, for the withdraw-and-requote cases. */
  async function newestOfferId(cookie: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .get('/api/v1/offers/mine')
      .set('Cookie', cookie)
      .expect(200);
    return res.body[0].id as string;
  }

  /**
   * A conversation opened by the client, ready for messaging. Returns the sender
   * (client) and recipient (réparateur) ids and cookies for the notification tests.
   */
  async function aConversation(): Promise<{
    conversationId: string;
    senderCookie: string;
    senderUserId: string;
    recipientUserId: string;
    recipientCookie: string;
  }> {
    const pair = await aPair();
    const conversationId = await openThread(pair, pair.clientCookie);
    const clientMe = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', pair.clientCookie)
      .expect(200);
    return {
      conversationId,
      senderCookie: pair.clientCookie,
      senderUserId: clientMe.body.id,
      recipientUserId: pair.repairerUserId,
      recipientCookie: pair.repairerCookie,
    };
  }

  beforeAll(async () => {
    process.env.MESSAGING_ENABLED = 'true';
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const category = await prisma.category.findFirstOrThrow({ where: { slug: 'smartphone' } });
    categoryId = category.id;
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
    // Cascade removes conversations, messages, offers and demandes with the users.
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
    if (originalFlag === undefined) delete process.env.MESSAGING_ENABLED;
    else process.env.MESSAGING_ENABLED = originalFlag;
  });

  it('refuses an anonymous inbox read', async () => {
    await request(app.getHttpServer()).get('/api/v1/conversations').expect(401);
  });

  // ---- the flag, first, because OFF is what ships ----

  it('refuses the conversation-open write with the flag off, in French', async () => {
    const pair = await aPair();
    delete process.env.MESSAGING_ENABLED;
    try {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set('Cookie', pair.clientCookie)
        .send({ demandeId: pair.demandeId, repairerUserId: pair.repairerUserId })
        .expect(422);
      expect(res.body.error.message).toBe("La messagerie n'est pas encore disponible.");
    } finally {
      process.env.MESSAGING_ENABLED = 'true';
    }
  });

  it('refuses the send write with the flag off, in French', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    delete process.env.MESSAGING_ENABLED;
    try {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/conversations/${id}/messages`)
        .set('Cookie', pair.clientCookie)
        .send({ body: 'Bonjour.' })
        .expect(422);
      expect(res.body.error.message).toBe("La messagerie n'est pas encore disponible.");
    } finally {
      process.env.MESSAGING_ENABLED = 'true';
    }
  });

  it('still serves a thread READ with the flag off, since the flag gates writes', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    delete process.env.MESSAGING_ENABLED;
    try {
      await request(app.getHttpServer())
        .get(`/api/v1/conversations/${id}`)
        .set('Cookie', pair.clientCookie)
        .expect(200);
      const me = await request(app.getHttpServer())
        .get('/api/v1/users/me')
        .set('Cookie', pair.clientCookie)
        .expect(200);
      expect(me.body.messagingEnabled).toBe(false);
    } finally {
      process.env.MESSAGING_ENABLED = 'true';
    }
  });

  // ---- the offer gate ----

  it('refuses a conversation when the réparateur has never offered', async () => {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const demande = await request(app.getHttpServer())
      .post('/api/v1/demandes')
      .set('Cookie', client.cookie)
      .send(demandeBody())
      .expect(201);
    const stranger = await signUpRepairer(app);
    createdEmails.push(stranger.email);
    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', stranger.cookie)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Cookie', stranger.cookie)
      .send({ demandeId: demande.body.id, repairerUserId: me.body.id })
      .expect(422);
    expect(res.body.error.message).toBe('Envoyez une offre pour contacter ce client.');
  });

  it('keeps the channel open after the offer is withdrawn', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.repairerCookie);
    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${await newestOfferId(pair.repairerCookie)}`)
      .set('Cookie', pair.repairerCookie)
      .expect(204);

    const thread = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.repairerCookie)
      .expect(200);
    // The recap goes null because no live offer remains; the thread does not.
    expect(thread.body.offerRecap).toBeNull();
  });

  // ---- THE key property: one thread across offer revisions ----

  it('reuses ONE conversation across two offers from the same réparateur', async () => {
    const pair = await aPair();
    const first = await openThread(pair, pair.clientCookie);

    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${await newestOfferId(pair.repairerCookie)}`)
      .set('Cookie', pair.repairerCookie)
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${pair.demandeId}/offers`)
      .set('Cookie', pair.repairerCookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    const second = await openThread(pair, pair.clientCookie);
    expect(second).toBe(first);

    const count = await prisma.conversation.count({ where: { demandeId: pair.demandeId } });
    expect(count).toBe(1);
  });

  /**
   * The other half of the keying decision, and it was missing until a deliberate
   * break exposed the gap: the pair key must SEPARATE réparateurs as surely as it
   * unites an offer's revisions. Dropping `repairerUserId` from the lookup would
   * hand réparateur B the thread réparateur A is already using - a cross-party
   * leak of private messages, which the re-quote test cannot see because it only
   * ever involves one réparateur.
   */
  it('gives two réparateurs on one demande two SEPARATE conversations', async () => {
    const pair = await aPair();

    const second = await signUpRepairer(app);
    createdEmails.push(second.email);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${pair.demandeId}/offers`)
      .set('Cookie', second.cookie)
      .send(offerBody({ priceCents: 9900 }))
      .expect(201);
    const secondMe = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', second.cookie)
      .expect(200);

    const withFirst = await openThread(pair, pair.clientCookie);
    const withSecond = await request(app.getHttpServer())
      .post('/api/v1/conversations')
      .set('Cookie', pair.clientCookie)
      .send({ demandeId: pair.demandeId, repairerUserId: secondMe.body.id })
      .expect(201);

    expect(withSecond.body.id).not.toBe(withFirst);
    expect(await prisma.conversation.count({ where: { demandeId: pair.demandeId } })).toBe(2);

    // And the first réparateur must not be able to read the second's thread.
    await request(app.getHttpServer())
      .get(`/api/v1/conversations/${withSecond.body.id}`)
      .set('Cookie', pair.repairerCookie)
      .expect(404);
  });

  it('shows the re-quoted price in the recap, because it is derived', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${await newestOfferId(pair.repairerCookie)}`)
      .set('Cookie', pair.repairerCookie)
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${pair.demandeId}/offers`)
      .set('Cookie', pair.repairerCookie)
      .send(offerBody({ priceCents: 7500 }))
      .expect(201);

    const thread = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.clientCookie)
      .expect(200);
    expect(thread.body.offerRecap.priceCents).toBe(7500);
    expect(thread.body.offerRecap.object).toBe('Écran iPhone 13 fissuré');
  });

  // ---- the inbox ----

  it('hides a conversation that has no message yet', async () => {
    const pair = await aPair();
    await openThread(pair, pair.clientCookie);
    const inbox = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Cookie', pair.clientCookie)
      .expect(200);
    expect(inbox.body).toEqual([]);
  });

  it('lists it once it carries a message, with the demande title as subject', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Bonjour, vous pouvez passer quand ?' })
      .expect(201);

    const inbox = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Cookie', pair.clientCookie)
      .expect(200);
    expect(inbox.body).toHaveLength(1);
    expect(inbox.body[0].subject).toBe('Écran iPhone 13 fissuré');
    expect(inbox.body[0].preview).toBe('Bonjour, vous pouvez passer quand ?');
  });

  // ---- unread ----

  it('counts the other party messages as unread and never your own', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Bonjour.' })
      .expect(201);

    // The sender sees zero unread even though his own message is the newest.
    const senderInbox = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Cookie', pair.clientCookie)
      .expect(200);
    expect(senderInbox.body[0].unread).toBe(0);
    expect(senderInbox.body[0].userRole).toBe('CLIENT');

    const recipientInbox = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Cookie', pair.repairerCookie)
      .expect(200);
    expect(recipientInbox.body[0].unread).toBe(1);
    expect(recipientInbox.body[0].userRole).toBe('REPAIRER');
  });

  it('clears unread for the reader only, not for the other party', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.repairerCookie)
      .send({ body: 'Je peux passer demain matin.' })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/v1/conversations/${id}/read`)
      .set('Cookie', pair.clientCookie)
      .expect(204);

    const clientInbox = await request(app.getHttpServer())
      .get('/api/v1/conversations')
      .set('Cookie', pair.clientCookie)
      .expect(200);
    expect(clientInbox.body[0].unread).toBe(0);

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    expect(row.clientLastReadAt).not.toBeNull();
    expect(row.repairerLastReadAt).toBeNull();
  });

  // ---- access control ----

  it('answers 404, not 403, to a stranger reading a thread', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', stranger.cookie)
      .expect(404);
    expect(res.body.error.message).toBe('Ressource introuvable.');
  });

  it('refuses a stranger sending into a thread', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', stranger.cookie)
      .send({ body: 'Bonjour.' })
      .expect(404);
  });

  // ---- the send transaction ----

  it('stamps lastMessageAt in the same act as the insert', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    expect(
      (await prisma.conversation.findUniqueOrThrow({ where: { id } })).lastMessageAt,
    ).toBeNull();

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Bonjour.' })
      .expect(201);

    const row = await prisma.conversation.findUniqueOrThrow({ where: { id } });
    expect(row.lastMessageAt).not.toBeNull();
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(1);
  });

  it('refuses an empty message with the authored French', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: '   ' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    // The authored message lands in `fields`, keyed by the Zod issue's path, while
    // `message` is always the generic envelope - see `ZodValidationPipe`. Asserting
    // the top-level message here is what an earlier draft of this test did, and it
    // failed against correct code.
    expect(res.body.error.fields.body).toBe('Votre message est vide.');
  });

  // ---- piece 2: reporting ----

  it('records a report from either party and answers 201', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.clientCookie)
      .send({ reason: 'HARASSMENT' })
      .expect(201);
    expect(res.body).toEqual({ ok: true });

    const row = await prisma.conversationReport.findFirstOrThrow({
      where: { conversationId: id },
    });
    expect(row.reason).toBe('HARASSMENT');
    expect(row.resolvedAt).toBeNull();
    // reportedUserId is the OTHER party, derived by the server. A client reporting
    // must never be able to name himself as the reported one.
    expect(row.reportedUserId).toBe(pair.repairerUserId);
    expect(row.reporterUserId).not.toBe(pair.repairerUserId);
  });

  it('derives reportedUserId from the caller, so the réparateur reporting names the CLIENT', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.repairerCookie);

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.repairerCookie)
      .send({ reason: 'OFF_PLATFORM' })
      .expect(201);

    const row = await prisma.conversationReport.findFirstOrThrow({
      where: { conversationId: id },
    });
    expect(row.reporterUserId).toBe(pair.repairerUserId);
    expect(row.reportedUserId).not.toBe(pair.repairerUserId);
  });

  it('refuses a report from a non-participant with 404, not 403', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', stranger.cookie)
      .send({ reason: 'SPAM' })
      .expect(404);
    expect(await prisma.conversationReport.count({ where: { conversationId: id } })).toBe(0);
  });

  it('refuses an unlisted report reason with 400 and the authored French at the field path', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.clientCookie)
      .send({ reason: 'WHATEVER' })
      .expect(400);
    // ZodValidationPipe puts the authored message at error.fields.<path>, NOT at
    // error.message. Piece 1 shipped a test asserting the wrong location.
    expect(res.body.error.fields.reason).toBe('Motif invalide.');
  });

  it('refuses a SECOND unresolved report from the same reporter on the same conversation', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.clientCookie)
      .send({ reason: 'SPAM' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.clientCookie)
      .send({ reason: 'SCAM' })
      .expect(422);
    expect(res.body.error.message).toBe('Votre signalement a déjà été transmis.');
    expect(await prisma.conversationReport.count({ where: { conversationId: id } })).toBe(1);
  });

  it('lets the OTHER party report the same conversation independently', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.clientCookie)
      .send({ reason: 'SPAM' })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.repairerCookie)
      .send({ reason: 'HARASSMENT' })
      .expect(201);

    expect(await prisma.conversationReport.count({ where: { conversationId: id } })).toBe(2);
  });

  it('accepts a report with MESSAGING_ENABLED absent, because a safety valve is not the feature', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    delete process.env.MESSAGING_ENABLED;
    try {
      await request(app.getHttpServer())
        .post(`/api/v1/conversations/${id}/report`)
        .set('Cookie', pair.clientCookie)
        .send({ reason: 'SPAM' })
        .expect(201);
    } finally {
      process.env.MESSAGING_ENABLED = 'true';
    }
  });

  /**
   * Spec §8: report and block are separate and NEITHER implies the other. Reporting is
   * a request for a human; blocking is immediate and self-served. A report that
   * silently blocked would take a decision on the user's behalf.
   */
  it('a report neither creates a block nor stops the conversation', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/report`)
      .set('Cookie', pair.clientCookie)
      .send({ reason: 'HARASSMENT' })
      .expect(201);

    expect(await prisma.block.count({ where: { blockedUserId: pair.repairerUserId } })).toBe(0);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Toujours possible.' })
      .expect(201);
  });

  // ---- piece 2: blocking ----

  it('blocks a counterpart and is idempotent on a second call', async () => {
    const pair = await aPair();
    await openThread(pair, pair.clientCookie);

    const res = await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);
    expect(res.body).toEqual({ ok: true });

    // Second call answers 201 too. The unique index would raise P2002 on a naive
    // insert, and a user tapping twice must not see an error for a state he asked
    // for and already has.
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);

    expect(await prisma.block.count({ where: { blockedUserId: pair.repairerUserId } })).toBe(1);
  });

  it('refuses to block a user the caller shares no conversation with', async () => {
    const pair = await aPair();
    await openThread(pair, pair.clientCookie);
    const stranger = await signUp(app);
    createdEmails.push(stranger.email);
    const strangerId = (await prisma.user.findUniqueOrThrow({ where: { email: stranger.email } }))
      .id;

    const res = await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: strangerId })
      .expect(404);
    expect(res.body.error.message).toBe('Ressource introuvable.');
    expect(await prisma.block.count({ where: { blockedUserId: strangerId } })).toBe(0);
  });

  it('refuses to block yourself', async () => {
    const pair = await aPair();
    await openThread(pair, pair.repairerCookie);

    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.repairerCookie)
      .send({ userId: pair.repairerUserId })
      .expect(404);
  });

  it('unblocks, and answers 204 whether or not a block existed', async () => {
    const pair = await aPair();
    await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/blocks/${pair.repairerUserId}`)
      .set('Cookie', pair.clientCookie)
      .expect(204);
    expect(await prisma.block.count({ where: { blockedUserId: pair.repairerUserId } })).toBe(0);

    // Idempotent: a second delete is not an error. The client's app can retry.
    await request(app.getHttpServer())
      .delete(`/api/v1/blocks/${pair.repairerUserId}`)
      .set('Cookie', pair.clientCookie)
      .expect(204);
  });

  it('unblocks even after the shared conversation was CLOSED, so nobody is stuck with a block he cannot lift', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);
    await prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });

    // DELETE carries NO shared-conversation precondition, unlike POST. Spec §8.1a.
    await request(app.getHttpServer())
      .delete(`/api/v1/blocks/${pair.repairerUserId}`)
      .set('Cookie', pair.clientCookie)
      .expect(204);
    expect(await prisma.block.count({ where: { blockedUserId: pair.repairerUserId } })).toBe(0);
  });

  it('accepts a block with MESSAGING_ENABLED absent', async () => {
    const pair = await aPair();
    await openThread(pair, pair.clientCookie);
    delete process.env.MESSAGING_ENABLED;
    try {
      await request(app.getHttpServer())
        .post('/api/v1/blocks')
        .set('Cookie', pair.clientCookie)
        .send({ userId: pair.repairerUserId })
        .expect(201);
    } finally {
      process.env.MESSAGING_ENABLED = 'true';
    }
  });

  it('refuses an anonymous block', async () => {
    await request(app.getHttpServer()).post('/api/v1/blocks').send({ userId: 'x' }).expect(401);
  });

  /**
   * Spec §8's stated V1 limitation, pinned rather than merely written down: **a block
   * does not stop commerce.** Only the text channel closes. This is the shipped
   * behaviour, not an absence, so a future change that quietly made a block refuse an
   * offer would be a silent product change with a money consequence - an accepted
   * offer whose parties cannot communicate.
   *
   * The withdraw-then-requote sequence is not incidental: `Offer`'s unique index is
   * PARTIAL, scoped to live offers, so a second SENT offer from the same réparateur on
   * the same demande needs the first withdrawn. `keeps the channel open after the offer
   * is withdrawn` above establishes that same sequence.
   */
  it('a blocked réparateur can still withdraw and re-quote, because a block does not stop commerce', async () => {
    const pair = await aPair();
    await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/offers/${await newestOfferId(pair.repairerCookie)}`)
      .set('Cookie', pair.repairerCookie)
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/v1/demandes/${pair.demandeId}/offers`)
      .set('Cookie', pair.repairerCookie)
      .send(offerBody({ priceCents: 7900 }))
      .expect(201);
  });

  // ---- piece 2: block enforcement ----

  it('refuses a send from the BLOCKER, in French', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Bonjour.' })
      .expect(422);
    expect(res.body.error.message).toBe('Vous ne pouvez plus échanger avec cette personne.');
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
  });

  it('refuses a send from the BLOCKED party too, so the block runs both ways', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    // The CLIENT blocks; the RÉPARATEUR is the one who tries to send.
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.repairerCookie)
      .send({ body: 'Bonjour.' })
      .expect(422);
    expect(res.body.error.message).toBe('Vous ne pouvez plus échanger avec cette personne.');
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
  });

  it('sends again after an unblock', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);
    await request(app.getHttpServer())
      .delete(`/api/v1/blocks/${pair.repairerUserId}`)
      .set('Cookie', pair.clientCookie)
      .expect(204);

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Bonjour.' })
      .expect(201);
  });

  it('reports block state on the thread, asymmetrically: byMe for the blocker only', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);

    const before = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.clientCookie)
      .expect(200);
    // Never null. The composer reads one shape.
    expect(before.body.blocked).toEqual({ active: false, byMe: false });
    expect(before.body.counterpartUserId).toBe(pair.repairerUserId);

    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);

    const blocker = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.clientCookie)
      .expect(200);
    expect(blocker.body.blocked).toEqual({ active: true, byMe: true });

    const blocked = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.repairerCookie)
      .expect(200);
    // active, but NOT byMe - so his composer says nothing about who blocked whom.
    expect(blocked.body.blocked).toEqual({ active: true, byMe: false });
  });

  it('reports which side of the thread the caller is on, so a client-only link can be hidden', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);

    const asClient = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.clientCookie)
      .expect(200);
    // The client's counterpart IS the réparateur, so the thread's options sheet may
    // offer « Voir le profil ».
    expect(asClient.body.counterpartIsRepairer).toBe(true);

    const asRepairer = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.repairerCookie)
      .expect(200);
    // 🛑 The réparateur's counterpart is the CLIENT, who has no RepairerProfile, so
    // GET /repairers/:userId answers 404 for him. Without this field the sheet would
    // offer a link that fails for half its users, and `activeMode` cannot substitute:
    // this inbox applies no mode filter, so a réparateur sees threads in which he is
    // the client.
    expect(asRepairer.body.counterpartIsRepairer).toBe(false);
    // Asserted on the PAIR rather than on one boolean, so a field hardcoded to either
    // value fails: the two reads must genuinely disagree.
    expect(asClient.body.counterpartUserId).not.toBe(asRepairer.body.counterpartUserId);
  });

  it('still lets a blocked pair READ the thread, since the block closes writes', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Avant le blocage.' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/blocks')
      .set('Cookie', pair.clientCookie)
      .send({ userId: pair.repairerUserId })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.repairerCookie)
      .expect(200);
    expect(res.body.messages).toHaveLength(1);
    expect(res.body.messages[0].body).toBe('Avant le blocage.');
  });

  // ---- piece 2: closure. The FIRST tests of getOrCreate's P2002 soft-delete branch,
  // which has been unreachable since piece 1 wrote it because nothing wrote deletedAt.

  it('hides a CLOSED conversation from both inboxes and 404s the thread', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Avant la fermeture.' })
      .expect(201);
    await prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });

    for (const cookie of [pair.clientCookie, pair.repairerCookie]) {
      const inbox = await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Cookie', cookie)
        .expect(200);
      expect(inbox.body.find((c: { id: string }) => c.id === id)).toBeUndefined();

      await request(app.getHttpServer())
        .get(`/api/v1/conversations/${id}`)
        .set('Cookie', cookie)
        .expect(404);
    }
  });

  /**
   * The owner's ruling from piece 1, now reachable and therefore now testable: a
   * soft-deleted conversation is NOT revived by the next « Contacter » tap. An
   * operator closed that channel and reopening it here would undo the moderation
   * decision. Only `PATCH /admin/conversations/:id/reopen` reopens it (spec §8.1).
   *
   * This exercises the P2002 branch specifically: `getOrCreate`'s `existing` lookup
   * filters `deletedAt: null` and the unique index does NOT, so the insert fails and
   * the catch is what produces this message. Without that branch the pair could never
   * message again with no authored message to explain why.
   */
  it('refuses to revive a closed conversation, from EITHER party', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });

    for (const cookie of [pair.clientCookie, pair.repairerCookie]) {
      const res = await request(app.getHttpServer())
        .post('/api/v1/conversations')
        .set('Cookie', cookie)
        .send({ demandeId: pair.demandeId, repairerUserId: pair.repairerUserId })
        .expect(422);
      expect(res.body.error.message).toBe('Cette conversation a été fermée.');
    }

    // And NO second row was created for the pair, which is the defect the branch
    // exists to prevent: the unique index is not partial, so a revive attempt that
    // inserted would have violated it, and one that succeeded would mean the index
    // was gone.
    expect(
      await prisma.conversation.count({
        where: { demandeId: pair.demandeId, repairerUserId: pair.repairerUserId },
      }),
    ).toBe(1);
  });

  it('refuses a SEND into a closed conversation, via the participant check', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });

    const res = await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Après la fermeture.' })
      .expect(404);
    expect(res.body.error.message).toBe('Ressource introuvable.');
    expect(await prisma.message.count({ where: { conversationId: id } })).toBe(0);
  });

  it('restores both inboxes when deletedAt is cleared, which is what reopen does', async () => {
    const pair = await aPair();
    const id = await openThread(pair, pair.clientCookie);
    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Cookie', pair.clientCookie)
      .send({ body: 'Toujours là.' })
      .expect(201);
    await prisma.conversation.update({ where: { id }, data: { deletedAt: new Date() } });
    await prisma.conversation.update({ where: { id }, data: { deletedAt: null } });

    for (const cookie of [pair.clientCookie, pair.repairerCookie]) {
      const inbox = await request(app.getHttpServer())
        .get('/api/v1/conversations')
        .set('Cookie', cookie)
        .expect(200);
      expect(inbox.body.find((c: { id: string }) => c.id === id)).toBeDefined();
    }
    // The messages survived the round trip, which is what makes it a SOFT delete.
    const thread = await request(app.getHttpServer())
      .get(`/api/v1/conversations/${id}`)
      .set('Cookie', pair.clientCookie)
      .expect(200);
    expect(thread.body.messages).toHaveLength(1);
  });

  // ---- notifications ----

  it('notifies the counterpart, and COLLAPSES a second message into one row', async () => {
    const { conversationId, senderCookie, recipientUserId } = await aConversation();

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', senderCookie)
      .send({ body: 'Bonjour, je peux passer demain.' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', senderCookie)
      .send({ body: 'Ou après-demain si vous préférez.' })
      .expect(201);

    const rows = await prisma.notification.findMany({
      where: { userId: recipientUserId, type: 'MESSAGE_RECEIVED', conversationId },
    });

    // ONE row, not two: the partial unique index makes that a database rule and the
    // service folds the newer message into the row already there.
    expect(rows).toHaveLength(1);

    const newest = await prisma.message.findFirstOrThrow({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
    });
    expect(rows[0]!.messageId).toBe(newest.id);
    expect(rows[0]!.readAt).toBeNull();
  });

  it('does not notify the SENDER about his own message', async () => {
    const { conversationId, senderCookie, senderUserId } = await aConversation();

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', senderCookie)
      .send({ body: 'Bonjour.' })
      .expect(201);

    expect(
      await prisma.notification.count({ where: { userId: senderUserId, type: 'MESSAGE_RECEIVED' } }),
    ).toBe(0);
  });

  /**
   * FIX 7: Opening a thread must clear its MESSAGE_RECEIVED notification, otherwise
   * the notification blocks all future ones for that thread (the partial unique index
   * permits only one unread MESSAGE_RECEIVED per conversation).
   */
  it('clears the MESSAGE_RECEIVED notification when the recipient marks the conversation read', async () => {
    const { conversationId, senderCookie, recipientUserId, recipientCookie } =
      await aConversation();

    await request(app.getHttpServer())
      .post(`/api/v1/conversations/${conversationId}/messages`)
      .set('Cookie', senderCookie)
      .send({ body: 'Bonjour.' })
      .expect(201);

    // The recipient has one unread notification.
    const before = await prisma.notification.findMany({
      where: { userId: recipientUserId, type: 'MESSAGE_RECEIVED', conversationId },
    });
    expect(before).toHaveLength(1);
    expect(before[0]!.readAt).toBeNull();

    await request(app.getHttpServer())
      .patch(`/api/v1/conversations/${conversationId}/read`)
      .set('Cookie', recipientCookie)
      .expect(204);

    // The notification is now marked read.
    const after = await prisma.notification.findMany({
      where: { userId: recipientUserId, type: 'MESSAGE_RECEIVED', conversationId },
    });
    expect(after).toHaveLength(1);
    expect(after[0]!.readAt).not.toBeNull();
  });
});
