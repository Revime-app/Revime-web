import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminComplianceService } from '../src/admin/admin-compliance.service.js';
import { ConsentProofsService } from '../src/compliance/consent-proofs.service.js';
import { computeConsentChecksum } from '@revime/shared';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * The real ConsentProofsService runs here (over a mocked Prisma delegate), so the verdict the
 * admin sees is the one the production code computes, not a value the test hands back.
 */
describe('AdminComplianceService', () => {
  let service: AdminComplianceService;
  let consentProof: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };

  const sealed = (over: Record<string, unknown> = {}) => {
    const row = {
      id: 'c0000000-0000-4000-8000-000000000001',
      userId: 'usr_test',
      kind: 'CGU_ACCEPTANCE' as const,
      timestamp: new Date('2026-10-11T04:30:00.000Z'),
      actionProof: 'CHECKBOX_CLICK',
      legalTextSnapshot: 'Texte CGU',
      commandeId: null,
      cguVersion: '2026-09-04',
      waiverTextVersion: null,
      ipAddress: '192.168.1.1',
      userAgent: 'Agent/1.0',
      metadata: null,
      checksum: '',
      user: { email: 'client@example.com' },
      ...over,
    };
    if (!over.checksum) row.checksum = computeConsentChecksum(row);
    return row;
  };

  beforeEach(() => {
    consentProof = {
      findMany: vi.fn().mockResolvedValue([sealed()]),
      findUnique: vi.fn(),
      count: vi.fn().mockResolvedValue(1),
    };
    const prisma = { consentProof } as unknown as PrismaService;
    service = new AdminComplianceService(prisma, new ConsentProofsService(prisma));
  });

  it('lists proofs with pagination and a verdict per row', async () => {
    const res = await service.list({ limit: 10, page: 1 });
    expect(res).toMatchObject({ total: 1, page: 1, totalPages: 1 });
    expect(res.items[0]).toMatchObject({
      id: sealed().id,
      userEmail: 'client@example.com',
      timestamp: '2026-10-11T04:30:00.000Z',
      valid: true,
      historicalImport: false,
    });
  });

  it('V9 B1 (`DEC9-06` (1)): carries the account sign-up method and the privacy version', async () => {
    consentProof.findMany.mockResolvedValue([
      sealed({ kind: 'PRIVACY_ACCEPTANCE', cguVersion: null, privacyVersion: '2026-11-19', user: { email: 'g@example.com', signupMethod: 'GOOGLE' } }),
    ]);
    const res = await service.list({ limit: 10, page: 1 });
    expect(res.items[0]).toMatchObject({ kind: 'PRIVACY_ACCEPTANCE', privacyVersion: '2026-11-19', signupMethod: 'GOOGLE', valid: true });
    const include = (consentProof.findMany.mock.calls[0]![0] as { include: unknown }).include;
    expect(include).toEqual({ user: { select: { email: true, signupMethod: true } } });
  });

  it('computes the page window and total pages from limit and page', async () => {
    consentProof.count.mockResolvedValue(45);
    const res = await service.list({ limit: 20, page: 3 });
    expect(consentProof.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20, skip: 40 }));
    expect(res.totalPages).toBe(3);
  });

  it('adds the kind filter, and matches the term on user id, commande id AND e-mail in ONE query', async () => {
    await service.list({ q: 'client@example.com', kind: 'CGU_ACCEPTANCE', limit: 10, page: 1 });
    const { where } = consentProof.findMany.mock.calls[0]![0];
    expect(where).toEqual({
      kind: 'CGU_ACCEPTANCE',
      OR: [
        { userId: 'client@example.com' },
        { commandeId: 'client@example.com' },
        { user: { email: { contains: 'client@example.com', mode: 'insensitive' } } },
      ],
    });
    // Same filter for the total, so a broad search is not silently truncated.
    expect(consentProof.count).toHaveBeenCalledWith({ where });
  });

  it('applies no filter when there is neither a kind nor a term', async () => {
    await service.list({ q: '   ', limit: 10, page: 1 });
    expect(consentProof.findMany.mock.calls[0]![0].where).toEqual({});
  });

  it('flags a tampered row during listing', async () => {
    consentProof.findMany.mockResolvedValue([sealed({ checksum: 'f'.repeat(64) }), ]);
    const res = await service.list({ limit: 10, page: 1 });
    expect(res.items[0]!.valid).toBe(false);
  });

  it('shows a backfilled row as valid AND historical, not as tampered', async () => {
    const legacy = sealed({
      actionProof: 'HISTORICAL_IMPORT_REGISTRATION',
      // encode(sha256(u.id::bytea), 'hex') for 'usr_test'
      checksum: '8ac09bdb4b0a56a1e3fc0cbd2f1b2dc7a7e8e2d6e4f9b62c8f5b1c64f2e7d0aa',
    });
    // The checksum above is only a placeholder; compute the real legacy value the same way SQL does.
    const { createHash } = await import('node:crypto');
    legacy.checksum = createHash('sha256').update('usr_test', 'utf8').digest('hex');
    consentProof.findMany.mockResolvedValue([legacy]);

    const res = await service.list({ limit: 10, page: 1 });
    expect(res.items[0]).toMatchObject({ valid: true, historicalImport: true });
  });

  it('verifies a stored proof with a single read and returns both checksums', async () => {
    const proof = sealed();
    consentProof.findUnique.mockResolvedValue(proof);
    const res = await service.verify(proof.id);
    expect(res).toMatchObject({
      id: proof.id,
      valid: true,
      historicalImport: false,
      calculatedChecksum: proof.checksum,
      storedChecksum: proof.checksum,
    });
    expect(consentProof.findUnique).toHaveBeenCalledTimes(1);
  });

  it('reports a tampered proof as invalid with the checksum it should have had', async () => {
    const good = sealed();
    consentProof.findUnique.mockResolvedValue({ ...good, checksum: 'bad_checksum' });
    const res = await service.verify(good.id);
    expect(res.valid).toBe(false);
    expect(res.storedChecksum).toBe('bad_checksum');
    expect(res.calculatedChecksum).toBe(good.checksum);
  });

  it('answers 404 for an unknown proof', async () => {
    consentProof.findUnique.mockResolvedValue(null);
    await expect(service.verify('c0000000-0000-4000-8000-999999999999')).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
