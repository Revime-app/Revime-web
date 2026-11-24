/**
 * A checkout nobody ever started: the order is PENDING_PAYMENT, no Stripe session and no payment
 * intent was created for it, and a day has passed. There is nothing on Stripe to expire and no
 * client to tell, so a plain `updateMany` to ABANDONED is safe here and ONLY here.
 *
 * 🛑 A row that carries a Stripe id is NOT this case. A card can still be charged against its live
 * session, so it must be settled through Stripe (`abandonBySessionId` after the session is read as
 * expired): `CronService.settleOrphanSessions` does that hourly. Abandoning it locally would leave a
 * captured payment on an ABANDONED row that no job looks at again. The `payments.service`
 * invariant « every abandon path expires its session first » rests on this split.
 */
export const STALE_UNSTARTED_PAYMENT_AFTER_MS = 24 * 60 * 60 * 1000;

export function staleUnstartedPaymentWhere(now: number = Date.now()) {
  return {
    status: 'PENDING_PAYMENT' as const,
    stripeSessionId: null,
    stripePaymentIntentId: null,
    createdAt: { lte: new Date(now - STALE_UNSTARTED_PAYMENT_AFTER_MS) },
  };
}
