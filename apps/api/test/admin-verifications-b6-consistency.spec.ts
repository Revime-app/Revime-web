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

describe('Bug B6: Verifications "Nécessite une action" filter & actionable decision consistency', () => {
  it('Bug B6.1: placed phantom row without IdentityVerification (level_unbacked) has needsAction: false and is hidden when needsAction=true', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      // No IdentityVerification row exists
    });

    // Default query (needsAction=true) should NOT include phantom rows where admin cannot decide
    const resDefault = await service.list();
    expect(resDefault.items).toHaveLength(0);

    // Unfiltered query (needsAction=false -> "Tous") should include the phantom row as non-actionable
    const resAll = await service.list({ needsAction: 'false' });
    expect(resAll.items).toHaveLength(1);
    expect(resAll.items[0]!.type).toBe('IDENTITY');
    expect(resAll.items[0]!.status).toBe('NOT_STARTED');
    expect(resAll.items[0]!.identity).toBeNull();
    expect(resAll.items[0]!.needsAction).toBe(false);
  });

  it('Bug B6.2: session never started by user (REQUIRES_INPUT without error code) has needsAction: false', async () => {
    const { service } = makeDeps({
      profile: { findMany: vi.fn().mockResolvedValue([profile()]) },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'REQUIRES_INPUT',
            verifiedAt: null,
            lastErrorCode: null, // User never submitted documents
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
            decision: null,
          },
        ]),
      },
    });

    // Default query (needsAction=true)
    const resDefault = await service.list();
    expect(resDefault.items).toHaveLength(0);

    // All query (needsAction=false)
    const resAll = await service.list({ needsAction: 'false' });
    expect(resAll.items).toHaveLength(1);
    expect(resAll.items[0]!.status).toBe('NOT_STARTED');
    expect(resAll.items[0]!.needsAction).toBe(false);
  });

  it('Bug B6.3: session with failure (DOCUMENTS_REQUIRED) or PROCESSING or fraudSignal has needsAction: true', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            profile({ userId: 'u1' }),
            profile({ userId: 'u2' }),
            profile({ userId: 'u3' }),
          ]),
      },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            status: 'REQUIRES_INPUT',
            verifiedAt: null,
            lastErrorCode: 'document_expired',
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
            decision: null,
          },
          {
            userId: 'u2',
            status: 'PROCESSING',
            verifiedAt: null,
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
            decision: null,
          },
          {
            userId: 'u3',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: new Date('2026-08-17T00:00:00Z'),
            updatedAt: new Date('2026-08-16T14:00:00Z'),
            decision: null,
          },
        ]),
      },
    });

    const res = await service.list();
    expect(res.items).toHaveLength(3);
    expect(res.items.every((i) => i.needsAction)).toBe(true);
  });

  it('Bug B6.4: filter off (needsAction: false) returns ALL items (both actionable and clean)', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi
          .fn()
          .mockResolvedValue([
            profile({ userId: 'u_actionable' }),
            profile({ userId: 'u_clean' }),
          ]),
      },
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u_actionable',
            status: 'REQUIRES_INPUT',
            verifiedAt: null,
            lastErrorCode: 'document_expired',
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
            decision: null,
          },
          {
            userId: 'u_clean',
            status: 'VERIFIED',
            verifiedAt: new Date('2026-08-16T14:00:00Z'),
            lastErrorCode: null,
            selfieFraudSignalAt: null,
            updatedAt: new Date('2026-08-16T14:00:00Z'),
            decision: null,
          },
        ]),
      },
    });

    // When needsAction=true: only actionable row is returned
    const resFiltered = await service.list({ needsAction: 'true' });
    expect(resFiltered.items).toHaveLength(1);
    expect(resFiltered.items[0]!.userId).toBe('u_actionable');
    expect(resFiltered.items[0]!.needsAction).toBe(true);

    // When needsAction=false (filter off = "Tous"): BOTH rows are returned (total >= filtered)
    const resAll = await service.list({ needsAction: 'false' });
    expect(resAll.items).toHaveLength(2);
    expect(resAll.total).toBe(2);
    expect(resAll.items.map((i) => i.userId).sort()).toEqual([
      'u_actionable',
      'u_clean',
    ]);
  });

  it('Bug B6.5: placed BUSINESS row without BusinessVerification has needsAction: false', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi
          .fn()
          .mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]),
      },
      // No BusinessVerification exists
    });

    const resDefault = await service.list();
    const bizActionable = resDefault.items.filter((i) => i.type === 'BUSINESS');
    expect(bizActionable).toHaveLength(0);

    const resAll = await service.list({ needsAction: 'false' });
    const bizAll = resAll.items.filter((i) => i.type === 'BUSINESS');
    expect(bizAll).toHaveLength(1);
    expect(bizAll[0]!.needsAction).toBe(false);
  });

  it('Bug B6.6: BUSINESS row with status PENDING has needsAction: true', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi
          .fn()
          .mockResolvedValue([profile({ verificationLevel: 'BUSINESS' })]),
      },
      businessVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            siren: '123456789',
            siret: '12345678900012',
            status: 'PENDING',
            submittedAt: new Date('2026-08-10T00:00:00Z'),
            verifiedAt: null,
          },
        ]),
      },
    });

    const resDefault = await service.list();
    const bizRows = resDefault.items.filter((i) => i.type === 'BUSINESS');
    expect(bizRows).toHaveLength(1);
    expect(bizRows[0]!.status).toBe('PROCESSING');
    expect(bizRows[0]!.needsAction).toBe(true);
    expect(bizRows[0]!.detail).toBe('Avis de situation SIRET déposé — en attente de décision');
  });

  it('Bug B6.7: BUSINESS row with status DOCUMENTS_REQUIRED has needsAction: false and detail "Pièces complémentaires demandées au réparateur"', async () => {
    const { service } = makeDeps({
      profile: {
        findMany: vi
          .fn()
          .mockResolvedValue([profile({ verificationLevel: 'IDENTITY' })]),
      },
      businessVerification: {
        findMany: vi.fn().mockResolvedValue([
          {
            userId: 'u1',
            siren: '123456789',
            siret: '12345678900012',
            status: 'DOCUMENTS_REQUIRED',
            submittedAt: new Date('2026-08-10T00:00:00Z'),
            verifiedAt: null,
          },
        ]),
      },
    });

    const resDefault = await service.list();
    const bizActionable = resDefault.items.filter((i) => i.type === 'BUSINESS');
    expect(bizActionable).toHaveLength(0);

    const resAll = await service.list({ needsAction: 'false' });
    const bizRows = resAll.items.filter((i) => i.type === 'BUSINESS');
    expect(bizRows).toHaveLength(1);
    expect(bizRows[0]!.status).toBe('DOCUMENTS_REQUIRED');
    expect(bizRows[0]!.needsAction).toBe(false);
    expect(bizRows[0]!.detail).toBe('Pièces complémentaires demandées au réparateur');
  });
});
