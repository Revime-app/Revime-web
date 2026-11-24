import { Injectable } from '@nestjs/common';
import {
  parisDayStart,
  type AdminReviewDetail,
  type AdminReviewListItem,
  type AdminReviewListQuery,
  type AdminReviewsPage,
  type AdminReviewsSummary,
  type HideReviewInput,
  type ReviewModerationMotif,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppException } from '../common/app-exception.js';
import { DEMO_EMAIL_SUFFIX, PAGE_SIZE } from './admin-constants.js';
import { isDemoReview, NOT_DEMO_REVIEW_WHERE } from '../reviews/demo-review.js';

const NOT_FOUND = 'Ressource introuvable.';
const ALREADY_HIDDEN = 'Cet avis est déjà masqué.';
const ALREADY_VISIBLE = 'Cet avis est déjà visible.';

const DEMO_EMAIL = { endsWith: DEMO_EMAIL_SUFFIX, mode: 'insensitive' } as const;

const LIST_SELECT = {
  id: true,
  createdAt: true,
  rating: true,
  comment: true,
  authorUserId: true,
  repairerUserId: true,
  commandeId: true,
  deletedAt: true,
  moderationMotif: true,
  author: { select: { username: true, email: true } },
  repairer: { select: { username: true, email: true } },
  commande: { select: { demande: { select: { title: true } } } },
} as const;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  qualityRating: true,
  delayRating: true,
  communicationRating: true,
  moderationNote: true,
  moderatedByUserId: true,
  commande: {
    select: {
      id: true,
      status: true,
      step: true,
      repairCents: true,
      shippingCents: true,
      protectionCents: true,
      totalCents: true,
      createdAt: true,
      paidAt: true,
      releasedAt: true,
      demande: { select: { title: true } },
    },
  },
} as const;

type ListRow = {
  id: string;
  createdAt: Date;
  rating: number;
  comment: string | null;
  authorUserId: string;
  repairerUserId: string;
  commandeId: string;
  deletedAt: Date | null;
  moderationMotif: ReviewModerationMotif | null;
  author: { username: string | null; email: string };
  repairer: { username: string | null; email: string };
  commande: { demande: { title: string } };
};

