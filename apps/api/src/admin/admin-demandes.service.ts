import { Injectable } from '@nestjs/common';
import type {
  AdminAuditAction,
  AdminDemandeActivityEntry,
  AdminDemandeConversationThread,
  AdminDemandeDetail,
  AdminDemandeListItem,
  AdminDemandeListResponse,
  AdminDemandeState,
  ReportReason,
} from '@revime/shared';
import { COMMANDE_STATUS_LABEL, REPORT_REASON_LABEL } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { ACCEPTABLE_OFFER_WHERE } from '../offers/offer-predicates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { storageGateway } from '../storage/gateway.js';
import { PAGE_SIZE } from './admin-constants.js';

const STATUTS = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
const ETATS = ['visible', 'masquee', 'supprimee'] as const;
/** CF4-25. `devis` = private quote requests, `publique` = everything else. */
const TYPES = ['publique', 'devis'] as const;

const NOT_FOUND = 'Ressource introuvable.';
const READ_URL_TTL_SECONDS = 3600;

/** How many of each kind the merged timeline carries. Matches B1's fiche. */
export const HISTORY_PER_KIND = 10;

/**
 * Here rather than in `packages/shared`, following `AdminUserListQuery`: a query type is the
 * controller's input shape and no other app constructs it - the admin page builds a
 * `URLSearchParams`, not this object. The controller imports it from here.
 */
export type AdminDemandeListQuery = {
  q?: string;
  categorie?: string;
  statut?: string;
  etat?: string;
  type?: string;
  du?: string;
  au?: string;
  page?: number;
};

/**
 * `deletedAt` wins, which is reachable and intended: an operator hides a demande to triage
 * it and then deletes it, so both markers end up set and the row is gone rather than merely
 * hidden.
 */
export function stateOf(row: { deletedAt: Date | null; hiddenAt: Date | null }): AdminDemandeState {
  if (row.deletedAt) return 'supprimee';
  if (row.hiddenAt) return 'masquee';
  return 'visible';
}

