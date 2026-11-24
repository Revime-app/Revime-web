import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminPromoService } from '../src/admin/admin-promos.service.js';
import { AdminPromosController } from '../src/admin/admin-promos.controller.js';
import { PERMISSION_KEY } from '../src/admin/require-permission.decorator.js';
import { ADMIN_AUDIT_ACTIONS, type PromoCodeCreateInput } from '@revime/shared';
import { AUDIT_KEY } from '../src/admin/admin-audit.decorator.js';

describe('AdminPromoService & AdminPromosController', () => {
  let service: AdminPromoService;
  let controller: AdminPromosController;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      promoCode: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      promoUsage: {
        aggregate: vi.fn(),
      },
      referralReward: {
        count: vi.fn(),
      },
    };

    service = new AdminPromoService(mockPrisma as any);
    controller = new AdminPromosController(service);
  });

  describe('AdminPromoService.createPromo', () => {
    it('successfully creates a fixed amount promo code and normalizes code to uppercase', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(null);
      const now = new Date('2026-10-16T10:00:00Z');
      const mockCreated = {
        id: 'promo-1',
        code: 'BIENVENUE10',
        description: 'Réduction de 10€',
        type: 'FIXED_AMOUNT',
        valueCents: 1000,
        maxDiscountCents: null,
        minOrderCents: 5000,
        startsAt: now,
        expiresAt: null,
        maxUsesTotal: 100,
        maxUsesPerUser: 1,
        firstOrderOnly: true,
        status: 'ACTIVE',
        isReferral: false,
        referrerId: null,
        referrer: null,
        usages: [],
        createdAt: now,
        updatedAt: now,
      };
      mockPrisma.promoCode.create.mockResolvedValue(mockCreated);

      const input: PromoCodeCreateInput = {
        code: 'bienvenue10',
        description: 'Réduction de 10€',
        type: 'FIXED_AMOUNT',
        valueCents: 1000,
        minOrderCents: 5000,
        maxUsesTotal: 100,
        maxUsesPerUser: 1,
        firstOrderOnly: true,
      };

      const result = await service.createPromo(input);

      expect(mockPrisma.promoCode.findUnique).toHaveBeenCalledWith({
        where: { code: 'BIENVENUE10' },
      });
      expect(mockPrisma.promoCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          code: 'BIENVENUE10',
          type: 'FIXED_AMOUNT',
          valueCents: 1000,
          minOrderCents: 5000,
          maxUsesTotal: 100,
          firstOrderOnly: true,
          status: 'ACTIVE',
        }),
        include: {
          referrer: { select: { id: true, name: true, email: true } },
          usages: { select: { discountCents: true } },
        },
      });
      expect(result.code).toBe('BIENVENUE10');
      expect(result.currentUsesCount).toBe(0);
      expect(result.totalDiscountDisbursedCents).toBe(0);
    });

    it('successfully creates a percentage promo code with max discount', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(null);
      const now = new Date('2026-10-16T10:00:00Z');
      const expires = new Date('2026-12-31T23:59:59Z');
      const mockCreated = {
        id: 'promo-2',
        code: 'SUMMER20',
        description: '20% off',
        type: 'PERCENTAGE',
        valueCents: 20, // 20%
        maxDiscountCents: 3000,
        minOrderCents: 0,
        startsAt: now,
        expiresAt: expires,
        maxUsesTotal: null,
        maxUsesPerUser: 2,
        firstOrderOnly: false,
        status: 'ACTIVE',
        isReferral: false,
        referrerId: null,
        referrer: null,
        usages: [],
        createdAt: now,
        updatedAt: now,
      };
      mockPrisma.promoCode.create.mockResolvedValue(mockCreated);

      const input: PromoCodeCreateInput = {
        code: 'SUMMER20',
        description: '20% off',
        type: 'PERCENTAGE',
        valueCents: 20,
        maxDiscountCents: 3000,
        minOrderCents: 0,
        expiresAt: expires.toISOString(),
        maxUsesPerUser: 2,
        firstOrderOnly: false,
      };

      const result = await service.createPromo(input);

      expect(result.code).toBe('SUMMER20');
      expect(result.type).toBe('PERCENTAGE');
      expect(result.valueCents).toBe(20);
      expect(result.maxDiscountCents).toBe(3000);
      expect(result.expiresAt).toBe(expires.toISOString());
    });

    it('rejects duplicate promo codes with clear French error message', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue({
        id: 'existing-promo',
        code: 'PROMO10',
      });

      const input: PromoCodeCreateInput = {
        code: 'PROMO10',
        type: 'FIXED_AMOUNT',
        valueCents: 1000,
        minOrderCents: 0,
        maxUsesPerUser: 1,
        firstOrderOnly: false,
      };

      await expect(service.createPromo(input)).rejects.toThrow(
        new BadRequestException('Un code promotionnel avec ce code existe déjà.'),
      );
      expect(mockPrisma.promoCode.create).not.toHaveBeenCalled();
    });
  });

  describe('AdminPromoService.updateStatus', () => {
    it('pauses an existing active promo code and logs audit', async () => {
      const now = new Date('2026-10-16T10:00:00Z');
      mockPrisma.promoCode.findUnique.mockResolvedValue({
        id: 'promo-1',
        status: 'ACTIVE',
      });
      mockPrisma.promoCode.update.mockResolvedValue({
        id: 'promo-1',
        code: 'PROMO10',
        description: null,
        type: 'FIXED_AMOUNT',
        valueCents: 1000,
        maxDiscountCents: null,
        minOrderCents: 0,
        startsAt: now,
        expiresAt: null,
        maxUsesTotal: null,
        maxUsesPerUser: 1,
        firstOrderOnly: false,
        status: 'PAUSED',
        isReferral: false,
        referrer: null,
        usages: [{ discountCents: 1000 }],
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.updateStatus('promo-1', 'PAUSED');

      expect(mockPrisma.promoCode.update).toHaveBeenCalledWith({
        where: { id: 'promo-1' },
        data: { status: 'PAUSED' },
        include: {
          referrer: { select: { id: true, name: true, email: true } },
          usages: { select: { discountCents: true } },
        },
      });
      expect(result.status).toBe('PAUSED');
      expect(result.currentUsesCount).toBe(1);
      expect(result.totalDiscountDisbursedCents).toBe(1000);
    });

    it('resumes a paused promo code back to ACTIVE', async () => {
      const now = new Date('2026-10-16T10:00:00Z');
      mockPrisma.promoCode.findUnique.mockResolvedValue({
        id: 'promo-1',
        status: 'PAUSED',
      });
      mockPrisma.promoCode.update.mockResolvedValue({
        id: 'promo-1',
        code: 'PROMO10',
        description: null,
        type: 'FIXED_AMOUNT',
        valueCents: 1000,
        maxDiscountCents: null,
        minOrderCents: 0,
        startsAt: now,
        expiresAt: null,
        maxUsesTotal: null,
        maxUsesPerUser: 1,
        firstOrderOnly: false,
        status: 'ACTIVE',
        isReferral: false,
        referrer: null,
        usages: [],
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.updateStatus('promo-1', 'ACTIVE');
      expect(result.status).toBe('ACTIVE');
    });

    it('throws NotFoundException if promo does not exist', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('unknown-id', 'PAUSED'),
      ).rejects.toThrow(new NotFoundException('Code promotionnel introuvable.'));

      expect(mockPrisma.promoCode.update).not.toHaveBeenCalled();
    });
  });

  describe('AdminPromoService.getPromoDetail', () => {
    it('returns detailed promo information mapped to contract', async () => {
      const now = new Date('2026-10-16T10:00:00Z');
      mockPrisma.promoCode.findUnique.mockResolvedValue({
        id: 'promo-detail-1',
        code: 'PARRAIN-ALICE',
        description: 'Code parrainage',
        type: 'FIXED_AMOUNT',
        valueCents: 1500,
        maxDiscountCents: null,
        minOrderCents: 3000,
        startsAt: now,
        expiresAt: null,
        maxUsesTotal: 10,
        maxUsesPerUser: 1,
        firstOrderOnly: true,
        status: 'ACTIVE',
        isReferral: true,
        referrer: { id: 'ref-1', name: 'Alice Dupont', email: 'alice@example.com' },
        usages: [{ discountCents: 1500 }, { discountCents: 1500 }],
        createdAt: now,
        updatedAt: now,
      });

      const result = await service.getPromoDetail('promo-detail-1');

      expect(mockPrisma.promoCode.findUnique).toHaveBeenCalledWith({
        where: { id: 'promo-detail-1' },
        include: {
          referrer: { select: { id: true, name: true, email: true } },
          usages: { select: { discountCents: true } },
        },
      });
      expect(result.id).toBe('promo-detail-1');
      expect(result.isReferral).toBe(true);
      expect(result.referrerName).toBe('Alice Dupont');
      expect(result.currentUsesCount).toBe(2);
      expect(result.totalDiscountDisbursedCents).toBe(3000);
    });

    it('throws NotFoundException if promo not found', async () => {
      mockPrisma.promoCode.findUnique.mockResolvedValue(null);

      await expect(service.getPromoDetail('missing-id')).rejects.toThrow(
        new NotFoundException('Code promotionnel introuvable.'),
      );
    });
  });

  describe('AdminPromoService.listPromos', () => {
    it('returns paginated promo list with aggregate usage and total', async () => {
      const now = new Date('2026-10-16T10:00:00Z');
      mockPrisma.promoCode.findMany.mockResolvedValue([
        {
          id: 'p1',
          code: 'PROMO1',
          description: 'Promo one',
          type: 'FIXED_AMOUNT',
          valueCents: 1000,
          maxDiscountCents: null,
          minOrderCents: 0,
          startsAt: now,
          expiresAt: null,
          maxUsesTotal: null,
          maxUsesPerUser: 1,
          firstOrderOnly: false,
          status: 'ACTIVE',
          isReferral: false,
          referrer: null,
          usages: [{ discountCents: 1000 }, { discountCents: 1000 }],
          createdAt: now,
          updatedAt: now,
        },
      ]);
      mockPrisma.promoCode.count.mockResolvedValue(1);

      const result = await service.listPromos({
        page: 1,
        limit: 10,
        search: 'PROMO',
        status: 'ACTIVE',
      });

      expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          OR: [
            { code: { contains: 'PROMO', mode: 'insensitive' } },
            { description: { contains: 'PROMO', mode: 'insensitive' } },
          ],
        },
        skip: 0,
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          referrer: { select: { id: true, name: true, email: true } },
          usages: { select: { discountCents: true } },
        },
      });
      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]!.currentUsesCount).toBe(2);
      expect(result.items[0]!.totalDiscountDisbursedCents).toBe(2000);
    });

    it('filters by isReferral when provided', async () => {
      mockPrisma.promoCode.findMany.mockResolvedValue([]);
      mockPrisma.promoCode.count.mockResolvedValue(0);

      await service.listPromos({ isReferral: true });

      expect(mockPrisma.promoCode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isReferral: true },
        }),
      );
    });
  });

  describe('AdminPromoService.getMarketingKpis', () => {
    it('computes aggregated marketing KPIs correctly', async () => {
      mockPrisma.promoUsage.aggregate.mockResolvedValue({
        _sum: { discountCents: 45000 },
        _count: { id: 32 },
      });
      mockPrisma.promoCode.count.mockResolvedValue(8);
      mockPrisma.referralReward.count.mockResolvedValue(15);

      const kpis = await service.getMarketingKpis();

      expect(mockPrisma.promoUsage.aggregate).toHaveBeenCalledWith({
        _sum: { discountCents: true },
        _count: { id: true },
      });
      expect(mockPrisma.promoCode.count).toHaveBeenCalledWith({
        where: { status: 'ACTIVE' },
      });
      expect(mockPrisma.referralReward.count).toHaveBeenCalledWith({
        where: { status: 'REWARDED' },
      });

      expect(kpis).toEqual({
        totalDiscountDisbursedCents: 45000,
        activeCodesCount: 8,
        totalOrdersWithPromoCount: 32,
        totalReferralConversionsCount: 15,
      });
    });

    it('defaults null/undefined aggregations to zero', async () => {
      mockPrisma.promoUsage.aggregate.mockResolvedValue({
        _sum: { discountCents: null },
        _count: { id: 0 },
      });
      mockPrisma.promoCode.count.mockResolvedValue(0);
      mockPrisma.referralReward.count.mockResolvedValue(0);

      const kpis = await service.getMarketingKpis();

      expect(kpis).toEqual({
        totalDiscountDisbursedCents: 0,
        activeCodesCount: 0,
        totalOrdersWithPromoCount: 0,
        totalReferralConversionsCount: 0,
      });
    });
  });

  describe('AdminPromosController', () => {
    it('delegates listPromos to service with parsed params', async () => {
      const spy = vi.spyOn(service, 'listPromos').mockResolvedValue({ items: [], total: 0 });

      const res = await controller.listPromos('PROMO', 'ACTIVE', 'true', '2', '15');

      expect(spy).toHaveBeenCalledWith({
        search: 'PROMO',
        status: 'ACTIVE',
        isReferral: true,
        page: 2,
        limit: 15,
      });
      expect(res).toEqual({ items: [], total: 0 });
    });

    it('delegates getMarketingKpis to service', async () => {
      const mockKpis = {
        totalDiscountDisbursedCents: 10000,
        activeCodesCount: 3,
        totalOrdersWithPromoCount: 5,
        totalReferralConversionsCount: 2,
      };
      vi.spyOn(service, 'getMarketingKpis').mockResolvedValue(mockKpis);

      const res = await controller.getMarketingKpis();
      expect(res).toEqual(mockKpis);
    });

    it('delegates getPromoDetail to service', async () => {
      const mockItem: any = { id: 'promo-123', code: 'TEST' };
      vi.spyOn(service, 'getPromoDetail').mockResolvedValue(mockItem);

      const res = await controller.getPromoDetail('promo-123');
      expect(res).toEqual(mockItem);
    });

    it('delegates createPromo to the service', async () => {
      const mockItem: any = { id: 'promo-123', code: 'TEST' };
      const spy = vi.spyOn(service, 'createPromo').mockResolvedValue(mockItem);
      const input: any = { code: 'TEST', type: 'FIXED_AMOUNT', valueCents: 500 };

      const res = await controller.createPromo(input);
      expect(spy).toHaveBeenCalledWith(input);
      expect(res).toEqual(mockItem);
    });

    it('delegates updateStatus to the service', async () => {
      const mockItem: any = { id: 'promo-123', status: 'PAUSED' };
      const spy = vi.spyOn(service, 'updateStatus').mockResolvedValue(mockItem);

      const res = await controller.updateStatus('promo-123', { status: 'PAUSED' });
      expect(spy).toHaveBeenCalledWith('promo-123', 'PAUSED');
      expect(res).toEqual(mockItem);
    });

    it('is audited by the interceptor, with the actions the journal knows (RU-24)', () => {
      expect(Reflect.getMetadata(AUDIT_KEY, controller.createPromo)).toMatchObject({
        action: 'promo.create',
        targetType: 'PromoCode',
      });
      expect(Reflect.getMetadata(AUDIT_KEY, controller.updateStatus)).toMatchObject({
        action: 'promo.update_status',
        targetParam: 'id',
      });
      expect(ADMIN_AUDIT_ACTIONS).toContain('promo.create');
      expect(ADMIN_AUDIT_ACTIONS).toContain('promo.update_status');
    });

    it('has RequirePermission decorators on all endpoints', () => {
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.listPromos)).toBe('dashboard.read');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.getMarketingKpis)).toBe('dashboard.read');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.getPromoDetail)).toBe('dashboard.read');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.createPromo)).toBe('users.moderate');
      expect(Reflect.getMetadata(PERMISSION_KEY, controller.updateStatus)).toBe('users.moderate');
    });
  });
});
