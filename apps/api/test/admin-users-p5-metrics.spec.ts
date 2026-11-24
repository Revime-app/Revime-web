import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GENUINE_COLLECTED_COMMANDE_WHERE } from '../src/admin/admin-constants.js';
import { AdminUsersService } from '../src/admin/admin-users.service.js';

const repairerRow = (over: Record<string, unknown> = {}) => ({
  id: 'rep-1',
  name: 'Jean Réparateur',
  username: 'jeanrep',
  email: 'jean@repareme.fr',
  phone: '+33611223344',
  createdAt: new Date('2026-07-01T10:00:00.000Z'),
  banned: false,
  banReason: null,
  banExpires: null,
  role: 'user',
  profile: {
    deletedAt: null,
    clientEnabled: false,
    repairerEnabled: true,
    verificationLevel: 'BUSINESS',
    repairerSuspendedAt: null,
  },
  repairerProfile: {
    displayName: 'Jean Atelier',
    postalCode: '75011',
  },
  ...over,
});

const deletedUserRow = (over: Record<string, unknown> = {}) => ({
  id: 'del-1',
  name: 'Marc Ancien',
  username: 'marcanc',
  email: 'marc@example.fr',
  phone: null,
  createdAt: new Date('2026-05-01T10:00:00.000Z'),
  banned: true,
  banReason: 'account_deleted',
  banExpires: null,
  role: 'user',
  profile: {
    deletedAt: new Date('2026-09-01T15:30:00.000Z'),
    clientEnabled: false,
    repairerEnabled: false,
    verificationLevel: 'NONE',
  },
  ...over,
});

describe('AdminUsersService - P5 Repairer Metrics & Deletion Metadata', () => {
  let prisma: any;
  let service: AdminUsersService;

  beforeEach(() => {
    prisma = {
      $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
      user: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      commande: {
        groupBy: vi.fn(),
      },
      review: {
        groupBy: vi.fn(),
      },
      adminAuditLog: {
        findMany: vi.fn(),
      },
    };
    service = new AdminUsersService(prisma, { repairerBlock: vi.fn() } as never, {} as never);
  });

  it('aggregates repairer metrics when type=reparateur', async () => {
    prisma.user.findMany.mockResolvedValue([repairerRow()]);
    prisma.user.count.mockResolvedValue(1);

    prisma.commande.groupBy.mockResolvedValue([
      {
        repairerUserId: 'rep-1',
        _count: { id: 18 },
        _sum: { repairCents: 245000 },
      },
    ]);

    prisma.review.groupBy.mockResolvedValue([
      {
        repairerUserId: 'rep-1',
        _avg: { rating: 4.8333 },
        _count: { id: 12 },
      },
    ]);

    const res = await service.list({ type: 'reparateur' });

    expect(prisma.commande.groupBy).toHaveBeenCalledWith({
      by: ['repairerUserId'],
      // Finished work between real accounts, not money taken: a repair still in escrow, a fixture
      // order and a demo account are not « réparations » nor « CA », and the CA is his quote
      // (`repairCents`), not the order total that also holds the shipping and the protection fee.
      where: {
        ...GENUINE_COLLECTED_COMMANDE_WHERE,
        status: 'PAID',
        step: 'RELEASED',
        repairerUserId: { in: ['rep-1'] },
      },
      _count: { id: true },
      _sum: { repairCents: true },
    });

    expect(prisma.review.groupBy).toHaveBeenCalledWith({
      by: ['repairerUserId'],
      where: {
        repairerUserId: { in: ['rep-1'] },
        deletedAt: null,
      },
      _avg: { rating: true },
      _count: { id: true },
    });

    expect(res.items[0]?.repairerMetrics).toEqual({
      rating: 4.8,
      reviewCount: 12,
      repairsCount: 18,
      totalRevenueCents: 245000,
    });
  });

  it('provides default zero metrics when a repairer has no orders or reviews', async () => {
    prisma.user.findMany.mockResolvedValue([repairerRow({ id: 'rep-new' })]);
    prisma.user.count.mockResolvedValue(1);
    prisma.commande.groupBy.mockResolvedValue([]);
    prisma.review.groupBy.mockResolvedValue([]);

    const res = await service.list({ type: 'reparateur' });

    expect(res.items[0]?.repairerMetrics).toEqual({
      rating: null,
      reviewCount: 0,
      repairsCount: 0,
      totalRevenueCents: 0,
    });
  });

  it('extracts deletion metadata from AdminAuditLog when accounts are deleted', async () => {
    prisma.user.findMany.mockResolvedValue([deletedUserRow()]);
    prisma.user.count.mockResolvedValue(1);

    prisma.adminAuditLog.findMany.mockResolvedValue([
      {
        targetId: 'del-1',
        actorEmail: 'admin@revime.fr',
        action: 'user.delete',
        detail: { reason: 'Demande RGPD confirmée' },
        // Written a few seconds after the soft delete: the date shown is the account's own
        // `Profile.deletedAt` (authoritative), not the audit row's.
        createdAt: new Date('2026-09-01T15:30:04.000Z'),
      },
    ]);

    const res = await service.list({ statut: 'supprime' });

    expect(prisma.adminAuditLog.findMany).toHaveBeenCalledWith({
      where: {
        action: 'user.delete',
        targetId: { in: ['del-1'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    expect(res.items[0]?.deletionMeta).toEqual({
      deletedAt: '2026-09-01T15:30:00.000Z',
      deletedReason: 'Demande RGPD confirmée',
      deletedBy: 'admin@revime.fr',
    });
  });

  it('handles deleted accounts with no audit log entry gracefully', async () => {
    prisma.user.findMany.mockResolvedValue([deletedUserRow({ id: 'del-2' })]);
    prisma.user.count.mockResolvedValue(1);
    prisma.adminAuditLog.findMany.mockResolvedValue([]);

    const res = await service.list({ statut: 'supprime' });

    expect(res.items[0]?.deletionMeta).toEqual({
      deletedAt: '2026-09-01T15:30:00.000Z',
      deletedReason: null,
      deletedBy: null,
    });
  });
});
