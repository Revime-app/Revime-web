import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { __setMailSender } from '../src/mail/mail.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, uniquePhone } from './helpers.js';

describe('email verification via OTP', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const sendOtp = (email: string) =>
    request(app.getHttpServer())
      .post('/api/auth/email-otp/send-verification-otp')
      .send({ email, type: 'email-verification' });

  const verifyEmail = (email: string, otp: string) =>
    request(app.getHttpServer()).post('/api/auth/email-otp/verify-email').send({ email, otp });

  const startPhone = (cookie: string, phone: string) =>
    request(app.getHttpServer())
      .post('/api/v1/verification/phone/start')
      .set('Cookie', cookie)
      .send({ phone });

  const checkPhone = (cookie: string, phone: string, code: string) =>
    request(app.getHttpServer())
      .post('/api/v1/verification/phone/check')
      .set('Cookie', cookie)
      .send({ phone, code });

  /**
   * Captures the plaintext OTP from the one callback that legitimately receives it.
   *
   * NOT read from the `verification` table: storeOTP is 'hashed', so retrieveOTP
   * returns null by design. A test able to recover the code from the database
   * would be proving the database still held it, which is the property this
   * design exists to have.
   */
  let lastOtp: string | undefined;
  const readOtp = (): string => {
    if (!lastOtp) throw new Error('No OTP captured. Did sendVerificationOTP run?');
    return lastOtp;
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    __setMailSender({
      async send(mail) {
        lastOtp = /\b(\d{6})\b/.exec(mail.text)?.[1];
      },
    });
  });

  afterAll(async () => {
    // Restore the factory's own selection, so a later file in the run is not left
    // with this file's capturing sender.
    __setMailSender(undefined);
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  const newUser = async () => {
    lastOtp = undefined;
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, email, cookie };
  };

  it('never stores a recoverable code, so the database cannot leak one', async () => {
    const { email } = await newUser();
    await sendOtp(email).expect(200);

    const row = await prisma.verification.findFirstOrThrow({
      // Better Auth's identifier is `${type}-otp-${email}`, read from
      // better-auth/dist/plugins/email-otp/utils.mjs.
      where: { identifier: { contains: email } },
      orderBy: { createdAt: 'desc' },
    });

    // The stored half is the hash, and the value is `<stored>:<attempts>` split at
    // the LAST colon. The captured plaintext must NOT appear in it.
    const stored = row.value.slice(0, row.value.lastIndexOf(':'));
    expect(stored).not.toBe(readOtp());
    expect(stored.length).toBeGreaterThan(6);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('writes an EMAIL SENT row, so the ledger is not secretly an SMS log', async () => {
    const { id, email } = await newUser();

    await sendOtp(email).expect(200);

    const rows = await prisma.verificationAttempt.findMany({
      where: { userId: id, channel: 'EMAIL' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('SENT');
    expect(rows[0]?.target).toBe(email);
  });

  it('sets emailVerified on the right code, and records APPROVED', async () => {
    const { id, email } = await newUser();
    await sendOtp(email).expect(200);

    await verifyEmail(email, readOtp()).expect(200);

    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.emailVerified).toBe(true);
    const approved = await prisma.verificationAttempt.findMany({
      where: { userId: id, channel: 'EMAIL', outcome: 'APPROVED' },
    });
    expect(approved).toHaveLength(1);
  });

  /**
   * 🛑 `CF-D1`, 2026-09-04: BASIC is e-mail OR phone. This test used to be « stays at NONE after
   * the email alone, because BASIC needs both halves », and the two below asserted NONE after
   * the first half. The client wrote « téléphone ou adresse e-mail »; the owner settled OR
   * because `+33` SMS delivery is unproven. Excluded from `test:unit`, so NOT run for this
   * change - edited by reading. `promote-basic.spec.ts` is the gate-run cover.
   */
  it('reaches BASIC after the email alone', async () => {
    const { id, email } = await newUser();
    await sendOtp(email).expect(200);
    await verifyEmail(email, readOtp()).expect(200);

    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile.verificationLevel).toBe('BASIC');
  });

  it('reaches BASIC at the phone, and the e-mail half then leaves the level alone', async () => {
    const { id, email, cookie } = await newUser();
    const target = uniquePhone();

    await startPhone(cookie, target).expect(201);
    await checkPhone(cookie, target, '000000').expect(201);

    let profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile.verificationLevel).toBe('BASIC');

    // The e-mail half still runs through afterEmailVerification and calls the promoter;
    // with BASIC already granted at the phone, its WHERE on NONE makes that a no-op, which
    // is the idempotence promote-basic.ts promises.
    await sendOtp(email).expect(200);
    await verifyEmail(email, readOtp()).expect(200);

    profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile.verificationLevel).toBe('BASIC');
    expect(profile.verifiedAt).not.toBeNull();
  });

  it('reaches BASIC at the e-mail, and the phone half then leaves the level alone', async () => {
    const { id, email, cookie } = await newUser();
    const target = uniquePhone();

    await sendOtp(email).expect(200);
    await verifyEmail(email, readOtp()).expect(200);

    let profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile.verificationLevel).toBe('BASIC');

    await startPhone(cookie, target).expect(201);
    // Both callers of promoteToBasicIfEligible are exercised across this test and the one
    // above: afterEmailVerification granted BASIC here, and OUR endpoint calls it again
    // below as a no-op.
    const res = await checkPhone(cookie, target, '000000').expect(201);

    expect(res.body.profile.verificationLevel).toBe('BASIC');
    profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile.verificationLevel).toBe('BASIC');
  });

  /** Drives an account all the way to BASIC, for the demotion cases below. */
  const reachBasic = async () => {
    const user = await newUser();
    const target = uniquePhone();
    await startPhone(user.cookie, target).expect(201);
    await checkPhone(user.cookie, target, '000000').expect(201);
    await sendOtp(user.email).expect(200);
    await verifyEmail(user.email, readOtp()).expect(200);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.verificationLevel).toBe('BASIC');
    return { ...user, phone: target };
  };

  it('drops phoneVerifiedAt but keeps BASIC when the phone changes, because the e-mail still backs it', async () => {
    const user = await reachBasic();

    await request(app.getHttpServer())
      .post('/api/auth/update-user')
      .set('Cookie', user.cookie)
      .send({ phone: uniquePhone() })
      .expect(200);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });

    // The flag must not survive the number it described.
    expect(row.phoneVerifiedAt).toBeNull();
    // But the level survives: BASIC is e-mail OR phone since `CF-D1` (2026-09-04), and this
    // account's e-mail is still verified. demoteBasicOnContactChange asks about the OTHER
    // contact - promote-basic.ts records why it cannot re-read the phone from the row.
    expect(profile.verificationLevel).toBe('BASIC');
    expect(profile.verifiedAt).not.toBeNull();
  });

  it('drops BASIC when the phone changes and it was the ONLY verified contact', async () => {
    const user = await newUser();
    const target = uniquePhone();
    await startPhone(user.cookie, target).expect(201);
    await checkPhone(user.cookie, target, '000000').expect(201);
    const before = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(before.verificationLevel).toBe('BASIC');

    await request(app.getHttpServer())
      .post('/api/auth/update-user')
      .set('Cookie', user.cookie)
      .send({ phone: uniquePhone() })
      .expect(200);

    // Nothing backs the level any more, so it must not stand.
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(profile.verificationLevel).toBe('NONE');
    expect(profile.verifiedAt).toBeNull();
  });

  it('keeps phoneVerifiedAt when the same number is re-saved', async () => {
    const user = await reachBasic();

    await request(app.getHttpServer())
      .post('/api/auth/update-user')
      .set('Cookie', user.cookie)
      .send({ phone: user.phone })
      .expect(200);

    // Re-confirming the number you already hold is not a reason to make you
    // verify it again.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.phoneVerifiedAt).not.toBeNull();
    expect(profile.verificationLevel).toBe('BASIC');
  });

  it('leaves phoneVerifiedAt alone when an update does not mention the phone', async () => {
    const user = await reachBasic();

    await request(app.getHttpServer())
      .post('/api/auth/update-user')
      .set('Cookie', user.cookie)
      .send({ name: 'Nom Modifié' })
      .expect(200);

    // This hook also fires for email verification, role changes and bans. If it
    // cleared the flag unconditionally, verifying an email would un-verify a phone.
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.phoneVerifiedAt).not.toBeNull();
    expect(profile.verificationLevel).toBe('BASIC');
  });
});
