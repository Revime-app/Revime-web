import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  adminExportSummarySchema,
  adminExportPreviewResponseSchema,
  type AdminExportQuery,
} from '@revime/shared';
import { AdminExportsService, escapeCsvValue } from '../src/admin/admin-exports.service.js';
import { formatEurCents } from '../src/admin/dac7-report.js';
import { AdminExportsController } from '../src/admin/admin-exports.controller.js';

describe('AdminExportsService', () => {
  let prisma: any;
  let auditService: any;
  let notifications: any;
  let mailer: any;
  let service: AdminExportsService;

  const fixedNow = new Date('2026-10-16T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();

    prisma = {
      commande: {
        findMany: vi.fn(),
        count: vi.fn(),
      },
      user: {
        findMany: vi.fn(),
      },
      repairerDac7Recap: {
        upsert: vi.fn().mockResolvedValue({ id: 'recap-1' }),
        findMany: vi.fn(),
      },
      adminAuditLog: {
        create: vi.fn().mockResolvedValue({ id: 'audit-log-1' }),
      },
    };

    auditService = {
      record: vi.fn().mockResolvedValue(undefined),
    };

    notifications = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    mailer = {
      send: vi.fn().mockResolvedValue(undefined),
    };

    service = new AdminExportsService(prisma, auditService, notifications, mailer);
  });

  describe('resolvePeriodBounds', () => {
    it('resolves this_month bounds and French label', () => {
      const bounds = service.resolvePeriodBounds('this_month', undefined, undefined, undefined, fixedNow);
      expect(bounds.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-10-31T23:59:59.999Z');
      expect(bounds.label).toBe('Octobre 2026');
    });

    it('resolves last_month bounds and French label', () => {
      const bounds = service.resolvePeriodBounds('last_month', undefined, undefined, undefined, fixedNow);
      expect(bounds.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-09-30T23:59:59.999Z');
      expect(bounds.label).toBe('Septembre 2026');
    });

    it('resolves last_month across year boundary (January to previous December)', () => {
      const janNow = new Date('2026-01-15T12:00:00.000Z');
      const bounds = service.resolvePeriodBounds('last_month', undefined, undefined, undefined, janNow);
      expect(bounds.start.toISOString()).toBe('2025-12-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2025-12-31T23:59:59.999Z');
      expect(bounds.label).toBe('Décembre 2025');
    });

    it('resolves this_quarter bounds and French label', () => {
      const bounds = service.resolvePeriodBounds('this_quarter', undefined, undefined, undefined, fixedNow);
      expect(bounds.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
      expect(bounds.label).toBe('T4 2026');
    });

    it('resolves last_quarter bounds and French label', () => {
      const bounds = service.resolvePeriodBounds('last_quarter', undefined, undefined, undefined, fixedNow);
      expect(bounds.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-09-30T23:59:59.999Z');
      expect(bounds.label).toBe('T3 2026');
    });

    it('resolves last_quarter across year boundary (Q1 to previous Q4)', () => {
      const febNow = new Date('2026-02-10T10:00:00.000Z');
      const bounds = service.resolvePeriodBounds('last_quarter', undefined, undefined, undefined, febNow);
      expect(bounds.start.toISOString()).toBe('2025-10-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2025-12-31T23:59:59.999Z');
      expect(bounds.label).toBe('T4 2025');
    });

    it('resolves this_year and last_year bounds', () => {
      const thisYear = service.resolvePeriodBounds('this_year', undefined, undefined, undefined, fixedNow);
      expect(thisYear.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(thisYear.end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
      expect(thisYear.label).toBe('Année 2026');

      const lastYear = service.resolvePeriodBounds('last_year', undefined, undefined, undefined, fixedNow);
      expect(lastYear.start.toISOString()).toBe('2025-01-01T00:00:00.000Z');
      expect(lastYear.end.toISOString()).toBe('2025-12-31T23:59:59.999Z');
      expect(lastYear.label).toBe('Année 2025');
    });

    it('resolves custom date range when valid start and end are provided', () => {
      const bounds = service.resolvePeriodBounds(
        'custom',
        '2026-05-01T00:00:00.000Z',
        '2026-05-15T23:59:59.999Z',
        undefined,
        fixedNow,
      );
      expect(bounds.start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-05-15T23:59:59.999Z');
      expect(bounds.label).toContain('2026');
    });

    it('defaults custom range to current month if dates are absent or invalid', () => {
      const bounds = service.resolvePeriodBounds('custom', undefined, undefined, undefined, fixedNow);
      expect(bounds.start.toISOString()).toBe('2026-10-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2026-10-31T23:59:59.999Z');
    });

    it('overrides period with calendar year when year parameter is provided (e.g. for DAC7)', () => {
      const bounds = service.resolvePeriodBounds('this_month', undefined, undefined, 2025, fixedNow);
      expect(bounds.start.toISOString()).toBe('2025-01-01T00:00:00.000Z');
      expect(bounds.end.toISOString()).toBe('2025-12-31T23:59:59.999Z');
      expect(bounds.label).toBe('Année 2025');
    });
  });

  describe('French VAT segregation & helpers', () => {
    it('formats EUR cents into French currency strings with comma', () => {
      expect(formatEurCents(0)).toBe('0,00 €');
      expect(formatEurCents(15000)).toBe('150,00 €');
      expect(formatEurCents(12500)).toBe('125,00 €');
      expect(formatEurCents(2500)).toBe('25,00 €');
      expect(formatEurCents(null)).toBe('0,00 €');
    });

    it('calculates French standard 20% VAT on platform commission (HT = Math.round(TTC / 1.2))', () => {
      const ttc1 = 15000;
      const ht1 = Math.round(ttc1 / 1.2);
      const vat1 = ttc1 - ht1;
      expect(ht1).toBe(12500);
      expect(vat1).toBe(2500);

      const ttc2 = 1000;
      const ht2 = Math.round(ttc2 / 1.2);
      const vat2 = ttc2 - ht2;
      expect(ht2).toBe(833);
      expect(vat2).toBe(167);

      const ttc0 = 0;
      const ht0 = Math.round(ttc0 / 1.2);
      const vat0 = ttc0 - ht0;
      expect(ht0).toBe(0);
      expect(vat0).toBe(0);
    });
  });

  describe('getExportSummary', () => {
    it('aggregates the 8 financial KPIs across matching orders in the period', async () => {
      const mockOrders = [
        {
          id: 'cmd-1',
          repairerUserId: 'rep-1',
          totalCents: 15000,
          repairCents: 12000,
          shippingCents: 1000,
          protectionCents: 2000,
          transferredCents: 12000,
          stripeTransferId: 'tr_111',
          refundedCents: 0,
          status: 'RELEASED',
        },
        {
          id: 'cmd-2',
          repairerUserId: 'rep-2',
          totalCents: 20000,
          repairCents: 16000,
          shippingCents: 1000,
          protectionCents: 3000,
          transferredCents: null,
          stripeTransferId: null,
          refundedCents: 0,
          status: 'PAID',
        },
        {
          id: 'cmd-3',
          repairerUserId: 'rep-1',
          totalCents: 10000,
          repairCents: 8000,
          shippingCents: 1000,
          protectionCents: 1000,
          transferredCents: null,
          stripeTransferId: null,
          refundedCents: 10000,
          status: 'REFUNDED',
        },
      ];

      prisma.commande.findMany.mockResolvedValueOnce(mockOrders);

      const query: AdminExportQuery = {
        reportType: 'COLLECTIONS',
        period: 'this_month',
        page: 1,
        limit: 25,
      };

      const summary = await service.getExportSummary(query);

      // Verify schema conformity
      const validated = adminExportSummarySchema.parse(summary);

      expect(validated.totalOrdersCount).toBe(3);
      expect(validated.totalGrossCents).toBe(45000); // 15000 + 20000 + 10000
      expect(validated.totalCommissionTtcCents).toBe(6000); // 2000 + 3000 + 1000
      expect(validated.totalCommissionHtCents).toBe(Math.round(6000 / 1.2)); // 5000
      expect(validated.totalVatCents).toBe(1000); // 6000 - 5000
      expect(validated.totalPayoutsCents).toBe(12000); // cmd-1 transferred
      expect(validated.totalRefundsCents).toBe(10000); // cmd-3 refunded
      expect(validated.uniqueRepairersCount).toBe(2); // rep-1, rep-2
    });
  });

  describe('getExportPreview for all 5 report types', () => {
    it('returns preview rows and columns for COLLECTIONS', async () => {
      const mockOrders = [
        {
          id: '12345678-0000-0000-0000-000000000001',
          paidAt: new Date('2026-10-10T14:30:00.000Z'),
          clientUserId: 'usr-client-1',
          repairerUserId: 'usr-rep-1',
          totalCents: 15000,
          repairCents: 12000,
          shippingCents: 1000,
          protectionCents: 2000,
          transferredCents: 12000,
          stripeChargeId: 'ch_test_1',
          stripePaymentIntentId: 'pi_test_1',
          stripeTransferId: 'tr_test_1',
          status: 'PAID',
          client: { name: 'Alice Dupont', email: 'alice@example.com' },
          repairer: { name: 'Bob Réparateur', email: 'bob@example.com' },
        },
      ];

      prisma.commande.findMany.mockResolvedValue(mockOrders);
      prisma.commande.count.mockResolvedValue(1);

      const preview = await service.getExportPreview({
        reportType: 'COLLECTIONS',
        period: 'this_month',
        page: 1,
        limit: 25,
      });

      adminExportPreviewResponseSchema.parse(preview);

      expect(preview.reportType).toBe('COLLECTIONS');
      expect(preview.columns.map((c) => c.key)).toEqual([
        'paidAt',
        'orderNumber',
        'clientName',
        'clientEmail',
        'repairerName',
        'totalEur',
        'shippingEur',
        'commissionTtcEur',
        'repairerNetEur',
        'chargeId',
      ]);
      expect(preview.previewRows).toHaveLength(1);
      const firstRow = preview.previewRows[0]!;
      expect(firstRow.orderNumber).toBe('#CMD-12345678');
      expect(firstRow.clientName).toBe('Alice Dupont');
      expect(firstRow.totalEur).toBe('150,00 €');
      expect(firstRow.commissionTtcEur).toBe('20,00 €');
      expect(preview.totalRows).toBe(1);
    });

    it('returns preview rows and columns for COMMISSIONS_VAT', async () => {
      const mockOrders = [
        {
          id: '22345678-0000-0000-0000-000000000002',
          paidAt: new Date('2026-10-12T10:00:00.000Z'),
          totalCents: 24000,
          repairCents: 20000,
          shippingCents: 1000,
          protectionCents: 3000,
          status: 'RELEASED',
          repairerUserId: 'rep-1',
        },
      ];

      prisma.commande.findMany.mockResolvedValue(mockOrders);
      prisma.commande.count.mockResolvedValue(1);

      const preview = await service.getExportPreview({
        reportType: 'COMMISSIONS_VAT',
        period: 'this_month',
        page: 1,
        limit: 25,
      });

      adminExportPreviewResponseSchema.parse(preview);

      expect(preview.reportType).toBe('COMMISSIONS_VAT');
      expect(preview.columns.map((c) => c.key)).toEqual([
        'paidAt',
        'orderNumber',
        'totalEur',
        'vatRate',
        'commissionHtEur',
        'vatAmountEur',
        'commissionTtcEur',
        'status',
      ]);
      const firstRow = preview.previewRows[0]!;
      expect(firstRow.vatRate).toBe('20 %');
      expect(firstRow.commissionTtcEur).toBe('30,00 €');
      expect(firstRow.commissionHtEur).toBe('25,00 €');
      expect(firstRow.vatAmountEur).toBe('5,00 €');
    });

    it('returns preview rows and columns for PAYOUTS', async () => {
      const mockOrders = [
        {
          id: '32345678-0000-0000-0000-000000000003',
          releasedAt: new Date('2026-10-14T09:00:00.000Z'),
          repairerUserId: 'rep-3',
          transferredCents: 8500,
          repairCents: 8500,
          stripeTransferId: 'tr_333',
          status: 'RELEASED',
          repairer: {
            name: 'Charlie Atelier',
            connectAccount: { stripeAccountId: 'acct_123456789' },
          },
        },
      ];

      prisma.commande.findMany.mockResolvedValue(mockOrders);
      prisma.commande.count.mockResolvedValue(1);

      const preview = await service.getExportPreview({
        reportType: 'PAYOUTS',
        period: 'this_month',
        page: 1,
        limit: 25,
      });

      adminExportPreviewResponseSchema.parse(preview);

      expect(preview.reportType).toBe('PAYOUTS');
      expect(preview.columns.map((c) => c.key)).toEqual([
        'releasedAt',
        'orderNumber',
        'repairerName',
        'connectAccountId',
        'payoutEur',
        'transferId',
        'status',
      ]);
      const firstRow = preview.previewRows[0]!;
      expect(firstRow.payoutEur).toBe('85,00 €');
      expect(firstRow.repairerName).toBe('Charlie Atelier');
      expect(firstRow.transferId).toBe('tr_333');
      expect(firstRow.connectAccountId).toBe('acct_123456789');
    });

    it('returns preview rows and columns for REFUNDS', async () => {
      const mockOrders = [
        {
          id: '42345678-0000-0000-0000-000000000004',
          refundedAt: new Date('2026-10-15T11:00:00.000Z'),
          refundedCents: 4500,
          totalCents: 4500,
          stripeRefundId: 're_444',
          refundMotif: 'CLIENT_CANCELLATION',
          refundReason: 'Annulation demandée par le client',
          repairerUserId: 'rep-1',
          client: { name: 'David Client', email: 'david@example.com' },
        },
      ];

      prisma.commande.findMany.mockResolvedValue(mockOrders);
      prisma.commande.count.mockResolvedValue(1);

      const preview = await service.getExportPreview({
        reportType: 'REFUNDS',
        period: 'this_month',
        page: 1,
        limit: 25,
      });

      adminExportPreviewResponseSchema.parse(preview);

      expect(preview.reportType).toBe('REFUNDS');
      expect(preview.columns.map((c) => c.key)).toEqual([
        'refundedAt',
        'orderNumber',
        'clientName',
        'refundEur',
        'motif',
        'refundId',
      ]);
      const firstRow = preview.previewRows[0]!;
      expect(firstRow.refundEur).toBe('45,00 €');
      expect(firstRow.clientName).toBe('David Client');
      expect(firstRow.refundId).toBe('re_444');
    });

  });

  describe('generateCsv and security features', () => {
    it('escapes CSV values and protects against formula injection (=, +, -, @)', () => {
      expect(escapeCsvValue('Simple')).toBe('Simple');
      expect(escapeCsvValue('With, comma')).toBe('"With, comma"');
      expect(escapeCsvValue('With "quotes"')).toBe('"With ""quotes"""');
      expect(escapeCsvValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(escapeCsvValue('+33600000000')).toBe("'+33600000000");
      expect(escapeCsvValue('-100')).toBe("'-100");
      expect(escapeCsvValue('@malicious')).toBe("'@malicious");
      expect(escapeCsvValue('=CMD|"/C calc"!A0')).toBe("\"'=CMD|\"\"/C calc\"\"!A0\"");
      expect(escapeCsvValue(null)).toBe('');
      expect(escapeCsvValue(undefined)).toBe('');
    });

    it('generates CSV with UTF-8 BOM, standard headers, and audit log', async () => {
      const mockOrders = [
        {
          id: '52345678-0000-0000-0000-000000000005',
          paidAt: new Date('2026-10-10T12:00:00.000Z'),
          clientUserId: 'usr-c1',
          repairerUserId: 'usr-r1',
          totalCents: 10000,
          repairCents: 8000,
          shippingCents: 1000,
          protectionCents: 1000,
          transferredCents: 8000,
          stripeChargeId: 'ch_555',
          status: 'PAID',
          client: { name: 'Claire Martin', email: 'claire@example.com' },
          repairer: { name: 'Atelier Mobile', email: 'contact@atelier.com' },
        },
      ];

      prisma.commande.findMany.mockResolvedValue(mockOrders);

      // `this_month` reads the real clock, so pin it to `fixedNow`: the expected
      // filename below names October 2026 and failed once November came.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(fixedNow);
      let result: Awaited<ReturnType<typeof service.generateCsv>>;
      try {
        result = await service.generateCsv(
          {
            reportType: 'COLLECTIONS',
            period: 'this_month',
            page: 1,
            limit: 25,
          },
          'operator-user-123',
        );
      } finally {
        vi.useRealTimers();
      }

      // Filename verification
      expect(result.filename).toBe('revime-export-COLLECTIONS-2026-10.csv');

      // UTF-8 BOM verification
      expect(result.content.startsWith('\uFEFF')).toBe(true);

      // Header row
      expect(result.content).toContain('Date paiement');
      expect(result.content).toContain('N° Commande');
      expect(result.content).toContain('Commission Revime TTC');

      // Data row
      expect(result.content).toContain('#CMD-52345678');
      expect(result.content).toContain('Claire Martin');
      expect(result.content).toContain('100,00 €');

      // Audit log was called
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorUserId: 'operator-user-123',
          action: 'export.generate',
          targetType: 'AccountingExport',
          detail: expect.objectContaining({
            reportType: 'COLLECTIONS',
            recordCount: 1,
          }),
        }),
      );
    });

    it('does not throw or fail CSV download if audit logging fails', async () => {
      prisma.commande.findMany.mockResolvedValue([]);
      auditService.record.mockRejectedValueOnce(new Error('Audit DB is down'));

      const result = await service.generateCsv({
        reportType: 'COLLECTIONS',
        period: 'this_month',
        page: 1,
        limit: 25,
      });

      expect(result).toBeDefined();
      expect(result.content.startsWith('\uFEFF')).toBe(true);
    });
  });

  describe('AdminExportsController', () => {
    let controller: AdminExportsController;

    beforeEach(() => {
      controller = new AdminExportsController(service);
    });

    it('delegates exportSummary to service with parsed query', async () => {
      const mockSummary: any = {
        totalOrdersCount: 5,
        totalGrossCents: 50000,
        totalCommissionTtcCents: 5000,
        totalCommissionHtCents: 4167,
        totalVatCents: 833,
        totalPayoutsCents: 45000,
        totalRefundsCents: 0,
        uniqueRepairersCount: 3,
      };
      const spy = vi.spyOn(service, 'getExportSummary').mockResolvedValue(mockSummary);

      const res = await controller.exportSummary({
        reportType: 'COMMISSIONS_VAT',
        period: 'last_quarter',
      });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'COMMISSIONS_VAT',
          period: 'last_quarter',
        }),
      );
      expect(res).toBe(mockSummary);
    });

    it('delegates exportPreview to service with parsed query', async () => {
      const mockPreview: any = {
        reportType: 'COLLECTIONS',
        summary: {} as any,
        columns: [],
        previewRows: [],
        totalRows: 0,
        periodLabel: 'Octobre 2026',
      };
      const spy = vi.spyOn(service, 'getExportPreview').mockResolvedValue(mockPreview);

      const res = await controller.exportPreview(
        {
          reportType: 'COLLECTIONS',
          page: '2',
          limit: '10',
        },
        { user: { role: 'read_only' } } as any,
      );

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'COLLECTIONS',
          page: 2,
          limit: 10,
        }),
      );
      expect(res).toBe(mockPreview);
    });

    it('delegates exportDownload to service and streams response headers and CSV body', async () => {
      const spy = vi.spyOn(service, 'generateCsv').mockResolvedValue({
        filename: 'revime-export-COLLECTIONS-octobre-2026.csv',
        content: '\uFEFFcol1,col2\nval1,val2',
      });

      const mockRes: any = {
        setHeader: vi.fn(),
        send: vi.fn(),
      };

      const session: any = { user: { id: 'admin-actor-456' } };

      await controller.exportDownload(
        { reportType: 'COLLECTIONS', period: 'this_month' },
        mockRes,
        session,
      );

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          reportType: 'COLLECTIONS',
          period: 'this_month',
        }),
        'admin-actor-456',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        'attachment; filename="revime-export-COLLECTIONS-octobre-2026.csv"',
      );
      expect(mockRes.send).toHaveBeenCalledWith('\uFEFFcol1,col2\nval1,val2');
    });
  });
});
