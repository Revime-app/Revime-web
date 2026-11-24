import type { DisputeStatus } from '../generated/prisma/client.js';

/**
 * Whether a REVIME dispute is open on a commande - D1 (design §3): only OPEN and
 * IN_REVIEW count as « Litige ouvert ». The three RESOLVED_* members are terminal and
 * read as not disputed, and a Stripe-only chargeback (no `Dispute` row at all) is
 * represented by `null`/`undefined` here, not by a DisputeStatus value - it keeps
 * today's opaque « Paiement en cours de vérification » instead.
 */
export function isDisputeOpen(dispute: { status: DisputeStatus } | null | undefined): boolean {
  if (!dispute) return false;
  return dispute.status === 'OPEN' || dispute.status === 'IN_REVIEW';
}
