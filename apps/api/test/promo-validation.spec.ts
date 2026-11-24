import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PromoValidationService } from '../src/promos/promo-validation.service.js';
import 'reflect-metadata';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { PromosController } from '../src/promos/promos.controller.js';

describe('PromoValidationService', () => {
  let service: PromoValidationService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      promoCode: {
        findUnique: vi.fn(),
      },
      promoUsage: {
        count: vi.fn(),
      },
      commande: {
        count: vi.fn(),
      },
    };
    service = new PromoValidationService(mockPrisma);
  });

  it('validates a fixed amount code and computes discount correctly', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p1',
      code: 'REDUCTION10',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      minOrderCents: 3000,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });
    mockPrisma.promoUsage.count.mockResolvedValue(0);

    const result = await service.validatePromo({
      code: 'REDUCTION10',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(true);
    expect(result.code).toBe('REDUCTION10');
    expect(result.promoId).toBe('p1');
    expect(result.discountCents).toBe(1000);
    expect(result.finalPayableCents).toBe(4000);
    expect(result.errorReason).toBeNull();
    expect(result.errorMessage).toBeNull();
  });

  it('normalizes lowercase code input to uppercase', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p1',
      code: 'REDUCTION10',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });
    mockPrisma.promoUsage.count.mockResolvedValue(0);

    const result = await service.validatePromo({
      code: '  reduction10  ',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(mockPrisma.promoCode.findUnique).toHaveBeenCalledWith({
      where: { code: 'REDUCTION10' },
    });
    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(1000);
  });

  it('caps fixed discount at orderAmountCents when discount exceeds order amount', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p1',
      code: 'BIGDISCOUNT',
      type: 'FIXED_AMOUNT',
      valueCents: 5000,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });
    mockPrisma.promoUsage.count.mockResolvedValue(0);

    const result = await service.validatePromo({
      code: 'BIGDISCOUNT',
      userId: 'u1',
      orderAmountCents: 3000,
    });

    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(3000);
    expect(result.finalPayableCents).toBe(0);
  });

  it('validates percentage code and respects maximum discount cap', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p2',
      code: 'SOLDE20',
      type: 'PERCENTAGE',
      valueCents: 20, // 20%
      maxDiscountCents: 1500, // 15€ max cap
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 2,
      firstOrderOnly: false,
      isReferral: false,
    });
    mockPrisma.promoUsage.count.mockResolvedValue(0);

    // 20% of 100€ (10000 cents) = 20€ (2000 cents), capped at 15€ (1500 cents)
    const result = await service.validatePromo({
      code: 'SOLDE20',
      userId: 'u1',
      orderAmountCents: 10000,
    });

    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(1500);
    expect(result.finalPayableCents).toBe(8500);
  });

  it('computes uncapped percentage discount when maxDiscountCents is null', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p2',
      code: 'PROMO15',
      type: 'PERCENTAGE',
      valueCents: 15, // 15%
      maxDiscountCents: null,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });
    mockPrisma.promoUsage.count.mockResolvedValue(0);

    // 15% of 6000 cents = 900 cents
    const result = await service.validatePromo({
      code: 'PROMO15',
      userId: 'u1',
      orderAmountCents: 6000,
    });

    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(900);
    expect(result.finalPayableCents).toBe(5100);
  });

  it('rejects if promo code is not found', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue(null);

    const result = await service.validatePromo({
      code: 'UNKNOWN',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.code).toBe('UNKNOWN');
    expect(result.discountCents).toBe(0);
    expect(result.finalPayableCents).toBe(5000);
    expect(result.errorReason).toBe('INVALID_CODE');
    expect(result.errorMessage).toBe('Code promotionnel introuvable.');
  });

  it('rejects paused promo code', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p-paused',
      code: 'PAUSEDCODE',
      type: 'FIXED_AMOUNT',
      valueCents: 500,
      minOrderCents: 0,
      status: 'PAUSED',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });

    const result = await service.validatePromo({
      code: 'PAUSEDCODE',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('CODE_PAUSED');
    expect(result.errorMessage).toBe(
      'Ce code promo est temporairement suspendu.',
    );
  });

  it('rejects expired promo code by status', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p-exp',
      code: 'EXPSTATUS',
      type: 'FIXED_AMOUNT',
      valueCents: 500,
      minOrderCents: 0,
      status: 'EXPIRED',
      startsAt: new Date(Date.now() - 20000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });

    const result = await service.validatePromo({
      code: 'EXPSTATUS',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('EXPIRED');
    expect(result.errorMessage).toBe('Ce code promo a expiré.');
  });

  it('rejects expired promo code by expiresAt date', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p-exp2',
      code: 'EXPDATE',
      type: 'FIXED_AMOUNT',
      valueCents: 500,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 20000),
      expiresAt: new Date(Date.now() - 1000),
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });

    const result = await service.validatePromo({
      code: 'EXPDATE',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('EXPIRED');
    expect(result.errorMessage).toBe('Ce code promo a expiré.');
  });

  it('rejects code not yet started', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p-future',
      code: 'FUTURECODE',
      type: 'FIXED_AMOUNT',
      valueCents: 500,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() + 60000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });

    const result = await service.validatePromo({
      code: 'FUTURECODE',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('NOT_STARTED');
    expect(result.errorMessage).toBe("Ce code promo n'est pas encore actif.");
  });

  it('rejects if minimum order basket is not met', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p3',
      code: 'MIN50',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      minOrderCents: 5000, // 50€ min
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });

    const result = await service.validatePromo({
      code: 'MIN50',
      userId: 'u1',
      orderAmountCents: 3500, // 35€ < 50€
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('MIN_ORDER_NOT_MET');
    expect(result.errorMessage).toBe(
      "Le montant minimum de commande n'est pas atteint.",
    );
  });

  it('rejects self-referral attempts', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p4',
      code: 'PARRAIN-ALICE',
      type: 'FIXED_AMOUNT',
      valueCents: 500,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: true,
      isReferral: true,
      referrerId: 'alice-user-id',
    });

    const result = await service.validatePromo({
      code: 'PARRAIN-ALICE',
      userId: 'alice-user-id', // Same user
      orderAmountCents: 3000,
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('CANNOT_USE_OWN_REFERRAL_CODE');
    expect(result.errorMessage).toBe(
      'Vous ne pouvez pas utiliser votre propre code de parrainage.',
    );
  });

  it('rejects code if first-order condition is not satisfied', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p5',
      code: 'FIRSTONLY',
      type: 'FIXED_AMOUNT',
      valueCents: 500,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: true,
      isReferral: false,
    });
    mockPrisma.commande.count.mockResolvedValue(2); // User already has 2 orders

    const result = await service.validatePromo({
      code: 'FIRSTONLY',
      userId: 'u2',
      orderAmountCents: 4000,
    });

    expect(mockPrisma.commande.count).toHaveBeenCalledWith({
      where: {
        clientUserId: 'u2',
        status: { notIn: ['ABANDONED', 'REFUNDED'] },
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('FIRST_ORDER_REQUIRED');
    expect(result.errorMessage).toBe(
      'Ce code de bienvenue est réservé à votre première commande.',
    );
  });

  it('allows first-order code if all previous orders were ABANDONED or REFUNDED', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p5',
      code: 'FIRSTONLY',
      type: 'FIXED_AMOUNT',
      valueCents: 500,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: null,
      maxUsesPerUser: 1,
      firstOrderOnly: true,
      isReferral: false,
    });
    mockPrisma.commande.count.mockResolvedValue(0);
    mockPrisma.promoUsage.count.mockResolvedValue(0);

    const result = await service.validatePromo({
      code: 'FIRSTONLY',
      userId: 'u2',
      orderAmountCents: 4000,
    });

    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(500);
  });

  it('rejects code when max total uses is reached', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p6',
      code: 'LIMITED100',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: 100,
      maxUsesPerUser: 2,
      firstOrderOnly: false,
      isReferral: false,
    });
    mockPrisma.promoUsage.count.mockResolvedValue(100);

    const result = await service.validatePromo({
      code: 'LIMITED100',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('MAX_USES_REACHED');
    expect(result.errorMessage).toBe(
      "Ce code promo a atteint sa limite d'utilisation globale.",
    );
  });

  it('rejects code when status is EXHAUSTED', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p6b',
      code: 'EXHAUSTEDCODE',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      minOrderCents: 0,
      status: 'EXHAUSTED',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: 50,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });

    const result = await service.validatePromo({
      code: 'EXHAUSTEDCODE',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('MAX_USES_REACHED');
    expect(result.errorMessage).toBe(
      "Ce code promo a atteint sa limite d'utilisation globale.",
    );
  });

  it('rejects code when per-user usage limit is reached', async () => {
    mockPrisma.promoCode.findUnique.mockResolvedValue({
      id: 'p7',
      code: 'ONCEPERUSER',
      type: 'FIXED_AMOUNT',
      valueCents: 1000,
      minOrderCents: 0,
      status: 'ACTIVE',
      startsAt: new Date(Date.now() - 10000),
      expiresAt: null,
      maxUsesTotal: 500,
      maxUsesPerUser: 1,
      firstOrderOnly: false,
      isReferral: false,
    });
    mockPrisma.promoUsage.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(1);

    const result = await service.validatePromo({
      code: 'ONCEPERUSER',
      userId: 'u1',
      orderAmountCents: 5000,
    });

    expect(mockPrisma.promoUsage.count).toHaveBeenNthCalledWith(2, {
      where: {
        promoCodeId: 'p7',
        userId: 'u1',
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errorReason).toBe('ALREADY_USED_BY_USER');
    expect(result.errorMessage).toBe(
      'Vous avez déjà utilisé ce code promo le nombre maximum de fois autorisé.',
    );
  });
});

