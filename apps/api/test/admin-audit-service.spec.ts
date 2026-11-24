import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ADMIN_AUDIT_DOMAINS } from '@revime/shared';
import { AdminAuditService } from '../src/admin/admin-audit.service.js';

describe('AdminAuditService (F4 filtering, KPIs, detail & export)', () => {
  let service: AdminAuditService;
  let mockPrisma: {
    adminAuditLog: {
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      groupBy: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    mockPrisma = {
      adminAuditLog: {
        findMany: vi.fn(),
        count: vi.fn(),
        findUnique: vi.fn(),
        groupBy: vi.fn(),
      },
    };
    service = new AdminAuditService(mockPrisma as never);
  });

  describe('listWithFilters', () => {
    it('applies search, domain, and date range filters', async () => {
      mockPrisma.adminAuditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          actorUserId: 'u1',
          actorEmail: 'staff@revime.fr',
          actorRole: 'ADMIN',
          action: 'commande.refund',
          targetType: 'Commande',
          targetId: 'cmd-123',
          statusCode: 200,
          detail: { motif: 'CLIENT_CANCELLED' },
          createdAt: new Date('2026-10-16T09:00:00.000Z'),
        },
      ]);
      mockPrisma.adminAuditLog.count.mockResolvedValue(1);

      const result = await service.listWithFilters({
        q: 'cmd-123',
        domain: 'COMMANDES',
        startDate: '2026-10-01T00:00:00.000Z',
        endDate: '2026-10-16T23:59:59.999Z',
        page: 1,
        limit: 25,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'log-1',
        actorUserId: 'u1',
        actorEmail: 'staff@revime.fr',
        actorRole: 'ADMIN',
        action: 'commande.refund',
        actionLabel: 'Remboursement',
        domain: 'COMMANDES',
        targetType: 'Commande',
        targetId: 'cmd-123',
        statusCode: 200,
        detail: { motif: 'CLIENT_CANCELLED' },
        createdAt: '2026-10-16T09:00:00.000Z',
      });
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(25);
      expect(result.totalPages).toBe(1);

      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { actorEmail: { contains: 'cmd-123', mode: 'insensitive' } },
            { targetId: { contains: 'cmd-123', mode: 'insensitive' } },
            { action: { contains: 'cmd-123', mode: 'insensitive' } },
          ],
          // The taxonomy itself, not a copy of it: a copy went stale the day an action was added.
          action: { in: ADMIN_AUDIT_DOMAINS.COMMANDES.actions },
          createdAt: {
            gte: new Date('2026-10-01T00:00:00.000Z'),
            lte: new Date('2026-10-16T23:59:59.999Z'),
          },
        },
        take: 25,
        skip: 0,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('filters by statusFamily range (2xx, 4xx, 5xx)', async () => {
      mockPrisma.adminAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.adminAuditLog.count.mockResolvedValue(0);

      await service.listWithFilters({ statusFamily: '2xx', page: 2, limit: 10 });
      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            statusCode: { gte: 200, lte: 299 },
          }),
          take: 10,
          skip: 10,
        }),
      );

      await service.listWithFilters({ statusFamily: '4xx' });
      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            statusCode: { gte: 400, lte: 499 },
          }),
        }),
      );

      await service.listWithFilters({ statusFamily: '5xx' });
      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            statusCode: { gte: 500, lte: 599 },
          }),
        }),
      );
    });

    it('filters by exact statusCode when specified (even if statusFamily is also present)', async () => {
      mockPrisma.adminAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.adminAuditLog.count.mockResolvedValue(0);

      await service.listWithFilters({ statusCode: 404, statusFamily: '4xx' });
      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            statusCode: { equals: 404 },
          }),
        }),
      );
    });

    it('filters by actorEmail, targetType, targetId, and specific action', async () => {
      mockPrisma.adminAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.adminAuditLog.count.mockResolvedValue(0);

      await service.listWithFilters({
        actorEmail: 'admin@revime.fr',
        targetType: 'User',
        targetId: 'usr-456',
        action: 'user.suspend',
      });

      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            actorEmail: { contains: 'admin@revime.fr', mode: 'insensitive' },
            targetType: { equals: 'User' },
            targetId: { contains: 'usr-456', mode: 'insensitive' },
            action: { equals: 'user.suspend' },
          },
        }),
      );
    });

    it('returns totalPages = 0 when total is 0', async () => {
      mockPrisma.adminAuditLog.findMany.mockResolvedValue([]);
      mockPrisma.adminAuditLog.count.mockResolvedValue(0);

      const result = await service.listWithFilters({});
      expect(result.total).toBe(0);
      expect(result.totalPages).toBe(0);
      expect(result.items).toEqual([]);
    });
  });

  describe('getAuditKpis', () => {
    it('computes daily activity, total actions, unique actors, and top domain from today', async () => {
      mockPrisma.adminAuditLog.count
        .mockResolvedValueOnce(35) // actionsTodayCount
        .mockResolvedValueOnce(1200); // totalActionsCount
      mockPrisma.adminAuditLog.groupBy.mockResolvedValue([
        { actorEmail: 'a@revime.fr' },
        { actorEmail: 'b@revime.fr' },
      ]);
      mockPrisma.adminAuditLog.findMany.mockResolvedValue([
        { action: 'commande.refund' },
        { action: 'commande.refund' },
        { action: 'user.suspend' },
      ]);

      const kpis = await service.getAuditKpis();
      expect(kpis.actionsTodayCount).toBe(35);
      expect(kpis.uniqueActorsTodayCount).toBe(2);
      expect(kpis.totalActionsCount).toBe(1200);
      expect(kpis.topDomain).toBe('Commandes & Remboursements');
    });

    it('counts « today » from Paris midnight, not the server clock (RU-24)', async () => {
      vi.useFakeTimers();
      try {
        // 22:30 UTC on 20 Oct is 00:30 on 21 Oct in Paris (CEST): the day began at 22:00 UTC.
        vi.setSystemTime(new Date('2026-10-20T22:30:00Z'));
        mockPrisma.adminAuditLog.count.mockResolvedValue(0);
        mockPrisma.adminAuditLog.groupBy.mockResolvedValue([]);
        mockPrisma.adminAuditLog.findMany.mockResolvedValue([]);

        await service.getAuditKpis();

        const expected = new Date('2026-10-20T22:00:00.000Z');
        expect(mockPrisma.adminAuditLog.count).toHaveBeenNthCalledWith(1, { where: { createdAt: { gte: expected } } });
        expect(mockPrisma.adminAuditLog.groupBy).toHaveBeenCalledWith(
          expect.objectContaining({ where: { createdAt: { gte: expected } } }),
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('falls back to recent 100 actions when no actions occurred today', async () => {
      mockPrisma.adminAuditLog.count
        .mockResolvedValueOnce(0) // actionsTodayCount
        .mockResolvedValueOnce(45); // totalActionsCount
      mockPrisma.adminAuditLog.groupBy.mockResolvedValue([]);
      // First findMany for today returns empty
      mockPrisma.adminAuditLog.findMany
        .mockResolvedValueOnce([])
        // Second findMany for recent 100
        .mockResolvedValueOnce([
          { action: 'report.resolve' },
          { action: 'report.assign' },
        ]);

      const kpis = await service.getAuditKpis();
      expect(kpis.actionsTodayCount).toBe(0);
      expect(kpis.uniqueActorsTodayCount).toBe(0);
      expect(kpis.totalActionsCount).toBe(45);
      expect(kpis.topDomain).toBe('Litiges & Signalements');
      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          take: 100,
          orderBy: { createdAt: 'desc' },
          select: { action: true },
        }),
      );
    });

    it('returns "Aucune activité" when there are no actions recorded at all', async () => {
      mockPrisma.adminAuditLog.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.adminAuditLog.groupBy.mockResolvedValue([]);
      mockPrisma.adminAuditLog.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const kpis = await service.getAuditKpis();
      expect(kpis.actionsTodayCount).toBe(0);
      expect(kpis.uniqueActorsTodayCount).toBe(0);
      expect(kpis.totalActionsCount).toBe(0);
      expect(kpis.topDomain).toBe('Aucune activité');
    });
  });

  describe('getAuditDetail', () => {
    it('returns mapped detailed entry when found', async () => {
      mockPrisma.adminAuditLog.findUnique.mockResolvedValue({
        id: 'log-42',
        actorUserId: 'u2',
        actorEmail: 'moderator@revime.fr',
        actorRole: 'SUPPORT',
        action: 'report.resolve',
        targetType: 'Report',
        targetId: 'rep-99',
        statusCode: 200,
        detail: { note: 'Resolved amicably' },
        createdAt: new Date('2026-10-16T08:30:00.000Z'),
      });

      const entry = await service.getAuditDetail('log-42');
      expect(entry).toEqual({
        id: 'log-42',
        actorUserId: 'u2',
        actorEmail: 'moderator@revime.fr',
        actorRole: 'SUPPORT',
        action: 'report.resolve',
        actionLabel: "Clôture d'un signalement",
        domain: 'LITIGES_SIGNALEMENTS',
        targetType: 'Report',
        targetId: 'rep-99',
        statusCode: 200,
        detail: { note: 'Resolved amicably' },
        createdAt: '2026-10-16T08:30:00.000Z',
      });
      expect(mockPrisma.adminAuditLog.findUnique).toHaveBeenCalledWith({
        where: { id: 'log-42' },
      });
    });

    it('throws NotFoundException when entry does not exist', async () => {
      mockPrisma.adminAuditLog.findUnique.mockResolvedValue(null);

      await expect(service.getAuditDetail('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getAuditDetail('non-existent')).rejects.toThrow(
        'Entrée de journal introuvable.',
      );
    });
  });

  describe('exportCsv', () => {
    it('generates formatted CSV with BOM, header, and escapes special characters and formula injection', async () => {
      mockPrisma.adminAuditLog.findMany.mockResolvedValue([
        {
          id: 'log-1',
          actorUserId: 'u1',
          actorEmail: 'staff@revime.fr',
          actorRole: 'ADMIN',
          action: 'user.suspend',
          targetType: 'User',
          targetId: 'usr-99',
          statusCode: 200,
          detail: { reason: 'Motif avec, virgule et "guillemets"' },
          createdAt: new Date('2026-10-16T10:15:00.000Z'),
        },
        {
          id: 'log-2',
          actorUserId: null,
          actorEmail: '=danger@revime.fr',
          actorRole: null,
          action: 'commande.refund',
          targetType: null,
          targetId: '+cmd-formula',
          statusCode: 422,
          detail: null,
          createdAt: new Date('2026-10-16T11:00:00.000Z'),
        },
      ]);

      const exportResult = await service.exportCsv({
        domain: 'USERS',
      });

      expect(exportResult.filename).toMatch(/^journal-audit-revime-\d{4}-\d{2}-\d{2}\.csv$/);
      expect(exportResult.content.startsWith('\uFEFF')).toBe(true);

      const lines = exportResult.content.replace(/^\uFEFF/, '').split('\r\n');
      expect(lines[0]).toBe(
        'Date / Heure,Opérateur,Rôle,Domaine,Action,Code Action,Type Cible,ID Cible,Statut HTTP,Détails',
      );

      // First row checks
      expect(lines[1]).toContain('2026-10-16T10:15:00.000Z');
      expect(lines[1]).toContain('staff@revime.fr');
      expect(lines[1]).toContain('ADMIN');
      expect(lines[1]).toContain('Utilisateurs & Réparateurs');
      expect(lines[1]).toContain('Suspension');
      expect(lines[1]).toContain('user.suspend');
      expect(lines[1]).toContain('User');
      expect(lines[1]).toContain('usr-99');
      expect(lines[1]).toContain('200');
      // Detail JSON escaped: double quotes and comma
      expect(lines[1]).toContain('"{""reason"":""Motif avec, virgule et \\""guillemets\\""""}"');

      // Second row checks: formula injection defense with leading apostrophe
      expect(lines[2]).toContain("'=danger@revime.fr");
      expect(lines[2]).toContain("'+cmd-formula");
      expect(lines[2]).toContain('422');

      // Verify findMany was called with take: 5000 and query filters
      expect(mockPrisma.adminAuditLog.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          action: {
            in: expect.arrayContaining(['user.suspend']),
          },
        }),
        take: 5000,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
