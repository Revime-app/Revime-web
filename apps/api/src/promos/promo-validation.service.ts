import { Injectable } from '@nestjs/common';
import type {
  PromoCodeValidationInput,
  PromoValidationResult,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class PromoValidationService {
  constructor(private readonly prisma: PrismaService) {}

  async validatePromo(
    input: PromoCodeValidationInput,
  ): Promise<PromoValidationResult> {
    const normalizedCode = input.code.trim().toUpperCase();

    const promo = await this.prisma.promoCode.findUnique({
      where: { code: normalizedCode },
    });

    // 1. Not found
    if (!promo) {
      return {
        valid: false,
        code: normalizedCode,
        discountCents: 0,
        finalPayableCents: input.orderAmountCents,
        errorReason: 'INVALID_CODE',
        errorMessage: 'Code promotionnel introuvable.',
      };
    }

    // 2. Paused status
    if (promo.status === 'PAUSED') {
      return {
        valid: false,
        code: promo.code,
        promoId: promo.id,
        discountCents: 0,
        finalPayableCents: input.orderAmountCents,
        errorReason: 'CODE_PAUSED',
        errorMessage: 'Ce code promo est temporairement suspendu.',
      };
    }

    // 3. Expired (status or expiresAt date reached)
    const now = new Date();
    if (
      promo.status === 'EXPIRED' ||
      (promo.expiresAt !== null && now > promo.expiresAt)
    ) {
      return {
        valid: false,
        code: promo.code,
        promoId: promo.id,
        discountCents: 0,
        finalPayableCents: input.orderAmountCents,
        errorReason: 'EXPIRED',
        errorMessage: 'Ce code promo a expiré.',
      };
    }

    // 4. Not started yet
    if (promo.startsAt !== null && now < promo.startsAt) {
      return {
        valid: false,
        code: promo.code,
        promoId: promo.id,
        discountCents: 0,
        finalPayableCents: input.orderAmountCents,
        errorReason: 'NOT_STARTED',
        errorMessage: "Ce code promo n'est pas encore actif.",
      };
    }

    // 5. Minimum basket requirement
    if (input.orderAmountCents < promo.minOrderCents) {
      return {
        valid: false,
        code: promo.code,
        promoId: promo.id,
        discountCents: 0,
        finalPayableCents: input.orderAmountCents,
        errorReason: 'MIN_ORDER_NOT_MET',
        errorMessage: "Le montant minimum de commande n'est pas atteint.",
      };
    }

    // 6. Anti-self-referral
    if (promo.isReferral && promo.referrerId === input.userId) {
      return {
        valid: false,
        code: promo.code,
        promoId: promo.id,
        discountCents: 0,
        finalPayableCents: input.orderAmountCents,
        errorReason: 'CANNOT_USE_OWN_REFERRAL_CODE',
        errorMessage:
          'Vous ne pouvez pas utiliser votre propre code de parrainage.',
      };
    }

    // 7. First order check
    if (promo.firstOrderOnly) {
      const priorOrderCount = await this.prisma.commande.count({
        where: {
          clientUserId: input.userId,
          status: { notIn: ['ABANDONED', 'REFUNDED'] },
        },
      });

      if (priorOrderCount > 0) {
        return {
          valid: false,
          code: promo.code,
          promoId: promo.id,
          discountCents: 0,
          finalPayableCents: input.orderAmountCents,
          errorReason: 'FIRST_ORDER_REQUIRED',
          errorMessage:
            'Ce code de bienvenue est réservé à votre première commande.',
        };
      }
    }

    // 8. Max total uses check (or EXHAUSTED status)
    if (promo.status === 'EXHAUSTED') {
      return {
        valid: false,
        code: promo.code,
        promoId: promo.id,
        discountCents: 0,
        finalPayableCents: input.orderAmountCents,
        errorReason: 'MAX_USES_REACHED',
        errorMessage:
          "Ce code promo a atteint sa limite d'utilisation globale.",
      };
    }

    if (promo.maxUsesTotal !== null && promo.maxUsesTotal !== undefined) {
      const totalUses = await this.prisma.promoUsage.count({
        where: { promoCodeId: promo.id },
      });

      if (totalUses >= promo.maxUsesTotal) {
        return {
          valid: false,
          code: promo.code,
          promoId: promo.id,
          discountCents: 0,
          finalPayableCents: input.orderAmountCents,
          errorReason: 'MAX_USES_REACHED',
          errorMessage:
            "Ce code promo a atteint sa limite d'utilisation globale.",
        };
      }
    }

    // 9. Max per-user uses check
    if (promo.maxUsesPerUser !== null && promo.maxUsesPerUser !== undefined) {
      const userUses = await this.prisma.promoUsage.count({
        where: {
          promoCodeId: promo.id,
          userId: input.userId,
        },
      });

      if (userUses >= promo.maxUsesPerUser) {
        return {
          valid: false,
          code: promo.code,
          promoId: promo.id,
          discountCents: 0,
          finalPayableCents: input.orderAmountCents,
          errorReason: 'ALREADY_USED_BY_USER',
          errorMessage:
            'Vous avez déjà utilisé ce code promo le nombre maximum de fois autorisé.',
        };
      }
    }

    // Computation
    let discountCents = 0;
    if (promo.type === 'FIXED_AMOUNT') {
      discountCents = Math.min(promo.valueCents, input.orderAmountCents);
    } else if (promo.type === 'PERCENTAGE') {
      const rawDiscount = Math.round(
        (input.orderAmountCents * promo.valueCents) / 100,
      );
      const cappedDiscount =
        promo.maxDiscountCents !== null && promo.maxDiscountCents !== undefined
          ? Math.min(rawDiscount, promo.maxDiscountCents)
          : rawDiscount;
      discountCents = Math.min(cappedDiscount, input.orderAmountCents);
    }

    const finalPayableCents = Math.max(
      0,
      input.orderAmountCents - discountCents,
    );

    return {
      valid: true,
      code: promo.code,
      promoId: promo.id,
      discountCents,
      finalPayableCents,
      errorReason: null,
      errorMessage: null,
    };
  }
}
