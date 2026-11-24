import { effectiveDisputeStatus } from './dispute-effective-status.js';
import { Injectable } from '@nestjs/common';
import {
  ADMIN_ROLES,
  isStaffRole,
  verifiedBadgeFor,
  type AdminAccountMarker,
  type AdminAuditAction,
  type AdminUserActivityEntry,
  type AdminUserDeletionMeta,
  type AdminUserDetail,
  type AdminUserFiscalData,
  type AdminUserFiscalRemindResponse,
  type AdminParticularQuota,
  type AdminLockScope,
  type AdminUserLoginLock,
  PARTICULAR_QUOTA_MAX_MISSIONS,
  PARTICULAR_QUOTA_MAX_CENTS,
  type AdminUserListItem,
  type AdminUserListResponse,
  type AdminUserRepairerMetrics,
  type AdminUserStatus,
  type AdminVerificationLevel,
  type IdentityDecision,
  type IdentityDecisionMotif,
  type AdminUserSummaryKpis,
  type AdminUserInternalNote,
  type AdminInternalNoteInput,
  type AdminSendUserEmailInput,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isReviewEmail } from '../review-accounts/review-account.js';
import { FiscalService } from '../fiscal/fiscal.service.js';
import { isFiscalComplete } from '../fiscal/fiscal-gate.js';
import { maskIbanLast4 } from '../connect/iban-mask.js';
import type { Prisma } from '../generated/prisma/client.js';
import {
  PARTICULAR_QUOTA_ORDER_SELECT,
  particularQuotaOrdersWhere,
  rollingQuotaWindowStart,
  summariseParticularQuota,
} from '../verification/particular-quota.js';
import {
  ACCOUNT_SUSPENDED_WHERE,
  DEMO_EMAIL_SUFFIX,
  GENUINE_COLLECTED_COMMANDE_WHERE,
  isRepairerSuspended,
  LIVE,
  PAGE_SIZE,
  TEST_FIXTURE_EMAIL_SUFFIX,
} from './admin-constants.js';
import { AdminRepairersService } from './admin-repairers.service.js';
import { mailSender } from '../mail/mail.service.js';
import { throttleKey } from '../auth/throttle/auth-throttle.js';

/** V7 U2: the two counters a person can be locked on. The IP counter belongs to no account. */
const ACCOUNT_LOCK_SCOPES = ['LOGIN_ACCOUNT', 'CODE_ACCOUNT'] as const;

const NOT_FOUND = 'Utilisateur introuvable.';
/** How many of each kind the merged timeline carries. Keeps one busy account readable. */
const HISTORY_PER_KIND = 10;

/** CF4-39. The fiche's decision line; null when undecided or with no identity row. */
function identityDecisionOf(
  row: {
    decision: IdentityDecision | null;
    decisionMotif: IdentityDecisionMotif | null;
    decisionNote: string | null;
    decidedAt: Date | null;
  } | null | undefined,
): AdminUserDetail['identityDecision'] {
  if (!row?.decision || !row.decidedAt) return null;
  return {
    decision: row.decision,
    motif: row.decisionMotif ?? null,
    note: row.decisionNote ?? null,
    decidedAt: row.decidedAt.toISOString(),
  };
}

const LEVELS: readonly AdminVerificationLevel[] = ['NONE', 'BASIC', 'IDENTITY', 'BUSINESS'];
const STATUTS = ['actif', 'suspendu', 'supprime'] as const;
const TYPES = ['client', 'reparateur', 'les-deux', 'equipe'] as const;

export type AdminUserListQuery = {
  q?: string;
  statut?: string;
  type?: string;
  niveau?: string;
  page?: number;
};

type ListRow = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  createdAt: Date;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  firstName?: string;
  lastName?: string;
  emailVerified?: boolean;
  phoneVerifiedAt?: Date | null;
  role?: string;
  profile: {
    deletedAt: Date | null;
    clientEnabled?: boolean;
    repairerEnabled?: boolean;
    verificationLevel?: AdminVerificationLevel;
    activeMode?: string;
    repairerSuspendedAt?: Date | null;
  } | null;
  repairerProfile?: {
    displayName: string;
    postalCode: string | null;
  } | null;
};

/**
 * 🛑 Names ONLY the four fields statusOf reads. Deliberately NOT ListRow: a parameter
 * type that names fields the function never touches forces every richer caller to cast,
 * and a cast on the function deriving a user-visible account status is exactly what the
 * discriminated union exists to prevent. Both the list row and the fiche row satisfy
 * this structurally, so no cast exists anywhere.
 */
type StatusInput = {
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  profile: { deletedAt: Date | null } | null;
};

/**
 * §8.2's « Statut du compte », derived rather than stored.
 *
 * 🛑 ORDER IS LOAD-BEARING. `deleted` is checked FIRST and off `Profile.deletedAt`,
 * which is authoritative - it is the column every other soft-delete filter in this repo
 * reads, whereas banReason is a side effect of CF-47's scrub. If the two ever disagree
 * this renders `deleted`, which fails safe.
 */
