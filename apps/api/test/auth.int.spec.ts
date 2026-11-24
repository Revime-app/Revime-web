import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

describe('auth', () => {
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

  it('creates exactly one Profile for a new user', async () => {
    const { email } = await signUp(app);
    createdEmails.push(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const profiles = await prisma.profile.findMany({ where: { userId: user.id } });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      clientEnabled: true,
      repairerEnabled: false,
      activeMode: 'CLIENT',
      deletedAt: null,
    });
  });

  it('maintains Profile invariant on retry (upsert prevents duplicate profiles)', async () => {
    const { email } = await signUp(app);
    createdEmails.push(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    // Simulate a retry by manually triggering the profile upsert again
    await prisma.profile.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        clientEnabled: true,
        repairerEnabled: false,
        activeMode: 'CLIENT',
      },
      update: {},
    });

    const profiles = await prisma.profile.findMany({ where: { userId: user.id } });
    expect(profiles).toHaveLength(1);
  });

  it('rejects a protected route without a session', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/users/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('accepts the session cookie it just issued', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const res = await request(app.getHttpServer()).get('/api/v1/users/me').set('Cookie', cookie);
    expect(res.status).toBe(200);
  });
});
