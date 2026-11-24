import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import type {
  AdminPromoKpis,
  AdminPromoListItem,
  AdminPromoListResponse,
  PromoCodeCreateInput,
  PromoStatus,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';

function mapToAdminPromoListItem(promo: any): AdminPromoListItem {
  const currentUsesCount = Array.isArray(promo.usages)
    ? promo.usages.length
    : (promo._count?.usages ?? 0);
  const totalDiscountDisbursedCents = Array.isArray(promo.usages)
    ? promo.usages.reduce((sum: number, u: any) => sum + (u.discountCents ?? 0), 0)
    : 0;
  const referrerName = promo.referrer
    ? promo.referrer.name || promo.referrer.email || null
    : null;

  return {
    id: promo.id,
    code: promo.code,
    description: promo.description ?? null,
    type: promo.type,
    valueCents: promo.valueCents,
    maxDiscountCents: promo.maxDiscountCents ?? null,
    minOrderCents: promo.minOrderCents ?? 0,
    startsAt:
      promo.startsAt instanceof Date
        ? promo.startsAt.toISOString()
        : String(promo.startsAt),
    expiresAt: promo.expiresAt
      ? promo.expiresAt instanceof Date
        ? promo.expiresAt.toISOString()
        : String(promo.expiresAt)
      : null,
    maxUsesTotal: promo.maxUsesTotal ?? null,
    maxUsesPerUser: promo.maxUsesPerUser ?? 1,
    currentUsesCount,
    totalDiscountDisbursedCents,
    firstOrderOnly: Boolean(promo.firstOrderOnly),
    status: promo.status,
    isReferral: Boolean(promo.isReferral),
    referrerName,
    createdAt:
      promo.createdAt instanceof Date
        ? promo.createdAt.toISOString()
        : String(promo.createdAt),
  };
}

@Injectable()
export class AdminPromoService {
  constructor(private readonly prisma: PrismaService) {}

  async listPromos(query?: {
    search?: string;
    status?: PromoStatus;
    isReferral?: boolean;
    page?: number;
    limit?: number;
  }): Promise<AdminPromoListResponse> {
    const page = Math.max(1, query?.page ?? 1);
    const limit = Math.max(1, Math.min(100, query?.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query?.status) {
      where.status = query.status;
    }
    if (query?.isReferral !== undefined) {
      where.isReferral = query.isReferral;
    }
    if (query?.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { code: { contains: s, mode: 'insensitive' } },
        { description: { contains: s, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.promoCode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          referrer: { select: { id: true, name: true, email: true } },
          usages: { select: { discountCents: true } },
        },
      }),
      this.prisma.promoCode.count({ where }),
    ]);

    return {
      items: items.map(mapToAdminPromoListItem),
      total,
    };
  }

  async getMarketingKpis(): Promise<AdminPromoKpis> {
    const [usagesAgg, activeCodesCount, referralConversionsCount] = await Promise.all([
      this.prisma.promoUsage.aggregate({
        _sum: { discountCents: true },
        _count: { id: true },
      }),
      this.prisma.promoCode.count({
        where: { status: 'ACTIVE' },
      }),
      this.prisma.referralReward
        .count({
          where: { status: 'REWARDED' },
        })
        .catch(() => 0),
    ]);

    return {
      totalDiscountDisbursedCents: usagesAgg._sum?.discountCents ?? 0,
      activeCodesCount: activeCodesCount ?? 0,
      totalOrdersWithPromoCount: usagesAgg._count?.id ?? 0,
      totalReferralConversionsCount: referralConversionsCount ?? 0,
    };
  }

  async getPromoDetail(id: string): Promise<AdminPromoListItem> {
    const promo = await this.prisma.promoCode.findUnique({
      where: { id },
      include: {
        referrer: { select: { id: true, name: true, email: true } },
        usages: { select: { discountCents: true } },
      },
    });

    if (!promo) {
      throw new NotFoundException('Code promotionnel introuvable.');
    }

    return mapToAdminPromoListItem(promo);
  }

  async createPromo(input: PromoCodeCreateInput): Promise<AdminPromoListItem> {
    const normalizedCode = input.code.trim().toUpperCase();

    const existing = await this.prisma.promoCode.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      throw new BadRequestException('Un code promotionnel avec ce code existe déjà.');
    }

    const created = await this.prisma.promoCode.create({
      data: {
        code: normalizedCode,
        description: input.description?.trim() || null,
        type: input.type,
        valueCents: input.valueCents,
        maxDiscountCents: input.maxDiscountCents ?? null,
        minOrderCents: input.minOrderCents ?? 0,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        maxUsesTotal: input.maxUsesTotal ?? null,
        maxUsesPerUser: input.maxUsesPerUser ?? 1,
        firstOrderOnly: input.firstOrderOnly ?? false,
        status: 'ACTIVE',
      },
      include: {
        referrer: { select: { id: true, name: true, email: true } },
        usages: { select: { discountCents: true } },
      },
    });

    return mapToAdminPromoListItem(created);
  }

  async updateStatus(id: string, status: PromoStatus): Promise<AdminPromoListItem> {
    const existing = await this.prisma.promoCode.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Code promotionnel introuvable.');
    }

    const updated = await this.prisma.promoCode.update({
      where: { id },
      data: { status },
      include: {
        referrer: { select: { id: true, name: true, email: true } },
        usages: { select: { discountCents: true } },
      },
    });

    return mapToAdminPromoListItem(updated);
  }
}
