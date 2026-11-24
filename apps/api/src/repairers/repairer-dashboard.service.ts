import { Injectable } from '@nestjs/common';
import {
  isActiveCommande,
  isRepairerTurn,
  mergeActivity,
  type CommandeStep,
  type DashboardActivityItem,
  type DashboardTodoItem,
  type RepairerDashboardDto,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isDisputeOpen } from '../commandes/dispute-open.js';
import {
  loadMatchingCategoryIds,
  matchingDemandeWhere,
} from '../demandes/matching-demande-where.js';
import type { Prisma } from '../generated/prisma/client.js';
// A VALUE import: Nest reads the constructor's parameter type at runtime (the `1d28ad4` bug).
import { PrismaService } from '../prisma/prisma.service.js';
import { VISIBLE_DEMANDE_WHERE } from '../demandes/demande-predicates.js';
import { LIVE_OFFER_WHERE } from '../offers/offer-predicates.js';

// Mirrors `isDisputeOpen` (OPEN / IN_REVIEW); the in-memory check below re-applies it.
const OPEN_DISPUTE: Prisma.DisputeWhereInput = { status: { in: ['OPEN', 'IN_REVIEW'] } };
const TITLE = { demande: { select: { title: true } } } as const;

/**
 * CF4-22 « À faire », CF4-23 « Activité récente », CF4-26 matching count - sub-project G,
 * spec §4.3. ONE read, derived from domain tables on every request: nothing is stored, so
 * a line cannot outlive the action it names.
 *
 * 🛑 EVERY read is scoped `repairerUserId = userId`. A réparateur who is also a client has
 * commandes where he is `clientUserId`; those are not his repairs and must never appear here.
 */
