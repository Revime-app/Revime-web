import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  type AdminExportQuery,
  type AdminExportSummary,
  type AdminExportPreviewResponse,
  type AdminExportColumnDef,
  type ExportPeriodPreset,
  type ExportReportType,
  type AdminDac7RecapResult,
  orderNumberFor,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { Prisma } from '../generated/prisma/client.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { AppException } from '../common/app-exception.js';
import { COLLECTED_COMMANDE_STATUSES, GENUINE_COLLECTED_COMMANDE_WHERE } from './admin-constants.js';
import { escapeCsvValue } from './admin-csv.js';
import { AdminAuditService } from './admin-audit.service.js';
import { writeAuditRow, type AuditRecordInput } from './admin-audit-write.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { mailSender, type MailSender } from '../mail/mail.service.js';
import {
  DAC7_ANNUAL_COLUMNS,
  DAC7_CSV_COLUMNS,
  buildDac7Row,
  dac7PaidCents,
  dac7RecapMail,
  defaultDac7Year,
  formatEurCents,
  type Dac7Order,
  type Dac7Repairer,
  type Dac7Row,
} from './dac7-report.js';

const MONTH_NAMES_FR = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

export { escapeCsvValue };

export const COLLECTIONS_COLUMNS: AdminExportColumnDef[] = [
  { key: 'paidAt', label: 'Date paiement', type: 'date' },
  { key: 'orderNumber', label: 'N° Commande', type: 'link' },
  { key: 'clientName', label: 'Client', type: 'text' },
  { key: 'clientEmail', label: 'Email client', type: 'text' },
  { key: 'repairerName', label: 'Réparateur', type: 'text' },
  { key: 'totalEur', label: 'Montant TTC', type: 'currency' },
  { key: 'shippingEur', label: 'Frais livraison', type: 'currency' },
  { key: 'commissionTtcEur', label: 'Commission Revime TTC', type: 'currency' },
  { key: 'repairerNetEur', label: 'Net Réparateur', type: 'currency' },
  { key: 'chargeId', label: 'ID Stripe Charge', type: 'text' },
];

export const COMMISSIONS_VAT_COLUMNS: AdminExportColumnDef[] = [
  { key: 'paidAt', label: 'Date', type: 'date' },
  { key: 'orderNumber', label: 'N° Commande', type: 'link' },
  { key: 'totalEur', label: 'Volume brut TTC', type: 'currency' },
  { key: 'vatRate', label: 'Taux TVA', type: 'badge' },
  { key: 'commissionHtEur', label: 'Commission Revime HT', type: 'currency' },
  { key: 'vatAmountEur', label: 'TVA collectée 20 %', type: 'currency' },
  { key: 'commissionTtcEur', label: 'Commission Revime TTC', type: 'currency' },
  { key: 'status', label: 'Statut commande', type: 'badge' },
];

export const PAYOUTS_COLUMNS: AdminExportColumnDef[] = [
  { key: 'releasedAt', label: 'Date virement', type: 'date' },
  { key: 'orderNumber', label: 'N° Commande', type: 'link' },
  { key: 'repairerName', label: 'Réparateur', type: 'text' },
  { key: 'connectAccountId', label: 'Compte Stripe Connect', type: 'text' },
  { key: 'payoutEur', label: 'Montant versé', type: 'currency' },
  { key: 'transferId', label: 'ID Transfert Stripe', type: 'text' },
  { key: 'status', label: 'Statut', type: 'badge' },
];

export const REFUNDS_COLUMNS: AdminExportColumnDef[] = [
  { key: 'refundedAt', label: 'Date remboursement', type: 'date' },
  { key: 'orderNumber', label: 'N° Commande', type: 'link' },
  { key: 'clientName', label: 'Client', type: 'text' },
  { key: 'refundEur', label: 'Montant remboursé', type: 'currency' },
  { key: 'motif', label: 'Motif', type: 'text' },
  { key: 'refundId', label: 'ID Remboursement Stripe', type: 'text' },
];

