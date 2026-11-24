import { Injectable } from '@nestjs/common';
import {
  orderIdPrefix,
  type AdminPaymentListItem,
  type AdminPaymentListQuery,
  type AdminPaymentListResponse,
  type AdminPaymentMetricsDto,
  type DisputeStatusType,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { isDisputeOpen } from '../commandes/dispute-open.js';
import { effectiveDisputeStatus } from './dispute-effective-status.js';
import { GENUINE_COLLECTED_COMMANDE_WHERE, GENUINE_COMMANDE_WHERE } from './admin-constants.js';
import { paymentOrderBy } from './list-sort.js';
import { paidWithin } from './admin-overview.service.js';
import { payoutStatusOf } from './payout-status.js';
import { staleUnstartedPaymentWhere } from '../payments/stale-payment.js';

@Injectable()
export class AdminPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: Partial<AdminPaymentListQuery> = {}): Promise<AdminPaymentListResponse> {
    const where: Record<string, any> = {};

    if (query.status && query.status !== 'ALL') {
      where.status = query.status;
    }

    if (query.step && query.step !== 'ALL') {
      where.step = query.step;
    }

    if (query.delivery && query.delivery !== 'ALL') {
      where.delivery = query.delivery;
    }

    if (query.disputed === 'true') {
      if (where.status) {
        if (where.status === 'REFUNDED') {
          where.status = { in: [] };
        }
      } else {
        where.status = { not: 'REFUNDED' };
      }
      where.OR = [
        { dispute: { status: { in: ['OPEN', 'IN_REVIEW'] } } },
        { AND: [{ disputedAt: { not: null } }, { dispute: null }] },
      ];
    } else if (query.disputed === 'false') {
      where.OR = [
        { status: 'REFUNDED' },
        { dispute: { status: { notIn: ['OPEN', 'IN_REVIEW'] } } },
        { AND: [{ dispute: null }, { disputedAt: null }] },
      ];
    }

