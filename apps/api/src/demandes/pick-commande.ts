import type { CommandeStatus, CommandeStep, DeliveryMode, ProgressCommande } from '@revime/shared';
import { partialRefundOf } from '../commandes/refund-plan.js';

type Row = {
  id: string;
  status: CommandeStatus;
  step: CommandeStep | null;
  delivery: DeliveryMode;
  disputeOpen: boolean;
  createdAt: Date;
  refundedCents: number | null;
  totalCents: number;
  /** CF4-I (spec §4.3). Every caller's select must now also supply this - the freeze flag. */
  cancellationRequestedAt: Date | null;
  /**
   * V8 `Q8-08`. Read only when the caller passes `withTransfer`, and never returned as a value: only
   * as `hasStripeTransfer`. Optional so a caller that does not select it still compiles.
   */
  stripeTransferId?: string | null;
};

export type PickCommandeOptions = {
  /**
   * V8 `Q8-08`. Add `hasStripeTransfer`, so a payout Revime is holding reads « Terminée ». It says
   * something about the RÉPARATEUR's payout setup, and `DemandeDto.commande` reaches réparateurs who
   * are not party to the order, so pass it only for the demande's author.
   */
  withTransfer?: boolean;
};

/**
 * A demande can hold SEVERAL commande rows: every abandoned checkout leaves one behind,
 * and `resolvePending` reaps rather than deletes. So "the demande's commande" is a
 * choice, not a lookup, and it lives here as a pure function so it is testable without
 * a database.
 *
 * A non-ABANDONED row wins, because at most one can exist - `resolvePending` refuses a
 * second live attempt. When every attempt was abandoned the newest is returned, which
 * `repairStatus()` maps to client index 0 anyway; returning it rather than null keeps
 * the shape honest about what the row actually says.
 *
 * Widened (CF4-12/13/14, design §4.2) to carry `commandeId`, `delivery` and
 * `disputeOpen` alongside `status`/`step` - every caller's select must supply these on
 * each row, `disputeOpen` via `isDisputeOpen` on the row's `dispute` relation.
 *
 * Widened again (CF4-D task 8, spec §6) with `partialRefund`, via `partialRefundOf` on
 * the row's own `status`/`refundedCents`/`totalCents` - every caller's select must now
 * also supply those two money columns.
 *
 * Widened again (CF4-I, spec §4.3) with `cancellationPending`, derived from
 * `cancellationRequestedAt !== null` - every caller's select must now also supply that column.
 */
export function pickCommande(rows: Row[], options: PickCommandeOptions = {}): ProgressCommande | null {
  if (rows.length === 0) return null;
  const toProgress = (r: Row): ProgressCommande => ({
    status: r.status,
    step: r.step,
    commandeId: r.id,
    delivery: r.delivery,
    disputeOpen: r.disputeOpen,
    partialRefund: partialRefundOf(r),
    cancellationPending: r.cancellationRequestedAt !== null,
    ...(options.withTransfer && r.stripeTransferId !== undefined
      ? { hasStripeTransfer: r.stripeTransferId !== null }
      : {}),
  });
  const live = rows.find((r) => r.status !== 'ABANDONED');
  if (live) return toProgress(live);
  const newest = [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  return newest ? toProgress(newest) : null;
}
