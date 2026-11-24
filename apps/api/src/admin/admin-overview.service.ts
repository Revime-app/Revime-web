import { BadRequestException, Injectable } from '@nestjs/common';
import {
  DELETED_USER_NAME,
  isDeletedUser,
  kpi,
  normaliseOrderSearch,
  type AdminOverview,
  type AdminPendingActions,
  type AdminBadgeCounts,
  type AdminSearchResult,
  type AdminSearchResultItem,
  type AdminOverviewTrends,
  type AdminSearchCategory,
  type AdminSearchDetailedItem,
  type AdminSearchDetailedResponse,
  type AdminSearchQuery,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { CronService } from '../cron/cron.service.js';
import { loadRepairerJourneys } from '../setup/setup-journey.js';
import { isStripeTestMode } from '../payments/config.js';
import { stripAccents, expandAccentVariants } from '../demandes/demandes.service.js';
import {
  ACCOUNT_SUSPENDED_WHERE,
  DEMO_EMAIL_SUFFIX,
  GENUINE_COMMANDE_PAID_WHERE,
  GENUINE_COMMANDE_WHERE,
  GENUINE_USER_WHERE,
  LIVE,
  RECENT_WINDOW_DAYS,
  TEST_FIXTURE_EMAIL_SUFFIX,
} from './admin-constants.js';
import { BUSINESS_NEEDS_DECISION_WHERE, IDENTITY_NEEDS_DECISION_WHERE } from './verification-needs-decision.js';

export { RECENT_WINDOW_DAYS } from './admin-constants.js';

/**
 * What a search result shows for a person. A deleted account's tombstone (`deleted+…@revime.invalid`) is
 * never printed: the client's UI7 ask is « Utilisateur supprimé » alone.
 */
function searchPersonLabel(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  if (isDeletedUser(name, email)) return DELETED_USER_NAME;
  return name || email || 'Inconnu';
}

/** The stored name, or the deleted-user label; null when there is none. */
function searchPersonName(
  name: string | null | undefined,
  email: string | null | undefined,
): string | null {
  return isDeletedUser(name, email) ? DELETED_USER_NAME : (name ?? null);
}

/** The e-mail to expose for a person, or null for a deleted account. */
function searchPersonEmail(
  name: string | null | undefined,
  email: string | null | undefined,
): string | null {
  return isDeletedUser(name, email) ? null : (email ?? null);
}

function searchRoleLabel(u: { role?: string | null; repairerProfile?: unknown }): string {
  return u.role ?? (u.repairerProfile ? 'Réparateur' : 'Client');
}

/** Deepest `page * limit` the « Tous » search tab will merge: beyond it the per-category tabs paginate in the database. */
const SEARCH_ALL_WINDOW = 2000;
export { stripAccents, expandAccentVariants } from '../demandes/demandes.service.js';

export function buildAccentVariants(term: string, maxVariants = 16): string[] {
  return expandAccentVariants(term, maxVariants);
}

/**
 * Generates exactly 30 contiguous UTC calendar date keys (YYYY-MM-DD)
 * ending at the provided `now` date [T - 29d ... T].
 */
export function generatePast30DaysUtc(now: Date = new Date()): string[] {
  const dates: string[] = [];
  const utcYear = now.getUTCFullYear();
  const utcMonth = now.getUTCMonth();
  const utcDate = now.getUTCDate();

  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.UTC(utcYear, utcMonth, utcDate - i));
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  return dates;
}

/**
 * « Paid in this window »: the day the money was collected, `paidAt`, falling back to `createdAt` for an
 * order that has none, as `/statistiques` does, so the dashboard's revenue and the statistics page cut
 * the same orders into the same days.
 */
export function paidWithin(range: { gte?: Date; lt?: Date; lte?: Date }) {
  return { OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] };
}

/**
 * Calculates month-over-month (MoM) percentage change between two 30-day windows.
 * Returns null if previous30d === 0, otherwise rounds to 1 decimal place.
 */
export function calcMom(
  current30d: number,
  previous30d: number,
): number | null {
  if (previous30d === 0) return null;
  return Number((((current30d - previous30d) / previous30d) * 100).toFixed(1));
}

