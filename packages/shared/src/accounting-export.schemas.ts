import { z } from 'zod';

export const exportReportTypeSchema = z.enum([
  'COLLECTIONS',       // Encaissements globaux
  'COMMISSIONS_VAT',   // Commissions & TVA Revime
  'PAYOUTS',           // Versements réparateurs
  'REFUNDS',           // Remboursements clients
  'DAC7_ANNUAL',       // Déclaration fiscale annuelle DAC7
]);
export type ExportReportType = z.infer<typeof exportReportTypeSchema>;

export const exportPeriodPresetSchema = z.enum([
  'this_month',
  'last_month',
  'this_quarter',
  'last_quarter',
  'this_year',
  'last_year',
  'custom',
]);
export type ExportPeriodPreset = z.infer<typeof exportPeriodPresetSchema>;

export const adminExportQuerySchema = z.object({
  reportType: exportReportTypeSchema.default('COLLECTIONS'),
  period: exportPeriodPresetSchema.default('this_month'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  year: z.coerce.number().int().min(2025).max(2050).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
export type AdminExportQuery = z.infer<typeof adminExportQuerySchema>;

export const adminExportSummarySchema = z.object({
  totalOrdersCount: z.number().int().nonnegative(),
  totalGrossCents: z.number().int().nonnegative(),           // Volume d'affaires brut TTC
  totalCommissionTtcCents: z.number().int().nonnegative(),   // Commissions Revime TTC
  totalCommissionHtCents: z.number().int().nonnegative(),    // Base HT = TTC / 1.2
  totalVatCents: z.number().int().nonnegative(),             // TVA 20% = TTC - HT
  totalPayoutsCents: z.number().int().nonnegative(),         // Versements décaissés aux réparateurs
  totalRefundsCents: z.number().int().nonnegative(),         // Remboursements clients émis
  uniqueRepairersCount: z.number().int().nonnegative(),      // Réparateurs uniques concernés
});
export type AdminExportSummary = z.infer<typeof adminExportSummarySchema>;

export const adminExportColumnDefSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'currency', 'date', 'badge', 'link']),
});
export type AdminExportColumnDef = z.infer<typeof adminExportColumnDefSchema>;

export const adminExportPreviewResponseSchema = z.object({
  reportType: exportReportTypeSchema,
  summary: adminExportSummarySchema,
  columns: z.array(adminExportColumnDefSchema),
  previewRows: z.array(z.record(z.string(), z.unknown())),
  totalRows: z.number().int().nonnegative(),
  periodLabel: z.string(),
  incompleteCount: z.number().int().nonnegative().optional(),
});
export type AdminExportPreviewResponse = z.infer<typeof adminExportPreviewResponseSchema>;

/**
 * `POST admin/exports/dac7/send-recaps` (CMP-D4). Counted per réparateur: `sent` accepted by the mail
 * provider, `blocked` incomplete dossiers that got no email, `failed` an email the provider refused or
 * a réparateur with no address (retried by the next run), `skipped` already sent or being sent by
 * another run.
 */
export const adminDac7RecapResultSchema = z.object({
  sentCount: z.number().int().nonnegative(),
  blockedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  totalCount: z.number().int().nonnegative(),
});
export type AdminDac7RecapResult = z.infer<typeof adminDac7RecapResultSchema>;

/** Query of that route. The year is optional: the one that just ended. */
export const adminDac7RecapsQuerySchema = z.object({
  year: z.coerce.number().int().min(2025).max(2050).optional(),
});
