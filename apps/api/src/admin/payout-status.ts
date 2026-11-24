import type { PayoutStatus } from '@revime/shared';

/**
 * Where the réparateur's money stands on one order, once, for every admin surface that shows it.
 * F5's payouts page and P11's « Versement réparateur » column each derived this on their own, and
 * the second one called a released order with no transfer « Transféré » (`step === 'RELEASED'`),
 * which is the exact case F5 calls FAILED.
 *
 * - REVERSED: Stripe took the transfer back.
 * - TRANSFERRED: a transfer id was written. That, and only that, is proof the money left.
 * - FAILED: the escrow was released and no transfer exists while the réparateur was payable. Stripe
 *   sends no failure event here, so it is inferred from the state: an order still in escrow is merely
 *   PENDING.
 * - HELD (V8 `ISS8-013`): the same released-but-untransferred shape while the réparateur is NOT payable
 *   (`payable` false, see `heldReasonOf`): the money waits on his setup and leaves by itself once it is
 *   done (`payoutStrandedCommandes`). Not a failure. A caller that cannot tell passes nothing and keeps
 *   the old FAILED reading (P11's payments column).
 * - PENDING: everything else.
 */
export function payoutStatusOf(
  row: {
    status: string;
    step: string | null;
    stripeTransferId: string | null;
    stripeTransferReversalId: string | null;
  },
  payable = true,
): PayoutStatus {
  if (row.stripeTransferReversalId) return 'REVERSED';
  if (row.stripeTransferId) return 'TRANSFERRED';
  if (row.status === 'PAID' && row.step === 'RELEASED') return payable ? 'FAILED' : 'HELD';
  return 'PENDING';
}

/**
 * V8 `ISS8-013`: why a released payout waits on the réparateur, or null when he is payable. The same
 * three conditions `CommandesService.releaseInternal` holds on (no account, transfers inactive, fiscal
 * incomplete), in that order. The row texts are shown on « Versements ».
 */
export function heldReasonOf(facts: { hasAccount: boolean; transfersActive: boolean; fiscalComplete: boolean }): string | null {
  if (!facts.hasAccount) return 'Compte Stripe Connect non créé par le réparateur';
  if (!facts.transfersActive) return 'Compte Stripe Connect inactif';
  if (!facts.fiscalComplete) return 'Informations fiscales du réparateur incomplètes (DAC7)';
  return null;
}