@Injectable()
export class RepairerDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<RepairerDashboardDto> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { repairerEnabled: true, dashboardTodoSeenAt: true },
    });
    // Not narrowed to activeMode, and a SUSPENDED réparateur is not refused: his commandes
    // are still his, and he still has steps to take on them.
    if (!profile?.repairerEnabled) {
      throw new AppException(
        'FORBIDDEN',
        'Activez le mode réparateur pour suivre votre activité.',
      );
    }

    const seenAt = profile.dashboardTodoSeenAt ?? null;

    const [inFlight, categoryIds, stepEvents, releases, reviews, disputes] = await Promise.all([
      // « À faire »: active commandes, plus any commande with an open dispute whatever its state.
      // NO `take`, unlike the activity reads below, deliberately: the counts must be exact, and
      // a cap would make « N réparations » lie. The set is his work IN FLIGHT (paid, unreleased,
      // or disputed), which is naturally small, and the select is five scalar columns.
      this.prisma.commande.findMany({
        where: {
          repairerUserId: userId,
          OR: [{ status: 'PAID', step: { not: 'RELEASED' } }, { dispute: OPEN_DISPUTE }],
        },
        select: {
          id: true,
          status: true,
          step: true,
          delivery: true,
          createdAt: true,
          stepEvents: {
            orderBy: { at: 'desc' },
            take: 1,
            select: { at: true, step: true },
          },
          dispute: {
            select: {
              status: true,
              createdAt: true,
              // CF4-22: the latest message of HIS confidential space only. REVIME as its
              // author = REVIME is waiting on him. Never the client space (J: confidential).
              messages: {
                where: { space: 'REPAIRER', deletedAt: null },
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { author: true, createdAt: true },
              },
            },
          },
        },
      }),
      loadMatchingCategoryIds(this.prisma, userId),
      // Activity. `take: 10` because two kinds share this read and each may need 5.
      this.prisma.commandeStepEvent.findMany({
        where: {
          step: { in: ['PAID', 'REPAIR_DONE'] },
          commande: { repairerUserId: userId },
        },
        orderBy: { at: 'desc' },
        take: 10,
        select: { step: true, at: true, commandeId: true, commande: { select: TITLE } },
      }),
      // `status: 'PAID'`: a refunded commande keeps `releasedAt` but is not money he received
      // (same rule as `repairerActivity`). `stripeTransferId` (V8 B2): a payout Revime is holding
      // (no « Virements » yet, or fiscal info missing) is RELEASED with no transfer, and « Fonds
      // versés » would be false for it; it appears here once `payoutStrandedCommandes` pays it.
      this.prisma.commande.findMany({
        where: { repairerUserId: userId, status: 'PAID', releasedAt: { not: null }, stripeTransferId: { not: null } },
        orderBy: { releasedAt: 'desc' },
        take: 5,
        select: {
          id: true,
          releasedAt: true,
          transferredCents: true,
          repairCents: true,
          ...TITLE,
        },
      }),
      this.prisma.review.findMany({
        where: { repairerUserId: userId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { rating: true, createdAt: true, commandeId: true, commande: { select: TITLE } },
      }),
      this.prisma.dispute.findMany({
        where: { commande: { repairerUserId: userId } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { createdAt: true, commandeId: true, commande: { select: TITLE } },
      }),
    ]);

    // Disputed first: a commande under an open dispute is counted there and NEVER as
    // ATTENTION, whatever its step (G3/G4).
    const disputed: string[] = [];
    const awaitingReply: string[] = [];
    const attention: string[] = [];
    let unseenDisputed = 0;
    let unseenAttention = 0;

    for (const c of inFlight) {
      if (isDisputeOpen(c.dispute)) {
        disputed.push(c.id);
        if (c.dispute?.messages?.[0]?.author === 'REVIME') awaitingReply.push(c.id);
        if (!seenAt) {
          unseenDisputed++;
        } else {
          const disputeCreatedAt = c.dispute?.createdAt ? new Date(c.dispute.createdAt) : null;
          const latestMsg = c.dispute?.messages?.[0];
          const msgCreatedAt = latestMsg?.createdAt ? new Date(latestMsg.createdAt) : null;
          const isNew =
            (disputeCreatedAt !== null && disputeCreatedAt > seenAt) ||
            (msgCreatedAt !== null && msgCreatedAt > seenAt && latestMsg?.author === 'REVIME');
          if (isNew) unseenDisputed++;
        }
        continue;
      }
      const step = c.step as CommandeStep | null;
      if (step !== null && isActiveCommande({ status: c.status, step }) && isRepairerTurn(step, c.delivery)) {
        attention.push(c.id);
        if (!seenAt) {
          unseenAttention++;
        } else {
          const stepAt = c.stepEvents?.[0]?.at ?? c.createdAt;
          if (stepAt && new Date(stepAt) > seenAt) {
            unseenAttention++;
          }
        }
      }
    }

    const todo: DashboardTodoItem[] = [];
    if (disputed.length > 0) {
      todo.push({
        kind: 'DISPUTE',
        count: disputed.length,
        // When REVIME is waiting on him, the row opens the dispute that needs his answer.
        commandeId: awaitingReply.length > 0 ? onlyOne(awaitingReply) : onlyOne(disputed),
        awaitingReply: awaitingReply.length,
      });
    }
    if (attention.length > 0) {
      todo.push({ kind: 'ATTENTION', count: attention.length, commandeId: onlyOne(attention) });
    }
    // CF4-25. Private requests addressed to him that still await HIS answer: OPEN, visible,
    // and no live quote from him yet. Before MATCHING - someone asked him by name.
    const quoteRequestsWhere: Prisma.DemandeWhereInput = {
      status: 'OPEN',
      targetRepairerUserId: userId,
      ...VISIBLE_DEMANDE_WHERE,
      offers: { none: { repairerUserId: userId, ...LIVE_OFFER_WHERE } },
    };
    const quoteRequests = await this.prisma.demande.count({ where: quoteRequestsWhere });
    const unseenQuoteRequests = seenAt
      ? await this.prisma.demande.count({
          where: { ...quoteRequestsWhere, createdAt: { gt: seenAt } },
        })
      : quoteRequests;

    if (quoteRequests > 0) todo.push({ kind: 'QUOTE_REQUESTS', count: quoteRequests });

    let matchingCount = 0;
    let unseenMatchingCount = 0;
    if (categoryIds.length === 0) {
      todo.push({ kind: 'CATEGORIES_MISSING' });
    } else {
      const matchWhere = matchingDemandeWhere(userId, categoryIds);
      matchingCount = await this.prisma.demande.count({
        where: matchWhere,
      });
      if (matchingCount > 0) todo.push({ kind: 'MATCHING', count: matchingCount });
      if (seenAt) {
        unseenMatchingCount = await this.prisma.demande.count({
          where: { ...matchWhere, createdAt: { gt: seenAt } },
        });
      } else {
        unseenMatchingCount = matchingCount;
      }
    }

    const unseenMissingCategories = !seenAt && categoryIds.length === 0 ? 1 : 0;
    const unseenTodoCount =
      unseenDisputed +
      unseenAttention +
      unseenQuoteRequests +
      unseenMatchingCount +
      unseenMissingCategories;

    const base = { amountCents: null, rating: null };
    const activity: DashboardActivityItem[] = [
      ...stepEvents.map((e) => ({
        ...base,
        kind: e.step === 'PAID' ? ('OFFER_ACCEPTED' as const) : ('REPAIR_DONE' as const),
        at: e.at.toISOString(),
        commandeId: e.commandeId,
        subject: e.commande.demande.title,
      })),
      ...releases.map((r) => ({
        ...base,
        kind: 'FUNDS_RELEASED' as const,
        // `releasedAt` is non-null by the where-clause above.
        at: (r.releasedAt as Date).toISOString(),
        commandeId: r.id,
        subject: r.demande.title,
        // What he was actually paid, as `CommandeListItem.payoutCents` computes it.
        amountCents: r.transferredCents ?? r.repairCents,
      })),
      ...reviews.map((r) => ({
        ...base,
        kind: 'REVIEW_RECEIVED' as const,
        at: r.createdAt.toISOString(),
        commandeId: r.commandeId,
        subject: r.commande.demande.title,
        rating: r.rating,
      })),
      ...disputes.map((d) => ({
        ...base,
        kind: 'DISPUTE_OPENED' as const,
        at: d.createdAt.toISOString(),
        commandeId: d.commandeId,
        subject: d.commande.demande.title,
      })),
    ];

    return {
      todo,
      activity: mergeActivity(activity),
      todoSeenAt: seenAt ? seenAt.toISOString() : null,
      unseenTodoCount,
    };
  }

  /**
   * CF5-15: Stamp when the réparateur viewed/opened the dashboard panel,
   * dismissing the home notification pill until newer actions arrive.
   */
  async markSeen(userId: string): Promise<void> {
    await this.prisma.profile.update({
      where: { userId },
      data: { dashboardTodoSeenAt: new Date() },
    });
  }
}

/** A row may open that one commande directly only when the count is exactly 1. */
function onlyOne(ids: string[]): string | null {
  return ids.length === 1 ? (ids[0] ?? null) : null;
}
