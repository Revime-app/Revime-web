import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { AppException } from '../src/common/app-exception.js';
import { DELETED_USER_NAME } from '@revime/shared';

function makePrismaMock() {
  const mock = {
    dispute: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    commande: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => (typeof cb === 'function' ? cb(mock) : Promise.all(cb))),
  } as any;
  return mock;
}

const mockDisputeRecord = {
  id: 'disp-p17',
  commandeId: 'cmd-p17',
  number: 17,
  status: 'OPEN',
  initiator: 'CLIENT',
  reason: 'Pièce défectueuse',
  assignedToUserId: null,
  assignedAt: null,
  createdAt: new Date('2026-10-14T10:00:00.000Z'),
  resolvedAt: null,
  verdict: null,
  commande: {
    id: 'cmd-p17',
    status: 'PAID',
    repairCents: 10000,
    totalCents: 12000,
    client: { name: 'Client Test', email: 'client@test.fr' },
    repairer: { name: 'Reparateur Test', email: 'rep@test.fr' },
  },
};

describe('AdminDisputesService P17 - Team Member Assignment & "Mes dossiers" Filter', () => {
  let prisma: any;
  let service: AdminDisputesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminDisputesService(prisma, {} as any, { announce: vi.fn() } as any);
  });

  describe('list filtering', () => {
    it('filters by assignedToUserId = currentUserId when onlyMine is true', async () => {
      prisma.dispute.count.mockResolvedValue(1);
      prisma.dispute.findMany.mockResolvedValue([mockDisputeRecord]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ onlyMine: true }, 'usr-current-admin');

      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedToUserId: 'usr-current-admin',
          }),
        }),
      );
      expect(prisma.dispute.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedToUserId: 'usr-current-admin',
          }),
        }),
      );
    });

    it('filters by assignedToUserId when assignedTo is provided', async () => {
      prisma.dispute.count.mockResolvedValue(1);
      prisma.dispute.findMany.mockResolvedValue([mockDisputeRecord]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ assignedTo: 'user-xyz' });

      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedToUserId: 'user-xyz',
          }),
        }),
      );
    });

    it('filters by assignedToUserId = null when assigned is unassigned', async () => {
      prisma.dispute.count.mockResolvedValue(1);
      prisma.dispute.findMany.mockResolvedValue([mockDisputeRecord]);
      prisma.user.findMany.mockResolvedValue([]);

      await service.list({ assigned: 'unassigned' });

      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedToUserId: null,
          }),
        }),
      );
    });
  });

  describe('assign', () => {
    it('assigns dispute to assigneeUserId when provided', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-p17',
        status: 'OPEN',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr-target',
        name: 'Collaborateur Test',
        role: 'support',
        profile: { deletedAt: null },
      });
      prisma.dispute.update.mockResolvedValue({ id: 'disp-p17' });

      const res = await service.assign('usr-admin', 'disp-p17', 'usr-target');

      expect(res).toEqual({ ok: true });
      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-p17' },
          data: expect.objectContaining({
            assignedToUserId: 'usr-target',
            status: 'IN_REVIEW',
          }),
        }),
      );
    });

    it('throws UNPROCESSABLE_ENTITY if assignee is soft-deleted by profile.deletedAt', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-p17',
        status: 'OPEN',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr-deleted',
        name: 'Ancien Collaborateur',
        profile: { deletedAt: new Date() },
      });

      await expect(service.assign('usr-admin', 'disp-p17', 'usr-deleted')).rejects.toThrow(
        AppException,
      );
    });

    it('throws UNPROCESSABLE_ENTITY if assignee is soft-deleted by DELETED_USER_NAME', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-p17',
        status: 'OPEN',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'usr-deleted-name',
        name: DELETED_USER_NAME,
        profile: { deletedAt: null },
      });

      await expect(service.assign('usr-admin', 'disp-p17', 'usr-deleted-name')).rejects.toThrow(
        AppException,
      );
    });
  });

  describe('listAssignees', () => {
    it('returns active staff members excluding soft-deleted users and sorted by name', async () => {
      const mockUsers = [
        {
          id: 'usr-1',
          name: 'Alice Admin',
          email: 'alice@revime.fr',
          role: 'admin',
        },
        {
          id: 'usr-2',
          name: 'Bob Support',
          email: 'bob@revime.fr',
          role: 'support',
        },
      ];
      prisma.user.findMany.mockResolvedValue(mockUsers);

      const assignees = await service.listAssignees();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          role: { in: ['super_admin', 'admin', 'support', 'finance'] },
          profile: { deletedAt: null },
          name: { not: DELETED_USER_NAME },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
        orderBy: { name: 'asc' },
      });

      expect(assignees).toEqual([
        {
          id: 'usr-1',
          name: 'Alice Admin',
          email: 'alice@revime.fr',
          role: 'admin',
        },
        {
          id: 'usr-2',
          name: 'Bob Support',
          email: 'bob@revime.fr',
          role: 'support',
        },
      ]);
    });
  });
});
