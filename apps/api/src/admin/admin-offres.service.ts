import { Injectable } from '@nestjs/common';
import { OFFER_UNANSWERED_AFTER_DAYS } from '@revime/shared';
import type {
  AdminOfferContextDto,
  AdminOffreListItem,
  AdminOffreListResponse,
  ModerateOfferBody,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { repairerStats } from '../reviews/repairer-stats.js';
import { PAGE_SIZE } from './admin-constants.js';

const STATUTS = ['SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'] as const;
const ETATS = ['visible', 'retiree'] as const;
const KIND_TO_DB_MAP: Record<string, 'PRO' | 'INDIVIDUAL'> = {
  PROFESSIONNEL: 'PRO',
  PARTICULIER: 'INDIVIDUAL',
};
const TRAVELS = ['WORKSHOP', 'HOME'] as const;


/**
 * Here rather than in `packages/shared`, following `AdminDemandeListQuery` and
 * `AdminUserListQuery`: a query type is the controller's input shape and no other app
 * constructs it - the admin page builds a `URLSearchParams`, not this object. The
 * controller imports it from here.
 *
 * `page?: number` is honest because Task 13's controller converts with `Number(page || 1)`.
 */
export type AdminOffreListQuery = {
  q?: string;
  statut?: string;
  etat?: string;
  kind?: string;
  travel?: string;
  parcel?: string;
  minPriceCents?: number;
  maxPriceCents?: number;
  du?: string;
  au?: string;
  sortBy?: string;
  page?: number;
};

/** Returns a Date only for a parseable input, so a typo cannot reach the driver. */
function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * P10. The three flags /offres adds to a row, read off the offer and its demande. One function for the
 * list and for the target offer of the inspection drawer, so the two cannot drift.
 */
function offerSignals(
  offer: { id: string; priceCents: number; status: string; createdAt: Date },
  demande: { budgetCents: number | null; commandes: { status: string; offerId: string }[] },
): Pick<
  AdminOffreListItem,
  'demandeBudgetCents' | 'isOverBudget' | 'overBudgetCents' | 'isUnanswered' | 'hasPendingPaymentOrder'
> {
  const budget = demande.budgetCents;
  const isOverBudget = budget !== null && offer.priceCents > budget;
  return {
    demandeBudgetCents: budget,
    isOverBudget,
    overBudgetCents: isOverBudget ? offer.priceCents - budget : null,
    isUnanswered:
      offer.status === 'SENT' &&
      Date.now() - offer.createdAt.getTime() > OFFER_UNANSWERED_AFTER_DAYS * 86_400_000,
    hasPendingPaymentOrder:
      offer.status === 'ACCEPTED' &&
      demande.commandes.some((c) => c.status === 'PENDING_PAYMENT' && c.offerId === offer.id),
  };
}

@Injectable()
export class AdminOffresService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminOffreListQuery): Promise<AdminOffreListResponse> {
    // Math.trunc||1 catches NaN, Math.max catches negatives - the same two guards, for the
    // same two reasons, as AdminDemandesService.list's clamp. Neither is redundant.
    const page = Math.max(Math.trunc(query.page ?? 1) || 1, 1);

    const and: Record<string, unknown>[] = [];

    /**
     * 🛑 NO DEFAULT VISIBILITY FILTER and NO DEMANDE VISIBILITY FILTER. An operator
     * looking at offers must see offers on demandes he has hidden - that is the same rule
     * the demandes list follows, and the reason `VISIBLE_DEMANDE_WHERE` is not used
     * anywhere in this file. This is written as a comment because a reader who has just
     * done Task 4 will reach for it.
     */

    if (query.etat && (ETATS as readonly string[]).includes(query.etat)) {
      if (query.etat === 'retiree') and.push({ deletedAt: { not: null } });
      // 'visible' means NOT withdrawn, i.e., deletedAt is null
      else and.push({ deletedAt: null });
    }

    if (query.statut && (STATUTS as readonly string[]).includes(query.statut)) {
      and.push({ status: query.statut });
    }

    if (query.kind && KIND_TO_DB_MAP[query.kind]) {
      and.push({ repairer: { repairerProfile: { kind: KIND_TO_DB_MAP[query.kind] } } });
    }

    if (query.travel && (TRAVELS as readonly string[]).includes(query.travel)) {
      and.push({ travel: query.travel });
    }

    if (query.parcel === 'true') {
      and.push({ acceptsParcel: true });
    }

