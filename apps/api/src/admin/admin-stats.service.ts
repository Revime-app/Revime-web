import { Injectable, Logger } from '@nestjs/common';
import type { AdminConversionFunnelDto, AdminStatsOverviewDto, AdminStatsPeriod, AdminStatsQuery } from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppException } from '../common/app-exception.js';
import { GENUINE_COLLECTED_COMMANDE_WHERE, GENUINE_USER_WHERE } from './admin-constants.js';
import { getDepartmentInfo } from './admin-stats-geo.js';
import { isStorageConfigured, storageGateway } from '../storage/gateway.js';

/** Matches `DemandesService` and `ConversationsService`, which sign the same avatars. */
const AVATAR_READ_TTL_SECONDS = 3600;

interface BucketDef {
  start: Date;
  end: Date;
  date: string;
  label: string;
}

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * `profile.avatarPath` is a path inside the PRIVATE photo bucket, not a URL: used as an
   * `<img src>` it resolves against the admin's own origin and 404s (the broken image on the
   * leaderboard). Sign it, as `ConversationsService` and `CommandesService` do.
   *
   * A path that cannot be signed (storage off, object gone, storage down) is simply absent from
   * the map, so the caller shows the initials. It must never fall back to the raw path.
   */
  private async signAvatarPaths(paths: string[]): Promise<Map<string, string>> {
    const unique = Array.from(new Set(paths));
    if (unique.length === 0 || !isStorageConfigured()) return new Map();
    try {
      return await storageGateway().createSignedReadUrls(unique, AVATAR_READ_TTL_SECONDS);
    } catch (err) {
      this.logger.warn(`Could not sign leaderboard avatars: ${err instanceof Error ? err.message : String(err)}`);
      return new Map();
    }
  }

  async getOverview(query: AdminStatsQuery): Promise<AdminStatsOverviewDto> {
    const period: AdminStatsPeriod = query.period ?? '30d';
    let endDate = new Date();
    let startDate: Date;

    if (period === 'custom') {
      // `adminStatsQuerySchema` guarantees two valid, ordered `YYYY-MM-DD` days at most three years apart.
      // Both days are INCLUSIVE (the chosen last day is part of the period): UTC days, like every other
      // bucket of this page.
      if (!query.from || !query.to) {
        throw new AppException('VALIDATION_FAILED', 'Une période personnalisée demande deux dates.');
      }
      startDate = new Date(`${query.from}T00:00:00.000Z`);
      endDate = new Date(`${query.to}T23:59:59.999Z`);
    } else {
      startDate = await this.computeStartDate(period, endDate, query.categoryId);
    }

    let comparisonPeriod: { startDate: string; endDate: string } | null = null;
    let priorStartDate: Date | null = null;
    let priorEndDate: Date | null = null;

    if (period !== 'all') {
      const duration = endDate.getTime() - startDate.getTime();
      priorEndDate = startDate;
      priorStartDate = new Date(startDate.getTime() - duration);
      comparisonPeriod = {
        startDate: priorStartDate.toISOString(),
        endDate: priorEndDate.toISOString(),
      };
    }

    const calcChangePct = (currentVal: number, priorVal: number | null): number | null => {
      if (period === 'all' || priorVal === null) return null;
      if (priorVal > 0) {
        return Math.round(((currentVal - priorVal) / priorVal) * 1000) / 10;
      }
      if (currentVal > 0 && priorVal === 0) {
        return 100;
      }
      return null;
    };

    const categoryId = query.categoryId;
    const department = query.department;

    // 1. Current Demandes
    // PRE-3: every population below excludes fixture and demo accounts (GENUINE_*), so that this page
    // and the overview read the same real platform.
    const currentDemandeWhere: any = {
      deletedAt: null,
      author: GENUINE_USER_WHERE,
      createdAt: { gte: startDate, lte: endDate },
    };
    if (categoryId) currentDemandeWhere.categoryId = categoryId;

    const rawDemandes = await this.prisma.demande.findMany({
      where: currentDemandeWhere,
      include: {
        category: { select: { id: true, labelFr: true } },
        // Real accounts only (PRE-3): a fixture offer or a fixture-paid order on a real demande
        // would otherwise move the funnel while the KPIs beside it ignore it.
        offers: {
          where: { deletedAt: null, repairer: GENUINE_USER_WHERE },
          orderBy: { createdAt: 'asc' },
          select: { id: true, status: true, createdAt: true },
        },
        commandes: {
          where: { ...GENUINE_COLLECTED_COMMANDE_WHERE, status: { in: ['PAID', 'REFUNDED'] } },
          select: { id: true, status: true, step: true, paidAt: true, releasedAt: true },
        },
      },
    });

    const currentDemandes = department
      ? rawDemandes.filter((d: any) => getDepartmentInfo(d.postalCode).code === department)
      : rawDemandes;

    // 2. Current Commandes (PAID or REFUNDED status)
    const currentCommandeWhere: any = {
      ...GENUINE_COLLECTED_COMMANDE_WHERE,
      status: { in: ['PAID', 'REFUNDED'] },
      OR: [
        { paidAt: { gte: startDate, lte: endDate } },
        { paidAt: null, createdAt: { gte: startDate, lte: endDate } },
      ],
    };
    if (categoryId) {
      currentCommandeWhere.demande = { categoryId };
    }

    const rawCommandes = await this.prisma.commande.findMany({
      where: currentCommandeWhere,
      include: {
        demande: {
          select: {
            id: true,
            categoryId: true,
            postalCode: true,
            category: { select: { id: true, labelFr: true } },
          },
        },
        dispute: {
          select: { id: true },
        },
      },
    });

    const currentCommandes = department
      ? rawCommandes.filter(
          (c: any) => c.demande?.postalCode && getDepartmentInfo(c.demande.postalCode).code === department,
        )
      : rawCommandes;

    // 3. Current Offers
    const currentOfferWhere: any = {
      deletedAt: null,
      repairer: GENUINE_USER_WHERE,
      createdAt: { gte: startDate, lte: endDate },
    };
    if (categoryId) {
      currentOfferWhere.demande = { categoryId };
    }

    const rawOffers = await this.prisma.offer.findMany({
      where: currentOfferWhere,
      include: {
        demande: {
          select: { id: true, categoryId: true, postalCode: true },
        },
        repairer: {
          select: {
            id: true,
            repairerProfile: {
              select: { postalCode: true },
            },
          },
        },
      },
    });

    const currentOffers = department
      ? rawOffers.filter(
          (o: any) => o.demande?.postalCode && getDepartmentInfo(o.demande.postalCode).code === department,
        )
      : rawOffers;

    // 4. Current Users
    const currentUsers = await this.prisma.user.findMany({
      where: {
        ...GENUINE_USER_WHERE,
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        repairerProfile: {
          select: { id: true, deletedAt: true },
        },
      },
    });

    // 5. Prior Period Metrics (if applicable)
    let priorDemandesCount = 0;
    let priorAvgResponseTime: number | null = null;
    let priorAcceptanceRate: number | null = null;
    let priorGmvCents = 0;
    let priorCommissionsCents = 0;
    let priorRegistrationsCount = 0;
    let priorAvgBasket: number | null = null;
    let priorActualCommissionRate: number | null = null;
    let priorDisputeRate: number | null = null;
    let priorRefundRate: number | null = null;

    if (period !== 'all' && priorStartDate && priorEndDate) {
      // Prior demandes
      const priorDemandeWhere: any = {
        deletedAt: null,
        author: GENUINE_USER_WHERE,
        createdAt: { gte: priorStartDate, lt: priorEndDate },
      };
      if (categoryId) priorDemandeWhere.categoryId = categoryId;

      const rawPriorDemandes = await this.prisma.demande.findMany({
        where: priorDemandeWhere,
        select: {
          id: true,
          postalCode: true,
          createdAt: true,
          offers: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          },
        },
      });

      const priorDemandes = department
        ? rawPriorDemandes.filter((d: any) => getDepartmentInfo(d.postalCode).code === department)
        : rawPriorDemandes;

      priorDemandesCount = priorDemandes.length;

      const priorDelays: number[] = [];
      for (const d of priorDemandes) {
        const earliest = d.offers?.[0];
        if (earliest) {
          const delay = Math.max(
            0,
            Math.round(
              (new Date(earliest.createdAt).getTime() - new Date(d.createdAt).getTime()) / 60000,
            ),
          );
          priorDelays.push(delay);
        }
      }
      priorAvgResponseTime =
        priorDelays.length > 0
          ? Math.round(priorDelays.reduce((s, v) => s + v, 0) / priorDelays.length)
          : 0;

      // Prior offers
      const priorOfferWhere: any = {
        deletedAt: null,
        repairer: GENUINE_USER_WHERE,
        createdAt: { gte: priorStartDate, lt: priorEndDate },
      };
      if (categoryId) priorOfferWhere.demande = { categoryId };

      const rawPriorOffers = await this.prisma.offer.findMany({
        where: priorOfferWhere,
        select: {
          id: true,
          status: true,
          demande: { select: { postalCode: true } },
        },
      });

      const priorOffers = department
        ? rawPriorOffers.filter(
            (o: any) => o.demande?.postalCode && getDepartmentInfo(o.demande.postalCode).code === department,
          )
        : rawPriorOffers;

      const priorAcceptedOffers = priorOffers.filter((o: any) => o.status === 'ACCEPTED').length;
      priorAcceptanceRate =
        priorOffers.length > 0
          ? Math.round((priorAcceptedOffers / priorOffers.length) * 1000) / 10
          : 0;

      // Prior commandes
      const priorCommandeWhere: any = {
        ...GENUINE_COLLECTED_COMMANDE_WHERE,
        status: { in: ['PAID', 'REFUNDED'] },
        OR: [
          { paidAt: { gte: priorStartDate, lt: priorEndDate } },
          { paidAt: null, createdAt: { gte: priorStartDate, lt: priorEndDate } },
        ],
      };
      if (categoryId) priorCommandeWhere.demande = { categoryId };

      const rawPriorCommandes = await this.prisma.commande.findMany({
        where: priorCommandeWhere,
        select: {
          totalCents: true,
          protectionCents: true,
          status: true,
          disputedAt: true,
          refundedAt: true,
          refundedCents: true,
          dispute: { select: { id: true } },
          demande: { select: { postalCode: true } },
        },
      });

      const priorCommandes = department
        ? rawPriorCommandes.filter(
            (c: any) => c.demande?.postalCode && getDepartmentInfo(c.demande.postalCode).code === department,
          )
        : rawPriorCommandes;

      priorGmvCents = priorCommandes.reduce((s: number, c: any) => s + (c.totalCents || 0), 0);
      priorCommissionsCents = priorCommandes.reduce((s: number, c: any) => s + (c.protectionCents || 0), 0);

      const priorPaidCommandesCount = priorCommandes.length;
      // null, not 0, when the prior period has no paid order: a rate over nothing is « no comparison »,
      // and 0 would show « +100 % » for any rate the current period has.
      priorAvgBasket =
        priorPaidCommandesCount > 0 ? Math.round(priorGmvCents / priorPaidCommandesCount) : null;
      priorActualCommissionRate =
        priorGmvCents > 0 ? Math.round((priorCommissionsCents / priorGmvCents) * 1000) / 10 : null;

      const priorDisputesCount = priorCommandes.filter(
        (c: any) => c.dispute != null || c.disputedAt != null,
      ).length;
      priorDisputeRate =
        priorPaidCommandesCount > 0
          ? Math.round((priorDisputesCount / priorPaidCommandesCount) * 1000) / 10
          : null;

      const priorRefundedCount = priorCommandes.filter(
        (c: any) =>
          c.status === 'REFUNDED' ||
          (Array.isArray(c.refunds) && c.refunds.length > 0) ||
          c.refundedAt != null ||
          (typeof c.refundedCents === 'number' && c.refundedCents > 0),
      ).length;
      priorRefundRate =
        priorPaidCommandesCount > 0
          ? Math.round((priorRefundedCount / priorPaidCommandesCount) * 1000) / 10
          : null;

      // Prior registrations
      priorRegistrationsCount = await this.prisma.user.count({
        where: {
          ...GENUINE_USER_WHERE,
          createdAt: { gte: priorStartDate, lt: priorEndDate },
        },
      });
    }

    // Indicator 1: repairsByCategory
    const categoryRepairsMap = new Map<
      string,
      { categoryId: string; categoryName: string; count: number; volumeCents: number }
    >();

    for (const c of currentCommandes) {
      const catId = c.demande?.categoryId ?? 'unknown';
      const catName = c.demande?.category?.labelFr ?? 'Autre';
      const volume = c.totalCents || 0;

      const entry = categoryRepairsMap.get(catId) ?? {
        categoryId: catId,
        categoryName: catName,
        count: 0,
        volumeCents: 0,
      };
      entry.count += 1;
      entry.volumeCents += volume;
      categoryRepairsMap.set(catId, entry);
    }

    const totalPaidOrders = currentCommandes.length;
    const repairsByCategory = Array.from(categoryRepairsMap.values())
      .map((entry) => ({
        ...entry,
        percentage:
          totalPaidOrders > 0 ? Math.round((entry.count / totalPaidOrders) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.count - a.count);

    // Repairer Stats & Active Repairers Aggregation
    const repairerStats = new Map<
      string,
      { offersSent: number; offersAccepted: number; totalRevenueCents: number }
    >();

    for (const o of currentOffers) {
      if (!o.repairerUserId) continue;
      const stats = repairerStats.get(o.repairerUserId) ?? {
        offersSent: 0,
        offersAccepted: 0,
        totalRevenueCents: 0,
      };
      stats.offersSent += 1;
      if (o.status === 'ACCEPTED') {
        stats.offersAccepted += 1;
      }
      repairerStats.set(o.repairerUserId, stats);
    }

    for (const c of currentCommandes) {
      if (!c.repairerUserId) continue;
      const stats = repairerStats.get(c.repairerUserId) ?? {
        offersSent: 0,
        offersAccepted: 0,
        totalRevenueCents: 0,
      };
      stats.totalRevenueCents += c.repairCents || 0;
      repairerStats.set(c.repairerUserId, stats);
    }

    // P24 « classement triable par CA »: the page sorts the rows it receives, so the rows must contain the
    // top 10 of EVERY sortable column, not only of the default one. The default ranking (offers sent) comes
    // first and keeps its ranks; the others are appended without duplicates (at most 40 rows, the page
    // shows 10 of them).
    type RepairerTally = { offersSent: number; offersAccepted: number; totalRevenueCents: number };
    const conversionOf = (s: RepairerTally) => (s.offersSent > 0 ? s.offersAccepted / s.offersSent : 0);
    const rankings: Array<(a: RepairerTally, b: RepairerTally) => number> = [
      (a, b) => b.offersSent - a.offersSent || b.totalRevenueCents - a.totalRevenueCents,
      (a, b) => b.totalRevenueCents - a.totalRevenueCents || b.offersSent - a.offersSent,
      (a, b) => b.offersAccepted - a.offersAccepted || b.totalRevenueCents - a.totalRevenueCents,
      (a, b) => conversionOf(b) - conversionOf(a) || b.offersSent - a.offersSent,
    ];
    const sortedRepairerIds = [
      ...new Set(
        rankings.flatMap((cmp) =>
          Array.from(repairerStats.entries())
            .sort((a, b) => cmp(a[1], b[1]))
            .slice(0, 10)
            .map(([id]) => id),
        ),
      ),
    ];

    const activeRepairerIds = Array.from(
      new Set(currentOffers.map((o: any) => o.repairerUserId).filter(Boolean)),
    );

    const repairerIdsToFetch = Array.from(
      new Set([...sortedRepairerIds, ...activeRepairerIds]),
    );

    let repairerUserMap = new Map<string, any>();
    if (repairerIdsToFetch.length > 0) {
      const repairerUsers = await this.prisma.user.findMany({
        where: { id: { in: repairerIdsToFetch } },
        include: {
          profile: true,
          repairerProfile: true,
          reviewsReceived: {
            where: { deletedAt: null },
            select: { rating: true },
          },
        },
      });

      repairerUserMap = new Map(repairerUsers.map((u: any) => [u.id, u]));
    }

    const deptActiveRepairersMap = new Map<string, Set<string>>();
    for (const o of currentOffers) {
      const repId = o.repairerUserId;
      if (!repId) continue;

      const u = repairerUserMap.get(repId);
      const postalCode =
        o.repairer?.repairerProfile?.postalCode ??
        (o as any).repairerProfile?.postalCode ??
        (o as any).postalCode ??
        u?.repairerProfile?.postalCode;

      if (postalCode) {
        const deptCode = getDepartmentInfo(postalCode).code;
        let repSet = deptActiveRepairersMap.get(deptCode);
        if (!repSet) {
          repSet = new Set<string>();
          deptActiveRepairersMap.set(deptCode, repSet);
        }
        repSet.add(repId);
      }
    }

    // Indicator 2: geoDistribution
    const deptMap = new Map<string, { code: string; name: string; count: number }>();
    for (const d of currentDemandes) {
      const info = getDepartmentInfo(d.postalCode);
      const entry = deptMap.get(info.code) ?? { code: info.code, name: info.name, count: 0 };
      entry.count += 1;
      deptMap.set(info.code, entry);
    }

    for (const deptCode of deptActiveRepairersMap.keys()) {
      if (!deptMap.has(deptCode)) {
        const info = getDepartmentInfo(deptCode);
        deptMap.set(deptCode, { code: info.code, name: info.name, count: 0 });
      }
    }

    const totalDemandesCount = currentDemandes.length;
    const geoDistribution = Array.from(deptMap.values())
      .map((dept) => ({
        departmentCode: dept.code,
        departmentName: dept.name,
        demandesCount: dept.count,
        activeRepairersCount: deptActiveRepairersMap.get(dept.code)?.size ?? 0,
        percentage:
          totalDemandesCount > 0 ? Math.round((dept.count / totalDemandesCount) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.demandesCount - a.demandesCount)
      .slice(0, 15);

    // Indicator 3: responseTime
    const delays: number[] = [];
    let within1HourCount = 0;
    let within24HoursCount = 0;
    let over24HoursCount = 0;
    let noOfferCount = 0;

    for (const d of currentDemandes) {
      const earliest = d.offers?.[0];
      if (earliest) {
        const delay = Math.max(
          0,
          Math.round(
            (new Date(earliest.createdAt).getTime() - new Date(d.createdAt).getTime()) / 60000,
          ),
        );
        delays.push(delay);

        if (delay < 60) {
          within1HourCount++;
        } else if (delay <= 1440) {
          within24HoursCount++;
        } else {
          over24HoursCount++;
        }
      } else {
        noOfferCount++;
      }
    }

    delays.sort((a, b) => a - b);
    const averageMinutes =
      delays.length > 0 ? Math.round(delays.reduce((s, v) => s + v, 0) / delays.length) : 0;

    let medianMinutes = 0;
    if (delays.length > 0) {
      const mid = Math.floor(delays.length / 2);
      const val = delays[mid] ?? 0;
      const prev = delays[mid - 1] ?? 0;
      medianMinutes = delays.length % 2 !== 0 ? val : Math.round((prev + val) / 2);
    }

    const responseTime = {
      averageMinutes,
      medianMinutes,
      within1HourCount,
      within24HoursCount,
      over24HoursCount,
      noOfferCount,
    };

    // Indicator 4: offerAcceptance
    const totalOffers = currentOffers.length;
    let acceptedOffers = 0;
    let rejectedOffers = 0;
    let pendingOffers = 0;

    for (const o of currentOffers) {
      if (o.status === 'ACCEPTED') acceptedOffers++;
      else if (o.status === 'REJECTED') rejectedOffers++;
      else if (o.status === 'SENT') pendingOffers++;
    }

    const acceptanceRate =
      totalOffers > 0 ? Math.round((acceptedOffers / totalOffers) * 1000) / 10 : 0;

    const offerAcceptance = {
      totalOffers,
      acceptedOffers,
      rejectedOffers,
      pendingOffers,
      acceptanceRate,
    };

    // Indicator 5: popularCategories
    const popularCategoriesMap = new Map<
      string,
      {
        categoryId: string;
        categoryName: string;
        demandesCount: number;
        offersCount: number;
        acceptedDemandesCount: number;
      }
    >();

    for (const d of currentDemandes) {
      const catId = d.categoryId;
      const catName = d.category?.labelFr ?? 'Autre';
      const entry = popularCategoriesMap.get(catId) ?? {
        categoryId: catId,
        categoryName: catName,
        demandesCount: 0,
        offersCount: 0,
        acceptedDemandesCount: 0,
      };
      entry.demandesCount += 1;
      const offerCount = d.offers ? d.offers.length : 0;
      entry.offersCount += offerCount;
      const hasAccepted = d.offers ? d.offers.some((o: any) => o.status === 'ACCEPTED') : false;
      if (hasAccepted) {
        entry.acceptedDemandesCount += 1;
      }
      popularCategoriesMap.set(catId, entry);
    }

    const popularCategories = Array.from(popularCategoriesMap.values())
      .map((entry) => ({
        categoryId: entry.categoryId,
        categoryName: entry.categoryName,
        demandesCount: entry.demandesCount,
        offersCount: entry.offersCount,
        conversionRate:
          entry.demandesCount > 0
            ? Math.round((entry.acceptedDemandesCount / entry.demandesCount) * 1000) / 10
            : 0,
      }))
      .sort((a, b) => b.demandesCount - a.demandesCount);

    // Indicator 6: topRepairers
    // An account `image` is already a URL (a Google photo); only a stored avatar path needs signing.
    const signedAvatars = await this.signAvatarPaths(
      sortedRepairerIds.flatMap((repId) => {
        const user: any = repairerUserMap.get(repId);
        const path: string | null | undefined = user?.profile?.avatarPath;
        return !user?.image && path ? [path] : [];
      }),
    );
    const topRepairers: AdminStatsOverviewDto['topRepairers'] = sortedRepairerIds.map((repId) => {
      const stats = repairerStats.get(repId)!;
      const u: any = repairerUserMap.get(repId);
      const rp = u?.repairerProfile;
      const reviews = u?.reviewsReceived ?? [];
      const rating =
        reviews.length > 0
          ? Math.round(
              (reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length) * 10,
            ) / 10
          : null;

      const businessName = rp?.displayName ?? null;
      const avatarPath: string | null | undefined = u?.profile?.avatarPath;
      const avatarUrl = u?.image ?? (avatarPath ? (signedAvatars.get(avatarPath) ?? null) : null);
      const city =
        rp?.serviceAreaLabel ??
        (rp?.postalCode ? getDepartmentInfo(rp.postalCode).name : null);
      const repAcceptanceRate =
        stats.offersSent > 0 ? Math.round((stats.offersAccepted / stats.offersSent) * 1000) / 10 : 0;

      return {
        repairerId: repId,
        name: u?.name ?? 'Réparateur',
        businessName,
        avatarUrl,
        city,
        offersSent: stats.offersSent,
        offersAccepted: stats.offersAccepted,
        acceptanceRate: repAcceptanceRate,
        totalRevenueCents: stats.totalRevenueCents,
        rating,
        reviewsCount: reviews.length,
      };
    });

    // Indicators 7, 8, 9 & Activity: Timeseries Buckets
    const buckets = this.generateBuckets(period, startDate, endDate);

    const timeseriesRegistrations = buckets.map((bucket) => {
      const usersInBucket = currentUsers.filter((u: any) => {
        const t = new Date(u.createdAt).getTime();
        return t >= bucket.start.getTime() && t < bucket.end.getTime();
      });

      let clients = 0;
      let repairers = 0;
      for (const u of usersInBucket) {
        if (u.repairerProfile && u.repairerProfile.deletedAt === null) {
          repairers++;
        } else {
          clients++;
        }
      }

      return {
        date: bucket.date,
        label: bucket.label,
        clients,
        repairers,
        total: clients + repairers,
      };
    });

    const timeseriesFinancials = buckets.map((bucket) => {
      const ordersInBucket = currentCommandes.filter((c: any) => {
        const orderDate = c.paidAt ?? c.createdAt;
        const t = new Date(orderDate).getTime();
        return t >= bucket.start.getTime() && t < bucket.end.getTime();
      });

      const gmvCents = ordersInBucket.reduce((s: number, c: any) => s + (c.totalCents || 0), 0);
      const commissionCents = ordersInBucket.reduce(
        (s: number, c: any) => s + (c.protectionCents || 0),
        0,
      );

      return {
        date: bucket.date,
        label: bucket.label,
        gmvCents,
        commissionCents,
        ordersCount: ordersInBucket.length,
      };
    });

    const timeseriesActivity = buckets.map((bucket) => {
      const demandesInBucket = currentDemandes.filter((d: any) => {
        const t = new Date(d.createdAt).getTime();
        return t >= bucket.start.getTime() && t < bucket.end.getTime();
      });

      const offersInBucket = currentOffers.filter((o: any) => {
        const t = new Date(o.createdAt).getTime();
        return t >= bucket.start.getTime() && t < bucket.end.getTime();
      });

      return {
        date: bucket.date,
        label: bucket.label,
        demandes: demandesInBucket.length,
        offers: offersInBucket.length,
      };
    });

    // 5-Stage Conversion Funnel
    const stage1Count = currentDemandes.length;
    let stage2Count = 0; // with_offer
    let stage3Count = 0; // accepted
    let stage4Count = 0; // paid
    let stage5Count = 0; // completed

    for (const d of currentDemandes) {
      // Strictly nested: a stage counts only a demande that went through the one before, so the
      // funnel cannot widen on legacy data (an order paid without an accepted offer).
      const hasOffer = d.offers.length > 0;
      const hasAccepted = d.offers.some((o) => o.status === 'ACCEPTED');
      // The commandes are already limited to paid or refunded real ones by the query.
      const hasPaid = hasAccepted && d.commandes.length > 0;
      // « Réparation finalisée » = the funds were released (the client validated or the delay ran
      // out), not merely that the device came back.
      const hasCompleted = hasPaid && d.commandes.some((c) => c.releasedAt != null || c.step === 'RELEASED');

      if (hasOffer) stage2Count++;
      if (hasAccepted) stage3Count++;
      if (hasPaid) stage4Count++;
      if (hasCompleted) stage5Count++;
    }

    const calcPctOfTotal = (count: number) =>
      stage1Count > 0 ? Math.round((count / stage1Count) * 1000) / 10 : 0;

    const calcStepConv = (count: number, prev: number) =>
      prev > 0 ? Math.round((count / prev) * 1000) / 10 : 0;

    const calcDropOff = (count: number, prev: number) =>
      prev > 0 ? Math.max(0, Math.round(((prev - count) / prev) * 1000) / 10) : 0;

    const conversionFunnel: AdminConversionFunnelDto = {
      stages: [
        {
          id: 'demandes',
          label: 'Demandes publiées',
          count: stage1Count,
          percentageOfTotal: stage1Count > 0 ? 100 : 0,
          stepConversionRate: 100,
          dropOffRate: 0,
        },
        {
          id: 'with_offer',
          label: 'Avec offre',
          count: stage2Count,
          percentageOfTotal: calcPctOfTotal(stage2Count),
          stepConversionRate: calcStepConv(stage2Count, stage1Count),
          dropOffRate: calcDropOff(stage2Count, stage1Count),
        },
        {
          id: 'accepted',
          label: 'Offre acceptée',
          count: stage3Count,
          percentageOfTotal: calcPctOfTotal(stage3Count),
          stepConversionRate: calcStepConv(stage3Count, stage2Count),
          dropOffRate: calcDropOff(stage3Count, stage2Count),
        },
        {
          id: 'paid',
          label: 'Paiement effectué',
          count: stage4Count,
          percentageOfTotal: calcPctOfTotal(stage4Count),
          stepConversionRate: calcStepConv(stage4Count, stage3Count),
          dropOffRate: calcDropOff(stage4Count, stage3Count),
        },
        {
          id: 'completed',
          label: 'Réparation finalisée',
          count: stage5Count,
          percentageOfTotal: calcPctOfTotal(stage5Count),
          stepConversionRate: calcStepConv(stage5Count, stage4Count),
          dropOffRate: calcDropOff(stage5Count, stage4Count),
        },
      ],
      overallConversionRate:
        stage1Count > 0 ? Math.round((stage5Count / stage1Count) * 1000) / 10 : 0,
    };

    // Overall KPIs
    const totalDemandesCurrent = currentDemandes.length;
    const acceptanceRateCurrent = offerAcceptance.acceptanceRate;
    const avgResponseTimeCurrent = responseTime.averageMinutes;
    const totalGmvCurrent = currentCommandes.reduce((s: number, c: any) => s + (c.totalCents || 0), 0);
    const totalCommissionsCurrent = currentCommandes.reduce(
      (s: number, c: any) => s + (c.protectionCents || 0),
      0,
    );
    const totalRegistrationsCurrent = currentUsers.length;

    const paidCommandesCountCurrent = currentCommandes.length;
    const averageBasketCurrent =
      paidCommandesCountCurrent > 0 ? Math.round(totalGmvCurrent / paidCommandesCountCurrent) : 0;
    const actualCommissionRateCurrent =
      totalGmvCurrent > 0 ? Math.round((totalCommissionsCurrent / totalGmvCurrent) * 1000) / 10 : 0;

    const disputesCountCurrent = currentCommandes.filter(
      (c: any) => c.dispute != null || c.disputedAt != null,
    ).length;
    const disputeRateCurrent =
      paidCommandesCountCurrent > 0
        ? Math.round((disputesCountCurrent / paidCommandesCountCurrent) * 1000) / 10
        : 0;

    const refundedCountCurrent = currentCommandes.filter(
      (c: any) =>
        c.status === 'REFUNDED' ||
        (Array.isArray(c.refunds) && c.refunds.length > 0) ||
        c.refundedAt != null ||
        (typeof c.refundedCents === 'number' && c.refundedCents > 0),
    ).length;
    const refundRateCurrent =
      paidCommandesCountCurrent > 0
        ? Math.round((refundedCountCurrent / paidCommandesCountCurrent) * 1000) / 10
        : 0;

    const kpis = {
      totalDemandes: {
        value: totalDemandesCurrent,
        changePct: calcChangePct(totalDemandesCurrent, priorDemandesCount),
      },
      acceptanceRate: {
        value: acceptanceRateCurrent,
        changePct: calcChangePct(acceptanceRateCurrent, priorAcceptanceRate),
      },
      averageResponseTimeMinutes: {
        value: avgResponseTimeCurrent,
        changePct: calcChangePct(avgResponseTimeCurrent, priorAvgResponseTime),
      },
      totalGmvCents: {
        value: totalGmvCurrent,
        changePct: calcChangePct(totalGmvCurrent, priorGmvCents),
      },
      totalCommissionsCents: {
        value: totalCommissionsCurrent,
        changePct: calcChangePct(totalCommissionsCurrent, priorCommissionsCents),
      },
      totalRegistrations: {
        value: totalRegistrationsCurrent,
        changePct: calcChangePct(totalRegistrationsCurrent, priorRegistrationsCount),
      },
      averageBasketCents: {
        value: averageBasketCurrent,
        changePct: calcChangePct(averageBasketCurrent, priorAvgBasket),
      },
      actualCommissionRate: {
        value: actualCommissionRateCurrent,
        changePct: calcChangePct(actualCommissionRateCurrent, priorActualCommissionRate),
      },
      disputeRate: {
        value: disputeRateCurrent,
        changePct: calcChangePct(disputeRateCurrent, priorDisputeRate),
      },
      refundRate: {
        value: refundRateCurrent,
        changePct: calcChangePct(refundRateCurrent, priorRefundRate),
      },
    };

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      comparisonPeriod,
      kpis,
      conversionFunnel,
      repairsByCategory,
      popularCategories,
      geoDistribution,
      responseTime,
      offerAcceptance,
      topRepairers,
      timeseries: {
        registrations: timeseriesRegistrations,
        financials: timeseriesFinancials,
        activity: timeseriesActivity,
      },
    };
  }

  /**
   * The day « Tout » opens on. It reads the SAME real platform as every figure below it (PRE-3): a
   * fixture or demo account created before launch must not pull the start back to a day with no
   * real data. A category has no user, so the user lookup is skipped when one is chosen.
   */
  private async getEarliestActivityDate(categoryId?: string): Promise<Date> {
    const demandeWhere: Prisma.DemandeWhereInput = { deletedAt: null, author: GENUINE_USER_WHERE };
    const commandeWhere: Prisma.CommandeWhereInput = { ...GENUINE_COLLECTED_COMMANDE_WHERE };
    if (categoryId) {
      demandeWhere.categoryId = categoryId;
      commandeWhere.demande = { categoryId };
    }

    const [firstUser, firstDemande, firstCommande] = await Promise.all([
      categoryId
        ? Promise.resolve(null)
        : this.prisma.user.findFirst({
            where: GENUINE_USER_WHERE,
            orderBy: { createdAt: 'asc' },
            select: { createdAt: true },
          }),
      this.prisma.demande.findFirst({
        where: demandeWhere,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      this.prisma.commande.findFirst({
        where: commandeWhere,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
    ]);

    const candidates: number[] = [];
    if (firstUser?.createdAt) candidates.push(new Date(firstUser.createdAt).getTime());
    if (firstDemande?.createdAt) candidates.push(new Date(firstDemande.createdAt).getTime());
    if (firstCommande?.createdAt) candidates.push(new Date(firstCommande.createdAt).getTime());

    if (candidates.length === 0) {
      // Platform launch baseline: 2026-01-01T00:00:00.000Z
      return new Date('2026-01-01T00:00:00.000Z');
    }

    const minTs = Math.min(...candidates);
    const minDate = new Date(minTs);
    // Start of the day in UTC so no activity on that date is excluded
    return new Date(Date.UTC(minDate.getUTCFullYear(), minDate.getUTCMonth(), minDate.getUTCDate(), 0, 0, 0, 0));
  }

  private async computeStartDate(
    period: AdminStatsPeriod,
    endDate: Date,
    categoryId?: string,
  ): Promise<Date> {
    switch (period) {
      case '7d':
        return new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '12m':
        return new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      case 'all':
        return this.getEarliestActivityDate(categoryId);
      case 'custom':
        return new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      default:
        return new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  private generateBuckets(period: AdminStatsPeriod, startDate: Date, endDate: Date): BucketDef[] {
    const buckets: BucketDef[] = [];
    const dayMs = 24 * 60 * 60 * 1000;

    if (period === '7d' || period === '30d') {
      const numDays = period === '7d' ? 7 : 30;
      for (let i = 0; i < numDays; i++) {
        const bStart = new Date(startDate.getTime() + i * dayMs);
        const bEnd =
          i === numDays - 1
            ? new Date(endDate.getTime() + 1000)
            : new Date(startDate.getTime() + (i + 1) * dayMs);
        const dateStr = bStart.toISOString().slice(0, 10);
        const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
          bStart,
        );
        buckets.push({
          start: bStart,
          end: bEnd,
          date: dateStr,
          label,
        });
      }
    } else if (period === '90d') {
      // 90 days in 7-day chunks (~13 chunks)
      let cursor = new Date(startDate.getTime());
      while (cursor.getTime() < endDate.getTime()) {
        const next = new Date(Math.min(cursor.getTime() + 7 * dayMs, endDate.getTime()));
        const dateStr = cursor.toISOString().slice(0, 10);
        const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
          cursor,
        );
        buckets.push({
          start: cursor,
          end: next.getTime() >= endDate.getTime() ? new Date(endDate.getTime() + 1000) : next,
          date: dateStr,
          label,
        });
        cursor = next;
      }
    } else if (period === 'custom') {
      const spanDays = Math.ceil((endDate.getTime() - startDate.getTime()) / dayMs);
      if (spanDays <= 31) {
        // Daily buckets
        let cursor = new Date(startDate.getTime());
        while (cursor.getTime() < endDate.getTime()) {
          const next = new Date(Math.min(cursor.getTime() + dayMs, endDate.getTime()));
          const dateStr = cursor.toISOString().slice(0, 10);
          const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
            cursor,
          );
          buckets.push({
            start: cursor,
            end: next.getTime() >= endDate.getTime() ? new Date(endDate.getTime() + 1000) : next,
            date: dateStr,
            label,
          });
          cursor = next;
        }
      } else if (spanDays <= 90) {
        // Weekly buckets (7-day chunks)
        let cursor = new Date(startDate.getTime());
        while (cursor.getTime() < endDate.getTime()) {
          const next = new Date(Math.min(cursor.getTime() + 7 * dayMs, endDate.getTime()));
          const dateStr = cursor.toISOString().slice(0, 10);
          const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
            cursor,
          );
          buckets.push({
            start: cursor,
            end: next.getTime() >= endDate.getTime() ? new Date(endDate.getTime() + 1000) : next,
            date: dateStr,
            label,
          });
          cursor = next;
        }
      } else {
        // Monthly buckets
        const startMonth = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
        let cursor = new Date(startMonth);
        while (cursor.getTime() <= endDate.getTime()) {
          const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
          const dateStr = cursor.toISOString().slice(0, 10);
          const label = new Intl.DateTimeFormat('fr-FR', {
            timeZone: 'UTC',
            month: 'short',
            year: 'numeric',
          }).format(cursor);
          buckets.push({
            start: cursor,
            end: next.getTime() > endDate.getTime() ? new Date(endDate.getTime() + 1000) : next,
            date: dateStr,
            label,
          });
          cursor = next;
        }
      }
      if (buckets.length === 0) {
        const dateStr = startDate.toISOString().slice(0, 10);
        const label = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(
          startDate,
        );
        buckets.push({
          start: startDate,
          end: new Date(endDate.getTime() + 1000),
          date: dateStr,
          label,
        });
      }
    } else {
      // '12m' or 'all': monthly buckets
      const startMonth = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
      const endMonth = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), 1));
      const start =
        period === 'all'
          ? (startMonth.getTime() <= endMonth.getTime() ? startMonth : endMonth)
          : new Date(Date.UTC(endDate.getUTCFullYear() - 1, endDate.getUTCMonth() + 1, 1));

      let cursor = new Date(start);
      while (cursor.getTime() <= endDate.getTime()) {
        const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
        const dateStr = cursor.toISOString().slice(0, 10);
        const label = new Intl.DateTimeFormat('fr-FR', {
          timeZone: 'UTC',
          month: 'short',
          year: 'numeric',
        }).format(cursor);
        buckets.push({
          start: cursor,
          end: next.getTime() > endDate.getTime() ? new Date(endDate.getTime() + 1000) : next,
          date: dateStr,
          label,
        });
        cursor = next;
      }
    }

    return buckets;
  }
}
