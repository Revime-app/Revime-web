import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRepairersService } from '../src/admin/admin-repairers.service.js';
import { AdminUsersService } from '../src/admin/admin-users.service.js';
import { CronService } from '../src/cron/cron.service.js';
import { FakeIdentityGateway, identityGateway } from '../src/identity/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

describe('Bug B13: Deleted user badges, buttons, and Stripe erasure reconciliation', () => {
  const DELETED_AT = new Date('2026-10-09T10:00:00.000Z'); // 4+ days ago relative to 2026-10-13

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
    },
    profile: {
      findUnique: vi.fn(),
    },
    identityVerification: {
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    offer: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn().mockImplementation((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    demande: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    commande: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _sum: { totalCents: null, repairCents: null } }),
    },
    review: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({ _avg: { rating: null }, _count: { id: 0 } }),
    },
    conversationReport: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) },
    // The fiche's KPIs and tab lists (P6): real delegates, because the service no longer skips a
    // model its mock forgot.
    dispute: { count: vi.fn().mockResolvedValue(0), findMany: vi.fn().mockResolvedValue([]) },
    session: { findMany: vi.fn().mockResolvedValue([]) },
  };

  let repairersService: AdminRepairersService;
  let usersService: AdminUsersService;

  beforeEach(() => {
    vi.clearAllMocks();
    repairersService = new AdminRepairersService(mockPrisma as unknown as PrismaService);
    usersService = new AdminUsersService(mockPrisma as unknown as PrismaService, repairersService, {} as never);
  });

  it('repairerBlock: clears publicBadge to null when the account is deleted (profile.deletedAt is set)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      repairerProfile: {
        displayName: 'Utilisateur supprimé',
        kind: 'PRO',
        bio: null,
        postalCode: null,
        serviceAreaLabel: null,
        serviceRadiusKm: null,
      },
      profile: {
        deletedAt: DELETED_AT,
        repairerEnabled: true,
        verificationLevel: 'IDENTITY', // Legacy non-cleared level
        repairerSuspendedAt: null,
        repairerSuspendedUntil: null,
        repairerSuspendedReason: null,
        verificationRevokedAt: null,
        verificationRevokedReason: null,
      },
      identityVerification: null,
      businessVerification: null,
      connectAccount: null,
    });

    const block = await repairersService.repairerBlock('user-deleted-1');
    expect(block).not.toBeNull();
    // Bug B13: Must NOT retain "Réparateur vérifié" badge when deleted
    expect(block?.publicBadge).toBeNull();
  });

  it('AdminUsersService.detail: clears verificationLevel to NONE and flags modes as false when deleted', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      id: 'user-deleted-1',
      name: 'Utilisateur supprimé',
      firstName: null,
      lastName: null,
      username: 'supprime_123',
      email: 'deleted+user1@revime.invalid',
      emailVerified: false,
      phone: null,
      phoneVerifiedAt: null,
      role: 'user',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      banned: true,
      banReason: 'account_deleted',
      banExpires: null,
      profile: {
        deletedAt: DELETED_AT,
        clientEnabled: true, // Legacy non-cleared flag
        repairerEnabled: true, // Legacy non-cleared flag
        activeMode: 'REPAIRER',
        verificationLevel: 'IDENTITY', // Legacy non-cleared level
      },
      identityVerification: null,
    });

    const detail = await usersService.detail('user-deleted-1');
    expect(detail.status.kind).toBe('deleted');
    // Bug B13: Verification level must be reset to NONE on a deleted user
    expect(detail.verificationLevel).toBe('NONE');
    // Modes should not remain active
    expect(detail.account.clientEnabled).toBe(false);
    expect(detail.account.repairerEnabled).toBe(false);
  });

  it('repairerBlock: shows an erasure stuck in PROCESSING as stored, without guessing or writing', async () => {
    const fourDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    mockPrisma.user.findUnique.mockResolvedValueOnce({
      repairerProfile: {
        displayName: 'Utilisateur supprimé',
        kind: 'PRO',
        bio: null,
        postalCode: null,
        serviceAreaLabel: null,
        serviceRadiusKm: null,
      },
      profile: {
        deletedAt: fourDaysAgo,
        repairerEnabled: true,
        verificationLevel: 'IDENTITY',
        repairerSuspendedAt: null,
        repairerSuspendedUntil: null,
        repairerSuspendedReason: null,
        verificationRevokedAt: null,
        verificationRevokedReason: null,
      },
      identityVerification: {
        id: 'iv-1',
        stripeSessionId: 'vs_test_123',
        status: 'CANCELED',
        verifiedAt: null,
        lastErrorCode: null,
        variant: 'DOCUMENT_AND_SELFIE',
        redactionStatus: 'PROCESSING', // Stuck in PROCESSING
        erasureRequestedAt: fourDaysAgo,
        selfieFraudSignalAt: null,
      },
      businessVerification: null,
      connectAccount: null,
    });

    const block = await repairersService.repairerBlock('user-deleted-1');
    expect(block).not.toBeNull();
    // A read shows what is stored. It neither guesses REDACTED from the clock nor writes.
    expect(block?.identity?.redactionStatus).toBe('PROCESSING');
    expect(mockPrisma.identityVerification.update).not.toHaveBeenCalled();
  });

  it('CronService.settlePendingErasures: records what Stripe reports and leaves a session Stripe still processes', async () => {
    const live = (redactionStatus: 'REDACTED' | 'PROCESSING') => ({
      id: 'vs',
      status: 'VERIFIED' as const,
      url: null,
      lastErrorCode: null,
      redactionStatus,
    });
    const gateway = identityGateway() as FakeIdentityGateway;
    vi.spyOn(gateway, 'retrieveSession').mockImplementation((id: string) => {
      if (id === 'vs-done') return Promise.resolve(live('REDACTED'));
      if (id === 'vs-processing') return Promise.resolve(live('PROCESSING'));
      return Promise.reject(new Error('Stripe unreachable'));
    });
    const mockCronPrisma = {
      identityVerification: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'iv-done', stripeSessionId: 'vs-done' },
          { id: 'iv-processing', stripeSessionId: 'vs-processing' },
          { id: 'iv-error', stripeSessionId: 'vs-error' },
        ]),
        update: vi.fn().mockResolvedValue({}),
      },
    };
    const cronService = new CronService(
      mockCronPrisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as never, // FiscalService (CMP-D3), unused here
      {} as never, // SetupRemindersService (V8 E1), unused here
    );

    const result = await cronService.settlePendingErasures();

    expect(mockCronPrisma.identityVerification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { redactionStatus: 'PROCESSING' } }),
    );
    expect(result).toEqual({ scanned: 3, acted: 1, failed: 1 });
    expect(mockCronPrisma.identityVerification.update).toHaveBeenCalledTimes(1);
    expect(mockCronPrisma.identityVerification.update).toHaveBeenCalledWith({
      where: { id: 'iv-done' },
      // The session's own status is recorded as Stripe reports it, not forced to CANCELED.
      data: expect.objectContaining({ redactionStatus: 'REDACTED', status: 'VERIFIED' }),
    });
  });

  it('repairerBlock: returns block with publicBadge null when user is deleted and repairerEnabled is false (post-deleteAccount shape)', async () => {
    mockPrisma.user.findUnique.mockResolvedValueOnce({
      repairerProfile: {
        displayName: 'Atelier Supprimé',
        kind: 'PRO',
        bio: null,
        postalCode: '75001',
        serviceAreaLabel: 'Paris',
        serviceRadiusKm: 15,
      },
      profile: {
        deletedAt: DELETED_AT,
        repairerEnabled: false, // Newly deleted account has repairerEnabled: false
        verificationLevel: 'NONE',
        repairerSuspendedAt: null,
        repairerSuspendedUntil: null,
        repairerSuspendedReason: null,
        verificationRevokedAt: null,
        verificationRevokedReason: null,
      },
      identityVerification: null,
      businessVerification: null,
      connectAccount: null,
    });

    const block = await repairersService.repairerBlock('user-deleted-2');
    expect(block).not.toBeNull();
    expect(block?.repairerEnabled).toBe(false);
    expect(block?.publicBadge).toBeNull();
    expect(block?.displayName).toBe('Atelier Supprimé');
  });

});
