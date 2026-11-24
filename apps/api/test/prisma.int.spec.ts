import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaModule } from '../src/prisma/prisma.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('prisma', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule] }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reaches Supabase through the pooled connection', async () => {
    const rows = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 AS one`;
    expect(rows[0]?.one).toBe(1);
  });

  it('exposes the identity tables', async () => {
    await expect(prisma.profile.count()).resolves.toBeGreaterThanOrEqual(0);
    await expect(prisma.repairerProfile.count()).resolves.toBeGreaterThanOrEqual(0);
  });

  it('enforces RLS on identity tables and Prisma migrations table', async () => {
    const rows = await prisma.$queryRaw<{ tablename: string; rowsecurity: boolean }[]>`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename IN ('Profile', 'RepairerProfile', '_prisma_migrations')
      ORDER BY tablename
    `;

    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ tablename: 'Profile', rowsecurity: true });
    expect(rows[1]).toEqual({ tablename: 'RepairerProfile', rowsecurity: true });
    expect(rows[2]).toEqual({ tablename: '_prisma_migrations', rowsecurity: true });
  });

  it('exposes BusinessVerification with the nullability the design specifies', async () => {
    const rows = await prisma.$queryRaw<
      { column_name: string; is_nullable: string; column_default: string | null }[]
    >`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'BusinessVerification'
      ORDER BY column_name
    `;
    const by = Object.fromEntries(rows.map((r) => [r.column_name, r]));

    // Evidence the registry supplied vs what the row asserts
    for (const nullable of [
      'siret',
      'vatNumber',
      'insuranceProofPath',
      'insuranceProofName',
      'insuranceProofSizeBytes',
      'etatAdministratif',
      'dirigeants',
      'decisionMotif',
      'decisionNote',
      'decidedAt',
      'decidedByUserId',
      'verifiedAt',
    ]) {
      expect(by[nullable]?.is_nullable).toBe('YES');
    }
    for (const required of [
      'siren',
      'denomination',
      'legalForm',
      'establishmentAddress',
      'dirigeantName',
      'registrationProofPath',
      'registrationProofName',
      'registrationProofSizeBytes',
      'status',
      'diffusible',
      'submittedAt',
      'createdAt',
      'updatedAt',
    ]) {
      expect(by[required]?.is_nullable).toBe('NO');
    }
  });

  it('has no unique index on siren, deliberately', async () => {
    // A global unique would let a squatter lock a real company out permanently, with
    // nothing able to unlock it until an admin surface exists. Design §6.
    const rows = await prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'BusinessVerification'
    `;
    expect(rows.some((r) => r.indexdef.includes('UNIQUE') && r.indexdef.includes('userId'))).toBe(
      true,
    );
    expect(rows.some((r) => r.indexdef.includes('UNIQUE') && r.indexdef.includes('siren'))).toBe(
      false,
    );
  });

  it('enforces RLS on BusinessVerification with zero policies', async () => {
    const [table] = await prisma.$queryRaw<{ relrowsecurity: boolean }[]>`
      SELECT relrowsecurity FROM pg_class WHERE relname = 'BusinessVerification'
    `;
    expect(table?.relrowsecurity).toBe(true);

    const policies = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_policies WHERE tablename = 'BusinessVerification'
    `;
    expect(Number(policies[0]?.count ?? -1)).toBe(0);
  });

  it('appended REGISTRY to VerificationChannel rather than positioning it', async () => {
    const rows = await prisma.$queryRaw<{ enumlabel: string; enumsortorder: number }[]>`
      SELECT enumlabel, enumsortorder FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'VerificationChannel'
      ORDER BY enumsortorder
    `;
    expect(rows.map((r) => r.enumlabel)).toEqual(['SMS', 'EMAIL', 'REGISTRY']);
  });
});
