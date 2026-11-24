import type { DisputeStatusType } from '@revime/shared';

/**
 * B11. A refunded order is terminal, so whatever the dispute row still says (a « Réparation
 * reprise » closed before the cancellation was refunded) must not be shown next to it. This is
 * the one place that decides what every admin surface displays for a dispute on such an order.
 *
 * It only DERIVES: the stored row keeps its own status and verdict, because overwriting them
 * would erase how the operator really closed the dispute. New refunds close an open dispute in
 * the refund transaction itself (`RefundService`), so this covers the closed ones.
 */
export function effectiveDisputeStatus(input: {
  status: DisputeStatusType;
  verdict: string | null;
  commande: { status: string; totalCents: number; refundedCents: number | null } | null;
}): { status: DisputeStatusType; verdict: string | null } {
  const { status, verdict, commande } = input;
  if (commande?.status !== 'REFUNDED' || status === 'RESOLVED_REFUNDED') {
    return { status, verdict };
  }
  // Only a verdict that contradicts the refund is replaced; a stored refund verdict stays.
  const contradicts = verdict === null || verdict === 'DISMISSED' || verdict === 'RELEASE_REPAIRER';
  const refunded = commande.refundedCents ?? commande.totalCents;
  return {
    status: 'RESOLVED_REFUNDED',
    verdict: contradicts ? (refunded === commande.totalCents ? 'REFUND_CLIENT' : 'PARTIAL_REFUND') : verdict,
  };
}