@Injectable()
export class AdminOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cron: CronService,
  ) {}

  async overview(): Promise<AdminOverview> {
    const since = new Date(
      Date.now() - RECENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [
      usersTotal,
      usersRecent,
      usersSuspended,
      repairersTotal,
      repairersVerified,
      repairersPending,
      repairersSuspended,
      demandesPublished,
      demandesInProgress,
      demandesDone,
      offersTotal,
      offersAccepted,
      offersRejected,
      paymentsPending,
      paymentsRefunded,
      demoAccounts,
      testFixtureAccounts,
      repairersPendingBusiness,
    ] = await this.prisma.$transaction([
      // User has no deletedAt of its own: CF-47 writes Profile.deletedAt.
      this.prisma.profile.count({
        where: { ...LIVE, user: GENUINE_USER_WHERE },
      }),
      this.prisma.profile.count({
        where: {
          ...LIVE,
          user: { ...GENUINE_USER_WHERE, createdAt: { gte: since } },
        },
      }),
      this.prisma.user.count({ where: ACCOUNT_SUSPENDED_WHERE }),

      // P3: Align with /utilisateurs?type=reparateur (profile with repairerEnabled: true)
      this.prisma.profile.count({
        where: {
          ...LIVE,
          repairerEnabled: true,
          user: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.profile.count({
        where: {
          ...LIVE,
          verificationLevel: { in: ['IDENTITY', 'BUSINESS'] },
          user: {
            ...GENUINE_USER_WHERE,
            repairerProfile: { is: { deletedAt: null } },
          },
        },
      }),
      // B6: the verifications an operator can decide on, by the rule the Vérifications list uses.
      this.prisma.identityVerification.count({ where: IDENTITY_NEEDS_DECISION_WHERE }),
      this.prisma.repairerProfile.count({
        where: { ...LIVE, user: ACCOUNT_SUSPENDED_WHERE },
      }),

      // P3: Align with /demandes?etat=visible (live demandes with hiddenAt: null)
      this.prisma.demande.count({
        where: { ...LIVE, hiddenAt: null, author: GENUINE_USER_WHERE },
      }),
      this.prisma.demande.count({ where: { ...LIVE, status: 'IN_PROGRESS', author: GENUINE_USER_WHERE } }),
      // ⚠️ Frozen in production: nothing in apps/api or packages/shared WRITES
      // DemandeStatus.DONE. The 36 rows came from the demo seeder. See the design
      // spec §5 and PROJECT_ROADMAP.md §4 follow-up 4.
      this.prisma.demande.count({ where: { ...LIVE, status: 'DONE', author: GENUINE_USER_WHERE } }),

      // No status filter: « offres envoyées » is every offer ever sent, so that the
      // three offer figures sum. WITHDRAWN is folded in; Ch.8 does not list it.
      this.prisma.offer.count({
        where: { ...LIVE, repairer: GENUINE_USER_WHERE },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'ACCEPTED',
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'REJECTED',
          repairer: GENUINE_USER_WHERE,
        },
      }),

      // Commande carries no deletedAt: status is its lifecycle.
      this.prisma.commande.count({ where: { status: 'PENDING_PAYMENT', ...GENUINE_COMMANDE_WHERE } }),
      this.prisma.commande.count({ where: { status: 'REFUNDED', ...GENUINE_COMMANDE_WHERE } }),

      this.prisma.user.count({
        where: { email: { endsWith: DEMO_EMAIL_SUFFIX } },
      }),
      this.prisma.user.count({
        where: { email: { endsWith: TEST_FIXTURE_EMAIL_SUFFIX } },
      }),
      // Appended: the tile counts business dossiers too, as the list does.
      this.prisma.businessVerification.count({ where: BUSINESS_NEEDS_DECISION_WHERE }),
    ]);

    // Rolling 30-day UTC windows for MoM variations
    const now = new Date();
    const nowMs = now.getTime();
    const t30d = new Date(nowMs - 30 * 24 * 60 * 60 * 1000);
    const t60d = new Date(nowMs - 60 * 24 * 60 * 60 * 1000);

    const current30d = { gte: t30d, lte: now };
    const previous30d = { gte: t60d, lt: t30d };

    // P4: 30 contiguous UTC calendar dates [T - 29d ... T]
    const past30Days = generatePast30DaysUtc(now);
    const trendsSince = new Date(`${past30Days[0]}T00:00:00.000Z`);

    const [
      money,
      sessions,
      [disputesOpen, disputesInReview, disputesClosed],
      badgeCounts,
      attentionItems,
      offersWithdrawn,
      usersCur30d,
      usersPrev30d,
      repairersCur30d,
      repairersPrev30d,
      demandesCur30d,
      demandesPrev30d,
      inProgressCur30d,
      inProgressPrev30d,
      doneCur30d,
      donePrev30d,
      offersSentCur30d,
      offersSentPrev30d,
      offersAcceptedCur30d,
      offersAcceptedPrev30d,
      offersRejectedCur30d,
      offersRejectedPrev30d,
      offersWithdrawnCur30d,
      offersWithdrawnPrev30d,
      paymentsMoneyCur30d,
      paymentsMoneyPrev30d,
      paymentsPendingCur30d,
      paymentsPendingPrev30d,
      paymentsRefundedCur30d,
      paymentsRefundedPrev30d,
      disputesOpenCur30d,
      disputesOpenPrev30d,
      disputesInReviewCur30d,
      disputesInReviewPrev30d,
      disputesClosedCur30d,
      disputesClosedPrev30d,
      trendsCommandes,
      trendsDemandes,
    ] = await Promise.all([
      // PAID only. Ch.8 lists remboursements separately, so counting a refunded order
      // in volume would misstate both.
      this.prisma.commande.aggregate({
        where: GENUINE_COMMANDE_PAID_WHERE,
        _sum: { totalCents: true, protectionCents: true },
      }),
      this.prisma.session.findMany({
        where: {
          expiresAt: { gt: new Date() },
          user: { profile: { deletedAt: null } },
        },
        select: { userId: true },
      }),
      Promise.all([
        this.prisma.dispute.count({ where: { commande: GENUINE_COMMANDE_WHERE, status: 'OPEN' } }),
        this.prisma.dispute.count({ where: { commande: GENUINE_COMMANDE_WHERE, status: 'IN_REVIEW' } }),
        this.prisma.dispute.count({
          where: {
            commande: GENUINE_COMMANDE_WHERE,
            status: {
              in: [
                'RESOLVED_REFUNDED',
                'RESOLVED_RELEASED',
                'RESOLVED_DISMISSED',
              ],
            },
          },
        }),
      ]),
      this.getBadgeCounts(),
      this.cron.attentionItems(),
      this.prisma.offer.count({
        where: { ...LIVE, status: 'WITHDRAWN', repairer: GENUINE_USER_WHERE },
      }),
      // MoM 30-day queries
      this.prisma.profile.count({
        where: {
          ...LIVE,
          user: { ...GENUINE_USER_WHERE, createdAt: current30d },
        },
      }),
      this.prisma.profile.count({
        where: {
          ...LIVE,
          user: { ...GENUINE_USER_WHERE, createdAt: previous30d },
        },
      }),
      this.prisma.profile.count({
        where: {
          ...LIVE,
          repairerEnabled: true,
          createdAt: current30d,
          user: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.profile.count({
        where: {
          ...LIVE,
          repairerEnabled: true,
          createdAt: previous30d,
          user: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.demande.count({
        where: {
          ...LIVE,
          hiddenAt: null,
          createdAt: current30d,
          author: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.demande.count({
        where: {
          ...LIVE,
          hiddenAt: null,
          createdAt: previous30d,
          author: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.demande.count({
        where: { ...LIVE, status: 'IN_PROGRESS', createdAt: current30d, author: GENUINE_USER_WHERE },
      }),
      this.prisma.demande.count({
        where: { ...LIVE, status: 'IN_PROGRESS', createdAt: previous30d, author: GENUINE_USER_WHERE },
      }),
      this.prisma.demande.count({
        where: { ...LIVE, status: 'DONE', createdAt: current30d, author: GENUINE_USER_WHERE },
      }),
      this.prisma.demande.count({
        where: { ...LIVE, status: 'DONE', createdAt: previous30d, author: GENUINE_USER_WHERE },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          createdAt: current30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          createdAt: previous30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'ACCEPTED',
          createdAt: current30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'ACCEPTED',
          createdAt: previous30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'REJECTED',
          createdAt: current30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'REJECTED',
          createdAt: previous30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'WITHDRAWN',
          createdAt: current30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.offer.count({
        where: {
          ...LIVE,
          status: 'WITHDRAWN',
          createdAt: previous30d,
          repairer: GENUINE_USER_WHERE,
        },
      }),
      this.prisma.commande.aggregate({
        where: { ...GENUINE_COMMANDE_PAID_WHERE, ...paidWithin(current30d) },
        _sum: { totalCents: true, protectionCents: true },
      }),
      this.prisma.commande.aggregate({
        where: { ...GENUINE_COMMANDE_PAID_WHERE, ...paidWithin(previous30d) },
        _sum: { totalCents: true, protectionCents: true },
      }),
      this.prisma.commande.count({
        where: { status: 'PENDING_PAYMENT', createdAt: current30d, ...GENUINE_COMMANDE_WHERE },
      }),
      this.prisma.commande.count({
        where: { status: 'PENDING_PAYMENT', createdAt: previous30d, ...GENUINE_COMMANDE_WHERE },
      }),
      this.prisma.commande.count({
        where: { status: 'REFUNDED', createdAt: current30d, ...GENUINE_COMMANDE_WHERE },
      }),
      this.prisma.commande.count({
        where: { status: 'REFUNDED', createdAt: previous30d, ...GENUINE_COMMANDE_WHERE },
      }),
      this.prisma.dispute.count({
        where: { commande: GENUINE_COMMANDE_WHERE, status: 'OPEN', createdAt: current30d },
      }),
      this.prisma.dispute.count({
        where: { commande: GENUINE_COMMANDE_WHERE, status: 'OPEN', createdAt: previous30d },
      }),
      this.prisma.dispute.count({
        where: { commande: GENUINE_COMMANDE_WHERE, status: 'IN_REVIEW', createdAt: current30d },
      }),
      this.prisma.dispute.count({
        where: { commande: GENUINE_COMMANDE_WHERE, status: 'IN_REVIEW', createdAt: previous30d },
      }),
      this.prisma.dispute.count({
        where: {
          commande: GENUINE_COMMANDE_WHERE,
          status: {
            in: [
              'RESOLVED_REFUNDED',
              'RESOLVED_RELEASED',
              'RESOLVED_DISMISSED',
            ],
          },
          createdAt: current30d,
        },
      }),
      this.prisma.dispute.count({
        where: {
          commande: GENUINE_COMMANDE_WHERE,
          status: {
            in: [
              'RESOLVED_REFUNDED',
              'RESOLVED_RELEASED',
              'RESOLVED_DISMISSED',
            ],
          },
          createdAt: previous30d,
        },
      }),
      // P4: 30-day time-series daily aggregation queries
      this.prisma.commande.findMany({
        where: { ...GENUINE_COMMANDE_PAID_WHERE, ...paidWithin({ gte: trendsSince }) },
        select: { paidAt: true, createdAt: true, totalCents: true },
      }),
      this.prisma.demande.findMany({
        where: {
          ...LIVE,
          hiddenAt: null,
          createdAt: { gte: trendsSince },
          author: GENUINE_USER_WHERE,
        },
        select: { createdAt: true },
      }),
    ]);

    const activeAccounts = new Set(sessions.map((s) => s.userId)).size;

    const pendingActions: AdminPendingActions = {
      litiges: badgeCounts.litiges,
      verifications: badgeCounts.verifications,
      signalements: badgeCounts.signalements,
      annulations: badgeCounts.annulations,
      attention: attentionItems.length,
      // Read off the list the « Commandes à surveiller » page shows, not counted a second time: a
      // second query had its own test-data rule and ignored the dismissals, so the card and the page
      // could disagree. An order is counted once however many reasons it carries.
      stalePayments: attentionItems.filter((item) => item.reasons?.includes('PAYMENT_PENDING_STALE')).length,
    };

    // Aggregate daily buckets for revenue and demandes
    const revenueMap: Record<string, number> = {};
    const demandesMap: Record<string, number> = {};
    for (const d of past30Days) {
      revenueMap[d] = 0;
      demandesMap[d] = 0;
    }

    for (const cmd of trendsCommandes) {
      const dateKey = (cmd.paidAt ?? cmd.createdAt).toISOString().slice(0, 10);
      if (revenueMap[dateKey] !== undefined) {
        revenueMap[dateKey] += cmd.totalCents ?? 0;
      }
    }

    for (const dem of trendsDemandes) {
      const dateKey = dem.createdAt.toISOString().slice(0, 10);
      if (demandesMap[dateKey] !== undefined) {
        demandesMap[dateKey] += 1;
      }
    }

    const trends30d: AdminOverviewTrends = {
      revenue: past30Days.map((date) => ({ date, value: revenueMap[date]! })),
      demandes: past30Days.map((date) => ({ date, value: demandesMap[date]! })),
    };

    // V8 E1 (criterion 8): « Configuration terminée / en cours », by the same shared journey the repairer's card
    // reads, over the repairers « Inscrits » counts (live, genuine, repairer mode on). « En cours » is the rest of
    // « Inscrits », so the two always add up, a repairer-mode profile with no RepairerProfile row included.
    const setupJourneys = await loadRepairerJourneys(this.prisma, {
      deletedAt: null,
      user: { ...GENUINE_USER_WHERE, profile: { repairerEnabled: true, deletedAt: null } },
    });
    const setupComplete = setupJourneys.filter((j) => j.journey.complete).length;

    return {
      pendingActions,
      users: {
        total: kpi(usersTotal, calcMom(usersCur30d, usersPrev30d)),
        recent: kpi(usersRecent),
        active: kpi(activeAccounts),
        suspended: kpi(usersSuspended),
      },
      repairers: {
        total: kpi(repairersTotal, calcMom(repairersCur30d, repairersPrev30d)),
        verified: kpi(repairersVerified),
        pendingVerification: kpi(repairersPending + repairersPendingBusiness),
        suspended: kpi(repairersSuspended),
        setupComplete: kpi(setupComplete),
        setupIncomplete: kpi(Math.max(0, repairersTotal - setupComplete)),
      },
      demandes: {
        published: kpi(
          demandesPublished,
          calcMom(demandesCur30d, demandesPrev30d),
        ),
        inProgress: kpi(
          demandesInProgress,
          calcMom(inProgressCur30d, inProgressPrev30d),
        ),
        done: kpi(demandesDone, calcMom(doneCur30d, donePrev30d)),
      },
      offers: {
        sent: kpi(offersTotal, calcMom(offersSentCur30d, offersSentPrev30d)),
        accepted: kpi(
          offersAccepted,
          calcMom(offersAcceptedCur30d, offersAcceptedPrev30d),
        ),
        rejected: kpi(
          offersRejected,
          calcMom(offersRejectedCur30d, offersRejectedPrev30d),
        ),
        withdrawn: kpi(
          offersWithdrawn,
          calcMom(offersWithdrawnCur30d, offersWithdrawnPrev30d),
        ),
      },
      payments: {
        volumeCents: kpi(
          money._sum.totalCents ?? 0,
          calcMom(
            paymentsMoneyCur30d._sum.totalCents ?? 0,
            paymentsMoneyPrev30d._sum.totalCents ?? 0,
          ),
        ),
        commissionCents: kpi(
          money._sum.protectionCents ?? 0,
          calcMom(
            paymentsMoneyCur30d._sum.protectionCents ?? 0,
            paymentsMoneyPrev30d._sum.protectionCents ?? 0,
          ),
        ),
        pending: kpi(
          paymentsPending,
          calcMom(paymentsPendingCur30d, paymentsPendingPrev30d),
        ),
        refunded: kpi(
          paymentsRefunded,
          calcMom(paymentsRefundedCur30d, paymentsRefundedPrev30d),
        ),
      },
      disputes: {
        open: kpi(
          disputesOpen,
          calcMom(disputesOpenCur30d, disputesOpenPrev30d),
        ),
        inReview: kpi(
          disputesInReview,
          calcMom(disputesInReviewCur30d, disputesInReviewPrev30d),
        ),
        closed: kpi(
          disputesClosed,
          calcMom(disputesClosedCur30d, disputesClosedPrev30d),
        ),
      },
      trends30d,
      context: {
        demoAccounts,
        testFixtureAccounts,
        // The one reader of the mode, shared with the mobile notice and the checkout response,
        // so the banner cannot say « test » where the app says « live » (a restricted key and the
        // fake driver used to disagree). It follows the secret key, so it disappears when a live
        // key is installed; `arePaymentsEnabled()` refuses a live key without a live publishable key.
        stripeTestMode: isStripeTestMode(),
        recentWindowDays: RECENT_WINDOW_DAYS,
      },
    };
  }

  /**
   * UI3: Notification badges for queues requiring operator intervention.
   * `attention` count is supplied by CronService in the controller.
   */
  async getBadgeCounts(): Promise<Omit<AdminBadgeCounts, 'attention'>> {
    const [
      litiges,
      annulations,
      signalements,
      pendingIdentity,
      pendingBusiness,
      equipe,
    ] = await Promise.all([
      // Raw on purpose (RU-31): a badge counts the rows its page lists, fixtures included.
      this.prisma.dispute.count({ where: { status: { in: ['OPEN', 'IN_REVIEW'] } } }),
      this.prisma.cancellationRequest.count({ where: { status: 'PENDING' } }),
      this.prisma.conversationReport.count({ where: { resolvedAt: null } }),
      this.prisma.identityVerification.count({ where: IDENTITY_NEEDS_DECISION_WHERE }),
      this.prisma.businessVerification.count({ where: BUSINESS_NEEDS_DECISION_WHERE }),
      this.prisma.staffInvitation.count({
        where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      }),
    ]);

    return {
      litiges,
      annulations,
      signalements,
      verifications: pendingIdentity + pendingBusiness,
      equipe,
    };
  }

  /**
   * Builds accent-tolerant Prisma search clauses across the 4 platform entities.
   */
  private buildSearchWhere(term: string) {
    const normalizedOrder = normaliseOrderSearch(term);
    const litMatch = term.match(/^(?:#?LIT-?)?0*(\d+)$/i);
    const litNumber =
      litMatch &&
      litMatch[1] &&
      Number(litMatch[1]) > 0 &&
      Number(litMatch[1]) <= 2_147_483_647
        ? parseInt(litMatch[1], 10)
        : undefined;

    const variants = expandAccentVariants(term, 16);

    const commandeWhere = {
      OR: [
        { id: { startsWith: normalizedOrder } },
        { id: { startsWith: term } },
        ...variants.flatMap((v) => [
          { client: { name: { contains: v, mode: 'insensitive' as const } } },
          { client: { email: { contains: v, mode: 'insensitive' as const } } },
          { repairer: { name: { contains: v, mode: 'insensitive' as const } } },
          { repairer: { email: { contains: v, mode: 'insensitive' as const } } },
        ]),
      ],
    };

    // V7 D2 (U5, Q3): the pseudo too, which the client calls « pseudo » and types with an « @ ».
    const handle = term.replace(/^@+/, '');
    const userWhere = {
      OR: [
        { id: { startsWith: term } },
        ...(handle ? [{ username: { contains: handle, mode: 'insensitive' as const } }] : []),
        ...variants.flatMap((v) => [
          { name: { contains: v, mode: 'insensitive' as const } },
          { email: { contains: v, mode: 'insensitive' as const } },
        ]),
        { phone: { contains: term } },
      ],
    };

    const demandeWhere = {
      OR: [
        { id: { startsWith: term } },
        ...variants.flatMap((v) => [
          { title: { contains: v, mode: 'insensitive' as const } },
          { brand: { contains: v, mode: 'insensitive' as const } },
          { model: { contains: v, mode: 'insensitive' as const } },
          { locationLabel: { contains: v, mode: 'insensitive' as const } },
          { category: { labelFr: { contains: v, mode: 'insensitive' as const } } },
          { author: { name: { contains: v, mode: 'insensitive' as const } } },
          { author: { email: { contains: v, mode: 'insensitive' as const } } },
        ]),
      ],
    };

    const disputeWhere = {
      OR: [
        { id: { startsWith: term } },
        { commandeId: { startsWith: normalizedOrder } },
        ...variants.map((v) => ({ reason: { contains: v, mode: 'insensitive' as const } })),
        ...(litNumber !== undefined ? [{ number: litNumber }] : []),
      ],
    };

    return { commandeWhere, userWhere, demandeWhere, disputeWhere };
  }

  /**
   * UI4 & F8: Instant header search across commandes, users, demandes, and disputes.
   */
  async search(query?: string): Promise<AdminSearchResult> {
    const term = (query ?? '').trim().slice(0, 100);
    if (!term) {
      return { commandes: [], users: [], demandes: [], disputes: [] };
    }

    const { commandeWhere, userWhere, demandeWhere, disputeWhere } = this.buildSearchWhere(term);

    const [commandesRaw, usersRaw, demandesRaw, disputesRaw] = await Promise.all([
      this.prisma.commande.findMany({
        where: commandeWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          client: { select: { name: true, email: true } },
          repairer: { select: { name: true, email: true } },
        },
      }),
      this.prisma.user.findMany({
        where: userWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          repairerProfile: { select: { id: true } },
        },
      }),
      this.prisma.demande.findMany({
        where: demandeWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          brand: true,
          model: true,
          status: true,
          locationLabel: true,
          category: { select: { labelFr: true } },
          author: { select: { name: true, email: true } },
        },
      }),
      this.prisma.dispute.findMany({
        where: disputeWhere,
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          commandeId: true,
          status: true,
          reason: true,
        },
      }),
    ]);

    const commandes: AdminSearchResultItem[] = commandesRaw.map((cmd) => ({
      id: cmd.id,
      title: `Commande #CMD-${cmd.id.slice(0, 8).toUpperCase()}`,
      subtitle: `Client : ${searchPersonLabel(cmd.client?.name, cmd.client?.email)} · Réparateur : ${searchPersonLabel(cmd.repairer?.name, cmd.repairer?.email)}`,
      badge: cmd.status,
      href: `/commandes/${cmd.id}`,
    }));

    const users: AdminSearchResultItem[] = usersRaw.map((u) => ({
      id: u.id,
      title: searchPersonLabel(u.name, u.email),
      subtitle: searchPersonEmail(u.name, u.email) ?? undefined,
      badge: searchRoleLabel(u),
      href: `/utilisateurs/${u.id}`,
    }));

    const demandes: AdminSearchResultItem[] = demandesRaw.map((dmd) => {
      const client = dmd.author;
      const clientLabel = searchPersonLabel(client?.name, client?.email);
      const devicePart = [dmd.brand, dmd.model].filter(Boolean).join(' ');
      const subtitle = [
        dmd.category?.labelFr || 'Appareil',
        devicePart,
        `Client : ${clientLabel}`,
      ]
        .filter(Boolean)
        .join(' · ');

      return {
        id: dmd.id,
        title: dmd.title,
        subtitle,
        badge: dmd.status,
        href: `/demandes/${dmd.id}`,
      };
    });

    const disputes: AdminSearchResultItem[] = disputesRaw.map((disp) => {
      const ref = `LIT-${String(disp.number).padStart(4, '0')}`;
      return {
        id: disp.id,
        title: `Litige #${ref}`,
        subtitle: `Commande #CMD-${disp.commandeId.slice(0, 8).toUpperCase()} · ${disp.reason}`,
        badge: disp.status,
        href: `/litiges?disputeId=${disp.id}`,
      };
    });

    return { commandes, users, demandes, disputes };
  }

  /**
   * F8: Detailed multi-category search hub with counts, pagination, and entity metadata.
   */
  async searchDetailed(query: AdminSearchQuery): Promise<AdminSearchDetailedResponse> {
    const term = (query.q ?? '').trim().slice(0, 100);
    if (!term) {
      return {
        query: '',
        category: query.category,
        total: 0,
        counts: {
          all: 0,
          commandes: 0,
          users: 0,
          demandes: 0,
          disputes: 0,
        },
        items: [],
        page: query.page,
        limit: query.limit,
      };
    }

    const { commandeWhere, userWhere, demandeWhere, disputeWhere } = this.buildSearchWhere(term);

    // Compute category counts in parallel
    const [commandesCount, usersCount, demandesCount, disputesCount] = await Promise.all([
      this.prisma.commande.count({ where: commandeWhere }),
      this.prisma.user.count({ where: userWhere }),
      this.prisma.demande.count({ where: demandeWhere }),
      this.prisma.dispute.count({ where: disputeWhere }),
    ]);

    const counts = {
      all: commandesCount + usersCount + demandesCount + disputesCount,
      commandes: commandesCount,
      users: usersCount,
      demandes: demandesCount,
      disputes: disputesCount,
    };

    const total = query.category === 'all' ? counts.all : counts[query.category];

    const mapCommandeToDetailed = (cmd: any): AdminSearchDetailedItem => ({
      id: cmd.id,
      title: `Commande #CMD-${cmd.id.slice(0, 8).toUpperCase()}`,
      subtitle: `Client : ${searchPersonLabel(cmd.client?.name, cmd.client?.email)} · Réparateur : ${searchPersonLabel(cmd.repairer?.name, cmd.repairer?.email)}`,
      badge: cmd.status,
      href: `/commandes/${cmd.id}`,
      category: 'commande',
      snippet: `Commande #${cmd.id.slice(0, 8).toUpperCase()} · Total : ${((cmd.totalCents ?? 0) / 100).toFixed(2)} € · Statut : ${cmd.status}`,
      createdAt:
        cmd.createdAt instanceof Date
          ? cmd.createdAt.toISOString()
          : new Date(cmd.createdAt).toISOString(),
      metadata: {
        totalCents: cmd.totalCents,
        status: cmd.status,
        clientName: searchPersonName(cmd.client?.name, cmd.client?.email),
        clientEmail: searchPersonEmail(cmd.client?.name, cmd.client?.email),
        repairerName: searchPersonName(cmd.repairer?.name, cmd.repairer?.email),
        repairerEmail: searchPersonEmail(cmd.repairer?.name, cmd.repairer?.email),
      },
    });

    const mapUserToDetailed = (u: any): AdminSearchDetailedItem => ({
      id: u.id,
      title: searchPersonLabel(u.name, u.email),
      subtitle: searchPersonEmail(u.name, u.email) ?? undefined,
      badge: searchRoleLabel(u),
      href: `/utilisateurs/${u.id}`,
      category: 'user',
      snippet: `${searchPersonEmail(u.name, u.email) ?? DELETED_USER_NAME}${u.phone ? ` · ${u.phone}` : ''} · Rôle : ${searchRoleLabel(u)}`,
      createdAt:
        u.createdAt instanceof Date
          ? u.createdAt.toISOString()
          : new Date(u.createdAt).toISOString(),
      metadata: {
        role: u.role,
        email: searchPersonEmail(u.name, u.email),
        phone: u.phone,
        isRepairer: Boolean(u.repairerProfile),
      },
    });

    const mapDemandeToDetailed = (dmd: any): AdminSearchDetailedItem => {
      const client = dmd.author;
      const clientLabel = searchPersonLabel(client?.name, client?.email);
      const devicePart = [dmd.brand, dmd.model].filter(Boolean).join(' ');
      const subtitle = [
        dmd.category?.labelFr || 'Appareil',
        devicePart,
        `Client : ${clientLabel}`,
      ]
        .filter(Boolean)
        .join(' · ');

      return {
        id: dmd.id,
        title: dmd.title,
        subtitle,
        badge: dmd.status,
        href: `/demandes/${dmd.id}`,
        category: 'demande',
        snippet: dmd.description
          ? dmd.description.length > 120
            ? `${dmd.description.slice(0, 117)}...`
            : dmd.description
          : undefined,
        createdAt:
          dmd.createdAt instanceof Date
            ? dmd.createdAt.toISOString()
            : new Date(dmd.createdAt).toISOString(),
        metadata: {
          status: dmd.status,
          brand: dmd.brand,
          model: dmd.model,
          category: dmd.category?.labelFr,
          location: dmd.locationLabel,
          clientName: searchPersonName(client?.name, client?.email),
          clientEmail: searchPersonEmail(client?.name, client?.email),
        },
      };
    };

    const mapDisputeToDetailed = (disp: any): AdminSearchDetailedItem => {
      const ref = `LIT-${String(disp.number).padStart(4, '0')}`;
      return {
        id: disp.id,
        title: `Litige #${ref}`,
        subtitle: `Commande #CMD-${disp.commandeId.slice(0, 8).toUpperCase()} · ${disp.reason}`,
        badge: disp.status,
        href: `/litiges?disputeId=${disp.id}`,
        category: 'dispute',
        snippet: `Litige #${ref} · Commande #CMD-${disp.commandeId.slice(0, 8).toUpperCase()} · Motif : ${disp.reason}`,
        createdAt:
          disp.createdAt instanceof Date
            ? disp.createdAt.toISOString()
            : new Date(disp.createdAt).toISOString(),
        metadata: {
          number: disp.number,
          commandeId: disp.commandeId,
          status: disp.status,
          reason: disp.reason,
        },
      };
    };

    let items: AdminSearchDetailedItem[] = [];

    if (query.category === 'all') {
      // A page N of the merge needs the newest N * limit rows of EACH list: capping the fetch at a
      // fixed 100 returned an empty page 3 of 50 while `total` still claimed more rows existed.
      const fetchCap = query.page * query.limit;
      if (fetchCap > SEARCH_ALL_WINDOW) {
        throw new BadRequestException(
          'Trop de résultats pour cet onglet : affinez la recherche ou choisissez une catégorie.',
        );
      }
      const [cmdRows, userRows, dmdRows, dispRows] = await Promise.all([
        this.prisma.commande.findMany({
          where: commandeWhere,
          take: fetchCap,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            status: true,
            totalCents: true,
            createdAt: true,
            client: { select: { name: true, email: true } },
            repairer: { select: { name: true, email: true } },
          },
        }),
        this.prisma.user.findMany({
          where: userWhere,
          take: fetchCap,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            phone: true,
            createdAt: true,
            repairerProfile: { select: { id: true } },
          },
        }),
        this.prisma.demande.findMany({
          where: demandeWhere,
          take: fetchCap,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            brand: true,
            model: true,
            status: true,
            locationLabel: true,
            createdAt: true,
            category: { select: { labelFr: true } },
            author: { select: { name: true, email: true } },
          },
        }),
        this.prisma.dispute.findMany({
          where: disputeWhere,
          take: fetchCap,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            number: true,
            commandeId: true,
            status: true,
            reason: true,
            createdAt: true,
          },
        }),
      ]);

      const merged = [
        ...cmdRows.map(mapCommandeToDetailed),
        ...userRows.map(mapUserToDetailed),
        ...dmdRows.map(mapDemandeToDetailed),
        ...dispRows.map(mapDisputeToDetailed),
      ];

      merged.sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      });

      const start = (query.page - 1) * query.limit;
      items = merged.slice(start, start + query.limit);
    } else if (query.category === 'commandes') {
      const rows = await this.prisma.commande.findMany({
        where: commandeWhere,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          totalCents: true,
          createdAt: true,
          client: { select: { name: true, email: true } },
          repairer: { select: { name: true, email: true } },
        },
      });
      items = rows.map(mapCommandeToDetailed);
    } else if (query.category === 'users') {
      const rows = await this.prisma.user.findMany({
        where: userWhere,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          phone: true,
          createdAt: true,
          repairerProfile: { select: { id: true } },
        },
      });
      items = rows.map(mapUserToDetailed);
    } else if (query.category === 'demandes') {
      const rows = await this.prisma.demande.findMany({
        where: demandeWhere,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          title: true,
          description: true,
          brand: true,
          model: true,
          status: true,
          locationLabel: true,
          createdAt: true,
          category: { select: { labelFr: true } },
          author: { select: { name: true, email: true } },
        },
      });
      items = rows.map(mapDemandeToDetailed);
    } else if (query.category === 'disputes') {
      const rows = await this.prisma.dispute.findMany({
        where: disputeWhere,
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          number: true,
          commandeId: true,
          status: true,
          reason: true,
          createdAt: true,
        },
      });
      items = rows.map(mapDisputeToDetailed);
    }

    return {
      query: term,
      category: query.category,
      total,
      counts,
      items,
      page: query.page,
      limit: query.limit,
    };
  }
}