    if (query.minPriceCents != null || query.maxPriceCents != null) {
      and.push({
        priceCents: {
          ...(query.minPriceCents != null ? { gte: query.minPriceCents } : {}),
          ...(query.maxPriceCents != null ? { lte: query.maxPriceCents } : {}),
        },
      });
    }

    const from = parseDay(query.du);
    const to = parseDay(query.au);
    if (from || to) {
      // Upper bound is exclusive (lt) of the following day's midnight, making the selected day
      // fully inclusive. Without this, au = 2026-09-30 would exclude anything created ON that day.
      const upperBound = to ? new Date(to) : null;
      if (upperBound) {
        upperBound.setUTCDate(upperBound.getUTCDate() + 1);
      }
      and.push({
        createdAt: { ...(from ? { gte: from } : {}), ...(upperBound ? { lt: upperBound } : {}) },
      });
    }

    const q = query.q?.trim();
    if (q) {
      // `mode: 'insensitive'` is required rather than decorative: none of these columns is
      // stored canonically, and the comment is free text.
      and.push({
        OR: [
          { repairer: { name: { contains: q, mode: 'insensitive' } } },
          { repairer: { email: { contains: q, mode: 'insensitive' } } },
          { repairer: { username: { contains: q, mode: 'insensitive' } } },
          { demande: { title: { contains: q, mode: 'insensitive' } } },
          { comment: { contains: q, mode: 'insensitive' } },
          { warrantyLabel: { contains: q, mode: 'insensitive' } },
          { partsLabel: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    let orderBy: Record<string, 'asc' | 'desc'> = { createdAt: 'desc' };
    if (query.sortBy === 'created_asc') {
      orderBy = { createdAt: 'asc' };
    } else if (query.sortBy === 'price_asc') {
      orderBy = { priceCents: 'asc' };
    } else if (query.sortBy === 'price_desc') {
      orderBy = { priceCents: 'desc' };
    } else {
      orderBy = { createdAt: 'desc' };
    }

    // 🛑 `AND` rather than spreading the fragments into one object. Two fragments here can
    // each contribute a top-level `OR` - q does today - and spreading would silently
    // overwrite the first. This is the bug the roadmap's `DemandesService.feed` backlog
    // entry describes, avoided by construction.
    const where = and.length ? { AND: and } : {};

    // First transaction: fetch the page of offers and the total count
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          demandeId: true,
          repairerUserId: true,
          priceCents: true,
          delayHours: true,
          warrantyLabel: true,
          partsLabel: true,
          travel: true,
          acceptsParcel: true,
          comment: true,
          status: true,
          createdAt: true,
          deletedAt: true,
          deletedReason: true,
          deletedByUserId: true,
          demande: {
            select: {
              title: true,
              budgetCents: true,
              commandes: { select: { status: true, offerId: true } },
            },
          },
          repairer: {
            select: {
              name: true,
              repairerProfile: {
                select: {
                  kind: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.offer.count({ where }),
    ]);

    // If no rows, return early
    if (!rows.length) {
      return { items: [], total, page, pageSize: PAGE_SIZE };
    }

    const repairerUserIds = Array.from(new Set(rows.map((r) => r.repairerUserId)));

    // Second queries: fetch derived data for the page.
    // One transaction for revision chains and report counts, one call for repairer reputation stats.
    const [[revisionData, conversations], statsMap] = await Promise.all([
      this.prisma.$transaction([
        // Compute revision chains for all offers on the page with one query
        this.prisma.offer.findMany({
          where: {
            OR: rows.map((r) => ({ demandeId: r.demandeId, repairerUserId: r.repairerUserId })),
          },
          select: {
            id: true,
            demandeId: true,
            repairerUserId: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'asc' },
        }),
        // Count conversation reports for all offer pairs on the page with one query.
        // Keyed by (demandeId, repairerUserId) which is exactly the Conversation's @@unique.
        this.prisma.conversation.findMany({
          where: {
            OR: rows.map((r) => ({ demandeId: r.demandeId, repairerUserId: r.repairerUserId })),
          },
          select: {
            demandeId: true,
            repairerUserId: true,
            _count: { select: { reports: true } },
          },
        }),
      ]),
      repairerStats(this.prisma, repairerUserIds),
    ]);

    // Build a map of (demandeId, repairerUserId) to report count
    const conversationReportMap = new Map<string, number>();
    for (const conv of conversations) {
      const key = `${conv.demandeId}:${conv.repairerUserId}`;
      conversationReportMap.set(key, conv._count.reports);
    }

    // Build revision chain lookup: (demandeId, repairerUserId) -> sorted offer ids
    const revisionChainMap = new Map<string, string[]>();
    for (const rev of revisionData) {
      const key = `${rev.demandeId}:${rev.repairerUserId}`;
      if (!revisionChainMap.has(key)) {
        revisionChainMap.set(key, []);
      }
      revisionChainMap.get(key)!.push(rev.id);
    }

    const items: AdminOffreListItem[] = rows.map((row) => {
      const chainKey = `${row.demandeId}:${row.repairerUserId}`;
      const chain = revisionChainMap.get(chainKey) || [row.id];
      const position = chain.indexOf(row.id) + 1;
      const total = chain.length;

      const conversationReportCount = conversationReportMap.get(chainKey) || 0;
      const rawKind = row.repairer.repairerProfile?.kind;
      const repairerKind: 'PARTICULIER' | 'PROFESSIONNEL' =
        rawKind === 'PRO' ? 'PROFESSIONNEL' : 'PARTICULIER';
      const stats = statsMap.get(row.repairerUserId);
      const repairerRating = stats?.rating ?? null;
      const repairerReviewCount = stats?.reviewCount ?? 0;

      const signals = offerSignals(row, row.demande);

      return {
        offerId: row.id,
        demandeId: row.demandeId,
        demandeTitle: row.demande.title,
        repairerUserId: row.repairerUserId,
        repairerName: row.repairer.name,
        repairerKind,
        repairerRating,
        repairerReviewCount,
        priceCents: row.priceCents,
        delayHours: row.delayHours,
        warrantyLabel: row.warrantyLabel,
        partsLabel: row.partsLabel,
        travel: row.travel as 'WORKSHOP' | 'HOME',
        acceptsParcel: row.acceptsParcel,
        comment: row.comment,
        status: row.status as 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN',
        withdrawn: row.deletedAt !== null,
        deletedReason: row.deletedReason,
        deletedByUserId: row.deletedByUserId,
        revision: { position, total },
        conversationReportCount,
        createdAt: row.createdAt.toISOString(),
        ...signals,
      };
    });

    return { items, total, page, pageSize: PAGE_SIZE };
  }

  async getContext(id: string): Promise<AdminOfferContextDto> {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        demande: {
          select: {
            id: true,
            title: true,
            budgetCents: true,
            mode: true,
            status: true,
            locationLabel: true,
            createdAt: true,
            category: { select: { labelFr: true, slug: true } },
            author: { select: { id: true, name: true } },
            commandes: { select: { id: true, status: true, offerId: true } },
          },
        },
        repairer: {
          select: {
            name: true,
            repairerProfile: {
              select: {
                kind: true,
              },
            },
          },
        },
      },
    });

    if (!offer) {
      throw new AppException('NOT_FOUND', 'Ressource introuvable.');
    }

    const allOffers = await this.prisma.offer.findMany({
      where: { demandeId: offer.demandeId },
      include: {
        repairer: {
          select: {
            name: true,
            repairerProfile: {
              select: {
                kind: true,
              },
            },
          },
        },
      },
      orderBy: { priceCents: 'asc' },
    });

    const [revisionOffers, conversations] = await this.prisma.$transaction([
      this.prisma.offer.findMany({
        where: {
          OR: [{ demandeId: offer.demandeId, repairerUserId: offer.repairerUserId }],
        },
        select: { id: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.conversation.findMany({
        where: {
          OR: [{ demandeId: offer.demandeId, repairerUserId: offer.repairerUserId }],
        },
        select: {
          demandeId: true,
          repairerUserId: true,
          _count: { select: { reports: true } },
        },
      }),
    ]);

    const conversationReportCount = conversations[0]?._count?.reports ?? 0;
    const revisionChain = revisionOffers.map((o) => o.id);
    const position = revisionChain.indexOf(offer.id) + 1 || 1;
    const total = revisionChain.length || 1;

    const offerCreatedAt =
      offer.createdAt instanceof Date ? offer.createdAt.toISOString() : String(offer.createdAt);
    const demandeCreatedAt =
      offer.demande.createdAt instanceof Date
        ? offer.demande.createdAt.toISOString()
        : String(offer.demande.createdAt);

    const categoryObj = offer.demande.category as { labelFr?: string; name?: string; slug?: string } | null;
    const categoryName = categoryObj?.labelFr ?? categoryObj?.name ?? '';
    const categorySlug = categoryObj?.slug ?? '';

    const allRepairerUserIds = Array.from(
      new Set([offer.repairerUserId, ...allOffers.map((o) => o.repairerUserId)]),
    );
    const statsMap = await repairerStats(this.prisma, allRepairerUserIds);

    const targetRawKind = offer.repairer.repairerProfile?.kind;
    const targetKind: 'PARTICULIER' | 'PROFESSIONNEL' =
      targetRawKind === 'PRO' ? 'PROFESSIONNEL' : 'PARTICULIER';
    const targetStats = statsMap.get(offer.repairerUserId);
    const targetRating = targetStats?.rating ?? null;
    const targetReviewCount = targetStats?.reviewCount ?? 0;

    const targetItem: AdminOffreListItem = {
      offerId: offer.id,
      demandeId: offer.demandeId,
      demandeTitle: offer.demande.title,
      repairerUserId: offer.repairerUserId,
      repairerName: offer.repairer.name,
      repairerKind: targetKind,
      repairerRating: targetRating,
      repairerReviewCount: targetReviewCount,
      priceCents: offer.priceCents,
      delayHours: offer.delayHours,
      warrantyLabel: offer.warrantyLabel,
      partsLabel: offer.partsLabel,
      travel: offer.travel as 'WORKSHOP' | 'HOME',
      acceptsParcel: offer.acceptsParcel,
      comment: offer.comment,
      status: offer.status as 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN',
      withdrawn: offer.deletedAt !== null,
      deletedReason: offer.deletedReason,
      deletedByUserId: offer.deletedByUserId,
      revision: { position, total },
      conversationReportCount,
      createdAt: offerCreatedAt,
      ...offerSignals(offer, offer.demande),
    };

    const totalOffers = allOffers.length;
    const lowestPriceCents = totalOffers > 0 ? Math.min(...allOffers.map((o) => o.priceCents)) : null;
    const highestPriceCents = totalOffers > 0 ? Math.max(...allOffers.map((o) => o.priceCents)) : null;
    const averagePriceCents =
      totalOffers > 0
        ? Math.round(allOffers.reduce((sum, o) => sum + o.priceCents, 0) / totalOffers)
        : null;

    const competingOffers = allOffers.map((o) => {
      const compRawKind = o.repairer.repairerProfile?.kind;
      const compKind: 'PARTICULIER' | 'PROFESSIONNEL' =
        compRawKind === 'PRO' ? 'PROFESSIONNEL' : 'PARTICULIER';
      const compStats = statsMap.get(o.repairerUserId);
      const compRating = compStats?.rating ?? null;

      return {
        id: o.id,
        repairerUserId: o.repairerUserId,
        repairerName: o.repairer.name,
        repairerKind: compKind,
        repairerRating: compRating,
        priceCents: o.priceCents,
        delayHours: o.delayHours,
        warrantyLabel: o.warrantyLabel,
        travel: o.travel as 'WORKSHOP' | 'HOME',
        acceptsParcel: o.acceptsParcel,
        status: o.status as 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN',
        createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : String(o.createdAt),
        isCurrent: o.id === offer.id,
      };
    });

    return {
      offer: targetItem,
      demande: {
        id: offer.demande.id,
        title: offer.demande.title,
        categoryName,
        categorySlug,
        budgetCents: offer.demande.budgetCents,
        mode: offer.demande.mode as 'OFFERS' | 'BUDGET',
        status: offer.demande.status,
        authorName: offer.demande.author.name,
        authorUserId: offer.demande.author.id,
        locationLabel: offer.demande.locationLabel,
        createdAt: demandeCreatedAt,
      },
      competingOffers,
      stats: {
        totalOffers,
        lowestPriceCents,
        averagePriceCents,
        highestPriceCents,
      },
    };
  }

  async moderateDelete(id: string, body: ModerateOfferBody, adminUserId: string) {
    const offer = await this.prisma.offer.findUnique({
      where: { id },
      include: {
        commandes: {
          where: { status: 'PENDING_PAYMENT' },
          select: { id: true, status: true },
        },
      },
    });

    if (!offer) {
      throw new AppException('NOT_FOUND', 'Ressource introuvable.');
    }

    if (offer.deletedAt !== null || offer.status === 'WITHDRAWN') {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette offre est déjà retirée.');
    }

    const hasPendingPayment =
      Array.isArray(offer.commandes) &&
      offer.commandes.some((c: { status?: string }) => c.status === 'PENDING_PAYMENT');
    if (hasPendingPayment) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Un paiement est en cours sur cette offre.');
    }

    const updated = await this.prisma.offer.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        status: 'WITHDRAWN',
        deletedReason: body.reason,
        deletedByUserId: adminUserId,
      },
      select: {
        id: true,
        demandeId: true,
        repairerUserId: true,
        deletedAt: true,
      },
    });

    return { success: true, ...updated };
  }
}
