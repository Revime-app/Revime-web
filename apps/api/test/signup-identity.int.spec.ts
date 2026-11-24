import { CURRENT_CGU_VERSION } from '@revime/shared';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, uniqueEmail, uniquePhone } from './helpers.js';

describe('signup identity fields', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // A user with a ConsentProof cannot be deleted: the FK is RESTRICT and the table's trigger
    // forbids deleting the proof, by design (CF6-18). The CGU case below therefore leaves its
    // (uniquely named, throwaway) account behind; everything else is cleaned up as before.
    await prisma.user.deleteMany({
      where: { email: { in: createdEmails }, consentProofs: { none: {} } },
    });
    await app.close();
  });

  it('persists prénom, nom and a normalised phone, and composes the display name', async () => {
    const { email } = await signUp(app);
    createdEmails.push(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.firstName).toBe('Test');
    expect(user.lastName).toBe('Utilisateur');
    expect(user.name).toBe('Test Utilisateur');
    expect(user.phone).toMatch(/^\+33[67]\d{8}$/);
    expect(user.phoneVerifiedAt).toBeNull();
  });

  it('creates the Profile at NONE, never BASIC', async () => {
    // BASIC means email OR phone verified since `CF-D1` (2026-09-04). A signup has verified
    // NEITHER, so this assertion is unaffected by that change - but the reason is now "no
    // contact is verified yet", not "only one of the two is". Awarding BASIC here would be a
    // lie told by the account-creation path either way.
    const { email } = await signUp(app);
    createdEmails.push(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.verificationLevel).toBe('NONE');
    expect(profile.verifiedAt).toBeNull();
  });

  it('normalises the phone server-side, so two formats of one number collide', async () => {
    const phone = uniquePhone();
    const local = `0${phone.slice(3)}`; // +33612345678 -> 0612345678
    const first = uniqueEmail();
    const second = uniqueEmail();

    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email: first, password: 'Motdepasse123', name: 'A B', firstName: 'A', lastName: 'B', phone })
      .expect(200);
    createdEmails.push(first);

    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email: second, password: 'Motdepasse123', name: 'C D', firstName: 'C', lastName: 'D', phone: local });

    expect(res.status).toBeGreaterThanOrEqual(400);
    // The account must not exist: a rejected phone leaves no half-made user.
    const leaked = await prisma.user.findFirst({ where: { email: second } });
    expect(leaked).toBeNull();
  });

  it('rejects a duplicate phone with a French message and creates no user', async () => {
    const phone = uniquePhone();
    const first = uniqueEmail();
    const second = uniqueEmail();

    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email: first, password: 'Motdepasse123', name: 'A B', firstName: 'A', lastName: 'B', phone })
      .expect(200);
    createdEmails.push(first);

    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email: second, password: 'Motdepasse123', name: 'C D', firstName: 'C', lastName: 'D', phone });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).toContain('PHONE_ALREADY_EXISTS');

    const leaked = await prisma.user.findFirst({ where: { email: second } });
    expect(leaked).toBeNull();
  });

  it('still accepts a signup with no identity fields, which keeps social signup possible', async () => {
    // Google is disabled in every build today, so this guards a future rather
    // than a present: it pins required: false so that enabling Google stays a
    // flag flip instead of becoming a schema migration.
    const email = uniqueEmail();
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password: 'Motdepasse123', name: 'Sans Identite' })
      .expect(200);
    createdEmails.push(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.firstName).toBeNull();
    expect(user.phone).toBeNull();
  });

  it('treats empty-string phone as absent and stores null, not the empty string', async () => {
    // Without this guard, the first signup with phone: '' stores '' in the
    // UNIQUE column, and the second gets a P2002 that surfaces unmapped.
    const email = uniqueEmail();
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password: 'Motdepasse123', name: 'Sans Tel', phone: '' })
      .expect(200);
    createdEmails.push(email);

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.phone).toBeNull();
  });

  it('refuses to let a client assert its own phone verification', async () => {
    // phoneVerifiedAt is input: false. Better Auth rejects the field at
    // validation time rather than silently ignoring it, so a body that includes
    // it fails the request. The guard works either way: the field cannot be set.
    const email = uniqueEmail();
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({
        email, password: 'Motdepasse123', name: 'E F', firstName: 'E', lastName: 'F',
        phone: uniquePhone(), phoneVerifiedAt: new Date().toISOString(),
      });

    // If Better Auth rejects it (400), no user was created - which is fine.
    // If it accepts but ignores the field (200), the field must be null.
    if (res.status === 200) {
      createdEmails.push(email);
      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.phoneVerifiedAt).toBeNull();
    } else {
      expect(res.status).toBe(400);
      const leaked = await prisma.user.findFirst({ where: { email } });
      expect(leaked).toBeNull();
    }
  });

  // POST /api/auth/update-user is a second, live door onto user.phone. Its body
  // is an open record and `phone` is an additionalField with no validator, so
  // before the update hook existed any authenticated session could write the
  // column raw and defeat the canonical form §5.1 exists to guarantee. Each of
  // these asserts the stored column, not just the status: a 400 that still wrote
  // the row would pass a status-only test.
  describe('the update-user path, guarded by the same hook as create', () => {
    it('rejects an invalid phone and leaves the stored column untouched', async () => {
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });

      const res = await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Cookie', cookie)
        .send({ phone: 'bonjour' });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.body)).toContain('INVALID_PHONE');

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.phone).toBe(before.phone);
    });

    it('normalises a local format to E.164, exactly as create does', async () => {
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);
      const next = uniquePhone();
      const local = `0${next.slice(3)}`; // +33612345678 -> 0612345678

      await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Cookie', cookie)
        .send({ phone: local })
        .expect(200);

      // The whole point: 0612345678 must not come to rest alongside
      // +33612345678 in a UNIQUE column.
      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.phone).toBe(next);
    });

    it('rejects a phone another account holds, with a code rather than a 500', async () => {
      const owner = await signUp(app);
      createdEmails.push(owner.email);
      const ownerRow = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });

      const other = await signUp(app);
      createdEmails.push(other.email);
      const otherBefore = await prisma.user.findUniqueOrThrow({ where: { email: other.email } });

      const res = await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Cookie', other.cookie)
        .send({ phone: ownerRow.phone });

      // An unmapped Prisma P2002 would be a 500 here, which is precisely what
      // §5.2 exists to prevent: authErrorMessageFr resolves codes, never messages.
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect(JSON.stringify(res.body)).toContain('PHONE_ALREADY_EXISTS');

      const otherAfter = await prisma.user.findUniqueOrThrow({ where: { email: other.email } });
      expect(otherAfter.phone).toBe(otherBefore.phone);
      // And the rightful owner still holds it.
      const ownerAfter = await prisma.user.findUniqueOrThrow({ where: { email: owner.email } });
      expect(ownerAfter.phone).toBe(ownerRow.phone);
    });

    it('does not clobber the stored phone on a name-only update', async () => {
      // The regression this pins: the update hook receives ONLY the changed
      // fields, so a hook that copied create's `{ ...user, phone: undefined }`
      // shape would inject a phone write into a request that never mentioned the
      // phone. The hook also fires for email verification, role changes and bans,
      // so every one of those would carry it too.
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(before.phone).toMatch(/^\+33[67]\d{8}$/);

      await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Cookie', cookie)
        .send({ name: 'Renomme Utilisateur' })
        .expect(200);

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.name).toBe('Renomme Utilisateur');
      expect(after.phone).toBe(before.phone);
    });

    it('lets a user re-save the number it already holds, rather than conflicting with itself', async () => {
      // The duplicate check excludes the caller via the session on the hook
      // context. Without that exclusion the owner's own row answers the lookup
      // and a no-op save returns PHONE_ALREADY_EXISTS.
      const { email, cookie } = await signUp(app);
      createdEmails.push(email);
      const before = await prisma.user.findUniqueOrThrow({ where: { email } });
      if (before.phone === null) throw new Error('signUp must store a phone for this test to mean anything');
      const local = `0${before.phone.slice(3)}`;

      await request(app.getHttpServer())
        .post('/api/auth/update-user')
        .set('Cookie', cookie)
        .send({ phone: local })
        .expect(200);

      const after = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(after.phone).toBe(before.phone);
    });

    it('stamps cguAcceptedAt and cguVersion when cguAccepted is true', async () => {
      const email = uniqueEmail();
      await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .send({
          email,
          password: 'Motdepasse123',
          name: 'CGU User',
          cguAccepted: true,
          marketingConsent: true,
        })
        .expect(200);
      createdEmails.push(email);

      const user = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.cguAcceptedAt).toBeInstanceOf(Date);
      expect(user.cguVersion).toBe(CURRENT_CGU_VERSION);
      expect(user.marketingConsentAt).toBeInstanceOf(Date);
      expect(user.marketingConsentEmail).toBe(true);
      expect(user.marketingConsentSms).toBe(true);
    });

    it('refuses signup when cguAccepted is explicitly false with CGU_REQUIRED', async () => {
      const email = uniqueEmail();
      const res = await request(app.getHttpServer())
        .post('/api/auth/sign-up/email')
        .send({
          email,
          password: 'Motdepasse123',
          name: 'Refused CGU',
          cguAccepted: false,
        });

      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(JSON.stringify(res.body)).toContain('CGU_REQUIRED');

      const leaked = await prisma.user.findFirst({ where: { email } });
      expect(leaked).toBeNull();
    });
  });
});
