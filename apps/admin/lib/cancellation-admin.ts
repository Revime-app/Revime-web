import { STEP_LABEL, type CancellationRequestStatus } from '@revime/shared';

/**
 * CF4-27 (spec §4.5). Pure helpers for the « Annulations » dashboard - kept out of the page
 * component so they are testable without a DOM.
 */

/** The status labels the plan lists for the dashboard's tabs and history rows. */
const CANCELLATION_STATUS_LABEL: Record<CancellationRequestStatus, string> = {
  PENDING: 'En attente',
  APPROVED: 'Acceptée',
  REFUSED: 'Refusée',
  WITHDRAWN: 'Retirée par le client',
  SUPERSEDED: 'Remplacée par un litige',
};

export function cancellationStatusLabel(status: CancellationRequestStatus): string {
  return CANCELLATION_STATUS_LABEL[status];
}

/**
 * Reuses the shared `STEP_LABEL` map - the same wording the payments table and the order
 * details page already use, so the frozen step reads identically everywhere. `null` reads
 * « — »: a request can only be made once PAID (Task 4's guard), so this is unreachable in
 * practice, but a null step is a real value the type carries and the row must render
 * something honest rather than throw. `step` is typed as a wire `string` (matching
 * `AdminCancellationListItem`'s own field, wire-shaped like `AdminDisputeListItem.step`)
 * rather than `CommandeStep`, so an entry `STEP_LABEL` does not recognise falls back to the
 * raw value instead of throwing on a `Record` index miss.
 */
export function frozenStepLabel(step: string | null): string {
  if (step === null) return '—';
  return (STEP_LABEL as Record<string, string>)[step] ?? step;
}

/**
 * Spec §4.5: the drawer's warning sentence when the order's funds have already been
 * transferred to the réparateur - a refund from here will reverse that transfer.
 */
export function transferredWarning(item: { transferred: boolean }): string | null {
  if (!item.transferred) return null;
  return 'Les fonds ont déjà été versés : le remboursement annulera le virement.';
}
