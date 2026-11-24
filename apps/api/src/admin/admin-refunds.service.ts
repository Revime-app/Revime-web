import { Injectable } from '@nestjs/common';
import {
  orderNumberFor,
  refundListStatus,
  type AdminRefundDetail,
  type AdminRefundListQuery,
  type AdminRefundListResponse,
  type AdminRefundListItem,
  type AdminRefundSummary,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { paymentsGateway } from '../payments/gateway.js';
import { shareOwedCents, partialRefundOf } from '../commandes/refund-plan.js';
import { AppException } from '../common/app-exception.js';
import { effectiveDisputeStatus } from './dispute-effective-status.js';
import { normaliseOrderSearch } from './admin-shipments-list.service.js';
import { sortRefundItems } from './list-sort.js';

const NOT_FOUND = 'Ressource introuvable.';

@Injectable()
export class AdminRefundsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Partial<AdminRefundListQuery> = {}): Promise<AdminRefundListResponse> {
    // CF4-19 (spec §4). Rows: commandes REFUNDED, plus PAID commandes carrying a
    // Stripe refund or reversal reference (the REFUND_INCOMPLETE case). Every
    // other filter narrows this set further.
    const baseOr = [
      { status: 'REFUNDED' },
      { status: 'PAID', OR: [{ stripeRefundId: { not: null } }, { stripeTransferReversalId: { not: null } }] },
    ];

    const where: Record<string, any> = {};

    if (query.from || query.to) {
      where.refundedAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    if (query.minCents !== undefined || query.maxCents !== undefined) {
      where.refundedCents = {
        ...(query.minCents !== undefined ? { gte: query.minCents } : {}),
        ...(query.maxCents !== undefined ? { lte: query.maxCents } : {}),
      };
    }

    if (query.motif) {
      where.refundMotif = query.motif;
    }

    if (query.client) {
      where.client = {
        OR: [
          { name: { contains: query.client, mode: 'insensitive' } },
          { username: { contains: query.client, mode: 'insensitive' } },
          { email: { contains: query.client, mode: 'insensitive' } },
        ],
      };
    }

    if (query.repairer) {
      where.repairer = {
        OR: [
          { name: { contains: query.repairer, mode: 'insensitive' } },
          { username: { contains: query.repairer, mode: 'insensitive' } },
          { email: { contains: query.repairer, mode: 'insensitive' } },
        ],
      };
    }

    if (query.q && query.q.trim().length > 0) {
      const term = query.q.trim();
      const qOr = [
        // Same normalisation as Task 3's commande search box (admin-shipments-list.service.ts).
        { id: { startsWith: normaliseOrderSearch(term) } },
        { stripeRefundId: term },
        { stripeChargeId: term },
        { stripePaymentIntentId: term },
        { client: { username: { contains: term, mode: 'insensitive' } } },
        { client: { name: { contains: term, mode: 'insensitive' } } },
        { client: { email: { contains: term, mode: 'insensitive' } } },
        { repairer: { username: { contains: term, mode: 'insensitive' } } },
        { repairer: { name: { contains: term, mode: 'insensitive' } } },
        { repairer: { email: { contains: term, mode: 'insensitive' } } },
      ];
      where.AND = [{ OR: qOr }, { OR: baseOr }];
    } else {
      where.OR = baseOr;
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 25);

    const rows = await this.prisma.commande.findMany({
      where,
      include: {
        client: { select: { name: true } },
        repairer: { select: { name: true } },
      },
    });

    const mapped: AdminRefundListItem[] = rows.map((row: any) => {
      const status = refundListStatus({
        status: row.status,
        shareOwedCents: shareOwedCents(row),
        partialRefund: partialRefundOf(row),
      });

      const dateSource = row.refundedAt ?? row.updatedAt;

      return {
        commandeId: row.id,
        orderNumber: orderNumberFor(row.id),
        date: dateSource instanceof Date ? dateSource.toISOString() : String(dateSource),
        clientName: row.client?.name ?? '',
        repairerName: row.repairer?.name ?? '',
        refundedCents: row.refundedCents ?? null,
        motif: row.refundMotif ?? null,
        status,
        stripeRefundId: row.stripeRefundId ?? null,
      };
    });

    // Spec §2 F6: status is derived from pure shared functions, not a stored
    // column, so it is filtered in memory AFTER the SQL filters and BEFORE
    // pagination - `total` is the count of this filtered set.
    const filtered = query.status ? mapped.filter((item) => item.status === query.status) : mapped;

    // INCOMPLETE is a PAID order that carries a Stripe refund reference: the refund did not complete,
    // so it is neither money returned nor a refund to count in the average.
    const refunded = filtered.filter((r) => r.status !== 'INCOMPLETE');
    const totalRefundedCents = refunded.reduce((acc, r) => acc + (r.refundedCents ?? 0), 0);
    const count = refunded.length;
    const averageRefundCents = count > 0 ? Math.round(totalRefundedCents / count) : 0;
    const summary: AdminRefundSummary = {
      totalRefundedCents,
      count,
      averageRefundCents,
    };

    const sorted = sortRefundItems(filtered, query.sort, query.dir);

    const total = sorted.length;
    const skip = (page - 1) * pageSize;
    const items = sorted.slice(skip, skip + pageSize);

    return { items, total, page, pageSize, summary };
  }