describe('PromosController', () => {
  const session = { user: { id: '11111111-1111-4111-a111-111111111111' } } as any;
  const mockService = () => ({
    validatePromo: vi.fn().mockResolvedValue({
      valid: true,
      code: 'TESTCODE',
      promoId: 'p1',
      discountCents: 500,
      finalPayableCents: 2500,
      errorReason: null,
      errorMessage: null,
    }),
  });

  it('delegates validation to PromoValidationService for the SIGNED-IN user', async () => {
    const svc = mockService();
    const controller = new PromosController(svc as any);

    const result = await controller.validate(session, { code: 'TESTCODE', orderAmountCents: 3000 });
    expect(svc.validatePromo).toHaveBeenCalledWith({
      code: 'TESTCODE',
      orderAmountCents: 3000,
      userId: '11111111-1111-4111-a111-111111111111',
    });
    expect(result.valid).toBe(true);
    expect(result.discountCents).toBe(500);
  });

  it('ignores a userId smuggled into the body (RU-24: it used to be trusted)', async () => {
    const svc = mockService();
    const controller = new PromosController(svc as any);

    await controller.validate(session, {
      code: 'TESTCODE',
      orderAmountCents: 3000,
      userId: '22222222-2222-4222-a222-222222222222',
    } as any);
    expect(svc.validatePromo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: '11111111-1111-4111-a111-111111111111' }),
    );
  });

  it('is not anonymous: a code cannot be probed by someone who is not signed in', () => {
    class Probe {
      @AllowAnonymous()
      open() {}
    }
    const keys = Reflect.getMetadataKeys(Probe.prototype.open);
    expect(keys.length).toBeGreaterThan(0);
    const controller = new PromosController(mockService() as any);
    for (const key of keys) {
      expect(Reflect.getMetadata(key, controller.validate)).toBeUndefined();
    }
  });
});
