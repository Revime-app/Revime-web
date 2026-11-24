import { z } from 'zod';

export const promoTypeSchema = z.enum(['FIXED_AMOUNT', 'PERCENTAGE']);
export type PromoType = z.infer<typeof promoTypeSchema>;

export const promoStatusSchema = z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'EXHAUSTED']);
export type PromoStatus = z.infer<typeof promoStatusSchema>;

export const referralRewardStatusSchema = z.enum([
  'PENDING_COMPLETION',
  'REWARDED',
  'REVOKED',
]);
export type ReferralRewardStatus = z.infer<typeof referralRewardStatusSchema>;

export const promoCodeCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3, 'Le code doit contenir au moins 3 caractères.')
    .max(30, 'Le code ne peut excéder 30 caractères.')
    .regex(/^[A-Za-z0-9_-]+$/, 'Le code ne doit contenir que des lettres, chiffres, tirets et underscores.')
    .transform((val) => val.toUpperCase()),
  description: z.string().trim().max(250).optional(),
  type: promoTypeSchema,
  valueCents: z.number().int().positive('La valeur de la réduction doit être supérieure à zéro.'),
  maxDiscountCents: z.number().int().positive().optional(),
  minOrderCents: z.number().int().nonnegative().default(0),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
  maxUsesTotal: z.number().int().positive().nullable().optional(),
  maxUsesPerUser: z.number().int().positive().default(1),
  firstOrderOnly: z.boolean().default(false),
}).superRefine((v, ctx) => {
  // `valueCents` holds EUR cents for FIXED_AMOUNT and a whole PERCENT for PERCENTAGE, one
  // column for two units. The modal checked 100 but the API did not, so 150 was a free order.
  if (v.type === 'PERCENTAGE' && v.valueCents > 100) {
    ctx.addIssue({
      code: 'custom',
      path: ['valueCents'],
      message: 'Le pourcentage ne peut excéder 100 %.',
    });
  }
  if (v.type === 'FIXED_AMOUNT' && v.maxDiscountCents !== undefined) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxDiscountCents'],
      message: 'Le plafond ne s\'applique qu\'à un pourcentage.',
    });
  }
  if (v.startsAt && v.expiresAt && new Date(v.expiresAt) <= new Date(v.startsAt)) {
    ctx.addIssue({
      code: 'custom',
      path: ['expiresAt'],
      message: 'La date de fin doit suivre la date de début.',
    });
  }
});
export type PromoCodeCreateInput = z.infer<typeof promoCodeCreateSchema>;

export const promoCodeUpdateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED']),
});
export type PromoCodeUpdateStatusInput = z.infer<typeof promoCodeUpdateStatusSchema>;

export const promoCodeValidationInputSchema = z.object({
  code: z.string().trim().toUpperCase(),
  orderAmountCents: z.number().int().positive(),
  userId: z.string().uuid(),
});
export type PromoCodeValidationInput = z.infer<typeof promoCodeValidationInputSchema>;

/** What the client app sends: the user is the signed-in session, never a field of the body. */
export const promoCodeValidationBodySchema = promoCodeValidationInputSchema.omit({ userId: true });
export type PromoCodeValidationBody = z.infer<typeof promoCodeValidationBodySchema>;

export const promoValidationResultSchema = z.object({
  valid: z.boolean(),
  code: z.string(),
  promoId: z.string().optional(),
  discountCents: z.number().int().nonnegative(),
  finalPayableCents: z.number().int().nonnegative(),
  errorReason: z
    .enum([
      'INVALID_CODE',
      'CODE_PAUSED',
      'EXPIRED',
      'NOT_STARTED',
      'MIN_ORDER_NOT_MET',
      'MAX_USES_REACHED',
      'ALREADY_USED_BY_USER',
      'FIRST_ORDER_REQUIRED',
      'CANNOT_USE_OWN_REFERRAL_CODE',
    ])
    .nullable(),
  errorMessage: z.string().nullable(),
});
export type PromoValidationResult = z.infer<typeof promoValidationResultSchema>;

export const adminPromoListItemSchema = z.object({
  id: z.string(),
  code: z.string(),
  description: z.string().nullable(),
  type: promoTypeSchema,
  valueCents: z.number().int(),
  maxDiscountCents: z.number().int().nullable(),
  minOrderCents: z.number().int(),
  startsAt: z.string(),
  expiresAt: z.string().nullable(),
  maxUsesTotal: z.number().int().nullable(),
  maxUsesPerUser: z.number().int(),
  currentUsesCount: z.number().int().nonnegative(),
  totalDiscountDisbursedCents: z.number().int().nonnegative(),
  firstOrderOnly: z.boolean(),
  status: promoStatusSchema,
  isReferral: z.boolean(),
  referrerName: z.string().nullable(),
  createdAt: z.string(),
});
export type AdminPromoListItem = z.infer<typeof adminPromoListItemSchema>;

export const adminPromoListResponseSchema = z.object({
  items: z.array(adminPromoListItemSchema),
  total: z.number().int().nonnegative(),
});
export type AdminPromoListResponse = z.infer<typeof adminPromoListResponseSchema>;

export const adminPromoKpisSchema = z.object({
  totalDiscountDisbursedCents: z.number().int().nonnegative(),
  activeCodesCount: z.number().int().nonnegative(),
  totalOrdersWithPromoCount: z.number().int().nonnegative(),
  totalReferralConversionsCount: z.number().int().nonnegative(),
});
export type AdminPromoKpis = z.infer<typeof adminPromoKpisSchema>;
