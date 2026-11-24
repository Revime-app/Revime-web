import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import {
  PARTICULAR_CAP_REACHED_TEXT,
  PARTICULAR_QUOTA_MAX_CENTS,
  PARTICULAR_QUOTA_MAX_MISSIONS,
  particularQuotaStanding,
  type MyParticularQuotaResponse,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { businessStepRefusal } from './gate.js';

/**
 * CGU art. 53: a réparateur « particulier » is capped at 10 missions or 1 500 € over a rolling 12
 * months. THE one definition of which orders count and how they add up, read by the counter on the
 * user's page (A2), by the 80 % alert on /verifications (A3), and since V7 A10 (U7) by the offer
 * gate and the repairer's own counter; the first two used to carry their own copy, anchored on
 * `createdAt` (when the payment attempt opened, not when it was paid) and counting an order a refund
 * had taken back. RU-29.
 *
 * Moved here from `admin/` by U7: the offer gate is not an admin concern. What the figures MEAN
 * (OK, WARNING, REACHED) is `particularQuotaStanding` in `@revime/shared`.
 */
export type QuotaOrder = {
  repairCents: number;
  /** The part of the quote a refund gave back, null for an order never (partly) refunded. */
  refundRepairCents: number | null;
  paidAt: Date | null;
};

export const PARTICULAR_QUOTA_ORDER_SELECT = {
  repairerUserId: true,
  repairCents: true,
  refundRepairCents: true,
  paidAt: true,
} satisfies Prisma.CommandeSelect;

/** Paid inside the window and not refunded in full (a full refund is stamped with a refund id). */
export function particularQuotaOrdersWhere(
  repairerUserIds: string | readonly string[],
  windowStart: Date,
): Prisma.CommandeWhereInput {
  return {
    repairerUserId: typeof repairerUserIds === 'string' ? repairerUserIds : { in: [...repairerUserIds] },
    status: 'PAID',
    stripeRefundId: null,
    paidAt: { gte: windowStart },
  };
}

export function rollingQuotaWindowStart(now: Date): Date {
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  return start;
}

export type QuotaFigures = {
  missionsCount: number;
  amountCollectedCents: number;
};

export function summariseParticularQuota(orders: readonly QuotaOrder[]): QuotaFigures & {
  /** The day the oldest counted mission leaves the window: the first slot to free up. */
  nextMissionReleaseAt: Date | null;
} {
  let oldestPaidAt: Date | null = null;
  let amountCollectedCents = 0;
  for (const o of orders) {
    amountCollectedCents += o.repairCents - (o.refundRepairCents ?? 0);
    if (o.paidAt && (!oldestPaidAt || o.paidAt < oldestPaidAt)) oldestPaidAt = o.paidAt;
  }
  let nextMissionReleaseAt: Date | null = null;
  if (oldestPaidAt) {
    nextMissionReleaseAt = new Date(oldestPaidAt);
    nextMissionReleaseAt.setUTCFullYear(nextMissionReleaseAt.getUTCFullYear() + 1);
  }
  return { missionsCount: orders.length, amountCollectedCents, nextMissionReleaseAt };
}

/** The admin's 80 % alert: WARNING or past it. */
export function isAtEightyPercentOfQuota(figures: QuotaFigures): boolean {
  return (
    particularQuotaStanding({
      ...figures,
      missionsMax: PARTICULAR_QUOTA_MAX_MISSIONS,
      amountMaxCents: PARTICULAR_QUOTA_MAX_CENTS,
    }) !== 'OK'
  );
}

type QuotaReader = Pick<PrismaService, 'repairerProfile' | 'commande' | 'businessVerification'>;

/**
 * The repairer's own counter (`GET /users/me/particular-quota`) and the sentence the cap would
 * answer an offer right now. Null for anyone who is not a private individual: professionals are
 * never counted (A10 criterion 4), and their orders are not even read.
 */
export async function readParticularQuota(
  prisma: QuotaReader,
  userId: string,
  now: Date = new Date(),
): Promise<MyParticularQuotaResponse> {
  const repairer = await prisma.repairerProfile.findUnique({ where: { userId }, select: { kind: true } });
  if (repairer?.kind !== 'INDIVIDUAL') return { quota: null, offerBlockedMessage: null };

  const orders = await prisma.commande.findMany({
    where: particularQuotaOrdersWhere(userId, rollingQuotaWindowStart(now)),
    select: PARTICULAR_QUOTA_ORDER_SELECT,
  });
  const { missionsCount, amountCollectedCents, nextMissionReleaseAt } = summariseParticularQuota(orders);
  const figures = {
    missionsCount,
    missionsMax: PARTICULAR_QUOTA_MAX_MISSIONS,
    amountCollectedCents,
    amountMaxCents: PARTICULAR_QUOTA_MAX_CENTS,
  };
  const standing = particularQuotaStanding(figures);

  let offerBlockedMessage: string | null = null;
  if (standing === 'REACHED') {
    // `DEC7-22` Q9: once he has submitted « Mon entreprise », the sentence follows that verification,
    // as A3's does for a professional.
    const business = await prisma.businessVerification.findUnique({ where: { userId }, select: { status: true } });
    offerBlockedMessage = businessStepRefusal(business?.status) ?? PARTICULAR_CAP_REACHED_TEXT;
  }

  return {
    quota: { ...figures, nextMissionReleaseAt: nextMissionReleaseAt?.toISOString() ?? null, standing },
    offerBlockedMessage,
  };
}

/**
 * CGU art. 53, « le réparateur ne peut plus publier de nouvelle offre en tant que particulier ».
 * Called by `OffersService.create` only (`DEC7-22` Q3): offers already sent stay payable and paid
 * orders carry on. No flag (Q12): an installed build shows the server's sentence as it is.
 */
export async function assertUnderParticularCap(
  prisma: QuotaReader,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const { offerBlockedMessage } = await readParticularQuota(prisma, userId, now);
  if (offerBlockedMessage) throw new AppException('PARTICULAR_CAP_REACHED', offerBlockedMessage);
}