/** Returns a Date only for a parseable input, so a typo cannot reach the driver. */
function parseDay(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class AdminDemandesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: AdminDemandeListQuery): Promise<AdminDemandeListResponse> {
    // Math.trunc||1 catches NaN, Math.max catches negatives - the same two guards, for the
    // same two reasons, as AdminUsersService.list's clamp. Neither is redundant.
    const page = Math.max(Math.trunc(query.page ?? 1) || 1, 1);

    const and: Record<string, unknown>[] = [];

    /**
     * 🛑 NO DEFAULT VISIBILITY FILTER, and this is the deliberate inverse of the users
     * list, which hides tombstones by default. A hidden demande is exactly what an operator
     * comes here to find, and defaulting it away would make « Masquer » look like it had
     * failed. The `état` column on every row is what keeps the list honest instead.
     */
    if (query.etat && (ETATS as readonly string[]).includes(query.etat)) {
      if (query.etat === 'supprimee') and.push({ deletedAt: { not: null } });
      // Both keys: a deleted demande that was hidden first must read as deleted, matching
      // stateOf's precedence. Without `deletedAt: null` this filter would also return it.
      else if (query.etat === 'masquee') and.push({ hiddenAt: { not: null }, deletedAt: null });
      else and.push({ hiddenAt: null, deletedAt: null });
    }

    if (query.statut && (STATUTS as readonly string[]).includes(query.statut)) {
      and.push({ status: query.statut });
    }

    if (query.type && (TYPES as readonly string[]).includes(query.type)) {
      and.push({ targetRepairerUserId: query.type === 'devis' ? { not: null } : null });
    }

    // The category id is a uuid we do not validate against the table: an unknown id returns
    // an empty list, which is the correct answer to « demandes in a category that does not
    // exist » and needs no extra query to say so.
    if (query.categorie) and.push({ categoryId: query.categorie });

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
      // `mode: 'insensitive'` is required rather than decorative: none of these four columns
      // is stored canonically, and `brand`/`model` are free text a client typed.
      and.push({
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { brand: { contains: q, mode: 'insensitive' } },
          { model: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    // 🛑 `AND` rather than spreading the fragments into one object. Two fragments here can
    // each contribute a top-level `OR` - q does today, and a future filter will - and
    // spreading would silently overwrite the first. This is the bug the roadmap's
    // `DemandesService.feed` backlog entry describes, avoided by construction.
    const where = and.length ? { AND: and } : {};

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.demande.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          title: true,
          status: true,
          locationLabel: true,
          createdAt: true,
          deletedAt: true,
          hiddenAt: true,
          hiddenByUserId: true,
          deletedByUserId: true,
          authorUserId: true,
          author: { select: { name: true } },
          category: { select: { labelFr: true } },
          // ACCEPTABLE, not LIVE: this count must agree with the number the client is shown
          // on his own demandes list, which uses the same predicate.
          _count: { select: { offers: { where: ACCEPTABLE_OFFER_WHERE } } },
          targetRepairerUserId: true,
          quoteClosedReason: true,
        },
      }),
      this.prisma.demande.count({ where }),
    ]);

    const targets = await this.targetNames(rows.map((r) => r.targetRepairerUserId));

    const items: AdminDemandeListItem[] = rows.map((row) => ({
      demandeId: row.id,
      title: row.title,
      categoryLabelFr: row.category.labelFr,
      status: row.status,
      state: stateOf(row),
      // Either marker having an actor means WE removed it. A client's own CF-16 delete
      // writes deletedAt and leaves deletedByUserId null, which is the distinction the
      // column exists to make.
      removedByAdmin: row.hiddenByUserId !== null || row.deletedByUserId !== null,
      authorUserId: row.authorUserId,
      authorName: row.author.name,
      locationLabel: row.locationLabel,
      offerCount: row._count.offers,
      quoteTarget: quoteTargetOf(row.targetRepairerUserId, targets),
      quoteClosedReason: row.quoteClosedReason,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, total, page, pageSize: PAGE_SIZE };
  }

  /**
   * CF4-25. The account names of the réparateurs private requests are addressed to, in ONE
   * read, and none when no row is private. No relation exists on `targetRepairerUserId`
   * (spec §4.1), so this cannot be a nested select.
   */
  private async targetNames(ids: ReadonlyArray<string | null>): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => !!id))];
    if (unique.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  async detail(demandeId: string): Promise<AdminDemandeDetail> {
    const row = await this.prisma.demande.findUnique({
      where: { id: demandeId },
      select: {
        id: true,
        title: true,
        description: true,
        brand: true,
        model: true,
        parts: true,
        mode: true,
        budgetCents: true,
        locationLabel: true,
        postalCode: true,
        status: true,
        categoryId: true,
        createdAt: true,
        deletedAt: true,
        hiddenAt: true,
        hiddenReason: true,
        deletedReason: true,
        hiddenByUserId: true,
        deletedByUserId: true,
        targetRepairerUserId: true,
        quoteClosedReason: true,
        author: { select: { id: true, name: true, email: true } },
        category: { select: { labelFr: true } },
        faultType: { select: { id: true, labelFr: true, slug: true } },
        photos: { select: { storagePath: true } },
        offers: {
          select: {
            id: true,
            status: true,
            priceCents: true,
            createdAt: true,
            repairer: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_PER_KIND,
        },
        commandes: {
          select: {
            id: true,
            status: true,
            totalCents: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_PER_KIND,
        },
      },
    });

    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);

    const [conversations, conversationReports, reviews, adminAuditLogs, pendingPaymentCount] =
      await this.prisma.$transaction([
        this.prisma.conversation.findMany({
          where: { demandeId },
          include: {
            repairer: { select: { id: true, name: true } },
            messages: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                senderUserId: true,
                kind: true,
                body: true,
                createdAt: true,
                deletedAt: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        }),
        this.prisma.conversationReport.findMany({
          where: { conversation: { demandeId } },
          select: { id: true, createdAt: true, reason: true },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_PER_KIND,
        }),
        this.prisma.review.findMany({
          where: { commande: { demandeId } },
          select: { id: true, createdAt: true, rating: true },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_PER_KIND,
        }),
        this.prisma.adminAuditLog.findMany({
          where: { targetType: 'Demande', targetId: demandeId },
          select: {
            id: true,
            action: true,
            actorEmail: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: HISTORY_PER_KIND,
        }),
        this.prisma.commande.count({
          where: { demandeId, status: 'PENDING_PAYMENT' },
        }),
      ]);

    const activity: AdminDemandeActivityEntry[] = [
      ...row.offers.map(
        (o): AdminDemandeActivityEntry => ({
          kind: 'offre',
          id: o.id,
          label: `Offre de ${o.repairer.name} - ${(o.priceCents / 100).toFixed(2)} €`,
          at: o.createdAt.toISOString(),
        }),
      ),
      ...row.commandes.map(
        (c): AdminDemandeActivityEntry => ({
          kind: 'commande',
          id: c.id,
          label: `Commande ${COMMANDE_STATUS_LABEL[c.status as keyof typeof COMMANDE_STATUS_LABEL] ?? c.status} - ${(c.totalCents / 100).toFixed(2)} €`,
          at: c.createdAt.toISOString(),
        }),
      ),
      ...conversations.map(
        (c): AdminDemandeActivityEntry => ({
          kind: 'conversation',
          id: c.id,
          label: 'Conversation démarrée',
          at: c.createdAt.toISOString(),
        }),
      ),
      ...conversationReports.map(
        (r): AdminDemandeActivityEntry => ({
          kind: 'signalement',
          id: r.id,
          label: `Signalement : ${REPORT_REASON_LABEL[r.reason as ReportReason] ?? r.reason}`,
          at: r.createdAt.toISOString(),
        }),
      ),
      ...reviews.map(
        (r): AdminDemandeActivityEntry => ({
          kind: 'avis',
          id: r.id,
          label: `Avis - ${r.rating} étoiles`,
          at: r.createdAt.toISOString(),
        }),
      ),
      ...adminAuditLogs.map(
        (a): AdminDemandeActivityEntry => ({
          kind: 'admin',
          id: a.id,
          label: `${a.action} par ${a.actorEmail}`,
          at: a.createdAt.toISOString(),
          action: a.action as AdminAuditAction,
          actorEmail: a.actorEmail,
        }),
      ),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    const paths = row.photos.map((p) => p.storagePath);
    const signed = await storageGateway().createSignedReadUrls(paths, READ_URL_TTL_SECONDS);
    const photoUrls = paths.map((p) => signed.get(p)).filter((u): u is string => u !== undefined);
    const targets = await this.targetNames([row.targetRepairerUserId]);

    const mappedConversations: AdminDemandeConversationThread[] = conversations.map((c) => ({
      id: c.id,
      repairerId: c.repairer.id,
      repairerName: c.repairer.name,
      messages: c.messages.map((m) => ({
        id: m.id,
        // A SYSTEM message has no author: read the kind, never infer « not the client » = réparateur.
        senderRole:
          m.kind === 'SYSTEM'
            ? ('SYSTEM' as const)
            : m.senderUserId === c.clientUserId
              ? ('CLIENT' as const)
              : ('REPAIRER' as const),
        content: m.body,
        createdAt: m.createdAt.toISOString(),
        deleted: m.deletedAt !== null,
      })),
    }));

    return {
      demandeId: row.id,
      title: row.title,
      description: row.description,
      brand: row.brand,
      model: row.model,
      parts: row.parts,
      mode: row.mode,
      budgetCents: row.budgetCents,
      locationLabel: row.locationLabel,
      postalCode: row.postalCode,
      status: row.status,
      categoryId: row.categoryId,
      categoryLabelFr: row.category.labelFr,
      faultType: row.faultType,
      state: stateOf(row),
      removalReason: row.deletedAt ? row.deletedReason : row.hiddenReason,
      removedByAdmin: row.hiddenByUserId !== null || row.deletedByUserId !== null,
      author: {
        userId: row.author.id,
        name: row.author.name,
        email: row.author.email,
      },
      photoUrls,
      paymentInFlight: pendingPaymentCount > 0,
      offers: row.offers.map((o) => ({
        offerId: o.id,
        repairerId: (o.repairer as { id?: string })?.id,
        repairerName: o.repairer.name,
        priceCents: o.priceCents,
        status: o.status,
      })),
      commandes: row.commandes.map((c) => ({
        commandeId: c.id,
        status: c.status,
        totalCents: c.totalCents,
      })),
      activity,
      conversations: mappedConversations,
      quoteTarget: quoteTargetOf(row.targetRepairerUserId, targets),
      quoteClosedReason: row.quoteClosedReason,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/** A deleted account's name is its tombstone; an id we cannot resolve still shows the id. */
function quoteTargetOf(
  id: string | null,
  names: Map<string, string>,
): AdminDemandeListItem['quoteTarget'] {
  return id ? { userId: id, displayName: names.get(id) ?? id } : null;
}
