import { describe, expect, it, vi } from 'vitest';
import { BusinessService } from '../src/business/business.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const USER_ID = 'user-d4';

function row(legalForm: string) {
  return {
    status: 'PENDING',
    siren: '123456789',
    siret: null,
    denomination: 'Atelier',
    legalForm,
    establishmentAddress: '1 rue X',
    vatNumber: null,
    dirigeantName: 'A B',
    registrationProofName: 'kbis.pdf',
    insuranceProofName: null,
    submittedAt: new Date('2026-10-01T10:00:00Z'),
    verifiedAt: null,
    decisionMotif: null,
    decisionNote: null,
    decidedAt: null,
  };
}

describe('BusinessService legal form (D4: « Forme juridique : 8310 »)', () => {
  it('answers the label for a code stored by an older build', async () => {
    const prisma = { businessVerification: { findUnique: vi.fn().mockResolvedValue(row('8310')) } };
    const service = new BusinessService(prisma as unknown as PrismaService);
    const res = await service.status(USER_ID);
    expect(res.company?.legalForm).toBe('Comité social économique d’entreprise');
  });

  it('leaves a stored label as it is', async () => {
    const prisma = {
      businessVerification: { findUnique: vi.fn().mockResolvedValue(row('Micro-entreprise / Auto-entrepreneur')) },
    };
    const service = new BusinessService(prisma as unknown as PrismaService);
    const res = await service.status(USER_ID);
    expect(res.company?.legalForm).toBe('Micro-entreprise / Auto-entrepreneur');
  });

  it('stores what was submitted, trimmed, and not a label expanded past the VarChar(100) column', async () => {
    // 5770 expands to a 103-character label: writing the expansion would fail in Postgres.
    const upsert = vi.fn().mockResolvedValue({});
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          firstName: 'A',
          lastName: 'B',
          name: 'A B',
          profile: { verificationLevel: 'IDENTITY' },
        }),
      },
      businessVerification: {
        upsert,
        findUnique: vi.fn().mockResolvedValue(row('5770')),
      },
      profile: { update: vi.fn() },
    };
    const service = new BusinessService(prisma as unknown as PrismaService);
    await service.submit(USER_ID, {
      identifier: '123456789',
      denomination: 'Atelier',
      legalForm: ' 5770 ',
      establishmentAddress: '1 rue X',
      registrationProof: { path: 'p', name: 'kbis.pdf', sizeBytes: 10 },
    } as never);
    expect(upsert.mock.calls[0]![0].create.legalForm).toBe('5770');
    expect(upsert.mock.calls[0]![0].update.legalForm).toBe('5770');
  });
});
