import { createHash } from 'node:crypto';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConsentProofsService } from '../src/compliance/consent-proofs.service.js';
import {
  CANONICAL_CGU_ACCEPTANCE_TEXT,
  computeConsentChecksum,
  CURRENT_CGU_VERSION,
} from '@revime/shared';

describe('ConsentProofsService', () => {
  let service: ConsentProofsService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      consentProof: {
        create: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
      },
    };
    service = new ConsentProofsService(mockPrisma);
  });

  it('records a CGU consent proof with accurate timestamp and checksum', async () => {
    const now = new Date('2026-10-11T03:00:00.000Z');
    mockPrisma.consentProof.create.mockImplementation(({ data }: any) => Promise.resolve({
      id: 'proof-uuid-1',
      ...data,
    }));

    const result = await service.recordProof({
      userId: 'user-1',
      kind: 'CGU_ACCEPTANCE',
      cguVersion: CURRENT_CGU_VERSION,
      legalTextSnapshot: CANONICAL_CGU_ACCEPTANCE_TEXT,
      actionProof: 'CHECKBOX_TICKED_AND_REGISTRATION_SUBMITTED',
      timestamp: now,
    });

    expect(mockPrisma.consentProof.create).toHaveBeenCalledOnce();
    const createdData = mockPrisma.consentProof.create.mock.calls[0][0].data;
    expect(createdData.userId).toBe('user-1');
    expect(createdData.kind).toBe('CGU_ACCEPTANCE');
    expect(createdData.checksum).toBe(
      computeConsentChecksum({
        userId: 'user-1',
        kind: 'CGU_ACCEPTANCE',
        timestamp: now,
        actionProof: 'CHECKBOX_TICKED_AND_REGISTRATION_SUBMITTED',
        legalTextSnapshot: CANONICAL_CGU_ACCEPTANCE_TEXT,
        cguVersion: CURRENT_CGU_VERSION,
      }),
    );
    expect(result.id).toBe('proof-uuid-1');
  });

  it('verifies integrity of a stored proof', async () => {
    const timestamp = new Date('2026-10-11T03:00:00.000Z');
    const checksum = computeConsentChecksum({
      userId: 'user-1',
      kind: 'CGU_ACCEPTANCE',
      timestamp,
      actionProof: 'CHECKBOX_TICKED',
      legalTextSnapshot: 'Legal Text',
      cguVersion: '2026-10-10',
    });

    mockPrisma.consentProof.findUnique.mockResolvedValue({
      id: 'proof-1',
      userId: 'user-1',
      kind: 'CGU_ACCEPTANCE',
      timestamp,
      actionProof: 'CHECKBOX_TICKED',
      legalTextSnapshot: 'Legal Text',
      cguVersion: '2026-10-10',
      checksum,
    });

    const verification = await service.verifyProof('proof-1');
    expect(verification!.valid).toBe(true);
  });

  it('detects tampering when stored checksum does not match payload', async () => {
    const timestamp = new Date('2026-10-11T03:00:00.000Z');
    mockPrisma.consentProof.findUnique.mockResolvedValue({
      id: 'proof-1',
      userId: 'user-1',
      kind: 'CGU_ACCEPTANCE',
      timestamp,
      actionProof: 'CHECKBOX_TICKED',
      legalTextSnapshot: 'Legal Text Altered',
      cguVersion: '2026-10-10',
      checksum: 'bogus_checksum_1234567890abcdef',
    });

    const verification = await service.verifyProof('proof-1');
    expect(verification!.valid).toBe(false);
  });

  it('verifyProof returns null for an unknown id', async () => {
    mockPrisma.consentProof.findUnique.mockResolvedValue(null);
    expect(await service.verifyProof('missing')).toBeNull();
  });

  it('reads an imported row sealed with the legacy sha256(id) scheme as valid AND historical', async () => {
    const userId = 'user-legacy';
    mockPrisma.consentProof.findUnique.mockResolvedValue({
      id: 'proof-legacy',
      userId,
      kind: 'CGU_ACCEPTANCE',
      timestamp: new Date('2026-09-01T00:00:00.000Z'),
      actionProof: 'HISTORICAL_IMPORT_REGISTRATION',
      legalTextSnapshot: 'Acceptation initiale des Conditions Générales d\'Utilisation.',
      cguVersion: '2026-09-04',
      // What the 20261011040000 backfill wrote: encode(sha256(u.id::bytea), 'hex').
      checksum: createHash('sha256').update(userId, 'utf8').digest('hex'),
    });

    const verification = await service.verifyProof('proof-legacy');
    expect(verification!.valid).toBe(true);
    expect(verification!.historicalImport).toBe(true);
  });

  it('a modified imported row is tampered, and a live row never gets the legacy exemption', async () => {
    const base = {
      id: 'p',
      userId: 'user-1',
      kind: 'CGU_ACCEPTANCE',
      timestamp: new Date('2026-09-01T00:00:00.000Z'),
      legalTextSnapshot: 'x',
      cguVersion: '2026-09-04',
      checksum: createHash('sha256').update('user-1', 'utf8').digest('hex'),
    };
    // Same legacy checksum but NOT an import marker: a live proof cannot borrow the scheme.
    mockPrisma.consentProof.findUnique.mockResolvedValue({ ...base, actionProof: 'CHECKBOX_TICKED' });
    expect((await service.verifyProof('p'))!.valid).toBe(false);
    // An import marker with a checksum that is not the legacy one.
    mockPrisma.consentProof.findUnique.mockResolvedValue({
      ...base,
      actionProof: 'HISTORICAL_IMPORT_REGISTRATION',
      checksum: 'f'.repeat(64),
    });
    expect((await service.verifyProof('p'))!.valid).toBe(false);
  });

  it('refuses a proof that fails the input schema instead of storing it', async () => {
    await expect(
      service.recordProof({ userId: 'u', kind: 'CGU_ACCEPTANCE', legalTextSnapshot: '', actionProof: 'X' }),
    ).rejects.toThrow();
    expect(mockPrisma.consentProof.create).not.toHaveBeenCalled();
  });
});