type DetailRow = ListRow & {
  qualityRating: number | null;
  delayRating: number | null;
  communicationRating: number | null;
  moderationNote: string | null;
  moderatedByUserId: string | null;
  commande: {
    id: string;
    status: string;
    step: string | null;
    repairCents: number;
    shippingCents: number;
    protectionCents: number;
    totalCents: number;
    createdAt: Date;
    paidAt: Date | null;
    releasedAt: Date | null;
    demande: { title: string };
  };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

/** The calendar day after `YYYY-MM-DD` (UTC arithmetic on a date-only value is exact). */
const nextDay = (ymd: string) => new Date(Date.parse(`${ymd}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

/**
 * CF4-37 « Avis » (spec L3, L4, §4.3). « Hidden » IS `Review.deletedAt`, so every public read
 * and the rating aggregate already exclude a hidden review; this service is its ONLY writer.
 * A hide requires a motif and is reversible; there is no « negative review » motif.
 */
@Injectable()
export class AdminReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: AdminReviewListQuery): Promise<AdminReviewsPage> {
    const and: Record<string, unknown>[] = [];
    if (q.state === 'hidden') and.push({ deletedAt: { not: null } });
    if (q.state === 'visible') and.push({ deletedAt: null });
    if (q.rating !== undefined) {
      if (q.rating === 'negative') {
        and.push({ rating: { lte: 2 } });
      } else {
        and.push({ rating: q.rating });
      }
    }
    // Europe/Paris calendar days, `to` inclusive (spec L5's day, reused).
    if (q.from) and.push({ createdAt: { gte: parisDayStart(q.from) } });
    if (q.to) and.push({ createdAt: { lt: parisDayStart(nextDay(q.to)) } });
    if (q.demo === 'yes') and.push({ OR: [{ author: { email: DEMO_EMAIL } }, { repairer: { email: DEMO_EMAIL } }] });
    if (q.demo === 'no') {
      and.push({ NOT: { author: { email: DEMO_EMAIL } } }, { NOT: { repairer: { email: DEMO_EMAIL } } });
    }
    if (q.q) {
      const c = { contains: q.q, mode: 'insensitive' as const };
      and.push({
        OR: [
          { author: { username: c } },
          { author: { email: c } },
          { repairer: { username: c } },
          { repairer: { email: c } },
          { commandeId: c },
          { comment: c },
        ],
      });
    }

    const where = { AND: and };
    const page = Math.max(1, q.page ?? 1);
    const [rows, total, summary] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: LIST_SELECT,
      }),
      this.prisma.review.count({ where }),
      this.computeSummary(),
    ]);

    return {
      items: (rows as ListRow[]).map((r) => this.toItem(r)),
      total,
      page,
      pageSize: PAGE_SIZE,
      summary,
    };
  }

  private async computeSummary(): Promise<AdminReviewsSummary> {
    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };

    // The figure customers see: hidden reviews and demo reviews (PRE-2) are not part of any public rating,
    // so they are not part of this one. It is global on purpose: the list's filters do not narrow it.
    const groups = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { deletedAt: null, ...NOT_DEMO_REVIEW_WHERE },
      _count: { _all: true },
    });

    let totalReviews = 0;
    let sum = 0;

    for (const g of groups) {
      const rating = g.rating as 1 | 2 | 3 | 4 | 5;
      const count = g._count?._all ?? 0;
      if (rating >= 1 && rating <= 5) {
        distribution[rating] = count;
        totalReviews += count;
        sum += rating * count;
      }
    }

    const averageRating = totalReviews > 0 ? Number((sum / totalReviews).toFixed(1)) : 0;

    return {
      averageRating,
      totalReviews,
      distribution,
    };
  }

  async detail(id: string): Promise<AdminReviewDetail> {
    const r = (await this.prisma.review.findUnique({ where: { id }, select: DETAIL_SELECT })) as DetailRow | null;
    if (!r) throw new AppException('NOT_FOUND', NOT_FOUND);

    let moderatorName: string | null = null;
    if (r.deletedAt && r.moderatedByUserId) {
      // No relation on purpose (schema): the moderator may have deleted his account.
      const u = await this.prisma.user.findUnique({ where: { id: r.moderatedByUserId }, select: { username: true } });
      moderatorName = u?.username ?? null;
    }

    return {
      ...this.toItem(r),
      qualityRating: r.qualityRating,
      delayRating: r.delayRating,
      communicationRating: r.communicationRating,
      commande: {
        id: r.commande.id,
        status: r.commande.status,
        step: r.commande.step,
        repairCents: r.commande.repairCents,
        shippingCents: r.commande.shippingCents,
        protectionCents: r.commande.protectionCents,
        totalCents: r.commande.totalCents,
        createdAt: r.commande.createdAt.toISOString(),
        paidAt: iso(r.commande.paidAt),
        releasedAt: iso(r.commande.releasedAt),
      },
      moderation: r.deletedAt
        ? {
            motif: r.moderationMotif,
            note: r.moderationNote,
            moderatorUserId: r.moderatedByUserId,
            moderatorName,
            at: r.deletedAt.toISOString(),
          }
        : null,
    };
  }

  /**
   * Conditional on `deletedAt: null`, so a double-click (or two operators) cannot overwrite the
   * first motif and moderator: the second write matches nothing and answers CONFLICT.
   */
  async hide(id: string, input: HideReviewInput, actorUserId: string): Promise<AdminReviewDetail> {
    const { count } = await this.prisma.review.updateMany({
      where: { id, deletedAt: null },
      data: {
        deletedAt: new Date(),
        moderationMotif: input.motif,
        moderationNote: input.note ?? null,
        moderatedByUserId: actorUserId,
      },
    });
    if (count === 0) await this.conflictOrNotFound(id, ALREADY_HIDDEN);
    return this.detail(id);
  }

  /** Conditional on `deletedAt` set, so restoring a visible review touches nothing. */
  async restore(id: string): Promise<AdminReviewDetail> {
    const { count } = await this.prisma.review.updateMany({
      where: { id, deletedAt: { not: null } },
      data: { deletedAt: null, moderationMotif: null, moderationNote: null, moderatedByUserId: null },
    });
    if (count === 0) await this.conflictOrNotFound(id, ALREADY_VISIBLE);
    return this.detail(id);
  }

  private async conflictOrNotFound(id: string, conflict: string): Promise<never> {
    const exists = await this.prisma.review.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new AppException('NOT_FOUND', NOT_FOUND);
    throw new AppException('CONFLICT', conflict);
  }

  private toItem(r: ListRow): AdminReviewListItem {
    return {
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      rating: r.rating,
      comment: r.comment,
      authorUserId: r.authorUserId,
      authorUsername: r.author.username,
      authorEmail: r.author.email,
      repairerUserId: r.repairerUserId,
      repairerUsername: r.repairer.username,
      repairerEmail: r.repairer.email,
      commandeId: r.commandeId,
      demandeTitle: r.commande.demande.title,
      isDemo: isDemoReview(r.author.email, r.repairer.email),
      hidden: r.deletedAt !== null,
      moderationMotif: r.deletedAt ? r.moderationMotif : null,
    };
  }
}
