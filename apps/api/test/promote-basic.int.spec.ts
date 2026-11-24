import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  demoteBasicOnContactChange,
  promoteToBasicIfEligible,
} from '../src/verification/promote-basic.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

/**
 * 🛑 REWRITTEN 2026-09-04 for `CF-03` / `CF-D1`: BASIC is a verified e-mail OR a verified phone.
 *
 * This file is excluded from `test:unit` and needs a database, so it was NOT RUN for that change.
 * It was edited by reading, so that it stops asserting the AND rule the slice replaced - an
 * integration spec that no gate runs is still a document the next reader trusts. The gate-run
 * cover for the same behaviour is `promote-basic.spec.ts`, over a stubbed Prisma.
 */
describe('promoteToBasicIfEligible', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const newUser = async () => {
    const { email } = await signUp(app);
    createdEmails.push(email);
    return prisma.user.findUniqueOrThrow({ where: { email } });
  };

  const levelOf = (userId: string) =>
    prisma.profile.findUniqueOrThrow({
      where: { userId },
      select: { verificationLevel: true, verifiedAt: true },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    await app.close();
  });

  it('leaves a fresh account at NONE', async () => {
    const user = await newUser();
    await promoteToBasicIfEligible(prisma, user.id);
    expect((await levelOf(user.id)).verificationLevel).toBe('NONE');
  });

  it('reaches BASIC with a verified phone alone', async () => {
    const user = await newUser();
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });

    await promoteToBasicIfEligible(prisma, user.id);

    // `CF-D1`. This case used to assert NONE and call itself « THE guard that matters »; the
    // client wrote « téléphone ou adresse e-mail », and the owner settled OR on 2026-09-04
    // because `+33` SMS delivery is unproven, so an AND rule would lock out every account
    // whose code never arrives.
    expect((await levelOf(user.id)).verificationLevel).toBe('BASIC');
  });

  it('reaches BASIC with a verified e-mail alone', async () => {
    const user = await newUser();
    await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });

    await promoteToBasicIfEligible(prisma, user.id);

    expect((await levelOf(user.id)).verificationLevel).toBe('BASIC');
  });

  it('promotes to BASIC and stamps verifiedAt with both halves verified', async () => {
    const user = await newUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, phoneVerifiedAt: new Date() },
    });

    await promoteToBasicIfEligible(prisma, user.id);

    const after = await levelOf(user.id);
    expect(after.verificationLevel).toBe('BASIC');
    expect(after.verifiedAt).not.toBeNull();
  });

  it('is idempotent, so calling it from both halves is safe', async () => {
    const user = await newUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, phoneVerifiedAt: new Date() },
    });

    await promoteToBasicIfEligible(prisma, user.id);
    const first = await levelOf(user.id);
    await promoteToBasicIfEligible(prisma, user.id);
    const second = await levelOf(user.id);

    expect(second.verificationLevel).toBe('BASIC');
    expect(second.verifiedAt?.getTime()).toBe(first.verifiedAt?.getTime());
  });

  it('never demotes an IDENTITY account, because piece 5 owns that level', async () => {
    const user = await newUser();
    await prisma.profile.update({
      where: { userId: user.id },
      data: { verificationLevel: 'IDENTITY', verifiedAt: new Date() },
    });

    // Neither half verified, so the eligibility test fails. It must still not
    // touch a level it did not grant.
    await promoteToBasicIfEligible(prisma, user.id);
    expect((await levelOf(user.id)).verificationLevel).toBe('IDENTITY');

    await demoteBasicOnContactChange(prisma, user.id, 'phone');
    expect((await levelOf(user.id)).verificationLevel).toBe('IDENTITY');
  });

  it('demotes BASIC to NONE and clears verifiedAt when the ONLY verified contact changes', async () => {
    const user = await newUser();
    await prisma.user.update({ where: { id: user.id }, data: { phoneVerifiedAt: new Date() } });
    await promoteToBasicIfEligible(prisma, user.id);
    expect((await levelOf(user.id)).verificationLevel).toBe('BASIC');

    await demoteBasicOnContactChange(prisma, user.id, 'phone');

    const after = await levelOf(user.id);
    expect(after.verificationLevel).toBe('NONE');
    expect(after.verifiedAt).toBeNull();
  });

  it('keeps BASIC when the phone changes but the e-mail still backs it', async () => {
    const user = await newUser();
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, phoneVerifiedAt: new Date() },
    });
    await promoteToBasicIfEligible(prisma, user.id);

    // The caller names the changing contact and the function asks only about the other one,
    // because normalise-phone.ts calls it BEFORE the framework writes phoneVerifiedAt: null.
    await demoteBasicOnContactChange(prisma, user.id, 'phone');

    const after = await levelOf(user.id);
    expect(after.verificationLevel).toBe('BASIC');
    expect(after.verifiedAt).not.toBeNull();
  });
});