    if (query.q && query.q.trim().length > 0) {
      const term = query.q.trim();
      const orderPrefix = orderIdPrefix(term);
      const searchOr: Record<string, any>[] = [
        { id: { contains: term, mode: 'insensitive' } },
        ...(orderPrefix ? [{ id: { startsWith: orderPrefix } }] : []),
        { stripeChargeId: { contains: term, mode: 'insensitive' } },
        { stripeSessionId: { contains: term, mode: 'insensitive' } },
        { stripePaymentIntentId: { contains: term, mode: 'insensitive' } },
        { client: { name: { contains: term, mode: 'insensitive' } } },
        { client: { email: { contains: term, mode: 'insensitive' } } },
        { repairer: { name: { contains: term, mode: 'insensitive' } } },
        { repairer: { email: { contains: term, mode: 'insensitive' } } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    let cutoff: Date | null = null;
    if (query.period === '7d') {
      cutoff = new Date(Date.now() - 7 * 86_400_000);
    } else if (query.period === '30d') {
      cutoff = new Date(Date.now() - 30 * 86_400_000);
    } else if (query.period === 'month') {
      const now = new Date();
      cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
    }

    // « Paid in this period », like the dashboard and /statistiques (`paidWithin`): an order created
    // last month and paid today belongs to today. An unpaid row falls back to its creation date.
    // AND, because the search and dispute filters above already own `where.OR`.
    const inPeriod = cutoff ? [paidWithin({ gte: cutoff })] : [];
    if (inPeriod.length > 0) {
      where.AND = [...(where.AND ?? []), ...inPeriod];
    }

    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? 25);
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [volumeAgg, escrowAgg, refundAgg, disputedCount, rows, total] = await Promise.all([
      this.prisma.commande.aggregate({
        where: { status: 'PAID', ...GENUINE_COLLECTED_COMMANDE_WHERE, AND: inPeriod },
        _sum: { totalCents: true, protectionCents: true },
      }),
      this.prisma.commande.aggregate({
        where: {
          status: 'PAID',
          step: { not: 'RELEASED' },
          ...GENUINE_COLLECTED_COMMANDE_WHERE,
          AND: inPeriod,
        },
        _sum: { repairCents: true },
      }),
      // CF4-D task 5 (spec §5, §7). `refundedCents` is what the CAS in
      // `RefundService.refund()` actually writes for the amount refunded -
      // `totalCents` is the order's original total and would overstate a partial
      // (flexible) refund.
      this.prisma.commande.aggregate({
        where: { status: 'REFUNDED', ...GENUINE_COLLECTED_COMMANDE_WHERE, AND: inPeriod },
        _sum: { refundedCents: true },
      }),
      this.prisma.dispute.count({
        where: {
          status: { in: ['OPEN', 'IN_REVIEW'] },
          commande: { ...GENUINE_COMMANDE_WHERE, AND: inPeriod },
        },
      }),
      this.prisma.commande.findMany({
        where,
        skip,
        take,
        orderBy: paymentOrderBy(query.sort, query.dir),
        include: {
          client: true,
          repairer: true,
          dispute: true,
        },
      }),
      this.prisma.commande.count({ where }),
    ]);

    const metrics: AdminPaymentMetricsDto = {
      totalVolumeCents: volumeAgg._sum?.totalCents ?? 0,
      commissionCents: volumeAgg._sum?.protectionCents ?? 0,
      escrowCents: escrowAgg._sum?.repairCents ?? 0,
      refundedCents: refundAgg._sum?.refundedCents ?? 0,
      disputedCount: disputedCount ?? 0,
    };

    const items: AdminPaymentListItem[] = rows.map((row: any) => {
      const client = row.clientUser ?? row.client;
      const repairer = row.repairerUser ?? row.repairer;
      const isRefunded = row.status === 'REFUNDED';
      const hasOpenDispute = isDisputeOpen(row.dispute);
      const isDisputed = !isRefunded && (hasOpenDispute || (row.disputedAt !== null && !row.dispute));
      const disputeStatus: DisputeStatusType | null = row.dispute
        ? effectiveDisputeStatus({
            status: row.dispute.status,
            verdict: row.dispute.verdict ?? null,
            commande: row,
          }).status
        : null;

      // Nothing is owed on an order that was never paid or was refunded. Otherwise the same rule as F5.
      const owed = row.status === 'PAID';
      const payoutStatus = owed ? payoutStatusOf(row) : 'NOT_APPLICABLE';
      const payoutAmountCents = owed ? (row.transferredCents ?? row.repairCents ?? 0) : null;

      return {
        id: row.id,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        paidAt: row.paidAt instanceof Date ? row.paidAt.toISOString() : (row.paidAt ? String(row.paidAt) : null),
        status: row.status,
        step: isRefunded ? null : (row.step ?? null),
        delivery: row.delivery,
        totalCents: row.totalCents ?? 0,
        repairCents: row.repairCents ?? 0,
        shippingCents: row.shippingCents ?? 0,
        protectionCents: row.protectionCents ?? 0,
        clientName: client?.name ?? '',
        clientEmail: client?.email ?? '',
        repairerName: repairer?.name ?? '',
        repairerEmail: repairer?.email ?? '',
        isDisputed,
        disputeId: row.dispute?.id ?? null,
        disputeStatus,
        stripeChargeId: row.stripeChargeId ?? null,
        stripeTransferId: row.stripeTransferId ?? null,
        stripeRefundId: row.stripeRefundId ?? null,
        // CF4-D final review, Important #1 (spec §5). The refunded AMOUNT, not
        // `totalCents` - see the field's own doc comment in admin.schemas.ts.
        refundedCents: row.refundedCents ?? null,
        // CF4-I. `include` above reads the whole row, so this is already on it.
        cancellationPending: row.cancellationRequestedAt !== null && row.cancellationRequestedAt !== undefined,
        payoutStatus,
        payoutAmountCents,
      };
    });

    return {
      items,
      metrics,
      total,
      page,
      pageSize,
    };
  }

  /**
   * The manual sweep for checkouts nobody started (no Stripe session, no intent). A row with a Stripe
   * id is left to `CronService.settleOrphanSessions`, which asks Stripe first: see `stale-payment.ts`.
   */
  async abandonStalePayments(): Promise<{ count: number }> {
    const result = await this.prisma.commande.updateMany({
      where: staleUnstartedPaymentWhere(),
      data: { status: 'ABANDONED' },
    });
    return { count: result.count };
  }
}