export type AdminExportQueryInput = {
  reportType?: ExportReportType;
  period?: ExportPeriodPreset;
  startDate?: string;
  endDate?: string;
  year?: number;
  q?: string;
  page?: number;
  limit?: number;
};

@Injectable()
export class AdminExportsService {
  private readonly logger = new Logger(AdminExportsService.name);
  private readonly mailer: MailSender;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditService?: AdminAuditService,
    @Optional() private readonly notifications?: NotificationsService,
    @Optional() @Inject('DAC7_MAILER') mailer?: MailSender,
  ) {
    this.mailer = mailer ?? mailSender();
  }

  /** A claim on a recap that nobody finished (a crash between claim and result) is retryable after this. */
  private static readonly RECAP_CLAIM_STALE_MS = 15 * 60 * 1000;

  /**
   * The bounds a report is read over. DAC7 is the calendar year, always: asked with any other
   * period, or none, it used to export that month under a file named for the year.
   */
  private boundsFor(query: AdminExportQueryInput & { reportType: ExportReportType }) {
    if (query.reportType === 'DAC7_ANNUAL') {
      return this.resolvePeriodBounds('this_year', undefined, undefined, query.year ?? defaultDac7Year());
    }
    return this.resolvePeriodBounds(query.period ?? 'this_month', query.startDate, query.endDate, query.year);
  }

  /** Audit rows never fail the action they describe, so a failure here is logged and swallowed. */
  private async audit(input: AuditRecordInput, context: string): Promise<void> {
    try {
      if (this.auditService) {
        await this.auditService.record(input);
      } else {
        await writeAuditRow(this.prisma, input, (msg, err) => this.logger.warn(`Audit error: ${msg}`, err));
      }
    } catch (err) {
      this.logger.warn(`Non-blocking audit log failure in ${context}`, err);
    }
  }

  /**
   * Resolves the start and end UTC bounds and French label for a given period preset or year override.
   */
  resolvePeriodBounds(
    preset: ExportPeriodPreset,
    startDate?: string,
    endDate?: string,
    year?: number,
    nowDate: Date = new Date(),
  ): { start: Date; end: Date; label: string } {
    if (year && !isNaN(year)) {
      const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
      return { start, end, label: `Année ${year}` };
    }

    const currentYear = nowDate.getUTCFullYear();
    const currentMonth = nowDate.getUTCMonth(); // 0-11

    switch (preset) {
      case 'this_month': {
        const start = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59, 999));
        const label = `${MONTH_NAMES_FR[currentMonth]} ${currentYear}`;
        return { start, end, label };
      }
      case 'last_month': {
        const start = new Date(Date.UTC(currentYear, currentMonth - 1, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(currentYear, currentMonth, 0, 23, 59, 59, 999));
        const label = `${MONTH_NAMES_FR[start.getUTCMonth()]} ${start.getUTCFullYear()}`;
        return { start, end, label };
      }
      case 'this_quarter': {
        const quarter = Math.floor(currentMonth / 3);
        const start = new Date(Date.UTC(currentYear, quarter * 3, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(currentYear, quarter * 3 + 3, 0, 23, 59, 59, 999));
        const label = `T${quarter + 1} ${currentYear}`;
        return { start, end, label };
      }
      case 'last_quarter': {
        const currentQuarter = Math.floor(currentMonth / 3);
        const prevQuarter = (currentQuarter - 1 + 4) % 4;
        const targetYear = currentQuarter === 0 ? currentYear - 1 : currentYear;
        const start = new Date(Date.UTC(targetYear, prevQuarter * 3, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(targetYear, prevQuarter * 3 + 3, 0, 23, 59, 59, 999));
        const label = `T${prevQuarter + 1} ${targetYear}`;
        return { start, end, label };
      }
      case 'this_year': {
        const start = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999));
        const label = `Année ${currentYear}`;
        return { start, end, label };
      }
      case 'last_year': {
        const prevYear = currentYear - 1;
        const start = new Date(Date.UTC(prevYear, 0, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(prevYear, 11, 31, 23, 59, 59, 999));
        const label = `Année ${prevYear}`;
        return { start, end, label };
      }
      case 'custom': {
        if (startDate && endDate) {
          const parsedStart = new Date(startDate);
          const parsedEnd = new Date(endDate);
          if (!isNaN(parsedStart.getTime()) && !isNaN(parsedEnd.getTime())) {
            const sDay = String(parsedStart.getUTCDate()).padStart(2, '0');
            const sMonth = String(parsedStart.getUTCMonth() + 1).padStart(2, '0');
            const eDay = String(parsedEnd.getUTCDate()).padStart(2, '0');
            const eMonth = String(parsedEnd.getUTCMonth() + 1).padStart(2, '0');
            const label = `Du ${sDay}/${sMonth}/${parsedStart.getUTCFullYear()} au ${eDay}/${eMonth}/${parsedEnd.getUTCFullYear()}`;
            return { start: parsedStart, end: parsedEnd, label };
          }
        }
        // Fallback to this_month
        const start = new Date(Date.UTC(currentYear, currentMonth, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 23, 59, 59, 999));
        const label = `${MONTH_NAMES_FR[currentMonth]} ${currentYear}`;
        return { start, end, label };
      }
    }
  }

  /**
   * Computes the 8 summary KPIs across orders paid / processed in the requested period.
   */
  async getExportSummary(query: AdminExportQueryInput): Promise<AdminExportSummary> {
    const bounds = this.resolvePeriodBounds(
      query.period ?? 'this_month',
      query.startDate,
      query.endDate,
      query.year,
    );

    // PRE-3: an accounting figure counts real orders only (no fixture or demo party, a Stripe payment).
    const where: Prisma.CommandeWhereInput = {
      ...GENUINE_COLLECTED_COMMANDE_WHERE,
      status: { in: COLLECTED_COMMANDE_STATUSES },
      paidAt: { gte: bounds.start, lte: bounds.end },
    };

    const orders = await this.prisma.commande.findMany({
      where,
      select: {
        id: true,
        repairerUserId: true,
        totalCents: true,
        repairCents: true,
        shippingCents: true,
        protectionCents: true,
        transferredCents: true,
        stripeTransferId: true,
        refundedCents: true,
        status: true,
      },
    });

    const totalOrdersCount = orders.length;
    const totalGrossCents = orders.reduce((sum, o) => sum + (o.totalCents || 0), 0);
    const totalCommissionTtcCents = orders.reduce((sum, o) => {
      let comm = 0;
      if (typeof o.protectionCents === 'number' && Number.isFinite(o.protectionCents)) {
        comm = o.protectionCents;
      } else if (typeof o.totalCents === 'number' && Number.isFinite(o.totalCents)) {
        const repair = typeof o.repairCents === 'number' ? o.repairCents : 0;
        const shipping = typeof o.shippingCents === 'number' ? o.shippingCents : 0;
        comm = Math.max(0, o.totalCents - repair - shipping);
      }
      return sum + (Number.isFinite(comm) ? comm : 0);
    }, 0);
    const totalCommissionHtCents = Math.round(totalCommissionTtcCents / 1.20);
    const totalVatCents = Math.max(0, totalCommissionTtcCents - totalCommissionHtCents);
    const totalPayoutsCents = orders.reduce((sum, o) => {
      if (typeof o.transferredCents === 'number' && Number.isFinite(o.transferredCents)) {
        return sum + o.transferredCents;
      }
      if (o.stripeTransferId && typeof o.repairCents === 'number' && Number.isFinite(o.repairCents)) {
        return sum + o.repairCents;
      }
      return sum;
    }, 0);
    const totalRefundsCents = orders.reduce((sum, o) => {
      if (typeof o.refundedCents === 'number' && Number.isFinite(o.refundedCents) && o.refundedCents > 0) {
        return sum + o.refundedCents;
      }
      if (o.status === 'REFUNDED' && typeof o.totalCents === 'number' && Number.isFinite(o.totalCents)) {
        return sum + o.totalCents;
      }
      return sum;
    }, 0);
    const repairerIds = new Set(orders.map((o) => o.repairerUserId).filter(Boolean));
    const uniqueRepairersCount = repairerIds.size;

    return {
      totalOrdersCount,
      totalGrossCents,
      totalCommissionTtcCents,
      totalCommissionHtCents,
      totalVatCents,
      totalPayoutsCents,
      totalRefundsCents,
      uniqueRepairersCount,
    };
  }

  /**
   * Report 1: Encaissements globaux (COLLECTIONS)
   */
  async buildCollectionsReport(
    bounds: { start: Date; end: Date },
    q?: string,
    limit?: number,
  ): Promise<{ rows: Record<string, unknown>[]; totalRows: number }> {
    const where: Prisma.CommandeWhereInput = {
      ...GENUINE_COLLECTED_COMMANDE_WHERE,
      paidAt: { gte: bounds.start, lte: bounds.end },
      status: { in: COLLECTED_COMMANDE_STATUSES },
    };

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { client: { name: { contains: term, mode: 'insensitive' } } },
        { client: { email: { contains: term, mode: 'insensitive' } } },
        { repairer: { name: { contains: term, mode: 'insensitive' } } },
        { repairer: { email: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [totalRows, orders] = await Promise.all([
      this.prisma.commande.count({ where }),
      this.prisma.commande.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, email: true } },
          repairer: { select: { id: true, name: true, email: true } },
        },
        orderBy: { paidAt: 'desc' },
        take: limit,
      }),
    ]);

    const rows = orders.map((o) => {
      const commTtc = o.protectionCents ?? Math.max(0, o.totalCents - o.repairCents - o.shippingCents);
      const repairerNet = o.transferredCents ?? o.repairCents;
      return {
        paidAt: o.paidAt instanceof Date ? o.paidAt.toISOString() : (o.paidAt ?? ''),
        orderNumber: orderNumberFor(o.id),
        orderId: o.id,
        clientName: o.client?.name ?? 'Client inconnu',
        clientEmail: o.client?.email ?? '',
        repairerName: o.repairer?.name ?? 'Réparateur inconnu',
        totalEur: formatEurCents(o.totalCents),
        shippingEur: formatEurCents(o.shippingCents),
        commissionTtcEur: formatEurCents(commTtc),
        repairerNetEur: formatEurCents(repairerNet),
        chargeId: o.stripeChargeId ?? o.stripePaymentIntentId ?? '',
      };
    });

    return { rows, totalRows };
  }

  /**
   * Report 2: Commissions & TVA Revime (COMMISSIONS_VAT)
   */
  async buildCommissionsVatReport(
    bounds: { start: Date; end: Date },
    q?: string,
    limit?: number,
  ): Promise<{ rows: Record<string, unknown>[]; totalRows: number }> {
    const where: Prisma.CommandeWhereInput = {
      ...GENUINE_COLLECTED_COMMANDE_WHERE,
      paidAt: { gte: bounds.start, lte: bounds.end },
      status: { in: COLLECTED_COMMANDE_STATUSES },
    };

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { client: { name: { contains: term, mode: 'insensitive' } } },
        { repairer: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const [totalRows, orders] = await Promise.all([
      this.prisma.commande.count({ where }),
      this.prisma.commande.findMany({
        where,
        orderBy: { paidAt: 'desc' },
        take: limit,
      }),
    ]);

    const rows = orders.map((o) => {
      const commTtc = o.protectionCents ?? Math.max(0, o.totalCents - o.repairCents - o.shippingCents);
      const commHt = Math.round(commTtc / 1.20);
      const vatAmount = commTtc - commHt;
      return {
        paidAt: o.paidAt instanceof Date ? o.paidAt.toISOString() : (o.paidAt ?? ''),
        orderNumber: orderNumberFor(o.id),
        orderId: o.id,
        totalEur: formatEurCents(o.totalCents),
        vatRate: '20 %',
        commissionHtEur: formatEurCents(commHt),
        vatAmountEur: formatEurCents(vatAmount),
        commissionTtcEur: formatEurCents(commTtc),
        status: o.status,
      };
    });

    return { rows, totalRows };
  }

  /**
   * Report 3: Versements réparateurs (PAYOUTS)
   */
  async buildPayoutsReport(
    bounds: { start: Date; end: Date },
    q?: string,
    limit?: number,
  ): Promise<{ rows: Record<string, unknown>[]; totalRows: number }> {
    const where: Prisma.CommandeWhereInput = {
      stripeTransferId: { not: null },
      releasedAt: { gte: bounds.start, lte: bounds.end },
    };

    if (q && q.trim()) {
      const term = q.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { repairer: { name: { contains: term, mode: 'insensitive' } } },
        { repairer: { email: { contains: term, mode: 'insensitive' } } },
        { stripeTransferId: { contains: term } },
      ];
    }

    const [totalRows, orders] = await Promise.all([
      this.prisma.commande.count({ where }),
      this.prisma.commande.findMany({
        where,
        include: {
          repairer: {
            select: {
              id: true,
              name: true,
              connectAccount: { select: { stripeAccountId: true } },
            },
          },
        },
        orderBy: { releasedAt: 'desc' },
        take: limit,
      }),
    ]);

    const rows = orders.map((o) => {
      const payoutCents = o.transferredCents ?? o.repairCents;
      const isReversed = Boolean(o.stripeTransferReversalId);
      return {
        releasedAt: o.releasedAt instanceof Date ? o.releasedAt.toISOString() : (o.releasedAt ?? ''),
        orderNumber: orderNumberFor(o.id),
        orderId: o.id,
        repairerName: o.repairer?.name ?? 'Réparateur inconnu',
        connectAccountId: o.repairer?.connectAccount?.stripeAccountId ?? 'Non connecté',
        payoutEur: formatEurCents(payoutCents),
        transferId: o.stripeTransferId ?? '',
        status: isReversed ? 'REVERSED' : 'TRANSFERRED',
      };
    });

    return { rows, totalRows };
  }

  /**
   * Report 4: Remboursements clients (REFUNDS)
   */
  async buildRefundsReport(
    bounds: { start: Date; end: Date },
    q?: string,
    limit?: number,
  ): Promise<{ rows: Record<string, unknown>[]; totalRows: number }> {
    const where: Prisma.CommandeWhereInput = {
      ...GENUINE_COLLECTED_COMMANDE_WHERE,
      refundedAt: { gte: bounds.start, lte: bounds.end },
      OR: [
        { refundedCents: { gt: 0 } },
        { stripeRefundId: { not: null } },
        { status: 'REFUNDED' },
      ],
    };

    if (q && q.trim()) {
      const term = q.trim();
      where.AND = [
        {
          OR: [
            { id: { contains: term, mode: 'insensitive' } },
            { client: { name: { contains: term, mode: 'insensitive' } } },
            { client: { email: { contains: term, mode: 'insensitive' } } },
            { stripeRefundId: { contains: term } },
          ],
        },
      ];
    }

    const [totalRows, orders] = await Promise.all([
      this.prisma.commande.count({ where }),
      this.prisma.commande.findMany({
        where,
        include: {
          client: { select: { id: true, name: true, email: true } },
        },
        orderBy: { refundedAt: 'desc' },
        take: limit,
      }),
    ]);

    const rows = orders.map((o) => {
      return {
        refundedAt: o.refundedAt instanceof Date ? o.refundedAt.toISOString() : (o.refundedAt ?? ''),
        orderNumber: orderNumberFor(o.id),
        orderId: o.id,
        clientName: o.client?.name ?? 'Client inconnu',
        refundEur: formatEurCents(o.refundedCents ?? o.totalCents),
        motif: o.refundMotif ?? o.refundReason ?? 'Remboursement',
        refundId: o.stripeRefundId ?? '',
      };
    });

    return { rows, totalRows };
  }

  /**
   * Report 5: DAC7 annual declaration (DAC7_ANNUAL). One row per réparateur who was PAID in the year.
   *
   * « Paid » is a transfer that exists (`stripeTransferId`), dated by the day it moved
   * (`transferredAt`), and counted net of what a refund took back. A held order has no transfer,
   * so it is not in the file until the sweep pays it; an order released in December and paid in
   * January belongs to January. Never filter on `status`: a REFUNDED order whose transfer was not
   * reversed still paid the réparateur.
   */
  async buildDac7Report(year: number, q?: string): Promise<Dac7Row[]> {
    const bounds = this.resolvePeriodBounds('this_year', undefined, undefined, year);
    const inYear = { gte: bounds.start, lte: bounds.end };

    const where: Prisma.CommandeWhereInput = {
      stripeTransferId: { not: null },
      // The release date stands in only for a row older than the `transferredAt` column.
      OR: [{ transferredAt: inYear }, { transferredAt: null, releasedAt: inYear }],
    };

    if (q && q.trim()) {
      const term = q.trim();
      where.repairer = {
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { businessVerification: { denomination: { contains: term, mode: 'insensitive' } } },
          { businessVerification: { siren: { contains: term } } },
          { fiscalDeclaration: { nif: { contains: term, mode: 'insensitive' } } },
        ],
      };
    }

    const orders = await this.prisma.commande.findMany({
      where,
      include: {
        repairer: {
          include: {
            profile: true,
            repairerProfile: true,
            fiscalDeclaration: true,
            businessVerification: true,
            connectAccount: true,
            dac7Recaps: { where: { taxYear: year } },
          },
        },
      },
      orderBy: { releasedAt: 'asc' },
    });

    const byRepairer = new Map<string, { repairer: Dac7Repairer; orders: Dac7Order[] }>();
    for (const o of orders) {
      // Taken back in full: the réparateur kept nothing of this order.
      if (dac7PaidCents(o) <= 0) continue;
      const entry = byRepairer.get(o.repairerUserId) ?? { repairer: o.repairer, orders: [] };
      entry.orders.push(o);
      byRepairer.set(o.repairerUserId, entry);
    }

    return [...byRepairer.values()].map(({ repairer, orders: paid }) => buildDac7Row(repairer, paid, year));
  }

  /**
   * Returns column definitions, preview rows, total count, summary KPIs, and period label.
   */
  async getExportPreview(
    query: AdminExportQueryInput & { reportType: ExportReportType },
  ): Promise<AdminExportPreviewResponse> {
    const bounds = this.boundsFor(query);

    const limit = query.limit ?? 25;
    const summary = await this.getExportSummary(query);

    let columns: AdminExportColumnDef[] = [];
    let previewRows: Record<string, unknown>[] = [];
    let totalRows = 0;
    let incompleteCount: number | undefined;

    switch (query.reportType) {
      case 'COLLECTIONS': {
        columns = COLLECTIONS_COLUMNS;
        const res = await this.buildCollectionsReport(bounds, query.q, limit);
        previewRows = res.rows;
        totalRows = res.totalRows;
        break;
      }
      case 'COMMISSIONS_VAT': {
        columns = COMMISSIONS_VAT_COLUMNS;
        const res = await this.buildCommissionsVatReport(bounds, query.q, limit);
        previewRows = res.rows;
        totalRows = res.totalRows;
        break;
      }
      case 'PAYOUTS': {
        columns = PAYOUTS_COLUMNS;
        const res = await this.buildPayoutsReport(bounds, query.q, limit);
        previewRows = res.rows;
        totalRows = res.totalRows;
        break;
      }
      case 'REFUNDS': {
        columns = REFUNDS_COLUMNS;
        const res = await this.buildRefundsReport(bounds, query.q, limit);
        previewRows = res.rows;
        totalRows = res.totalRows;
        break;
      }
      case 'DAC7_ANNUAL': {
        columns = DAC7_ANNUAL_COLUMNS;
        const allDac7Rows = await this.buildDac7Report(bounds.start.getUTCFullYear(), query.q);
        totalRows = allDac7Rows.length;
        // Every row, not a page of them: this is one line per réparateur, and the screen's
        // « dossiers incomplets » filter works on what it is given.
        previewRows = allDac7Rows;
        incompleteCount = allDac7Rows.filter((r) => r.isIncomplete).length;
        break;
      }
    }

    return {
      reportType: query.reportType,
      summary,
      columns,
      previewRows,
      totalRows,
      ...(incompleteCount !== undefined ? { incompleteCount } : {}),
      periodLabel: bounds.label,
    };
  }

  /**
   * Generates standard RFC 4180 CSV with UTF-8 BOM and formula injection protection.
   * Logs non-blocking audit event.
   */
  async generateCsv(
    query: AdminExportQueryInput & { reportType: ExportReportType },
    operatorUserId?: string,
  ): Promise<{ filename: string; content: string }> {
    const bounds = this.boundsFor(query);

    let columns: AdminExportColumnDef[] = [];
    let rows: Record<string, unknown>[] = [];

    switch (query.reportType) {
      case 'COLLECTIONS': {
        columns = COLLECTIONS_COLUMNS;
        const res = await this.buildCollectionsReport(bounds, query.q, 5000);
        rows = res.rows;
        break;
      }
      case 'COMMISSIONS_VAT': {
        columns = COMMISSIONS_VAT_COLUMNS;
        const res = await this.buildCommissionsVatReport(bounds, query.q, 5000);
        rows = res.rows;
        break;
      }
      case 'PAYOUTS': {
        columns = PAYOUTS_COLUMNS;
        const res = await this.buildPayoutsReport(bounds, query.q, 5000);
        rows = res.rows;
        break;
      }
      case 'REFUNDS': {
        columns = REFUNDS_COLUMNS;
        const res = await this.buildRefundsReport(bounds, query.q, 5000);
        rows = res.rows;
        break;
      }
      case 'DAC7_ANNUAL': {
        columns = DAC7_CSV_COLUMNS;
        // No cap, unlike the others: a declaration file that silently stops at 5 000 lines is wrong.
        rows = await this.buildDac7Report(bounds.start.getUTCFullYear(), query.q);
        break;
      }
    }

    // Build RFC 4180 CSV
    const headerLine = columns.map((c) => escapeCsvValue(c.label)).join(',');
    const rowLines = rows.map((r) =>
      columns.map((c) => escapeCsvValue(r[c.key])).join(','),
    );

    const content = '\uFEFF' + [headerLine, ...rowLines].join('\r\n') + '\r\n';

    // Build filename
    let filename: string;
    if (query.reportType === 'DAC7_ANNUAL') {
      filename = `revime-export-DAC7-${bounds.start.getUTCFullYear()}.csv`;
    } else if (query.period === 'this_year' || query.period === 'last_year' || query.year) {
      filename = `revime-export-${query.reportType}-${bounds.start.getUTCFullYear()}.csv`;
    } else if (query.period === 'this_quarter' || query.period === 'last_quarter') {
      const q = Math.floor(bounds.start.getUTCMonth() / 3) + 1;
      filename = `revime-export-${query.reportType}-${bounds.start.getUTCFullYear()}-T${q}.csv`;
    } else {
      const month = String(bounds.start.getUTCMonth() + 1).padStart(2, '0');
      filename = `revime-export-${query.reportType}-${bounds.start.getUTCFullYear()}-${month}.csv`;
    }

    await this.audit(
      {
        actorUserId: operatorUserId ?? null,
        actorEmail: null,
        action: 'export.generate',
        targetType: 'AccountingExport',
        statusCode: 200,
        detail: { reportType: query.reportType, recordCount: rows.length },
      },
      'generateCsv',
    );

    return { filename, content };
  }

  /**
   * Statutory annual recap dispatcher (CMP-D4). Emails each paid, complete réparateur his year and
   * records the outcome in `RepairerDac7Recap`, one row per réparateur and year.
   *
   * - A recap already SENT is never sent again: running this twice, or after a réparateur completed
   *   his declaration, reaches only the people who did not get one yet.
   * - A recap is SENT only when the provider accepted the email. The in-app notice is a pointer to
   *   it and may fail without making the recap unsent.
   * - A row is claimed (created, or taken over from BLOCKED, FAILED or a stale claim) BEFORE the
   *   email goes out, so two operators pressing the button together cannot both send.
   * - One réparateur's failure never stops the others.
   */
  async sendDac7Recaps(year: number, operatorUserId?: string): Promise<AdminDac7RecapResult> {
    if (year >= new Date().getUTCFullYear()) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        "Les récapitulatifs DAC7 ne peuvent être envoyés qu'une fois l'année civile terminée.",
      );
    }
    const rows = await this.buildDac7Report(year);

    const result: AdminDac7RecapResult = {
      sentCount: 0,
      blockedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      totalCount: rows.length,
    };
    const CHUNK_SIZE = 5;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const settled = await Promise.allSettled(rows.slice(i, i + CHUNK_SIZE).map((row) => this.sendOneDac7Recap(row, year)));
      for (const [index, res] of settled.entries()) {
        if (res.status === 'rejected') {
          this.logger.error(`DAC7 recap dispatch failed for ${rows[i + index]?.repairerUserId}`, res.reason);
          result.failedCount++;
        } else if (res.value === 'SENT') {
          result.sentCount++;
        } else if (res.value === 'BLOCKED') {
          result.blockedCount++;
        } else if (res.value === 'FAILED') {
          result.failedCount++;
        } else {
          result.skippedCount++;
        }
      }
    }

    await this.audit(
      {
        actorUserId: operatorUserId ?? null,
        actorEmail: null,
        action: 'export.dac7_send_recaps',
        targetType: 'AccountingExport',
        targetId: String(year),
        statusCode: 200,
        detail: { ...result },
      },
      'sendDac7Recaps',
    );

    return result;
  }

  private async sendOneDac7Recap(row: Dac7Row, year: number): Promise<'SENT' | 'BLOCKED' | 'FAILED' | 'SKIPPED'> {
    if (row.recapStatus === 'Envoyé') return 'SKIPPED';
    const userId = row.repairerUserId;
    const totals = { totalCents: row.totalCents, ordersCount: row.ordersCount };

    if (row.isIncomplete) {
      return (await this.claimDac7Recap(userId, year, 'BLOCKED', totals)) ? 'BLOCKED' : 'SKIPPED';
    }
    if (!(await this.claimDac7Recap(userId, year, 'SENDING', totals))) return 'SKIPPED';

    try {
      if (!row.email) throw new Error('the réparateur has no email address');
      await this.mailer.send({ to: row.email, ...dac7RecapMail(row, year) }, { strict: true });
    } catch (e) {
      this.logger.error(`DAC7 recap email failed for ${userId}`, e);
      await this.prisma.repairerDac7Recap.update({
        where: { userId_taxYear: { userId, taxYear: year } },
        data: { status: 'FAILED', channel: 'NONE' },
      });
      return 'FAILED';
    }

    let channel = 'EMAIL';
    try {
      await this.notifications?.emit({
        userId,
        mode: 'REPAIRER',
        type: 'DAC7_ANNUAL_RECAP_SENT',
        subject: String(year),
      });
      if (this.notifications) channel = 'EMAIL_AND_INAPP';
    } catch (e) {
      this.logger.error(`DAC7 in-app notice failed for ${userId}; the email was sent`, e);
    }

    await this.prisma.repairerDac7Recap.update({
      where: { userId_taxYear: { userId, taxYear: year } },
      data: { status: 'SENT', sentAt: new Date(), channel },
    });
    return 'SENT';
  }

  /**
   * Takes the (réparateur, year) row for this run, or reports that another run holds it or it is
   * already SENT. `sentAt` is « when the status last changed », which is all a BLOCKED row has.
   */
  private async claimDac7Recap(
    userId: string,
    year: number,
    status: 'SENDING' | 'BLOCKED',
    totals: { totalCents: number; ordersCount: number },
  ): Promise<boolean> {
    const data = { status, sentAt: new Date(), channel: 'NONE', ...totals };
    try {
      await this.prisma.repairerDac7Recap.create({ data: { userId, taxYear: year, ...data } });
      return true;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
    }
    const staleBefore = new Date(Date.now() - AdminExportsService.RECAP_CLAIM_STALE_MS);
    const claimed = await this.prisma.repairerDac7Recap.updateMany({
      where: {
        userId,
        taxYear: year,
        OR: [{ status: { in: ['BLOCKED', 'FAILED'] } }, { status: 'SENDING', sentAt: { lt: staleBefore } }],
      },
      data,
    });
    return claimed.count === 1;
  }
}
