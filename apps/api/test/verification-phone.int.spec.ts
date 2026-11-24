import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { signUp, uniquePhone } from './helpers.js';

describe('phone verification start', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const start = (cookie: string, phone: string) =>
    request(app.getHttpServer())
      .post('/api/v1/verification/phone/start')
      .set('Cookie', cookie)
      .send({ phone });

  const newUser = async () => {
    const { email, cookie } = await signUp(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    return { id: user.id, email, cookie };
  };

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('rejects an anonymous caller, so nothing can be spent without an account', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/verification/phone/start')
      .send({ phone: uniquePhone() });
    expect(res.status).toBe(401);
  });

  it('accepts a French mobile and returns the cooldown on the happy path', async () => {
    const { id, cookie } = await newUser();

    const res = await start(cookie, uniquePhone()).expect(201);

    expect(res.body.retryAfterSeconds).toBe(60);
    const rows = await prisma.verificationAttempt.findMany({ where: { userId: id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.outcome).toBe('SENT');
    expect(rows[0]?.channel).toBe('SMS');
  });

  it('does not write user.phone on start, so a typo cannot squat a stranger number', async () => {
    const { id, cookie } = await newUser();
    const target = uniquePhone();

    await start(cookie, target).expect(201);

    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    // signUp already gave this account its own phone; the point is that the
    // START target was neither claimed nor allowed to overwrite it.
    expect(user.phone).not.toBe(target);
    expect(user.phoneVerifiedAt).toBeNull();
  });

  it('normalises a nationally formatted number to E.164 before storing the target', async () => {
    const { id, cookie } = await newUser();

    await start(cookie, '06 12 34 56 78').expect(201);

    const row = await prisma.verificationAttempt.findFirstOrThrow({ where: { userId: id } });
    expect(row.target).toBe('+33612345678');
  });

  it('rejects a landline with 400 and a French field error', async () => {
    const { cookie } = await newUser();

    const res = await start(cookie, '0142000000');

    // 400, not 422: app-exception.ts maps VALIDATION_FAILED to 400.
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.phone).toBe('Indiquez un numéro de mobile français (06 ou 07).');
  });

  it('refuses a number another account already holds, with 409', async () => {
    const other = await newUser();
    const holder = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    const { cookie } = await newUser();

    const res = await start(cookie, holder.phone!);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.message).toBe('Ce numéro de téléphone est déjà utilisé.');
  });

  it('spends nothing on a number another account holds, so the pre-check runs first', async () => {
    const other = await newUser();
    const holder = await prisma.user.findUniqueOrThrow({ where: { id: other.id } });
    const caller = await newUser();

    await start(caller.cookie, holder.phone!).expect(409);

    // No ledger row at all: not SENT, and not BLOCKED either. A 409 must not
    // consume the caller's own daily budget for someone else's number.
    const rows = await prisma.verificationAttempt.findMany({ where: { userId: caller.id } });
    expect(rows).toHaveLength(0);
  });

  it('refuses a second send inside the cooldown with 429 and the right code', async () => {
    const { cookie } = await newUser();
    const target = uniquePhone();

    await start(cookie, target).expect(201);
    const res = await start(cookie, target);

    expect(res.status).toBe(429);
    // Pinning the code, not only the status: without CODE_BY_STATUS[429] this
    // answers 429 carrying INTERNAL and logs as a server fault.
    expect(res.body.error.code).toBe('TOO_MANY_REQUESTS');
    expect(res.body.error.message).toMatch(/secondes/);
  });

  it('writes a BLOCKED row when the limiter refuses, so a refusal is auditable and free', async () => {
    const { id, cookie } = await newUser();
    const target = uniquePhone();

    await start(cookie, target).expect(201);
    await start(cookie, target).expect(429);

    const rows = await prisma.verificationAttempt.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.outcome)).toEqual(['SENT', 'BLOCKED']);
    // BLOCKED never reached Twilio, so it carries no provider reference.
    expect(rows[1]?.providerRef).toBeNull();
  });

  const check = (cookie: string, phone: string, code: string) =>
    request(app.getHttpServer())
      .post('/api/v1/verification/phone/check')
      .set('Cookie', cookie)
      .send({ phone, code });

  it('refuses a check with no prior send for that pair, so it cannot be a free Twilio call', async () => {
    const { cookie } = await newUser();

    const res = await check(cookie, uniquePhone(), '000000');

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNPROCESSABLE_ENTITY');
    expect(res.body.error.message).toBe(
      'Aucun code en attente pour ce numéro. Demandez un nouveau code.',
    );
  });

  it('refuses a wrong code with 422 and leaves the phone unverified', async () => {
    const { id, cookie } = await newUser();
    const target = uniquePhone();
    await start(cookie, target).expect(201);

    const res = await check(cookie, target, '123456');

    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('Code incorrect. Vérifiez le code reçu par SMS.');
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.phoneVerifiedAt).toBeNull();
  });

  it('claims the phone and stamps phoneVerifiedAt on the right code', async () => {
    const { id, cookie } = await newUser();
    const target = uniquePhone();
    await start(cookie, target).expect(201);

    const res = await check(cookie, target, '000000').expect(201);

    expect(res.body.phone).toBe(target);
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    expect(user.phone).toBe(target);
    expect(user.phoneVerifiedAt).not.toBeNull();
  });

  /**
   * 🛑 `CF-D1`, 2026-09-04: BASIC is e-mail OR phone, so the phone alone reaches it. This test
   * used to be « stays at NONE after the phone alone, because BASIC needs both halves ». The
   * client wrote « téléphone ou adresse e-mail »; the owner settled OR because `+33` SMS
   * delivery is unproven and an AND rule would lock out accounts whose code never arrives.
   * Excluded from `test:unit`, so NOT run for this change - edited by reading.
   * `promote-basic.spec.ts` is the gate-run cover.
   */
  it('reaches BASIC after the phone alone, with the e-mail still unverified', async () => {
    const { cookie } = await newUser();
    const target = uniquePhone();
    await start(cookie, target).expect(201);

    const res = await check(cookie, target, '000000').expect(201);

    // signUp leaves emailVerified false. One verified contact is the whole rule now.
    expect(res.body.profile.verificationLevel).toBe('BASIC');
  });

  it('records APPROVED and REJECTED outcomes distinctly in the ledger', async () => {
    const { id, cookie } = await newUser();
    const target = uniquePhone();
    await start(cookie, target).expect(201);
    await check(cookie, target, '123456').expect(422);
    await check(cookie, target, '000000').expect(201);

    const rows = await prisma.verificationAttempt.findMany({
      where: { userId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows.map((r) => r.outcome)).toEqual(['SENT', 'REJECTED', 'APPROVED']);
  });

  it('rejects a five-digit code with 400 before reaching the provider', async () => {
    const { cookie } = await newUser();
    const target = uniquePhone();
    await start(cookie, target).expect(201);

    const res = await check(cookie, target, '12345');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.fields.code).toBe('Le code doit contenir 6 chiffres.');
  });
});
