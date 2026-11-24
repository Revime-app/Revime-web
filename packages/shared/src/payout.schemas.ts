import { z } from 'zod';

/**
 * V8 `ISS8-013`: `HELD` = released to the réparateur, not transferred, because HE is not payable yet (no
 * Connect account, transfers inactive, fiscal information incomplete); `FAILED` = the same shape while he
 * was payable, i.e. a real transfer failure. An older API never sends `HELD`.
 */
export const payoutStatusSchema = z.enum(['TRANSFERRED', 'PENDING', 'HELD', 'FAILED', 'REVERSED']);
export type PayoutStatus = z.infer<typeof payoutStatusSchema>;

export const connectAccountStatusSchema = z.enum(['PENDING', 'VERIFIED', 'RESTRICTED', 'REJECTED']);
export type ConnectAccountStatus = z.infer<typeof connectAccountStatusSchema>;

export const adminPayoutListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.enum(['ALL', 'TRANSFERRED', 'PENDING', 'HELD', 'FAILED', 'REVERSED']).default('ALL'),
  period: z.enum(['today', '7d', '30d', 'all']).default('all'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
export type AdminPayoutListQuery = z.infer<typeof adminPayoutListQuerySchema>;

export const adminPayoutListItemSchema = z.object({
  id: z.string(),
  orderNumber: z.string(),
  createdAt: z.string(),
  paidAt: z.string().nullable(),
  releasedAt: z.string().nullable(),
  amountCents: z.number().int(),
  totalOrderCents: z.number().int(),
  commissionCents: z.number().int(),
  status: payoutStatusSchema,
  repairerId: z.string(),
  repairerName: z.string(),
  repairerEmail: z.string(),
  stripeAccountId: z.string().nullable(),
  transfersActive: z.boolean(),
  stripeTransferId: z.string().nullable(),
  stripeChargeId: z.string().nullable(),
  failureReason: z.string().nullable(),
  canRetry: z.boolean(),
});
export type AdminPayoutListItem = z.infer<typeof adminPayoutListItemSchema>;

export const adminPayoutListResponseSchema = z.object({
  items: z.array(adminPayoutListItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type AdminPayoutListResponse = z.infer<typeof adminPayoutListResponseSchema>;

export const adminIncompleteAccountsQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
export type AdminIncompleteAccountsQuery = z.infer<typeof adminIncompleteAccountsQuerySchema>;

export const adminIncompleteConnectAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  repairerName: z.string(),
  repairerEmail: z.string(),
  /** V8 `ISS8-013`: null for a réparateur with held payouts and no Connect account at all. */
  stripeAccountId: z.string().nullable(),
  status: connectAccountStatusSchema.nullable(),
  transfersActive: z.boolean(),
  disabledReason: z.string().nullable(),
  pendingPayoutsCount: z.number().int().nonnegative(),
  pendingPayoutsTotalCents: z.number().int().nonnegative(),
  createdAt: z.string(),
  lastSyncedAt: z.string().nullable(),
});
export type AdminIncompleteConnectAccount = z.infer<typeof adminIncompleteConnectAccountSchema>;

export const adminIncompleteAccountsResponseSchema = z.object({
  items: z.array(adminIncompleteConnectAccountSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type AdminIncompleteAccountsResponse = z.infer<typeof adminIncompleteAccountsResponseSchema>;

export const adminPayoutKpisSchema = z.object({
  totalTransferredCents: z.number().int().nonnegative(),
  pendingEscrowCents: z.number().int().nonnegative(),
  failedTransfersCount: z.number().int().nonnegative(),
  /** V8 `ISS8-013`: payouts waiting on the réparateur's setup. Optional: an older API omits them. */
  heldPayoutsCount: z.number().int().nonnegative().optional(),
  heldPayoutsCents: z.number().int().nonnegative().optional(),
  incompleteAccountsCount: z.number().int().nonnegative(),
});
export type AdminPayoutKpis = z.infer<typeof adminPayoutKpisSchema>;