export function statusOf(row: StatusInput): AdminUserStatus {
  if (row.profile?.deletedAt) {
    return { kind: 'deleted', at: row.profile.deletedAt.toISOString() };
  }
  if (row.banned === true) {
    return {
      kind: 'suspended',
      reason: row.banReason,
      until: row.banExpires ? row.banExpires.toISOString() : null,
    };
  }
  return { kind: 'active' };
}

/** 🛑 Case-sensitive, deliberately unchanged from §8.1: the limit is recorded, not fixed. */
export function markerOf(email: string): AdminAccountMarker {
  if (email.endsWith(DEMO_EMAIL_SUFFIX)) return 'demo';
  if (email.endsWith(TEST_FIXTURE_EMAIL_SUFFIX)) return 'fixture';
  // PUB-33 (DECP-23): case-insensitive, unlike the two above, because the seal itself is.
  if (isReviewEmail(email)) return 'review';
  return null;
}

function formatBirthDate(dateInput: Date | string | null | undefined): string | null {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * What the fiche reads of the account. A constant so that the fiscal block's helpers and the specs
 * are typed from it: a fixture carrying a column this does not select, or the schema lacks, no longer compiles
 * (the first A1 and A3 specs mocked columns the real query never returned, RU-29).
 */
export const USER_DETAIL_SELECT = {
  id: true, name: true, firstName: true, lastName: true, username: true,
  email: true, emailVerified: true, phone: true, phoneVerifiedAt: true,
  role: true, createdAt: true, banned: true, banReason: true, banExpires: true,
  birthDate: true,
  profile: {
    select: {
      deletedAt: true, clientEnabled: true, repairerEnabled: true,
      activeMode: true, verificationLevel: true,
    },
  },
  // CF4-39 (spec §4.6): the current identity decision, for the fiche's line.
  identityVerification: {
    select: { decision: true, decisionMotif: true, decisionNote: true, decidedAt: true },
  },
  repairerProfile: {
    select: {
      id: true,
      kind: true,
      fiscalCompletedAt: true,
      fiscalReminderCount: true,
      lastFiscalReminderAt: true,
    },
  },
  fiscalDeclaration: {
    select: {
      addressLine: true,
      postalCode: true,
      city: true,
      country: true,
      nif: true,
      hasNoNif: true,
      birthCity: true,
      birthCountry: true,
    },
  },
  businessVerification: { select: { status: true, siret: true, vatNumber: true } },
  connectAccount: { select: { ibanLast4: true } },
} satisfies Prisma.UserSelect;
export type DetailUser = Prisma.UserGetPayload<{ select: typeof USER_DETAIL_SELECT }>;

/**
 * « Finished real work »: PAID **and step RELEASED** (the terminal step), between two genuine accounts,
 * through a real Stripe payment. `status: PAID` alone would count a repair still in escrow, and a fixture
 * or demo order the figures of every other admin page already exclude. The list's « Réparations » and
 * « CA » and the fiche's use this one filter.
 */
const FINISHED_REAL_WORK = {
  ...GENUINE_COLLECTED_COMMANDE_WHERE,
  status: 'PAID',
  step: 'RELEASED',
} as const;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly repairers: AdminRepairersService,
    private readonly fiscal: FiscalService,
  ) {}

  async list(query: AdminUserListQuery): Promise<AdminUserListResponse> {
    // Math.trunc||1 catches NaN, Math.max catches negatives - the same two guards, for
    // the same two reasons, as AdminAuditService.list's clamp. Neither is redundant.
    const page = Math.max(Math.trunc(query.page ?? 1) || 1, 1);

    const and: Record<string, unknown>[] = [];

    // A tombstone is not a user an operator is searching for, so the DEFAULT hides them.
    // Validated against the enum rather than passed through: an unknown value must not
    // reach Prisma, and it must not silently return nothing either.
    if (query.statut && (STATUTS as readonly string[]).includes(query.statut)) {
      if (query.statut === 'supprime') {
        and.push({ profile: { deletedAt: { not: null } } });
      } else if (query.statut === 'suspendu') {
        // 🛑 Follow-up #9: COMPOSE at the call site. ACCOUNT_SUSPENDED_WHERE alone includes a
        // banned orphan (no Profile row), which the list must exclude because it renders
        // profile fields and must agree with KPI #1. KPI #4 must NOT carry this condition or
        // it under-counts. AND with explicit `is:` so nothing can clobber the base predicate.
        //
        // 🛑 STRICTER than pre-refactor: the list was `{ banned: true }` + `{ profile: { deletedAt: null } }`
        // with no banReason test, so an account with `banReason: 'account_deleted'` AND a live profile
        // would have appeared then and is excluded now. No REACHABLE row changes - `deleteAccount`
        // writes both fields in one transaction, so the divergent state is unreachable - and on the
        // merits, a tombstone should not appear in a suspended-accounts list whatever its profile says.
        and.push({ AND: [ACCOUNT_SUSPENDED_WHERE, { profile: { is: { deletedAt: null } } }] });
      } else {
        // 'actif': live accounts that are not banned.
        // 🛑 Deliberately `{ profile: { deletedAt: null } }`, not an OR with `profile: null`.
        // This excludes a User with NO Profile row, which is deliberate: §8.1's KPI #1 « Nombre
        // total d'utilisateurs » counts users WITH a live Profile, so the list and the dashboard
        // agree by construction. A profile-less User is an anomaly whose only route is a failed
        // signup rollback, and it must not surface in an operator's list first.
        and.push({ profile: { deletedAt: null } });
        and.push({ OR: [{ banned: false }, { banned: null }] });
      }
    } else {
      // No statut, or unknown value: hide deleted accounts by default.
      and.push({ profile: { deletedAt: null } });
    }

    if (query.type && (TYPES as readonly string[]).includes(query.type)) {
      if (query.type === 'client') and.push({ profile: { clientEnabled: true } });
      if (query.type === 'reparateur') and.push({ profile: { repairerEnabled: true } });
      if (query.type === 'les-deux') {
        and.push({ profile: { clientEnabled: true, repairerEnabled: true } });
      }
      // CF4-40: the dashboard's « Équipe » filter.
      if (query.type === 'equipe') and.push({ role: { in: [...ADMIN_ROLES] } });
    }

    if (query.niveau && (LEVELS as readonly string[]).includes(query.niveau)) {
      and.push({ profile: { verificationLevel: query.niveau } });
    }

    const q = query.q?.trim();
    if (q) {
      // `mode: 'insensitive'` is required, not optional: username is stored
      // canonical-lowercase but email and name are not. `phone` is nullable - a user
      // with no phone is simply unsearchable by phone, which is intended.
      and.push({
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
        ],
      });
    }

    const where = { AND: and };

    // 🛑 Piece B2, Task 11: Add réparateur fields when type=reparateur. The select is
    // CONDITIONAL so client-shaped queries carry no join cost.
    const isRepairerList = query.type === 'reparateur';

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          phone: true,
          createdAt: true,
          banned: true,
          banReason: true,
          banExpires: true,
          role: true,
          profile: {
            select: {
              deletedAt: true,
              clientEnabled: true,
              repairerEnabled: true,
              verificationLevel: true,
              repairerSuspendedAt: isRepairerList,
            },
          },
          repairerProfile: isRepairerList
            ? {
                select: {
                  displayName: true,
                  postalCode: true,
                },
              }
            : undefined,
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    // P5: Collect repairer IDs when querying repairers
    const repairerUserIds =
      isRepairerList || rows.some((r) => r.repairerProfile)
        ? rows.map((r) => r.id)
        : [];

    const repairerMetricsById = new Map<string, AdminUserRepairerMetrics>();

    if (repairerUserIds.length > 0) {
      const [commandeGroups, reviewGroups] = await Promise.all([
        this.prisma.commande.groupBy({
          by: ['repairerUserId'],
          where: {
            ...FINISHED_REAL_WORK,
            repairerUserId: { in: repairerUserIds },
          },
          _count: { id: true },
          _sum: { repairCents: true },
        }),
        this.prisma.review.groupBy({
          by: ['repairerUserId'],
          where: {
            repairerUserId: { in: repairerUserIds },
            deletedAt: null,
          },
          _avg: { rating: true },
          _count: { id: true },
        }),
      ]);

      const commandeMap = new Map(
        commandeGroups.map((g) => {
          const count =
            typeof g._count === 'object' && g._count !== null ? (g._count as { id?: number }).id ?? 0 : 0;
          const sum = g._sum?.repairCents ?? 0;
          return [
            g.repairerUserId,
            {
              repairsCount: count,
              totalRevenueCents: sum,
            },
          ];
        }),
      );

      const reviewMap = new Map(
        reviewGroups.map((g) => {
          const count =
            typeof g._count === 'object' && g._count !== null ? (g._count as { id?: number }).id ?? 0 : 0;
          return [
            g.repairerUserId,
            {
              rating:
                g._avg?.rating !== null && g._avg?.rating !== undefined
                  ? Math.round(g._avg.rating * 10) / 10
                  : null,
              reviewCount: count,
            },
          ];
        }),
      );

      for (const id of repairerUserIds) {
        const cmd = commandeMap.get(id);
        const rev = reviewMap.get(id);
        repairerMetricsById.set(id, {
          rating: rev?.rating ?? null,
          reviewCount: rev?.reviewCount ?? 0,
          repairsCount: cmd?.repairsCount ?? 0,
          totalRevenueCents: cmd?.totalRevenueCents ?? 0,
        });
      }
    }

    // P5: Collect deleted user IDs to query deletion audit logs
    const deletedUserIds = (rows as ListRow[])
      .filter((r) => r.profile?.deletedAt)
      .map((r) => r.id);

    const deletionMetaById = new Map<string, AdminUserDeletionMeta>();

    if (deletedUserIds.length > 0) {
      const logs = await this.prisma.adminAuditLog.findMany({
        where: {
          action: 'user.delete',
          targetId: { in: deletedUserIds },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const log of logs) {
        if (log.targetId && !deletionMetaById.has(log.targetId)) {
          const detail = log.detail as { reason?: string } | null;
          deletionMetaById.set(log.targetId, {
            deletedAt: log.createdAt.toISOString(),
            deletedReason: typeof detail?.reason === 'string' ? detail.reason : null,
            deletedBy: log.actorEmail ?? null,
          });
        }
      }
    }

    const items: AdminUserListItem[] = (rows as ListRow[]).map((r) => {
      const isDeleted = r.profile?.deletedAt !== null && r.profile?.deletedAt !== undefined;
      const base: AdminUserListItem = {
        userId: r.id,
        name: r.name,
        username: r.username,
        email: r.email,
        phone: r.phone,
        createdAt: r.createdAt.toISOString(),
        status: statusOf(r),
        modes: {
          client: isDeleted ? false : (r.profile?.clientEnabled ?? false),
          repairer: isDeleted ? false : (r.profile?.repairerEnabled ?? false),
        },
        verificationLevel: isDeleted ? 'NONE' : (r.profile?.verificationLevel ?? 'NONE'),
        marker: markerOf(r.email),
        staffRole: isDeleted ? null : (isStaffRole(r.role) ? r.role : null),
      };

      // 🛑 Piece B2, Task 11: Add réparateur-shaped columns when repairerProfile is selected.
      if (r.repairerProfile) {
        base.repairer = {
          displayName: r.repairerProfile.displayName,
          publicBadge: isDeleted ? null : verifiedBadgeFor(r.profile?.verificationLevel ?? 'NONE'),
          // 🛑 isRepairerSuspended, never an inline `!== null`. It is the SINGLE form of « le
          // mode réparateur est suspendu » - the `REPAIRER_SUSPENDED_WHERE` fragment this
          // comment used to pair it with was dead surface and is deleted. The loose `!= null`
          // inside it is load-bearing: `r.profile` may be absent.
          suspended: isRepairerSuspended(r.profile),
          postalCode: r.repairerProfile.postalCode,
        };
      }

      // P5: Attach repairer metrics when querying repairers or when repairerProfile exists
      if (isRepairerList || r.repairerProfile) {
        base.repairerMetrics = repairerMetricsById.get(r.id) ?? {
          rating: null,
          reviewCount: 0,
          repairsCount: 0,
          totalRevenueCents: 0,
        };
      }

      // P5: Attach deletion metadata for deleted accounts
      if (isDeleted) {
        const auditMeta = deletionMetaById.get(r.id);
        base.deletionMeta = {
          deletedAt: r.profile?.deletedAt ? r.profile.deletedAt.toISOString() : auditMeta?.deletedAt ?? r.createdAt.toISOString(),
          deletedReason: auditMeta?.deletedReason ?? null,
          deletedBy: auditMeta?.deletedBy ?? null,
        };
      }

      return base;
    });

    return { items, total, page, pageSize: PAGE_SIZE };
  }

  async detail(userId: string): Promise<AdminUserDetail> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: USER_DETAIL_SELECT,
    });
    if (!user) throw new AppException('NOT_FOUND', NOT_FOUND);

    // « Réparations » counted on BOTH sides because one account has two modes; a single figure
    // would be wrong for anyone who is both. Design §5.
    const FINISHED = FINISHED_REAL_WORK;

    const [
      demandes,
      repairsPerformed,
      repairsReceived,
      reviewsReceived,
      reviewsWritten,
      reportsAgainst,
      reportsMade,
      recentDemandes,
      recentOffres,
      recentCommandes,
      recentAvis,
      recentSignalements,
      adminActions,
    ] = await this.prisma.$transaction([
      this.prisma.demande.count({ where: { authorUserId: userId, ...LIVE } }),
      // 🛑 Commande has no deletedAt column, so no filter is applied. A repair count
      // correctly counts every finished repair.
      this.prisma.commande.count({ where: { ...FINISHED, repairerUserId: userId } }),
      this.prisma.commande.count({ where: { ...FINISHED, clientUserId: userId } }),
      this.prisma.review.count({ where: { repairerUserId: userId, ...LIVE } }),
      this.prisma.review.count({ where: { authorUserId: userId, ...LIVE } }),
      // 🛑 ConversationReport has no deletedAt column. Both directions: a serial reporter is
      // itself a moderation signal, which is why « émis » is not dropped.
      this.prisma.conversationReport.count({ where: { reportedUserId: userId } }),
      this.prisma.conversationReport.count({ where: { reporterUserId: userId } }),
      this.prisma.demande.findMany({
        where: { authorUserId: userId, ...LIVE },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_PER_KIND,
        select: { id: true, title: true, createdAt: true },
      }),
      this.prisma.offer.findMany({
        where: { repairerUserId: userId, ...LIVE },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_PER_KIND,
        select: { id: true, createdAt: true, demande: { select: { title: true } } },
      }),
      // Commande has no deletedAt, so no filter.
      this.prisma.commande.findMany({
        where: { OR: [{ clientUserId: userId }, { repairerUserId: userId }] },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_PER_KIND,
        select: { id: true, createdAt: true, demande: { select: { title: true } } },
      }),
      this.prisma.review.findMany({
        where: { authorUserId: userId, ...LIVE },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_PER_KIND,
        select: { id: true, rating: true, createdAt: true },
      }),
      // ConversationReport has no deletedAt.
      this.prisma.conversationReport.findMany({
        where: { reporterUserId: userId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_PER_KIND,
        select: { id: true, reason: true, createdAt: true },
      }),
      // Reads the composite index piece A created for exactly this: @@index([targetType, targetId]).
      this.prisma.adminAuditLog.findMany({
        where: { targetType: 'User', targetId: userId },
        orderBy: { createdAt: 'desc' },
        take: HISTORY_PER_KIND,
        select: { id: true, action: true, statusCode: true, actorEmail: true, createdAt: true },
      }),
    ]);

    // 🛑 Task 8: Add the réparateur block. Null for accounts that never enabled réparateur mode.
    const repairer = await this.repairers.repairerBlock(userId);

    const history: AdminUserActivityEntry[] = [
      ...(recentDemandes as { id: string; title: string; createdAt: Date }[]).map((d) => ({
        kind: 'demande' as const,
        id: d.id,
        label: d.title,
        at: d.createdAt.toISOString(),
      })),
      ...(recentOffres as { id: string; demande: { title: string }; createdAt: Date }[]).map((o) => ({
        kind: 'offre' as const,
        id: o.id,
        label: `Offre sur « ${o.demande.title} »`,
        at: o.createdAt.toISOString(),
      })),
      ...(recentCommandes as { id: string; demande: { title: string }; createdAt: Date }[]).map((c) => ({
        kind: 'commande' as const,
        id: c.id,
        label: `Commande pour « ${c.demande.title} »`,
        at: c.createdAt.toISOString(),
      })),
      ...(recentAvis as { id: string; rating: number; createdAt: Date }[]).map((r) => ({
        kind: 'avis' as const,
        id: r.id,
        label: `Avis ${r.rating}/5`,
        at: r.createdAt.toISOString(),
      })),
      ...(recentSignalements as { id: string; reason: string; createdAt: Date }[]).map((s) => ({
        kind: 'signalement' as const,
        id: s.id,
        label: `Signalement : ${s.reason}`,
        at: s.createdAt.toISOString(),
      })),
      ...(
        adminActions as {
          id: string; action: string; statusCode: number; actorEmail: string; createdAt: Date;
        }[]
      ).map((a) => ({
        kind: 'admin' as const,
        id: a.id,
        label: `${a.action} par ${a.actorEmail}`,
        at: a.createdAt.toISOString(),
        action: a.action as AdminAuditAction,
        actorEmail: a.actorEmail,
        statusCode: a.statusCode,
      })),
    ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    const isDeleted = user.profile?.deletedAt !== null && user.profile?.deletedAt !== undefined;
    const loginLock = isDeleted ? null : await this.loginLock(user.id, user.email);

    // P6: Compute summary KPIs
    const [spentAgg, revAgg, reviewAgg, disputesCount] = await Promise.all([
      // What he paid: money taken, in escrow or not.
      this.prisma.commande.aggregate({
        where: { ...GENUINE_COLLECTED_COMMANDE_WHERE, clientUserId: userId, status: 'PAID' },
        _sum: { totalCents: true },
      }),
      // What he earned: his quote on finished work, the same orders « Réparations » counts. The
      // order total also holds the shipping and the protection fee, which are not his.
      this.prisma.commande.aggregate({
        where: { ...FINISHED_REAL_WORK, repairerUserId: userId },
        _sum: { repairCents: true },
      }),
      this.prisma.review.aggregate({
        where: { repairerUserId: userId, ...LIVE },
        _avg: { rating: true },
        _count: { id: true },
      }),
      this.prisma.dispute.count({
        where: { commande: { OR: [{ clientUserId: userId }, { repairerUserId: userId }] } },
      }),
    ]);

    const totalSpentCents = spentAgg._sum?.totalCents ?? 0;
    const totalRevenueCents = revAgg._sum?.repairCents ?? 0;
    const averageRating =
      reviewAgg._avg?.rating !== null && reviewAgg._avg?.rating !== undefined
        ? Math.round(reviewAgg._avg.rating * 10) / 10
        : null;
    const reviewCount = reviewAgg._count.id;

    const summaryKpis: AdminUserSummaryKpis = {
      demandesCount: demandes as number,
      repairsCompletedCount: (repairsPerformed as number) + (repairsReceived as number),
      totalSpentCents,
      totalRevenueCents,
      averageRating,
      reviewCount,
      disputesCount,
      reportsCount: reportsAgainst as number,
    };

    // P6: Query internal notes from AdminAuditLog with deduplication
    let internalNotes: AdminUserInternalNote[] = [];
    {
      const noteLogs = await this.prisma.adminAuditLog.findMany({
        where: {
          action: 'user.note_add',
          targetType: 'User',
          targetId: userId,
        },
        orderBy: { createdAt: 'desc' },
      });
      const seen = new Set<string>();
      internalNotes = [];
      for (const log of noteLogs) {
        const detail = log.detail as { content?: string; authorName?: string } | null;
        const content =
          typeof detail?.content === 'string'
            ? detail.content
            : typeof detail === 'string'
              ? detail
              : '';
        const dedupeKey = `${log.actorEmail}:${content}:${Math.floor(new Date(log.createdAt).getTime() / 5000)}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        internalNotes.push({
          id: log.id,
          authorName:
            typeof detail?.authorName === 'string' && detail.authorName
              ? detail.authorName
              : log.actorEmail,
          authorEmail: log.actorEmail,
          content,
          createdAt: log.createdAt instanceof Date ? log.createdAt.toISOString() : String(log.createdAt),
        });
      }
    }

    // P6: Tab data (orders, payments, disputes, reviews, reports, sessions)
    const [ordersRows, paymentsRows, disputesRows, reviewsRows, reportsRows, sessionsRows] =
      await Promise.all([
        this.prisma.commande.findMany({
              where: { OR: [{ clientUserId: userId }, { repairerUserId: userId }] },
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: {
                id: true,
                clientUserId: true,
                repairerUserId: true,
                totalCents: true,
                status: true,
                createdAt: true,
                demande: { select: { title: true } },
              },
            }),
        this.prisma.commande.findMany({
              where: {
                OR: [{ clientUserId: userId }, { repairerUserId: userId }],
                status: { in: ['PAID', 'REFUNDED'] },
              },
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: {
                id: true,
                stripeChargeId: true,
                totalCents: true,
                status: true,
                createdAt: true,
              },
            }),
        this.prisma.dispute.findMany({
              where: { commande: { OR: [{ clientUserId: userId }, { repairerUserId: userId }] } },
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: {
                id: true,
                number: true,
                commandeId: true,
                status: true,
                verdict: true,
                reason: true,
                createdAt: true,
                commande: { select: { status: true, totalCents: true, refundedCents: true } },
              },
            }),
        this.prisma.review.findMany({
              where: { OR: [{ authorUserId: userId }, { repairerUserId: userId }], ...LIVE },
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: {
                id: true,
                rating: true,
                comment: true,
                repairerUserId: true,
                createdAt: true,
              },
            }),
        this.prisma.conversationReport.findMany({
              where: { OR: [{ reportedUserId: userId }, { reporterUserId: userId }] },
              orderBy: { createdAt: 'desc' },
              take: 50,
              select: {
                id: true,
                conversationId: true,
                reportedUserId: true,
                reason: true,
                createdAt: true,
                resolvedAt: true,
              },
            }),
        this.prisma.session.findMany({
              where: { userId },
              orderBy: { createdAt: 'desc' },
              take: 20,
              select: {
                id: true,
                createdAt: true,
                ipAddress: true,
                userAgent: true,
              },
            }),
      ]);

    const orders = ordersRows.map((c: any) => ({
      id: c.id,
      role: (c.clientUserId === userId ? 'CLIENT' : 'REPAIRER') as 'CLIENT' | 'REPAIRER',
      title: c.demande?.title ?? 'Commande',
      totalCents: c.totalCents,
      status: c.status,
      createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : String(c.createdAt),
    }));

    const payments = paymentsRows.map((p: any) => ({
      id: p.stripeChargeId || p.id,
      commandeId: p.id,
      amountCents: p.totalCents,
      status: p.status,
      createdAt: p.createdAt instanceof Date ? p.createdAt.toISOString() : String(p.createdAt),
    }));

    const disputes = disputesRows.map((d: any) => ({
      id: d.id,
      number: d.number,
      commandeId: d.commandeId,
      // B11 / ISS-085: the status the lists show, not the stored one, on a refunded order.
      status: effectiveDisputeStatus({ status: d.status, verdict: d.verdict, commande: d.commande }).status,
      reason: d.reason,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    }));

    const reviews = reviewsRows.map((r: any) => ({
      id: r.id,
      rating: r.rating,
      comment: r.comment ?? null,
      role: (r.repairerUserId === userId ? 'RECEIVED' : 'WRITTEN') as 'RECEIVED' | 'WRITTEN',
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    const reports = reportsRows.map((rep: any) => ({
      id: rep.id,
      conversationId: rep.conversationId,
      role: (rep.reportedUserId === userId ? 'AGAINST' : 'MADE') as 'AGAINST' | 'MADE',
      reason: rep.reason,
      createdAt: rep.createdAt instanceof Date ? rep.createdAt.toISOString() : String(rep.createdAt),
      resolvedAt: rep.resolvedAt ? (rep.resolvedAt instanceof Date ? rep.resolvedAt.toISOString() : String(rep.resolvedAt)) : null,
    }));

    const sessions = sessionsRows.map((s: any) => ({
      id: s.id,
      createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
      ipAddress: s.ipAddress ?? null,
      userAgent: s.userAgent ?? null,
    }));

    const fiscalComplete = isFiscalComplete({
      kind: user.repairerProfile?.kind,
      fiscalCompletedAt: user.repairerProfile?.fiscalCompletedAt,
      verificationLevel: user.profile?.verificationLevel,
      businessStatus: user.businessVerification?.status,
    });
    const fiscal = await this.fiscalBlock(user, fiscalComplete);
    const particularQuota = await this.particularQuota(user, fiscalComplete);

    return {
      userId: user.id,
      identity: {
        name: user.name,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
      },
      contact: {
        email: user.email,
        emailVerified: user.emailVerified,
        phone: user.phone,
        phoneVerified: user.phoneVerifiedAt !== null,
      },
      account: {
        clientEnabled: isDeleted ? false : (user.profile?.clientEnabled ?? false),
        repairerEnabled: isDeleted ? false : (user.profile?.repairerEnabled ?? false),
        activeMode: user.profile?.activeMode ?? 'CLIENT',
        role: isDeleted ? 'user' : user.role,
      },
      createdAt: user.createdAt.toISOString(),
      counts: {
        demandes: demandes as number,
        repairsPerformed: repairsPerformed as number,
        repairsReceived: repairsReceived as number,
        reviewsReceived: reviewsReceived as number,
        reviewsWritten: reviewsWritten as number,
        reportsAgainst: reportsAgainst as number,
        reportsMade: reportsMade as number,
      },
      status: statusOf(user),
      verificationLevel: isDeleted ? 'NONE' : (user.profile?.verificationLevel ?? 'NONE'),
      marker: markerOf(user.email),
      repairer,
      fiscal,
      particularQuota,
      loginLock,
      identityDecision: identityDecisionOf(user.identityVerification),
      staffRole: isDeleted ? null : (isStaffRole(user.role) ? user.role : null),
      history,
      summaryKpis,
      internalNotes,
      tabsData: {
        orders,
        payments,
        disputes,
        reviews,
        reports,
        sessions,
      },
    };
  }

  /**
   * A1. What REVIME holds about one réparateur for DAC7. Null for an account with neither a réparateur
   * profile nor a declaration.
   *
   * 🛑 The name and the date of birth are what the account says, DECLARED by the réparateur: nothing
   * reads Stripe Identity's verified outputs back (`ISS-052`), so this carries no « vérifié par Stripe ».
   * `isComplete` is the golden rule's own answer, the one that holds or releases the payout.
   */
  private async fiscalBlock(user: DetailUser, isComplete: boolean): Promise<AdminUserFiscalData | null> {
    const declaration = user.fiscalDeclaration;
    if (!user.repairerProfile && !declaration) return null;

    const auditLogs = await this.prisma.repairerFiscalAuditLog.findMany({
      where: { userId: user.id },
      orderBy: { changedAt: 'desc' },
      take: 50,
    });
    // `firstName` and `lastName` are the legal identity fields; `name` is the display name composed from them.
    const legalName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.name;
    const addressParts = declaration
      ? [declaration.addressLine, [declaration.postalCode, declaration.city].filter(Boolean).join(' ')].filter(Boolean)
      : [];

    return {
      isComplete,
      legalName,
      birthDate: formatBirthDate(user.birthDate),
      address: addressParts.length > 0 ? addressParts.join(', ') : null,
      nif: declaration?.nif ?? null,
      hasNoNif: declaration?.hasNoNif ?? false,
      birthCity: declaration?.birthCity ?? null,
      birthCountry: declaration?.birthCountry ?? null,
      siret: user.businessVerification?.siret ?? null,
      vatNumber: user.businessVerification?.vatNumber ?? null,
      maskedIban: maskIbanLast4(user.connectAccount?.ibanLast4),
      reminderCount: user.repairerProfile?.fiscalReminderCount ?? 0,
      lastReminderAt: user.repairerProfile?.lastFiscalReminderAt?.toISOString() ?? null,
      auditLogs: auditLogs.map((log) => ({
        id: log.id,
        fieldName: log.fieldName,
        oldValue: log.oldValue,
        newValue: log.newValue,
        changedAt: log.changedAt.toISOString(),
      })),
    };
  }

  /**
   * A2. CGU art. 53's rolling 12 months for an individual réparateur (null for anyone else). It COUNTS;
   * nothing refuses an offer at the threshold (review `ISS-061`).
   *
   * « En attente » is money still owed to him: paid, not transferred, not refunded, not taken back.
   * « Bloqué » is the golden rule's own answer (`fiscalComplete`), as in `payoutBlocker`.
   */
  /**
   * V7 A11 (U2, Q6). Locks in force are read from the counters (keyed by e-mail, so they exist even
   * before a history row could); the history from AuthLockEvent (keyed by user).
   */
  private async loginLock(userId: string, email: string): Promise<AdminUserLoginLock> {
    const [active, history] = await Promise.all([
      this.prisma.authThrottle.findMany({
        where: { scope: { in: [...ACCOUNT_LOCK_SCOPES] }, key: throttleKey(email), lockedUntil: { gt: new Date() } },
        select: { scope: true, level: true, lockedUntil: true },
      }),
      this.prisma.authLockEvent.findMany({
        where: { userId, scope: { in: [...ACCOUNT_LOCK_SCOPES] } },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, kind: true, scope: true, level: true, lockedUntil: true, createdAt: true, unlockedAt: true, unlockReason: true },
      }),
    ]);
    const accountScope = (scope: string): AdminLockScope => (scope === 'CODE_ACCOUNT' ? 'CODE_ACCOUNT' : 'LOGIN_ACCOUNT');
    return {
      active: active.map((row) => ({
        scope: accountScope(row.scope),
        level: row.level,
        lockedUntil: row.lockedUntil!.toISOString(),
      })),
      history: history.map((row) => ({
        id: row.id,
        // V7 U2b: SECURED is a « Ce n'est pas moi », which the sheet shows in the same list.
        kind: row.kind,
        scope: accountScope(row.scope),
        level: row.level,
        lockedUntil: row.lockedUntil.toISOString(),
        createdAt: row.createdAt.toISOString(),
        unlockedAt: row.unlockedAt ? row.unlockedAt.toISOString() : null,
        unlockReason: row.unlockReason ?? null,
      })),
    };
  }

  private async particularQuota(user: DetailUser, fiscalComplete: boolean): Promise<AdminParticularQuota | null> {
    if (user.repairerProfile?.kind !== 'INDIVIDUAL') return null;

    const [orders, pending] = await Promise.all([
      this.prisma.commande.findMany({
        where: particularQuotaOrdersWhere(user.id, rollingQuotaWindowStart(new Date())),
        select: PARTICULAR_QUOTA_ORDER_SELECT,
      }),
      this.prisma.commande.aggregate({
        where: {
          repairerUserId: user.id,
          status: 'PAID',
          stripeTransferId: null,
          stripeRefundId: null,
          stripeTransferReversalId: null,
        },
        _sum: { repairCents: true },
      }),
    ]);
    const { missionsCount, amountCollectedCents, nextMissionReleaseAt } = summariseParticularQuota(orders);
    const pendingPayoutCents = pending._sum.repairCents ?? 0;

    return {
      missionsCount,
      missionsMax: PARTICULAR_QUOTA_MAX_MISSIONS,
      amountCollectedCents,
      amountMaxCents: PARTICULAR_QUOTA_MAX_CENTS,
      nextMissionReleaseAt: nextMissionReleaseAt?.toISOString() ?? null,
      pendingPayoutCents,
      isBlockedFiscal: !fiscalComplete && pendingPayoutCents > 0,
    };
  }

  /** The operator's « Relancer pour infos fiscales »: the cron's reminder, for one réparateur, on demand. */
  async sendFiscalReminder(userId: string): Promise<AdminUserFiscalRemindResponse> {
    const { reminderCount, lastReminderAt } = await this.fiscal.remindOne(userId);
    return { success: true, reminderCount, lastReminderAt: lastReminderAt.toISOString() };
  }

  /**
   * The note itself is written by the `@Audit('user.note_add', { detailFields: ['content'] })` on the
   * controller route: the audit row IS the note (author, time, content), read back by `detail()`. This
   * only refuses an unknown account.
   */
  async addInternalNote(userId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new AppException('NOT_FOUND', NOT_FOUND);

    return { ok: true };
  }

  async sendUserEmail(
    userId: string,
    input: AdminSendUserEmailInput,
  ): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, profile: { select: { deletedAt: true } } },
    });
    if (!user) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (user.profile?.deletedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Ce compte est supprimé.');
    }

    await mailSender().send({
      to: user.email,
      subject: input.subject,
      text: input.message,
    });

    return { ok: true };
  }

  async resetPassword(userId: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, profile: { select: { deletedAt: true } } },
    });
    if (!user) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (user.profile?.deletedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Ce compte est supprimé.');
    }

    // Better Auth's own request, the one the mobile « Mot de passe oublié » makes: it mints the
    // single-use token and calls `sendResetPassword` (auth.ts) with the link the app opens. A link
    // built here by hand carried only the user id, no token, and led nowhere. Imported lazily because
    // `auth.ts` builds the whole auth instance (database, providers) when it is first loaded.
    const { auth } = await import('../auth/auth.js');
    await auth.api.requestPasswordReset({
      body: { email: user.email, redirectTo: 'revime://reset-password' },
    });

    return { ok: true };
  }
}
