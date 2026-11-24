// apps/api/scripts/seed-demo/commande-shape.mjs
import { computeAmounts } from '@revime/shared';

/**
 * A demo commande in the ONLY shape that is safe in production.
 *
 * repairCount counts commandes at status PAID + step RELEASED, and `status: 'PAID'`
 * is exactly what five cron queries select on. The rule that makes this safe is not
 * a workaround: every cron job exists to find STUCK rows, so a terminal-healthy
 * commande is invisible to all of them. Each field below names the query it dodges.
 *
 * The DEMO_ prefix on the Stripe ids is load-bearing. If an operator ever refunds
 * one of these from /remboursement, Stripe will 404 the charge, and the identifier
 * should say why before anyone starts debugging Stripe.
 *
 * **CRITICAL: `n` must be unique across every call within a seeding run.** Three
 * columns derived from `n` are marked `@unique` in schema.prisma: `stripeSessionId`,
 * `stripePaymentIntentId`, and `stripeTransferId`. Reusing an `n` will trigger a
 * unique-constraint violation at insert time against the production database.
 *
 * @param {Object} params
 * @param {number} params.n - Unique positive integer per run (used to generate unique Stripe IDs)
 * @param {string} params.demandeId
 * @param {string} params.offerId
 * @param {string} params.clientUserId
 * @param {string} params.repairerUserId
 * @param {'HOME'|'WORKSHOP'|'PARCEL'} params.delivery
 * @param {number} params.repairCents
 * @param {Date} params.paidAt
 */
export function buildCommandeShape({
  n,
  demandeId,
  offerId,
  clientUserId,
  repairerUserId,
  delivery,
  repairCents,
  paidAt,
}) {
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(
      `n must be a unique positive integer per seeding run (generates unique stripeSessionId, stripePaymentIntentId, stripeTransferId). Got: ${n}`,
    );
  }

  const amounts = computeAmounts(repairCents, delivery);
  const releasedAt = new Date(paidAt.getTime() + 6 * 86_400_000);

  return {
    demandeId,
    offerId,
    clientUserId,
    repairerUserId,
    delivery,
    ...amounts,
    status: 'PAID',
    step: 'RELEASED',
    stripeSessionId: `cs_test_DEMO_${n}`,
    stripePaymentIntentId: `pi_DEMO_${n}`,
    stripeChargeId: `ch_DEMO_${n}`,
    stripeTransferId: `tr_DEMO_${n}`,
    transferredCents: amounts.repairCents,
    paidAt,
    releaseRequestedAt: new Date(paidAt.getTime() + 5 * 86_400_000),
    releasedAt,
    autoReleaseDueAt: new Date(paidAt.getTime() + 60 * 86_400_000),
    stripeRefundId: null,
    stripeTransferReversalId: null,
    refundedAt: null,
    refundedCents: null,
    reversedCents: null,
    disputedAt: null,
    outboundTrackingNumber: null,
    returnTrackingNumber: null,
    returnSentAt: null,
    createdAt: paidAt,
  };
}
