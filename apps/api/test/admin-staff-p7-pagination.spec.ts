import { describe, expect, it, vi } from 'vitest';
import { AdminStaffInvitationsService } from '../src/admin/admin-staff-invitations.service.js';
import { AppException } from '../src/common/app-exception.js';

describe('P7 Staff Management — Search, Pagination & Member Removal', () => {
  describe('listMembers pagination & search', () => {
    it('applies pagination parameters and filters by insensitive q', async () => {
      const mockUsers = [
        {
          id: 'u-1',
          email: 'alice@revime.fr',
          name: 'Alice Dupont',
          firstName: 'Alice',
          lastName: 'Dupont',
          role: 'super_admin',
          twoFactorEnabled: true,
          createdAt: new Date('2026-01-01T10:00:00.000Z'),
        },
      ];

      // The client's 52 members: the total is the count of the match, not the length of the page.
      const countMock = vi.fn().mockResolvedValue(52);
      const findManyMock = vi.fn().mockResolvedValue(mockUsers);
      const groupByMock = vi.fn().mockResolvedValue([
        {
          userId: 'u-1',
          _max: { createdAt: new Date('2026-10-12T14:30:00.000Z') },
        },
      ]);

      const prismaMock: any = {
        user: {
          count: countMock,
          findMany: findManyMock,
        },
        session: {
          groupBy: groupByMock,
        },
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      const result = await service.listMembers({ q: 'alice', page: 2, pageSize: 10 });

      expect(countMock).toHaveBeenCalledWith({
        where: expect.objectContaining({
          role: { in: expect.any(Array) },
          profile: { deletedAt: null },
          OR: [
            { name: { contains: 'alice', mode: 'insensitive' } },
            { email: { contains: 'alice', mode: 'insensitive' } },
            { firstName: { contains: 'alice', mode: 'insensitive' } },
            { lastName: { contains: 'alice', mode: 'insensitive' } },
          ],
        }),
      });

      expect(findManyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
          orderBy: { createdAt: 'desc' },
        }),
      );

      expect(result.page).toBe(2);
      expect(result.pageSize).toBe(10);
      expect(result.total).toBe(52);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'u-1',
        email: 'alice@revime.fr',
        name: 'Alice Dupont',
        firstName: 'Alice',
        lastName: 'Dupont',
        role: 'super_admin',
        twoFactorEnabled: true,
        createdAt: '2026-01-01T10:00:00.000Z',
        lastLoginAt: '2026-10-12T14:30:00.000Z',
      });
    });

    it('returns null for lastLoginAt when staff member has never logged in', async () => {
      const mockUsers = [
        {
          id: 'u-2',
          email: 'bob@revime.fr',
          name: 'Bob Martin',
          firstName: 'Bob',
          lastName: 'Martin',
          role: 'support',
          twoFactorEnabled: false,
          createdAt: new Date('2026-02-01T10:00:00.000Z'),
        },
      ];

      const prismaMock: any = {
        user: {
          count: vi.fn().mockResolvedValue(1),
          findMany: vi.fn().mockResolvedValue(mockUsers),
        },
        session: {
          groupBy: vi.fn().mockResolvedValue([]),
        },
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      const result = await service.listMembers();

      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(1);
      expect(result.items[0]!.lastLoginAt).toBeNull();
    });
  });

  describe('removeMember safeguards', () => {
    it('prohibits self-removal with 422 UNPROCESSABLE_ENTITY', async () => {
      const prismaMock: any = {};
      const service = new AdminStaffInvitationsService(prismaMock);

      await expect(service.removeMember('actor-1', 'actor-1')).rejects.toThrow(
        new AppException('UNPROCESSABLE_ENTITY', "Vous ne pouvez pas vous retirer vous-même de l'équipe."),
      );
    });

    it('throws 404 NOT_FOUND if target user does not exist', async () => {
      const prismaMock: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            user: {
              findUnique: vi.fn().mockResolvedValue(null),
            },
          };
          return cb(tx);
        }),
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      await expect(service.removeMember('actor-1', 'target-missing')).rejects.toThrow(
        new AppException('NOT_FOUND', 'Utilisateur introuvable.'),
      );
    });

    it('throws 422 if target account is soft-deleted', async () => {
      const prismaMock: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            user: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'target-deleted',
                role: 'admin',
                profile: { deletedAt: new Date() },
              }),
            },
          };
          return cb(tx);
        }),
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      await expect(service.removeMember('actor-1', 'target-deleted')).rejects.toThrow(
        new AppException('UNPROCESSABLE_ENTITY', "Ce compte est supprimé. Aucune modification n'est possible."),
      );
    });

    it('throws 422 if target account is not a staff member', async () => {
      const prismaMock: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            user: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'target-client',
                role: 'user',
                profile: { deletedAt: null },
              }),
            },
          };
          return cb(tx);
        }),
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      await expect(service.removeMember('actor-1', 'target-client')).rejects.toThrow(
        new AppException('UNPROCESSABLE_ENTITY', "Ce compte ne fait pas partie de l'équipe."),
      );
    });

    it('enforces platform rule of keeping at least 2 active Super Admins (throws 409 CONFLICT)', async () => {
      const prismaMock: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            user: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'target-superadmin',
                role: 'super_admin',
                profile: { deletedAt: null },
              }),
              count: vi.fn().mockResolvedValue(2), // only 2 active super admins left
            },
          };
          return cb(tx);
        }),
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      await expect(service.removeMember('actor-1', 'target-superadmin')).rejects.toThrow(
        new AppException('CONFLICT', 'La plateforme doit conserver au moins 2 Super Admins actifs en permanence.'),
      );
    });

    it('successfully revokes staff role (role: "user") and deletes sessions for non-superadmin', async () => {
      const updateMock = vi.fn().mockResolvedValue({ id: 'target-support', role: 'user' });
      const deleteSessionsMock = vi.fn().mockResolvedValue({ count: 3 });
      const releaseDisputesMock = vi.fn().mockResolvedValue({ count: 2 });
      const releaseReportsMock = vi.fn().mockResolvedValue({ count: 1 });

      const prismaMock: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            user: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'target-support',
                role: 'support',
                profile: { deletedAt: null },
              }),
              update: updateMock,
            },
            session: {
              deleteMany: deleteSessionsMock,
            },
            dispute: { updateMany: releaseDisputesMock },
            conversationReport: { updateMany: releaseReportsMock },
          };
          return cb(tx);
        }),
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      const res = await service.removeMember('actor-1', 'target-support');

      expect(res).toEqual({ ok: true });
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'target-support' },
        data: { role: 'user' },
      });
      expect(deleteSessionsMock).toHaveBeenCalledWith({
        where: { userId: 'target-support' },
      });
      // What was assigned to him must not stay assigned to a plain user (the release deleting an
      // account does, B16): « Assigné à » would name someone who can no longer act on it.
      expect(releaseDisputesMock).toHaveBeenCalledWith({
        where: { assignedToUserId: 'target-support' },
        data: { assignedToUserId: null, assignedAt: null },
      });
      expect(releaseReportsMock).toHaveBeenCalledWith({
        where: { assignedToUserId: 'target-support' },
        data: { assignedToUserId: null, assignedAt: null },
      });
    });

    it('successfully removes super_admin when more than 2 super admins exist', async () => {
      const updateMock = vi.fn().mockResolvedValue({ id: 'target-sa', role: 'user' });
      const deleteSessionsMock = vi.fn().mockResolvedValue({ count: 1 });

      const prismaMock: any = {
        $transaction: vi.fn().mockImplementation(async (cb) => {
          const tx = {
            user: {
              findUnique: vi.fn().mockResolvedValue({
                id: 'target-sa',
                role: 'super_admin',
                profile: { deletedAt: null },
              }),
              count: vi.fn().mockResolvedValue(3), // 3 active super admins
              update: updateMock,
            },
            session: {
              deleteMany: deleteSessionsMock,
            },
            dispute: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
            conversationReport: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
          };
          return cb(tx);
        }),
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      const res = await service.removeMember('actor-1', 'target-sa');

      expect(res).toEqual({ ok: true });
      expect(updateMock).toHaveBeenCalledWith({
        where: { id: 'target-sa' },
        data: { role: 'user' },
      });
      expect(deleteSessionsMock).toHaveBeenCalledWith({
        where: { userId: 'target-sa' },
      });
    });

    it('handles concurrency conflict P2034 by throwing 409 CONFLICT', async () => {
      const p2034Error = new Error('Write conflict');
      (p2034Error as any).code = 'P2034';

      const prismaMock: any = {
        $transaction: vi.fn().mockRejectedValue(p2034Error),
      };

      const service = new AdminStaffInvitationsService(prismaMock);
      await expect(service.removeMember('actor-1', 'target-concurrent')).rejects.toThrow(
        new AppException('CONFLICT', 'Une autre modification de rôle est en cours. Réessayez.'),
      );
    });
  });
});
