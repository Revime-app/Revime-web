import { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { promoteToBusinessIfEligible } from '../src/verification/promote-business.js';
import { createTestApp } from './create-test-app.js';
import { signUp } from './helpers.js';

describe('promoteToBusinessIfEligible', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const createdEmails: string[] = [];

  const seed = async (opts: {
    level: 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';
    withRow?: boolean;
    status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DOCUMENTS_REQUIRED';
  }) => {
    const { email } = await signUp(app);
    createdEmails.push(email);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });

    await prisma.profile.update({
      where: { userId: user.id },
      data: {
        verificationLevel: opts.level,
        // Stamped, and NOT left null. The already-BUSINESS test compares verifiedAt
        // before and after: with null on both sides that assertion passes whether the
        // WHERE clause works or not, which is a check whose failure looks like a pass.
        verifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      },
    });

    if (opts.withRow ?? true) {
      await prisma.businessVerification.create({
        data: {
          userId: user.id,
          status: opts.status ?? 'APPROVED',
          siren: '980491005',
          siret: '98049100500016',
          denomination: 'ATELIER FIXTURE',
          legalForm: '1000',
          establishmentAddress: '12 RUE DE LA FIXTURE 16000 ANGOULEME',
          dirigeantName: 'Camille Fixture',
          registrationProofPath: 'business-documents/u1/kbis.pdf',
          registrationProofName: 'kbis.pdf',
          registrationProofSizeBytes: 1024,
          etatAdministratif: 'A',
          diffusible: true,
          dirigeants: [],
          verifiedAt: new Date(),
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

  it('grants BUSINESS from IDENTITY', async () => {
    const id = await seed({ level: 'IDENTITY' });
    await promoteToBusinessIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('BUSINESS');
  });

  it("refuses to skip IDENTITY, which is the client's own rule", async () => {
    // « toutes les informations du niveau 2 », 2026-08-13. It is also what stops a
    // réparateur satisfying the IDENTITY gate with a SIREN anyone can look up.
    const id = await seed({ level: 'BASIC' });
    await promoteToBusinessIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('BASIC');
  });

  it('grants nothing from NONE', async () => {
    const id = await seed({ level: 'NONE' });
    await promoteToBusinessIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('NONE');
  });

  it('does nothing without a BusinessVerification row', async () => {
    const id = await seed({ level: 'IDENTITY', withRow: false });
    await promoteToBusinessIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('IDENTITY');
  });

  it('does not promote if BusinessVerification status is not APPROVED', async () => {
    const idPending = await seed({ level: 'IDENTITY', status: 'PENDING' });
    await promoteToBusinessIfEligible(prisma, idPending);
    expect(await levelOf(idPending)).toBe('IDENTITY');

    const idRejected = await seed({ level: 'IDENTITY', status: 'REJECTED' });
    await promoteToBusinessIfEligible(prisma, idRejected);
    expect(await levelOf(idRejected)).toBe('IDENTITY');
  });

  it('is idempotent', async () => {
    const id = await seed({ level: 'IDENTITY' });
    await promoteToBusinessIfEligible(prisma, id);
    await promoteToBusinessIfEligible(prisma, id);
    expect(await levelOf(id)).toBe('BUSINESS');
  });

  it('stamps verifiedAt on the profile when it grants', async () => {
    const id = await seed({ level: 'IDENTITY' });
    const before = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    await promoteToBusinessIfEligible(prisma, id);
    const after = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    // Moved, not merely non-null: the seed already stamps one, so a non-null
    // assertion alone would pass without the write happening.
    expect(after.verifiedAt?.getTime()).toBeGreaterThan(before.verifiedAt!.getTime());
  });

  it('leaves an already-BUSINESS profile exactly where it is', async () => {
    const id = await seed({ level: 'BUSINESS' });
    const before = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    await promoteToBusinessIfEligible(prisma, id);
    const after = await prisma.profile.findUniqueOrThrow({ where: { userId: id } });
    expect(after.verificationLevel).toBe('BUSINESS');
    // The WHERE clause excludes it, so even verifiedAt must not move - a correction
    // re-stamps the evidence row, not the conclusion.
    expect(after.verifiedAt?.getTime()).toBe(before.verifiedAt?.getTime());
  });
});
