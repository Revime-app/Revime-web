import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, signUpRepairer } from './helpers.js';

describe('réparateur location', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const patch = (cookie: string, body: { postalCode: string }) =>
    request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
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

  it('is null before any save, so the app can tell unset from unloaded', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);

    expect(res.body.repairer.postalCode).toBeNull();
    expect(res.body.repairer.serviceAreaLabel).toBeNull();
  });

  it('writes the code, the coordinates and the municipality, and returns MeResponse', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await patch(cookie, { postalCode: '69003' }).expect(200);

    expect(res.body.repairer.postalCode).toBe('69003');
    // BAN returns the arrondissement for 69003, not "Lyon". Assert the prefix
    // rather than the exact string, so a BAN wording change cannot break this.
    expect(res.body.repairer.serviceAreaLabel).toContain('Lyon');

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    // Loose bounds around central Lyon: tight enough that null or a wrong
    // country fails, loose enough to survive a centroid nudge.
    expect(row.lat).toBeGreaterThan(45);
    expect(row.lat).toBeLessThan(46.5);
    expect(row.lng).toBeGreaterThan(4);
    expect(row.lng).toBeLessThan(5.5);
  });

  it('saves an ungeocodable code with null coordinates rather than failing', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await patch(cookie, { postalCode: '99999' }).expect(200);

    expect(res.body.repairer.postalCode).toBe('99999');
    expect(res.body.repairer.serviceAreaLabel).toBeNull();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const row = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.lat).toBeNull();
    expect(row.lng).toBeNull();
  });

  it('overwrites all four fields on a move, leaving no stale coordinates', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    await patch(cookie, { postalCode: '69003' }).expect(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const lyon = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(lyon.lat).not.toBeNull();

    // Moving to a code BAN cannot resolve must null the old coordinates. Keeping
    // them would make the feed sort confidently on a lie, and every UI shows
    // only postalCode, so it would be invisible.
    await patch(cookie, { postalCode: '99999' }).expect(200);
    const after = await prisma.repairerProfile.findUniqueOrThrow({ where: { userId: user.id } });

    expect(after.postalCode).toBe('99999');
    expect(after.lat).toBeNull();
    expect(after.lng).toBeNull();
    expect(after.serviceAreaLabel).toBeNull();
  });

  it('rejects a malformed postal code with a French field error and 400', async () => {
    const { email, cookie } = await signUpRepairer(app);
    createdEmails.push(email);

    const res = await patch(cookie, { postalCode: '6900' });

    // 400, not 422: app-exception.ts maps VALIDATION_FAILED to 400.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.postalCode).toBe('Code postal invalide.');
  });

  it('refuses a user who has not enabled réparateur mode', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    const res = await patch(cookie, { postalCode: '69003' });

    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe('Activez le mode réparateur.');
  });

  it('rejects an anonymous caller', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/repairer')
      .send({ postalCode: '69003' });
    expect(res.status).toBe(401);
  });
});
