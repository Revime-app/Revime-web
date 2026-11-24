import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { AdminController } from '../src/admin/admin.controller.js';
import type { AdminAuditService } from '../src/admin/admin-audit.service.js';

describe('AdminController audit endpoints', () => {
  const auditService = {
    listWithFilters: vi.fn(),
    getAuditKpis: vi.fn(),
    exportCsv: vi.fn(),
    getAuditDetail: vi.fn(),
  } as unknown as AdminAuditService;

  const controller = Object.assign(Object.create(AdminController.prototype), {
    auditService,
  }) as AdminController;

  describe('GET /admin/audit (audit)', () => {
    it('parses query and delegates to auditService.listWithFilters', async () => {
      const mockResult = {
        items: [],
        total: 0,
        page: 1,
        pageSize: 25,
        totalPages: 0,
      };
      vi.mocked(auditService.listWithFilters).mockResolvedValue(mockResult);

      const query = {
        q: 'search-term',
        domain: 'COMMANDES',
        page: '2',
        limit: '50',
      };

      const result = await controller.audit(query);

      expect(auditService.listWithFilters).toHaveBeenCalledWith({
        q: 'search-term',
        domain: 'COMMANDES',
        page: 2,
        limit: 50,
      });
      expect(result).toBe(mockResult);
    });
  });

  describe('GET /admin/audit/kpis (auditKpis)', () => {
    it('delegates to auditService.getAuditKpis', async () => {
      const mockKpis = {
        actionsTodayCount: 12,
        uniqueActorsTodayCount: 3,
        topDomain: 'Commandes & Remboursements',
        totalActionsCount: 450,
      };
      vi.mocked(auditService.getAuditKpis).mockResolvedValue(mockKpis);

      const result = await controller.auditKpis();

      expect(auditService.getAuditKpis).toHaveBeenCalled();
      expect(result).toBe(mockKpis);
    });
  });

  describe('GET /admin/audit/export (auditExport)', () => {
    it('parses query, calls exportCsv, sets CSV headers and sends response', async () => {
      vi.mocked(auditService.exportCsv).mockResolvedValue({
        filename: 'journal-audit-revime-2026-10-16.csv',
        content: '\uFEFFheader1,header2\r\nval1,val2',
      });

      const res = {
        setHeader: vi.fn(),
        send: vi.fn(),
      } as unknown as Response;

      const query = { domain: 'USERS' };
      await controller.auditExport(query, res);

      expect(auditService.exportCsv).toHaveBeenCalledWith({
        domain: 'USERS',
        page: 1,
        limit: 25,
      });
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="journal-audit-revime-2026-10-16.csv"',
      );
      expect(res.send).toHaveBeenCalledWith('\uFEFFheader1,header2\r\nval1,val2');
    });
  });

  describe('GET /admin/audit/:id (auditDetail)', () => {
    it('delegates to auditService.getAuditDetail with id', async () => {
      const mockDetail = {
        id: 'entry-123',
        actorUserId: 'u-1',
        actorEmail: 'admin@revime.fr',
        actorRole: 'admin',
        action: 'commande.refund' as const,
        actionLabel: 'Remboursement commande',
        domain: 'COMMANDES' as const,
        targetType: 'Commande',
        targetId: 'cmd-999',
        statusCode: 200,
        detail: { amount: 50 },
        createdAt: '2026-10-16T10:00:00.000Z',
      };
      vi.mocked(auditService.getAuditDetail).mockResolvedValue(mockDetail);

      const result = await controller.auditDetail('entry-123');

      expect(auditService.getAuditDetail).toHaveBeenCalledWith('entry-123');
      expect(result).toBe(mockDetail);
    });
  });
});
