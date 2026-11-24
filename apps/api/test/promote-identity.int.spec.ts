import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { promoteFromIdentityIfEligible } from '../src/verification/promote-identity.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

describe('promoteFromIdentityIfEligible', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  /**
   * A user at a chosen level, optionally with a verified Identity session.
   * Contact details are marked verified unless asked otherwise, because BASIC is
   * the floor this promotion builds on.
   */
  const seed = async (opts: {
    level: 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';
    identityVerified: boolean;
    contactVerified?: boolean;
    withRow?: boolean;
  }) => {
    const { email } = await signUp(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    const contact = opts.contactVerified ?? true;
    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: contact, phoneVerifiedAt: contact ? new Date() : null },
    });
    await prisma.profile.update({
      where: { userId: user.id },
      data: { verificationLevel: opts.level },
    });

    if (opts.withRow ?? true) {
      await prisma.identityVerification.create({
        data: {
          userId: user.id,
          stripeSessionId: `vs_seed_${user.id}`,
          status: opts.identityVerified ? 'VERIFIED' : 'REQUIRES_INPUT',
          verifiedAt: opts.identityVerified ? new Date() : null,
        },
      });
    }
    return user.id;
  };

  const levelOf = async (userId: string) =>
    (await prisma.profile.findUniqueOrThrow({ where: { userId } })).verificationLevel;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdEmails.length > 0) {
      await prisma.user.deleteMany({ where: { email: { in: createdEmails } } });
    }
    await app.close();
  });

  it('grants IDENTITY from BASIC on a verified session', async () => {
    const id = await seed({ level: 'BASIC', identityVerified: true });
    await promoteFromIdentityIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('IDENTITY');
  });

  it('grants nothing while the session is unverified', async () => {
    const id = await seed({ level: 'BASIC', identityVerified: false });
    await promoteFromIdentityIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('BASIC');
  });

  it('refuses to skip BASIC - a level reachable out of order is not a level', async () => {
    const id = await seed({ level: 'NONE', identityVerified: true, contactVerified: false });
    await promoteFromIdentityIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('NONE');
  });

  it('never demotes BUSINESS to IDENTITY', async () => {
    const id = await seed({ level: 'BUSINESS', identityVerified: true });
    await promoteFromIdentityIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('BUSINESS');
  });

  it('is idempotent', async () => {
    const id = await seed({ level: 'BASIC', identityVerified: true });
    await promoteFromIdentityIfEligible(prisma, id);
    await promoteFromIdentityIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('IDENTITY');
  });

  it('does nothing for a user with no IdentityVerification row', async () => {
    const id = await seed({ level: 'BASIC', identityVerified: false, withRow: false });
    await promoteFromIdentityIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('BASIC');
  });

  it('stamps verifiedAt on the profile when it grants', async () => {
    const id = await seed({ level: 'BASIC', identityVerified: true });
    await promoteFromIdentityIfEligible(prisma, id);
    const profile = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    expect(profile.verifiedAt).not.toBeNull();
  });

  it('grants IDENTITY from an earlier verification once BASIC is reached, even if the session has since been canceled', async () => {
    // The order a réparateur can plausibly do things in: document first, email and
    // phone afterwards. verifiedAt is the FACT; status is only where the session
    // got to, and it can move afterwards.
    const id = await seed({ level: 'NONE', identityVerified: true });
    await prisma.identityVerification.update({
      where: { userId: id },
      data: { status: 'CANCELED' },
    });

    // Nothing granted yet: he was NONE when the document verified, and BASIC is a
    // floor no promotion may skip.
    await promoteFromIdentityIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('NONE');

    // Now he completes level 1.
    await prisma.profile.update({
      where: { userId: id },
      data: { verificationLevel: 'BASIC' },
    });
    await promoteFromIdentityIfEligible(prisma, id);

    // Granted on the strength of the stamp, not the current status. Reading status
    // here would refuse, and would charge him for verifying the same passport twice.
    expect(await levelOf(id)).toBe('IDENTITY');
  });
});
