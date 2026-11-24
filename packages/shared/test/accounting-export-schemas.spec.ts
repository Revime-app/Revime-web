import { describe, expect, it } from 'vitest';
import {
  exportReportTypeSchema,
  exportPeriodPresetSchema,
  adminExportQuerySchema,
  adminExportSummarySchema,
  adminExportColumnDefSchema,
  adminExportPreviewResponseSchema,
  adminDac7RecapResultSchema,
  adminDac7RecapsQuerySchema,
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
} from '../src/index.js';

describe('Accounting Export Schemas Contract', () => {
  it('validates all 5 report types in exportReportTypeSchema', () => {
    const types = ['COLLECTIONS', 'COMMISSIONS_VAT', 'PAYOUTS', 'REFUNDS', 'DAC7_ANNUAL'];
    for (const t of types) {
      expect(exportReportTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(exportReportTypeSchema.safeParse('UNKNOWN').success).toBe(false);
  });

  it('validates period presets in exportPeriodPresetSchema', () => {
    const presets = ['this_month', 'last_month', 'this_quarter', 'last_quarter', 'this_year', 'last_year', 'custom'];
    for (const p of presets) {
      expect(exportPeriodPresetSchema.safeParse(p).success).toBe(true);
    }
    expect(exportPeriodPresetSchema.safeParse('invalid_preset').success).toBe(false);
  });

  it('parses adminExportQuerySchema with sensible defaults', () => {
    const parsed = adminExportQuerySchema.parse({});
    expect(parsed.reportType).toBe('COLLECTIONS');
    expect(parsed.period).toBe('this_month');
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(25);
  });

  it('parses adminExportQuerySchema with custom params and coercion', () => {
    const parsed = adminExportQuerySchema.parse({
      reportType: 'COMMISSIONS_VAT',
      period: 'custom',
      startDate: '2026-01-01T00:00:00.000Z',
      endDate: '2026-01-31T23:59:59.000Z',
      year: '2026',
      q: '  query string  ',
      page: '2',
      limit: '50',
    });
    expect(parsed.reportType).toBe('COMMISSIONS_VAT');
    expect(parsed.period).toBe('custom');
    expect(parsed.startDate).toBe('2026-01-01T00:00:00.000Z');
    expect(parsed.endDate).toBe('2026-01-31T23:59:59.000Z');
    expect(parsed.year).toBe(2026);
    expect(parsed.q).toBe('query string');
    expect(parsed.page).toBe(2);
    expect(parsed.limit).toBe(50);
  });

  it('rejects invalid limit or year in adminExportQuerySchema', () => {
    expect(adminExportQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(adminExportQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(adminExportQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(adminExportQuerySchema.safeParse({ year: 2024 }).success).toBe(false);
    expect(adminExportQuerySchema.safeParse({ year: 2051 }).success).toBe(false);
  });

  it('validates adminExportSummarySchema structure with 8 metrics', () => {
    const valid = {
      totalOrdersCount: 10,
      totalGrossCents: 150000,
      totalCommissionTtcCents: 15000,
      totalCommissionHtCents: 12500,
      totalVatCents: 2500,
      totalPayoutsCents: 135000,
      totalRefundsCents: 0,
      uniqueRepairersCount: 4,
    };
    expect(adminExportSummarySchema.safeParse(valid).success).toBe(true);
  });

  it('rejects negative numbers in adminExportSummarySchema', () => {
    const base = {
      totalOrdersCount: 10,
      totalGrossCents: 150000,
      totalCommissionTtcCents: 15000,
      totalCommissionHtCents: 12500,
      totalVatCents: 2500,
      totalPayoutsCents: 135000,
      totalRefundsCents: 0,
      uniqueRepairersCount: 4,
    };
    expect(adminExportSummarySchema.safeParse({ ...base, totalGrossCents: -1 }).success).toBe(false);
    expect(adminExportSummarySchema.safeParse({ ...base, totalOrdersCount: -1 }).success).toBe(false);
    expect(adminExportSummarySchema.safeParse({ ...base, totalCommissionTtcCents: -1 }).success).toBe(false);
    expect(adminExportSummarySchema.safeParse({ ...base, totalCommissionHtCents: -1 }).success).toBe(false);
    expect(adminExportSummarySchema.safeParse({ ...base, totalVatCents: -1 }).success).toBe(false);
    expect(adminExportSummarySchema.safeParse({ ...base, totalPayoutsCents: -1 }).success).toBe(false);
    expect(adminExportSummarySchema.safeParse({ ...base, totalRefundsCents: -1 }).success).toBe(false);
    expect(adminExportSummarySchema.safeParse({ ...base, uniqueRepairersCount: -1 }).success).toBe(false);
  });

  it('validates adminExportColumnDefSchema types', () => {
    const colTypes = ['text', 'currency', 'date', 'badge', 'link'] as const;
    for (const type of colTypes) {
      expect(adminExportColumnDefSchema.safeParse({ key: 'test', label: 'Test', type }).success).toBe(true);
    }
    expect(adminExportColumnDefSchema.safeParse({ key: 'test', label: 'Test', type: 'unknown' }).success).toBe(false);
  });

  it('validates adminExportPreviewResponseSchema structure', () => {
    const preview = {
      reportType: 'COLLECTIONS',
      summary: {
        totalOrdersCount: 1,
        totalGrossCents: 5000,
        totalCommissionTtcCents: 500,
        totalCommissionHtCents: 417,
        totalVatCents: 83,
        totalPayoutsCents: 4500,
        totalRefundsCents: 0,
        uniqueRepairersCount: 1,
      },
      columns: [
        { key: 'orderId', label: 'Commande', type: 'text' as const },
        { key: 'grossAmount', label: 'Montant TTC', type: 'currency' as const },
      ],
      previewRows: [
        { orderId: 'cmd-1', grossAmount: 5000 },
      ],
      totalRows: 1,
      periodLabel: 'Octobre 2026',
    };
    expect(adminExportPreviewResponseSchema.safeParse(preview).success).toBe(true);
  });

  it('includes export.generate in audit actions and label dictionary', () => {
    expect(adminAuditActionSchema.safeParse('export.generate').success).toBe(true);
    expect(ADMIN_AUDIT_ACTION_LABEL['export.generate']).toBe('Export comptable généré');
  });

  it('supports incompleteCount in adminExportPreviewResponseSchema', () => {
    const parsed = adminExportPreviewResponseSchema.parse({
      reportType: 'DAC7_ANNUAL',
      periodLabel: 'Année 2026',
      summary: {
        totalOrdersCount: 0,
        totalGrossCents: 0,
        totalCommissionTtcCents: 0,
        totalCommissionHtCents: 0,
        totalVatCents: 0,
        totalPayoutsCents: 0,
        totalRefundsCents: 0,
        uniqueRepairersCount: 0,
      },
      columns: [],
      previewRows: [],
      totalRows: 0,
      incompleteCount: 3,
    });
    expect(parsed.incompleteCount).toBe(3);
  });

  it('requires the summary: the service always sends it, so a response without one is a bug', () => {
    expect(
      adminExportPreviewResponseSchema.safeParse({
        reportType: 'PAYOUTS',
        periodLabel: 'Octobre 2026',
        columns: [],
        previewRows: [],
        totalRows: 0,
      }).success,
    ).toBe(false);
  });

  it('describes the outcome of a recap run: sent, blocked, failed, skipped, total', () => {
    const counts = { sentCount: 3, blockedCount: 1, failedCount: 2, skippedCount: 4, totalCount: 10 };
    expect(adminDac7RecapResultSchema.parse(counts)).toEqual(counts);
    expect(adminDac7RecapResultSchema.safeParse({ ...counts, failedCount: undefined }).success).toBe(false);
    expect(adminDac7RecapResultSchema.safeParse({ ...counts, sentCount: -1 }).success).toBe(false);
  });

  it('accepts a whole year from 2025 to 2050 for the recap run, or none', () => {
    expect(adminDac7RecapsQuerySchema.parse({}).year).toBeUndefined();
    expect(adminDac7RecapsQuerySchema.parse({ year: '2025' }).year).toBe(2025);
    for (const bad of ['2024', '2051', '2025.5', 'abc', '']) {
      expect(adminDac7RecapsQuerySchema.safeParse({ year: bad }).success, bad).toBe(false);
    }
  });

  it('includes export.dac7_send_recaps in audit actions and label dictionary', () => {
    expect(adminAuditActionSchema.safeParse('export.dac7_send_recaps').success).toBe(true);
    expect(ADMIN_AUDIT_ACTION_LABEL['export.dac7_send_recaps']).toBe('Envoi des récapitulatifs fiscaux DAC7');
  });
});
