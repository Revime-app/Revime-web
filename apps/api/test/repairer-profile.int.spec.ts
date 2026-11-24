import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('réparateur public profile authoring', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const patch = (cookie: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer-profile')
      .set('Cookie', cookie)
      .send(body);

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('reports bio as null before any save, so the app can tell unset from unloaded', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.repairer.bio).toBeNull();
  });

  it('writes both fields and returns them on MeResponse', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await patch(cookie, {
      displayName: "L'Atelier du Coin",
      bio: 'Je répare smartphones et tablettes depuis dix ans.',
    }).expect(200);

    // The route returns MeResponse, so the body must contain what it just wrote.
    // Before this task MeResponse.repairer had no bio at all and this assertion
    // could not have passed.
    expect(res.body.repairer.displayName).toBe("L'Atelier du Coin");
    expect(res.body.repairer.bio).toBe('Je répare smartphones et tablettes depuis dix ans.');
  });

  it('writes only the field it was given, leaving the other alone', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    await patch(cookie, { bio: 'Première version.' }).expect(200);
    const res = await patch(cookie, { displayName: 'Atelier Renommé' }).expect(200);

    // A partial PATCH must not null the bio. This is the semantic that made a new
    // route necessary rather than widening PATCH me/repairer, which writes all four
    // of its geography fields on every call by design.
    expect(res.body.repairer.displayName).toBe('Atelier Renommé');
    expect(res.body.repairer.bio).toBe('Première version.');
  });

  it('normalises a whitespace-only bio to NULL, not to an empty string', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await patch(cookie, { bio: '     ' }).expect(200);

    // « No bio » has exactly one representation in the column. Same reasoning as
    // Review.comment, and it is why the service normalises rather than the schema.
    expect(res.body.repairer.bio).toBeNull();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.bio).toBeNull();
  });

  it('accepts an empty body as a no-op rather than refusing it', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    await patch(cookie, { bio: 'Conservée.' }).expect(200);
    const res = await patch(cookie, {}).expect(200);
    expect(res.body.repairer.bio).toBe('Conservée.');
  });

  it('rejects a too-short displayName with 400 and a field error', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await patch(cookie, { displayName: 'A' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.displayName).toBe('Nom trop court.');
  });

  it('rejects a bio over 600 characters', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await patch(cookie, { bio: 'a'.repeat(601) });
    expect(res.status).toBe(400);
    expect(res.body.error.fields.bio).toBe('Description trop longue.');
  });

  it('IGNORES a kind sent in the body rather than writing it', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    await patch(cookie, { displayName: 'Atelier Pro', kind: 'PRO' }).expect(200);

    // Zod strips it, so it never reaches Prisma. Design 4.4: a self-declared
    // « Professionnel » must not exist on any surface a client reads.
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.kind).toBe('INDIVIDUAL');
  });

  it('IGNORES a postalCode sent in the body, leaving geography to its own writer', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    await patch(cookie, { bio: 'Test', postalCode: '75001' }).expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.postalCode).toBeNull();
  });

  it('refuses a user who has not enabled réparateur mode', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await patch(cookie, { bio: 'Test' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Activez le mode réparateur.');
  });

  it('rejects an anonymous caller', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer-profile')
      .send({ bio: 'Test' });
    expect(res.status).toBe(401);
  });

  it('surfaces a saved bio on the PUBLIC profile read', async () => {
    const author = await signUpRepairer(app);
    createdEmails.push(author.email);
    const viewer = await signUpRepairer(app);
    createdEmails.push(viewer.email);

    await patch(author.cookie, { bio: 'Spécialiste écrans.' }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: author.email } });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/repairers/${user.id}`)
      .set('Cookie', viewer.cookie)
      .expect(200);

    // The end-to-end point of this task: without it, « À propos » is structurally
    // empty for everyone forever.
    expect(res.body.bio).toBe('Spécialiste écrans.');
  });
});