  async detail(commandeId: string): Promise<AdminRefundDetail> {
    const row = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: {
        demande: { select: { title: true } },
        client: { select: { name: true } },
        repairer: { select: { name: true } },
        dispute: { select: { id: true, number: true, status: true, verdict: true } },
      },
    });

    // NOT_FOUND when the commande is neither REFUNDED nor PAID-with-attempt -
    // the same row set `list()` selects, checked here for the single id.
    const isRefundIncomplete =
      row?.status === 'PAID' && (row.stripeRefundId !== null || row.stripeTransferReversalId !== null);
    if (!row || (row.status !== 'REFUNDED' && !isRefundIncomplete)) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    // Legacy REFUNDED rows (null breakdown) show the paid amounts as refunded:
    // legacy refunds were full (brief's ruling). shippingCents folds in
    // insuranceCents on the "paid" side, same reasoning as suggestedRefund
    // (refund.schemas.ts) - insurance has no breakdown column of its own.
    const shippingPaid = row.shippingCents + row.insuranceCents;
    const hasBreakdown = row.refundRepairCents !== null;

    const lines: AdminRefundDetail['lines'] = {
      repair: { paid: row.repairCents, refunded: hasBreakdown ? row.refundRepairCents! : row.repairCents },
      shipping: {
        paid: shippingPaid,
        refunded: hasBreakdown ? row.refundShippingCents! : shippingPaid,
        insuranceCents: row.insuranceCents,
      },
      protection: { paid: row.protectionCents, refunded: hasBreakdown ? row.refundProtectionCents! : row.protectionCents },
    };

    // `shareCents` = the réparateur's share not yet transferred back to us -
    // repair paid minus repair refunded (0 for a legacy row, since the legacy
    // "refunded = paid" convention above already accounts for the whole repair).
    const shareCents = row.repairCents - lines.repair.refunded;

    let adminName: string | null = null;
    if (row.refundedByUserId) {
      const admin = await this.prisma.user.findUnique({ where: { id: row.refundedByUserId } });
      adminName = admin?.name ?? null;
    }

    // Stripe reads: each in its own try/catch, per the controller notes - a
    // Stripe outage must never break the detail page. `available` is false as
    // soon as a call that WAS needed (the id existed) failed; an id that never
    // existed needed no call, so it does not count against `available`.
    let refundStatus: string | null = null;
    let cardBrand: string | null = null;
    let cardLast4: string | null = null;
    let available = true;

    if (row.stripeRefundId) {
      try {
        const refund = await paymentsGateway().retrieveRefund(row.stripeRefundId);
        refundStatus = refund.status;
      } catch {
        available = false;
      }
    }

    if (row.stripeChargeId) {
      try {
        const method = await paymentsGateway().retrieveChargePaymentMethod(row.stripeChargeId);
        cardBrand = method.brand;
        cardLast4 = method.last4;
      } catch {
        available = false;
      }
    }

    // History: AdminAuditLog rows for this commande, oldest first. Filtered to
    // targetType 'Commande' only - the dispute-refund audit action
    // ('dispute.resolve_refund') targets 'Dispute', not this commande, so
    // including every targetId match would mix in an unrelated dispute's trail.
    const auditRows = await this.prisma.adminAuditLog.findMany({
      where: { targetType: 'Commande', targetId: commandeId },
      orderBy: { createdAt: 'asc' },
    });

    const history = auditRows.map((entry: any) => ({
      at: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt),
      action: entry.action,
      actorEmail: entry.actorEmail,
      statusCode: entry.statusCode,
    }));

    return {
      commandeId: row.id,
      orderNumber: orderNumberFor(row.id),
      demandeTitle: row.demande?.title ?? '',
      clientName: row.client?.name ?? '',
      repairerName: row.repairer?.name ?? '',
      totalCents: row.totalCents,
      lines,
      refundableCents: row.totalCents,
      refundedCents: row.refundedCents ?? 0,
      shareCents,
      shareOwedCents: shareOwedCents(row),
      motif: row.refundMotif ?? null,
      note: row.refundReason ?? null,
      adminName,
      refundedAt: row.refundedAt instanceof Date ? row.refundedAt.toISOString() : (row.refundedAt ?? null),
      stripe: {
        refundStatus,
        cardBrand,
        cardLast4,
        available,
      },
      history,
      disputeNumber: row.dispute?.number ?? null,
      disputeStatus: row.dispute
        ? effectiveDisputeStatus({
            status: row.dispute.status,
            verdict: row.dispute.verdict,
            commande: row,
          }).status
        : null,
    };
  }
}
