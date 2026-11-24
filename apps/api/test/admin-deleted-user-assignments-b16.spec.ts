import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { ModerationAdminService } from '../src/admin/moderation-admin.service.js';
import { UsersService } from '../src/users/users.service.js';
import { DELETED_USER_NAME } from '@revime/shared';

describe('Bug B16: Deleted user assignments on litiges and signalements', () => {
  describe('UsersService.deleteAccount unassigns active disputes and reports', () => {
    it('clears assignedToUserId and assignedAt on disputes and conversation reports in deletion transaction', async () => {
      const mockTx = {
        user: {
          findUnique: vi.fn().mockResolvedValue({ role: 'admin' }),
          update: vi.fn().mockResolvedValue({}),
        },
        profile: {
          update: vi.fn().mockResolvedValue({}),
        },
        repairerProfile: {
          updateMany: vi.fn().mockResolvedValue({}),
        },
        session: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        account: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        verificationAttempt: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        dispute: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        conversationReport: {
          updateMany: vi.fn().mockResolvedValue({ count: 3 }),
        },
        favoriteRepairer: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        favoriteDemande: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        repairerCategory: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        repairerAvailability: {
          deleteMany: vi.fn().mockResolvedValue({}),
        },
        offer: {
          updateMany: vi.fn().mockResolvedValue({}),
        },
        demande: {
          updateMany: vi.fn().mockResolvedValue({}),
        },
        quoteRequest: {
          updateMany: vi.fn().mockResolvedValue({}),
        },
      };

      const prisma = {
        profile: {
          findFirst: vi.fn().mockResolvedValue({ userId: 'admin-del', deletedAt: null }),
        },
        commande: {
          count: vi.fn().mockResolvedValue(0),
        },
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockTx)),
      } as any;

      const usersService = new UsersService(prisma, {} as any);
      await usersService.deleteAccount('admin-del');

      // Assert that dispute assignments were cleared
      expect(mockTx.dispute.updateMany).toHaveBeenCalledWith({
        where: { assignedToUserId: 'admin-del' },
        data: { assignedToUserId: null, assignedAt: null },
      });

      // Assert that conversationReport assignments were cleared
      expect(mockTx.conversationReport.updateMany).toHaveBeenCalledWith({
        where: { assignedToUserId: 'admin-del' },
        data: { assignedToUserId: null, assignedAt: null },
      });
    });
  });

  describe('AdminDisputesService assignment guards and display of a deleted assignee', () => {
    let service: AdminDisputesService;
    let prisma: any;

    beforeEach(() => {
      prisma = {
        dispute: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
          count: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        user: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
        },
        commande: {
          findUnique: vi.fn(),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      service = new AdminDisputesService(prisma, {} as any, {} as any);
    });

    it('rejects assigning a dispute to a deleted admin user', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
      });
      // The user is deleted
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-deleted',
        name: DELETED_USER_NAME,
        profile: { deletedAt: new Date() },
      });

      await expect(
        service.assign('actor-1', 'disp-1', 'admin-deleted'),
      ).rejects.toThrow("Impossible d'assigner à un utilisateur supprimé.");
    });

    it('shows as unassigned, without writing, disputes assigned to deleted users in list()', async () => {
      prisma.dispute.findMany.mockResolvedValue([
        {
          id: 'disp-1',
          number: 101,
          commandeId: 'cmd-1',
          status: 'OPEN',
          assignedToUserId: 'admin-deleted',
          assignedAt: new Date(),
          commande: { client: { name: 'Alice' }, repairer: { name: 'Bob' } },
        },
      ]);
      prisma.dispute.count.mockResolvedValue(1);

      // User lookup reveals the user is deleted
      prisma.user.findMany.mockResolvedValue([
        {
          id: 'admin-deleted',
          name: DELETED_USER_NAME,
          email: 'deleted+admin-del@revime.invalid',
          profile: { deletedAt: new Date() },
        },
      ]);

      const res = await service.list({});
      expect(res.items).toHaveLength(1);
      // Must NOT be assigned to deleted user!
      expect(res.items[0]!.assignedToUserId).toBeNull();
      expect(res.items[0]!.assignedToName).toBeNull();

      // A read does not write: deletion already released the assignment in its own transaction
      expect(prisma.dispute.updateMany).not.toHaveBeenCalled();
    });

    it('shows as unassigned, without writing, a dispute assigned to a deleted user in getDossier()', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        number: 101,
        commandeId: 'cmd-1',
        status: 'OPEN',
        assignedToUserId: 'admin-deleted',
        assignedAt: new Date(),
        commande: {
          id: 'cmd-1',
          client: { id: 'c1', name: 'Alice', email: 'alice@test.fr' },
          repairer: { id: 'r1', name: 'Bob', email: 'bob@test.fr' },
        },
      });

      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-deleted',
        name: DELETED_USER_NAME,
        profile: { deletedAt: new Date() },
      });

      const res = await service.getDossier('disp-1');
      expect(res.dispute.assignedToUserId).toBeNull();

      expect(prisma.dispute.update).not.toHaveBeenCalled();
    });

    it('shows as unassigned, without writing, a dispute assigned to a missing / hard-deleted user in getDossier()', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-2',
        number: 102,
        commandeId: 'cmd-2',
        status: 'OPEN',
        assignedToUserId: 'orphaned-operator-id',
        assignedAt: new Date(),
        commande: {
          id: 'cmd-2',
          client: { id: 'c1', name: 'Alice', email: 'alice@test.fr' },
          repairer: { id: 'r1', name: 'Bob', email: 'bob@test.fr' },
        },
      });

      // User lookup returns null (hard-deleted / erased)
      prisma.user.findUnique.mockResolvedValue(null);

      const res = await service.getDossier('disp-2');
      expect(res.dispute.assignedToUserId).toBeNull();
      expect(res.dispute.assignedToName).toBeNull();

      expect(prisma.dispute.update).not.toHaveBeenCalled();
    });
  });

  describe('ModerationAdminService assignment guards and display of a deleted assignee', () => {
    let service: ModerationAdminService;
    let prisma: any;

    beforeEach(() => {
      prisma = {
        conversationReport: {
          findMany: vi.fn(),
          findUnique: vi.fn(),
          count: vi.fn(),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          update: vi.fn().mockResolvedValue({}),
        },
        user: {
          findUnique: vi.fn(),
          findMany: vi.fn(),
        },
      };
      service = new ModerationAdminService(prisma);
    });

    it('rejects assigning a report to a deleted user in assignReport()', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-deleted',
        name: DELETED_USER_NAME,
        profile: { deletedAt: new Date() },
      });

      await expect(
        service.assignReport('rep-1', 'admin-deleted'),
      ).rejects.toThrow("Impossible d'assigner à un utilisateur supprimé.");
    });

    it('shows as unassigned, without writing, reports assigned to deleted users in listReports()', async () => {
      prisma.conversationReport.findMany.mockResolvedValue([
        {
          id: 'rep-1',
          conversationId: 'conv-1',
          reason: 'SPAM',
          assignedToUserId: 'admin-deleted',
          createdAt: new Date(),
          reporter: { id: 'u1', name: 'User 1', email: 'u1@test.fr' },
          reported: { id: 'u2', name: 'User 2', email: 'u2@test.fr' },
          conversation: { deletedAt: null, demande: null },
        },
      ]);
      prisma.conversationReport.count.mockResolvedValue(1);

      prisma.user.findMany.mockResolvedValue([
        {
          id: 'admin-deleted',
          name: DELETED_USER_NAME,
          email: 'deleted@revime.invalid',
          profile: { deletedAt: new Date() },
        },
      ]);

      const res = await service.listReports({});
      expect(res.items).toHaveLength(1);
      expect(res.items[0]!.assignedTo).toBeNull();

      expect(prisma.conversationReport.updateMany).not.toHaveBeenCalled();
    });

    it('shows as unassigned, without writing, a report assigned to a deleted user in getReportDetail()', async () => {
      prisma.conversationReport.findUnique.mockResolvedValue({
        id: 'rep-1',
        conversationId: 'conv-1',
        reason: 'SPAM',
        assignedToUserId: 'admin-deleted',
        createdAt: new Date(),
        reporterUserId: 'u1',
        reportedUserId: 'u2',
        reporter: { id: 'u1', name: 'User 1', email: 'u1@test.fr', createdAt: new Date() },
        reported: { id: 'u2', name: 'User 2', email: 'u2@test.fr', createdAt: new Date() },
        conversation: { deletedAt: null, demande: null, messages: [] },
      });
      prisma.conversationReport.count.mockResolvedValue(0);

      prisma.user.findMany.mockResolvedValue([
        {
          id: 'admin-deleted',
          name: DELETED_USER_NAME,
          email: 'deleted@revime.invalid',
          profile: { deletedAt: new Date() },
        },
      ]);

      const res = await service.getReportDetail('rep-1');
      expect(res.assignedTo).toBeNull();

      expect(prisma.conversationReport.update).not.toHaveBeenCalled();
    });

    it('shows as unassigned, without writing, a report assigned to a missing / hard-deleted user in getReportDetail()', async () => {
      prisma.conversationReport.findUnique.mockResolvedValue({
        id: 'rep-2',
        conversationId: 'c2',
        reason: 'SPAM',
        assignedToUserId: 'orphaned-operator-id',
        assignedAt: new Date(),
        resolvedByUserId: null,
        resolvedAt: null,
        resolutionVerdict: null,
        resolutionNote: null,
        createdAt: new Date(),
        reporterUserId: 'u1',
        reportedUserId: 'u2',
        reporter: { id: 'u1', name: 'User 1', email: 'u1@test.fr', createdAt: new Date() },
        reported: { id: 'u2', name: 'User 2', email: 'u2@test.fr', createdAt: new Date() },
        conversation: { deletedAt: null, demande: null, messages: [] },
      });
      prisma.conversationReport.count.mockResolvedValue(0);

      // User lookup returns empty array (operator hard-deleted / not found)
      prisma.user.findMany.mockResolvedValue([]);

      const res = await service.getReportDetail('rep-2');
      expect(res.assignedTo).toBeNull();

      expect(prisma.conversationReport.update).not.toHaveBeenCalled();
    });
  });
});
