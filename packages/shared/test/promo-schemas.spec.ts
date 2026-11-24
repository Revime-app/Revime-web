import { describe, it, expect } from 'vitest';
import {
  promoTypeSchema,
  promoStatusSchema,
  referralRewardStatusSchema,
  promoCodeCreateSchema,
  promoCodeUpdateStatusSchema,
  promoCodeValidationInputSchema,
  promoValidationResultSchema,
  adminPromoListItemSchema,
  adminPromoListResponseSchema,
  adminPromoKpisSchema,
} from '../src/promo.schemas.js';

describe('Promo & Referral Schemas (@revime/shared)', () => {
  describe('enums', () => {
    it('validates promoTypeSchema values', () => {
      expect(promoTypeSchema.parse('FIXED_AMOUNT')).toBe('FIXED_AMOUNT');
      expect(promoTypeSchema.parse('PERCENTAGE')).toBe('PERCENTAGE');
      expect(() => promoTypeSchema.parse('OTHER')).toThrow();
    });

    it('validates promoStatusSchema values', () => {
      expect(promoStatusSchema.parse('ACTIVE')).toBe('ACTIVE');
      expect(promoStatusSchema.parse('PAUSED')).toBe('PAUSED');
      expect(promoStatusSchema.parse('EXPIRED')).toBe('EXPIRED');
      expect(promoStatusSchema.parse('EXHAUSTED')).toBe('EXHAUSTED');
      expect(() => promoStatusSchema.parse('UNKNOWN')).toThrow();
    });

    it('validates referralRewardStatusSchema values', () => {
      expect(referralRewardStatusSchema.parse('PENDING_COMPLETION')).toBe('PENDING_COMPLETION');
      expect(referralRewardStatusSchema.parse('REWARDED')).toBe('REWARDED');
      expect(referralRewardStatusSchema.parse('REVOKED')).toBe('REVOKED');
      expect(() => referralRewardStatusSchema.parse('OTHER')).toThrow();
    });
  });

  describe('promoCodeCreateSchema', () => {
    it('validates a valid fixed amount promo code and converts code to uppercase', () => {
      const input = {
        code: 'bienvenue10',
        description: '10€ offerts sur le premier achat',
        type: 'FIXED_AMOUNT',
        valueCents: 1000,
        minOrderCents: 3000,
        maxUsesPerUser: 1,
        firstOrderOnly: true,
      };
      const parsed = promoCodeCreateSchema.parse(input);
      expect(parsed.code).toBe('BIENVENUE10');
      expect(parsed.valueCents).toBe(1000);
      expect(parsed.minOrderCents).toBe(3000);
      expect(parsed.maxUsesPerUser).toBe(1);
      expect(parsed.firstOrderOnly).toBe(true);
    });

    it('validates a valid percentage promo code with max discount cap and default values', () => {
      const input = {
        code: 'summer20',
        type: 'PERCENTAGE',
        valueCents: 20, // 20%
        maxDiscountCents: 1500, // max 15€
      };
      const parsed = promoCodeCreateSchema.parse(input);
      expect(parsed.code).toBe('SUMMER20');
      expect(parsed.maxDiscountCents).toBe(1500);
      expect(parsed.minOrderCents).toBe(0);
      expect(parsed.maxUsesPerUser).toBe(1);
      expect(parsed.firstOrderOnly).toBe(false);
    });

    it('accepts optional nullable datetime and maxUsesTotal fields', () => {
      const now = new Date().toISOString();
      const input = {
        code: 'PROMO-2026_FLASH',
        type: 'FIXED_AMOUNT',
        valueCents: 500,
        startsAt: now,
        expiresAt: null,
        maxUsesTotal: null,
      };
      const parsed = promoCodeCreateSchema.parse(input);
      expect(parsed.code).toBe('PROMO-2026_FLASH');
      expect(parsed.startsAt).toBe(now);
      expect(parsed.expiresAt).toBeNull();
      expect(parsed.maxUsesTotal).toBeNull();
    });

    it('rejects invalid promo code format with special characters', () => {
      expect(() =>
        promoCodeCreateSchema.parse({
          code: 'PROMO 10%!',
          type: 'FIXED_AMOUNT',
          valueCents: 1000,
        }),
      ).toThrow();
    });

    it('rejects promo code shorter than 3 characters or longer than 30', () => {
      expect(() =>
        promoCodeCreateSchema.parse({
          code: 'AB',
          type: 'FIXED_AMOUNT',
          valueCents: 1000,
        }),
      ).toThrow();

      expect(() =>
        promoCodeCreateSchema.parse({
          code: 'A'.repeat(31),
          type: 'FIXED_AMOUNT',
          valueCents: 1000,
        }),
      ).toThrow();
    });

    it('rejects negative or zero discount values', () => {
      expect(() =>
        promoCodeCreateSchema.parse({
          code: 'ZERO',
          type: 'FIXED_AMOUNT',
          valueCents: 0,
        }),
      ).toThrow();

      expect(() =>
        promoCodeCreateSchema.parse({
          code: 'NEGATIVE',
          type: 'FIXED_AMOUNT',
          valueCents: -500,
        }),
      ).toThrow();
    });
  });

  describe('promoCodeUpdateStatusSchema', () => {
    it('accepts ACTIVE and PAUSED statuses', () => {
      expect(promoCodeUpdateStatusSchema.parse({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' });
      expect(promoCodeUpdateStatusSchema.parse({ status: 'PAUSED' })).toEqual({ status: 'PAUSED' });
    });

    it('rejects other statuses', () => {
      expect(() => promoCodeUpdateStatusSchema.parse({ status: 'EXPIRED' })).toThrow();
    });
  });

  describe('promoCodeValidationInputSchema', () => {
    it('validates a valid checkout validation payload and uppercases code', () => {
      const input = {
        code: '  promo20  ',
        orderAmountCents: 5000,
        userId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      };
      const parsed = promoCodeValidationInputSchema.parse(input);
      expect(parsed.code).toBe('PROMO20');
      expect(parsed.orderAmountCents).toBe(5000);
      expect(parsed.userId).toBe('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d');
    });

    it('rejects invalid UUID or non-positive orderAmount', () => {
      expect(() =>
        promoCodeValidationInputSchema.parse({
          code: 'PROMO20',
          orderAmountCents: 0,
          userId: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        }),
      ).toThrow();

      expect(() =>
        promoCodeValidationInputSchema.parse({
          code: 'PROMO20',
          orderAmountCents: 5000,
          userId: 'not-a-uuid',
        }),
      ).toThrow();
    });
  });

  describe('promoValidationResultSchema', () => {
    it('validates successful and rejected validation results', () => {
      const successResult = {
        valid: true,
        code: 'BIENVENUE10',
        promoId: 'promo-123',
        discountCents: 1000,
        finalPayableCents: 4000,
        errorReason: null,
        errorMessage: null,
      };
      expect(promoValidationResultSchema.parse(successResult)).toEqual(successResult);

      const rejectedResult = {
        valid: false,
        code: 'EXPIRED10',
        discountCents: 0,
        finalPayableCents: 5000,
        errorReason: 'EXPIRED',
        errorMessage: 'Ce code promo a expiré.',
      };
      expect(promoValidationResultSchema.parse(rejectedResult)).toEqual(rejectedResult);
    });

    it('validates all allowable error reasons', () => {
      const reasons = [
        'INVALID_CODE',
        'CODE_PAUSED',
        'EXPIRED',
        'NOT_STARTED',
        'MIN_ORDER_NOT_MET',
        'MAX_USES_REACHED',
        'ALREADY_USED_BY_USER',
        'FIRST_ORDER_REQUIRED',
        'CANNOT_USE_OWN_REFERRAL_CODE',
      ] as const;

      for (const reason of reasons) {
        const payload = {
          valid: false,
          code: 'TEST',
          discountCents: 0,
          finalPayableCents: 1000,
          errorReason: reason,
          errorMessage: 'Error message',
        };
        expect(promoValidationResultSchema.parse(payload).errorReason).toBe(reason);
      }
    });
  });

  describe('adminPromoListItemSchema & adminPromoListResponseSchema', () => {
    it('validates admin promo list item and response', () => {
      const item = {
        id: 'promo_cl901',
        code: 'BIENVENUE10',
        description: 'Offre nouveau client',
        type: 'FIXED_AMOUNT' as const,
        valueCents: 1000,
        maxDiscountCents: null,
        minOrderCents: 3000,
        startsAt: '2026-10-01T00:00:00.000Z',
        expiresAt: null,
        maxUsesTotal: 500,
        maxUsesPerUser: 1,
        currentUsesCount: 142,
        totalDiscountDisbursedCents: 142000,
        firstOrderOnly: true,
        status: 'ACTIVE' as const,
        isReferral: false,
        referrerName: null,
        createdAt: '2026-10-01T00:00:00.000Z',
      };

      expect(adminPromoListItemSchema.parse(item)).toEqual(item);

      const response = {
        items: [item],
        total: 1,
      };
      expect(adminPromoListResponseSchema.parse(response)).toEqual(response);
    });
  });

  describe('adminPromoKpisSchema', () => {
    it('validates admin promo marketing KPIs', () => {
      const kpis = {
        totalDiscountDisbursedCents: 145000,
        activeCodesCount: 8,
        totalOrdersWithPromoCount: 142,
        totalReferralConversionsCount: 36,
      };
      expect(adminPromoKpisSchema.parse(kpis)).toEqual(kpis);
    });

    it('rejects negative KPI values', () => {
      expect(() =>
        adminPromoKpisSchema.parse({
          totalDiscountDisbursedCents: -1,
          activeCodesCount: 8,
          totalOrdersWithPromoCount: 142,
          totalReferralConversionsCount: 36,
        }),
      ).toThrow();
    });
  });
});
