import { describe, expect, it, vi } from 'vitest';
import { AdminVerificationsService } from '../src/admin/admin-verifications.service.js';

const profile = (over: Record<string, unknown> = {}) => ({
  userId: 'u1',
  verificationLevel: 'IDENTITY',
  verifiedAt: new Date('2026-08-16T14:00:05.194Z'),
  updatedAt: new Date('2026-08-16T14:00:05.194Z'),
  user: {
    email: 'camille@example.fr',
    name: 'Camille',
    username: 'camille',
    repairerProfile: { kind: 'PRO' },
  },
  ...over,
});

const makeDeps = (over: Record<string, unknown> = {}) => {
  const prisma = {
    profile: { findMany: vi.fn().mockResolvedValue([]) },
    identityVerification: { findMany: vi.fn().mockResolvedValue([]) },
    businessVerification: { findMany: vi.fn().mockResolvedValue([]) },
    verificationAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    ...over,
  };
  return { prisma, service: new AdminVerificationsService(prisma as never) };
};

describe('P8: Verifications sortOrder by age & rich detail formatting', () => {
  describe('sortOrder: asc vs desc and defaults', () => {
    const twoIdentityProfiles = [
      profile({ userId: 'u-old', user: { email: 'old@example.fr', name: 'Old', username: 'old', repairerProfile: { kind: 'PRO' } } }),
      profile({ userId: 'u-new', user: { email: 'new@example.fr', name: 'New', username: 'new', repairerProfile: { kind: 'PRO' } } }),
    ];

    const twoActionableIdentityRows = [
      {
        userId: 'u-old',
        status: 'REQUIRES_INPUT',
        verifiedAt: null,
        lastErrorCode: 'document_expired',
        selfieFraudSignalAt: null,
        updatedAt: new Date('2026-08-01T10:00:00.000Z'),
        decision: null,
      },
      {
        userId: 'u-new',
        status: 'REQUIRES_INPUT',
        verifiedAt: null,
        lastErrorCode: 'document_expired',
        selfieFraudSignalAt: null,
        updatedAt: new Date('2026-08-20T10:00:00.000Z'),
        decision: null,
      },
    ];

    it('defaults to asc (oldest first) when needsAction is active (default)', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue(twoIdentityProfiles) },
        identityVerification: { findMany: vi.fn().mockResolvedValue(twoActionableIdentityRows) },
      });

      const res = await service.list();
      expect(res.items).toHaveLength(2);
      expect(res.items[0]!.userId).toBe('u-old');
      expect(res.items[1]!.userId).toBe('u-new');
    });

    it('sorts oldest first when sortOrder is explicitly asc', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue(twoIdentityProfiles) },
        identityVerification: { findMany: vi.fn().mockResolvedValue(twoActionableIdentityRows) },
      });

      const res = await service.list({ sortOrder: 'asc' });
      expect(res.items).toHaveLength(2);
      expect(res.items[0]!.userId).toBe('u-old');
      expect(res.items[1]!.userId).toBe('u-new');
    });

    it('sorts newest first when sortOrder is explicitly desc', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue(twoIdentityProfiles) },
        identityVerification: { findMany: vi.fn().mockResolvedValue(twoActionableIdentityRows) },
      });

      const res = await service.list({ sortOrder: 'desc' });
      expect(res.items).toHaveLength(2);
      expect(res.items[0]!.userId).toBe('u-new');
      expect(res.items[1]!.userId).toBe('u-old');
    });

    it('defaults to desc (newest first) when needsAction is false', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue(twoIdentityProfiles) },
        identityVerification: { findMany: vi.fn().mockResolvedValue(twoActionableIdentityRows) },
      });

      const res = await service.list({ needsAction: 'false' });
      expect(res.items).toHaveLength(2);
      expect(res.items[0]!.userId).toBe('u-new');
      expect(res.items[1]!.userId).toBe('u-old');
    });
  });

  describe('Identity rows rich contextual detail (zero empty dashes)', () => {
    it('formats decided ACCEPTED with custom note or fallback', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'VERIFIED',
              verifiedAt: new Date('2026-08-01T00:00:00Z'),
              lastErrorCode: null,
              selfieFraudSignalAt: null,
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: 'ACCEPTED',
              decisionNote: 'Passeport vérifié avec soin',
              decidedAt: new Date(),
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      expect(res.items[0]!.detail).toBe('Passeport vérifié avec soin');
    });

    it('formats decided REFUSED with reason motif', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'VERIFIED',
              verifiedAt: new Date('2026-08-01T00:00:00Z'),
              lastErrorCode: null,
              selfieFraudSignalAt: null,
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: 'REFUSED',
              decisionMotif: 'ILLEGIBLE',
              decisionNote: null,
              decidedAt: new Date(),
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      expect(res.items[0]!.detail).toBe('Document illisible');
    });

    it('formats fraud signal with explicit biometric / selfie detail', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'VERIFIED',
              verifiedAt: new Date('2026-08-01T00:00:00Z'),
              lastErrorCode: null,
              selfieFraudSignalAt: new Date('2026-08-01T00:00:00Z'),
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: null,
            },
          ]),
        },
      });

      const res = await service.list();
      expect(res.items[0]!.detail).toContain('Signal selfie / anomalie biométrique');
    });

    it('formats DOCUMENTS_REQUIRED with explicit French guidance', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'REQUIRES_INPUT',
              verifiedAt: null,
              lastErrorCode: 'document_unverified_other',
              selfieFraudSignalAt: null,
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: null,
            },
          ]),
        },
      });

      const res = await service.list();
      expect(res.items[0]!.detail).toBe('Documents à refaire — justificatif non conforme ou illisible');
    });

    it('formats PROCESSING with pending decision notice', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'PROCESSING',
              verifiedAt: null,
              lastErrorCode: null,
              selfieFraudSignalAt: null,
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: null,
            },
          ]),
        },
      });

      const res = await service.list();
      expect(res.items[0]!.detail).toBe('Documents soumis — en attente de décision');
    });

    it('formats NOT_STARTED with transmission waiting notice', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'REQUIRES_INPUT',
              verifiedAt: null,
              lastErrorCode: null,
              selfieFraudSignalAt: null,
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: null,
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      expect(res.items[0]!.detail).toBe('En attente de transmission des documents');
    });

    it('formats VERIFIED with identity verified notice', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'VERIFIED',
              verifiedAt: new Date('2026-08-01T00:00:00Z'),
              lastErrorCode: null,
              selfieFraudSignalAt: null,
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: null,
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      expect(res.items[0]!.detail).toBe('Identité vérifiée avec succès');
    });

    it('formats CANCELED with user cancellation notice', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
        identityVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              status: 'CANCELED',
              verifiedAt: null,
              lastErrorCode: null,
              selfieFraudSignalAt: null,
              updatedAt: new Date('2026-08-01T00:00:00Z'),
              decision: null,
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      expect(res.items[0]!.detail).toBe("Session annulée par l'utilisateur");
    });
  });

  describe('Business rows rich contextual detail (zero empty dashes)', () => {
    it('formats VERIFIED business as verified in business registry', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]) },
        businessVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              siren: '123456789',
              siret: '12345678900012',
              status: 'APPROVED',
              verifiedAt: new Date('2026-08-10T00:00:00Z'),
              submittedAt: new Date('2026-08-10T00:00:00Z'),
              registrationProofName: 'kbis.pdf',
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      const bizRow = res.items.find((i) => i.type === 'BUSINESS');
      expect(bizRow!.detail).toBe('Établissement vérifié au registre des entreprises');
    });

    it('formats SIRET mismatch when declared SIRET differs from filename', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'IDENTITY' })]) },
        businessVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              siren: '808359764',
              siret: '80835976400020',
              status: 'PENDING',
              verifiedAt: null,
              submittedAt: new Date('2026-08-10T00:00:00Z'),
              registrationProofName: 'Avis_de_situation_97923317800040_08_09_2026.pdf',
            },
          ]),
        },
      });

      const res = await service.list();
      const bizRow = res.items.find((i) => i.type === 'BUSINESS');
      expect(bizRow!.detail).toBe('Écart détecté entre SIRET déclaré et justificatif');
    });

    it('formats pending business decision without mismatch', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'IDENTITY' })]) },
        businessVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              siren: '808359764',
              siret: '80835976400020',
              status: 'PENDING',
              verifiedAt: null,
              submittedAt: new Date('2026-08-10T00:00:00Z'),
              registrationProofName: 'Avis_de_situation_80835976400020_08_09_2026.pdf',
            },
          ]),
        },
      });

      const res = await service.list();
      const bizRow = res.items.find((i) => i.type === 'BUSINESS');
      expect(bizRow!.detail).toBe('Avis de situation SIRET déposé — en attente de décision');
    });

    it('formats DOCUMENTS_REQUIRED for business', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'IDENTITY' })]) },
        businessVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              siren: '808359764',
              siret: '80835976400020',
              status: 'DOCUMENTS_REQUIRED',
              verifiedAt: null,
              submittedAt: new Date('2026-08-10T00:00:00Z'),
              registrationProofName: 'doc.pdf',
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      const bizRow = res.items.find((i) => i.type === 'BUSINESS');
      expect(bizRow!.detail).toBe('Pièces complémentaires demandées au réparateur');
    });

    it('formats REJECTED business as not found or closed', async () => {
      const { service } = makeDeps({
        profile: { findMany: vi.fn().mockResolvedValue([profile({ verificationLevel: 'IDENTITY' })]) },
        businessVerification: {
          findMany: vi.fn().mockResolvedValue([
            {
              userId: 'u1',
              siren: '808359764',
              siret: '80835976400020',
              status: 'REJECTED',
              verifiedAt: null,
              submittedAt: new Date('2026-08-10T00:00:00Z'),
              registrationProofName: 'doc.pdf',
            },
          ]),
        },
      });

      const res = await service.list({ needsAction: 'false' });
      const bizRow = res.items.find((i) => i.type === 'BUSINESS');
      expect(bizRow!.detail).toBe('SIRET non trouvé ou entreprise fermée au registre');
    });
  });
});
