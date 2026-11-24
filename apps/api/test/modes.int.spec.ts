import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

describe('modes', () => {
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

  it('returns the default client profile', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body).toMatchObject({
      firstName: 'Test',
      lastName: 'Utilisateur',
    });
    expect(res.body.phone).toMatch(/^\+33[67]\d{8}$/);
    expect(res.body.profile.verificationLevel).toBe('NONE');
    expect(res.body.profile).toMatchObject({
      clientEnabled: true,
      repairerEnabled: false,
      activeMode: 'CLIENT',
    });
    expect(res.body.repairer).toBeNull();
  });

  it('creates the RepairerProfile when repairer mode is enabled, idempotently', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const patch = () =>
      request(app.getHttpServer())
        .patch('/api/v1/users/me/modes')
        .set('Cookie', cookie)
        .send({ repairerEnabled: true });

    await patch().expect(200);
    const second = await patch().expect(200);

    expect(second.body.repairer).toMatchObject({
      kind: 'INDIVIDUAL',
      displayName: 'Test Utilisateur',
      // A réparateur is unlocated until they save a postal code. These being
      // present-and-null is what lets the app tell "not set" from "not loaded".
      postalCode: null,
      serviceAreaLabel: null,
    });
    expect(second.body.repairer).not.toHaveProperty('verificationLevel');
    expect(second.body.profile.verificationLevel).toBe('NONE');

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const rows = await prisma.repairerProfile.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
  });

  it('refuses REPAIRER as active mode when repairer mode is disabled', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ activeMode: 'REPAIRER' });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toContain('réparateur');
  });

  it('refuses disabling both modes', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ clientEnabled: false, repairerEnabled: false });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Au moins un mode doit rester activé.');
  });

  it('rejects an unknown field with a French field error', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const res = await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ activeMode: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields).toHaveProperty('activeMode');
  });

  it('never surfaces a soft-deleted repairer profile', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ repairerEnabled: true })
      .expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.repairerProfile.update({
      where: { userId: user.id },
      data: { deletedAt: new Date() },
    });

    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(res.body.repairer).toBeNull();
  });

  it('restores a soft-deleted RepairerProfile when repairer mode is re-enabled', async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);

    // Enable repairer mode
    await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ repairerEnabled: true })
      .expect(200);

    // Soft-delete the profile
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    await prisma.repairerProfile.update({
      where: { userId: user.id },
      data: { deletedAt: new Date() },
    });

    // Verify it's hidden
    const beforeRestore = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(beforeRestore.body.repairer).toBeNull();

    // Re-enable repairer mode
    const afterRestore = await request(app.getHttpServer())
      .patch('/api/v1/users/me/modes')
      .set('Cookie', cookie)
      .send({ repairerEnabled: true })
      .expect(200);

    // Verify the profile is restored
    expect(afterRestore.body.repairer).toMatchObject({
      kind: 'INDIVIDUAL',
      displayName: 'Test Utilisateur',
    });
    expect(afterRestore.body.repairer).not.toHaveProperty('verificationLevel');
    expect(afterRestore.body.profile.verificationLevel).toBe('NONE');

    // Verify there is still exactly one row
    const rows = await prisma.repairerProfile.findMany({ where: { userId: user.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.deletedAt).toBeNull();
  });
});
