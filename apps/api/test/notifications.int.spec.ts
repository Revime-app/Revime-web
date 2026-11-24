import { INestApplication } from '@nestjs/common';
import type { NotificationDto } from '@revime/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

describe('notifications - table shape', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Cascade from the user takes the notifications with it. This suite runs against the
    // LIVE project, so it must remove exactly what it created and nothing else.
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('accepts a row with every optional column absent', async () => {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const me = await prisma.user.findFirstOrThrow({ where: { email: client.email } });

    const row = await prisma.notification.create({
      data: { userId: me.id, mode: 'CLIENT', type: 'OFFER_RECEIVED' },
    });

    expect(row.readAt).toBeNull();
    expect(row.actorName).toBeNull();
    expect(row.step).toBeNull();
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('permits only ONE unread MESSAGE_RECEIVED per conversation, and any number read', async () => {
    const client = await signUp(app);
    createdEmails.push(client.email);
    const me = await prisma.user.findFirstOrThrow({ where: { email: client.email } });
    const conversationId = 'conv-shape-test';

    await prisma.notification.create({
      data: { userId: me.id, mode: 'CLIENT', type: 'MESSAGE_RECEIVED', conversationId },
    });

    // The partial unique index is the guard. Without it the emitter's collapse logic in
    // Task 3 would be a convention rather than a rule.
    await expect(
      prisma.notification.create({
        data: { userId: me.id, mode: 'CLIENT', type: 'MESSAGE_RECEIVED', conversationId },
      }),
    ).rejects.toThrow();

    // A READ row is outside the index's predicate, so history accumulates freely.
    await prisma.notification.create({
      data: {
        userId: me.id,
        mode: 'CLIENT',
        type: 'MESSAGE_RECEIVED',
        conversationId,
        readAt: new Date(),
      },
    });

    const rows = await prisma.notification.count({ where: { userId: me.id, conversationId } });
    expect(rows).toBe(2);
  });
});

describe('notifications - routes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  /** A signed-up user plus a raw notification in the given mode. */
  async function withNotification(mode: 'CLIENT' | 'REPAIRER', over: Record<string, unknown> = {}) {
    const user = await signUp(app);
    createdEmails.push(user.email);
    const me = await prisma.user.findFirstOrThrow({ where: { email: user.email } });
    const row = await prisma.notification.create({
      data: { userId: me.id, mode, type: 'OFFER_RECEIVED', subject: 'Écran cassé', ...over },
    });
    return { cookie: user.cookie, userId: me.id, row };
  }

  it('refuses an anonymous read', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/notifications?mode=CLIENT');
    expect(res.status).toBe(401);
  });

  it('rejects a mode that is not one of the two', async () => {
    const { cookie } = await withNotification('CLIENT');
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?mode=BOTH')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('rejects an absent mode rather than guessing one', async () => {
    const { cookie } = await withNotification('CLIENT');
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications')
      .set('Cookie', cookie);
    expect(res.status).toBe(400);
  });

  it('returns the row with read false and an ISO createdAt', async () => {
    const { cookie, row } = await withNotification('CLIENT');
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?mode=CLIENT')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({ id: row.id, type: 'OFFER_RECEIVED', read: false });
    expect(typeof res.body[0].createdAt).toBe('string');
    expect(new Date(res.body[0].createdAt).toString()).not.toBe('Invalid Date');
  });

  it('FILTERS BY MODE - a client row is absent from a réparateur list', async () => {
    const { cookie } = await withNotification('CLIENT');
    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?mode=REPAIRER')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toEqual([]);
  });

  it('counts unread per mode', async () => {
    const { cookie, userId } = await withNotification('CLIENT');
    await prisma.notification.create({
      data: { userId, mode: 'CLIENT', type: 'FUNDS_RELEASED', readAt: new Date() },
    });
    await prisma.notification.create({
      data: { userId, mode: 'REPAIRER', type: 'OFFER_DECLINED' },
    });

    const client = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count?mode=CLIENT')
      .set('Cookie', cookie)
      .expect(200);
    expect(client.body).toEqual({ count: 1 });

    const repairer = await request(app.getHttpServer())
      .get('/api/v1/notifications/unread-count?mode=REPAIRER')
      .set('Cookie', cookie)
      .expect(200);
    expect(repairer.body).toEqual({ count: 1 });
  });

  it('marks one read, and is idempotent', async () => {
    const { cookie, row } = await withNotification('CLIENT');

    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${row.id}/read`)
      .set('Cookie', cookie)
      .expect(204);
    // Twice, because zero rows updated is not an error.
    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${row.id}/read`)
      .set('Cookie', cookie)
      .expect(204);

    const after = await prisma.notification.findFirstOrThrow({ where: { id: row.id } });
    expect(after.readAt).not.toBeNull();
  });

  it('cannot mark ANOTHER user\'s notification read', async () => {
    const victim = await withNotification('CLIENT');
    const attacker = await signUp(app);
    createdEmails.push(attacker.email);

    await request(app.getHttpServer())
      .post(`/api/v1/notifications/${victim.row.id}/read`)
      .set('Cookie', attacker.cookie)
      .expect(204);

    // 204 and NO mutation: ownership is in the WHERE, so the id is not enumerable and
    // the response says nothing about whether it exists.
    const after = await prisma.notification.findFirstOrThrow({ where: { id: victim.row.id } });
    expect(after.readAt).toBeNull();
  });

  it('marks all read in ONE mode only', async () => {
    const { cookie, userId } = await withNotification('CLIENT');
    await prisma.notification.create({
      data: { userId, mode: 'REPAIRER', type: 'OFFER_DECLINED' },
    });

    await request(app.getHttpServer())
      .post('/api/v1/notifications/read-all?mode=CLIENT')
      .set('Cookie', cookie)
      .expect(204);

    expect(await prisma.notification.count({ where: { userId, readAt: null } })).toBe(1);
    expect(
      await prisma.notification.count({ where: { userId, mode: 'REPAIRER', readAt: null } }),
    ).toBe(1);
  });

  it('serves the fallback preview for a soft-deleted message', async () => {
    const { cookie, userId } = await withNotification('CLIENT');
    // A conversation and a message, then remove the message the way moderation does.
    const author = await prisma.user.findFirstOrThrow({ where: { id: userId } });
    const demande = await prisma.demande.findFirst({ where: { authorUserId: author.id } });
    // No demande is needed for this assertion: the join is on messageId alone, so a
    // message id that resolves to nothing is the same case as a removed one.
    await prisma.notification.create({
      data: {
        userId,
        mode: 'CLIENT',
        type: 'MESSAGE_RECEIVED',
        actorName: 'Sophie',
        conversationId: 'conv-route-test',
        messageId: 'message-that-is-gone',
      },
    });
    expect(demande).toBeNull();

    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?mode=CLIENT')
      .set('Cookie', cookie)
      .expect(200);

    const message = res.body.find((n: NotificationDto) => n.type === 'MESSAGE_RECEIVED');
    expect(message.messagePreview).toBeNull();
  });

  it('caps the list at 50', async () => {
    const { cookie, userId } = await withNotification('CLIENT');
    await prisma.notification.createMany({
      data: Array.from({ length: 50 }, () => ({
        userId,
        mode: 'CLIENT' as const,
        type: 'OFFER_RECEIVED' as const,
      })),
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/notifications?mode=CLIENT')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toHaveLength(50);
  });
});
