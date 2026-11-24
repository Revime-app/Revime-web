import type { CommandeStatus } from '@revime/shared';

/**
 * Thrown when the admin's requested amounts do not fit the order, or sum to
 * zero. Message is French, shown to the admin. See spec §3.
 */
export class RefundPlanError extends Error {}

export type RefundAmounts = {
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
};

export type RefundOrder = {
  repairCents: number;
  shippingCents: number;
  insuranceCents: number;
  protectionCents: number;
  stripeTransferId: string | null;
  transferredCents: number | null;
};

export type RefundPlan = {
  refundCents: number;
  reverseFirst: boolean;
  reverseCents: number;
  transferCents: number;
  needsPayabilityCheck: boolean;
};

/**
 * Pure, so the money-shaped decision is testable with no database - the same
 * reasoning that puts `lineItems` and `summarise` outside the Stripe driver class
 * in `payments/gateway.ts`.
 *
 * `reverse_transfer` is not an option here: it is a destination-charge parameter,
 * and with separate charges and transfers a refund does not touch the transfer at
 * all. Reverse BEFORE refund when a reversal is due - the refund is paid from the
 * platform balance and the reversal is what funds it, so doing it the other way
 * round leaves the platform covering the refund out of its own money in the
 * window between the two calls. See spec §3.
 */
export function refundPlan(a: RefundAmounts, o: RefundOrder): RefundPlan {
  // Ceilings first (repair, livraison, protection, in that order), then the
  // zero-total check. See CF4-15 / CF4-33 and spec §3.
  if (a.repairCents < 0 || a.repairCents > o.repairCents) {
    throw new RefundPlanError('Le montant de la réparation dépasse le montant payé.');
  }
  if (a.shippingCents < 0 || a.shippingCents > o.shippingCents + o.insuranceCents) {
    throw new RefundPlanError('Le montant de la livraison dépasse le montant payé.');
  }
  if (a.protectionCents < 0 || a.protectionCents > o.protectionCents) {
    throw new RefundPlanError('Le montant de la Protection REVIME dépasse le montant payé.');
  }
  const refundCents = a.repairCents + a.shippingCents + a.protectionCents;
  if (refundCents <= 0) {
    throw new RefundPlanError('Le remboursement doit être supérieur à 0 €.');
  }

  // "Already paid" = a transfer id set AND an amount actually recorded for it.
  // A transfer id with no recorded amount is a row we do not understand:
  // reversing repairCents instead would claw back a figure nobody wrote down,
  // and transferredCents exists precisely so a historical row reports what was
  // actually paid. Refund the client either way; leave the clawback to a human.
  const reverseFirst =
    o.stripeTransferId !== null && o.transferredCents !== null && a.repairCents > 0;
  const reverseCents = reverseFirst ? Math.min(a.repairCents, o.transferredCents ?? 0) : 0;

  // Not yet paid and X < repair: the unrefunded part goes to the réparateur by
  // transfer, but only once the refund succeeds and payability is confirmed.
  const alreadyPaid = o.stripeTransferId !== null;
  const transferCents =
    !alreadyPaid && a.repairCents < o.repairCents ? o.repairCents - a.repairCents : 0;

  return {
    refundCents,
    reverseFirst,
    reverseCents,
    transferCents,
    needsPayabilityCheck: transferCents > 0,
  };
}

export type PartialRefundRow = {
  status: CommandeStatus;
  refundedCents: number | null;
  totalCents: number;
};

/**
 * CF4-D task 8 (spec §6). True when a REFUNDED commande's refund was a flexible
 * PARTIAL one - refunded strictly less than the total paid. Used at the four
 * `disputeOpen: isDisputeOpen(...)` facts sites so `ProgressCommande.partialRefund`
 * / `RepairFacts['commande'].partialRefund` can flip `repairStatus()`'s exit wording
 * to « Remboursée partiellement ». `refundedCents === null` (never refunded, or a
 * legacy row with no amount recorded) reads as a full refund, same reasoning as
 * those two optional fields' own doc comments.
 */
export function partialRefundOf(r: PartialRefundRow): boolean {
  if (r.status !== 'REFUNDED') return false;
  if (r.refundedCents === null) return false;
  return r.refundedCents < r.totalCents;
}

export type ShareOwedRow = {
  status: CommandeStatus;
  repairCents: number;
  refundRepairCents: number | null;
  stripeTransferId: string | null;
};

/**
 * The réparateur's share still owed after a refund: repair − refunded repair,
 * only when the order was refunded with a breakdown recorded and no transfer
 * (or reversal) has moved money for it yet. Derived, no column - spec §3.
 */
export function shareOwedCents(r: ShareOwedRow): number {
  if (r.status !== 'REFUNDED') return 0;
  if (r.refundRepairCents === null) return 0;
  if (r.stripeTransferId !== null) return 0;
  return r.repairCents - r.refundRepairCents;
}

export type ReversalExpectedRow = {
  status: CommandeStatus;
  repairCents: number;
  refundRepairCents: number | null;
  stripeTransferId: string | null;
  transferredCents: number | null;
  stripeTransferReversalId: string | null;
};

/**
 * Replaces the attention list's `REVERSAL_FAILED` predicate. That predicate
 * today is only `status = REFUNDED AND stripeTransferId != null AND
 * stripeTransferReversalId = null` (cron.service.ts) - it does not look at
 * transferredCents or refundRepairCents at all, so it flags EVERY such row,
 * legacy or not.
 *
 * We can only replace it with the arithmetic check when we have both halves
 * of the picture: a recorded breakdown (`refundRepairCents`) AND a recorded
 * transferred amount (`transferredCents`). If either is null, this is a row
 * we cannot account for - same reasoning as `refundPlan`'s "a transfer id
 * without an amount is a row we do not understand" - and dropping it from the
 * attention list would hide a real, already-anticipated state
 * (refund.service.ts logs a warning for exactly this shape) on a money
 * question the spec requires stay surfaced. So: refundRepairCents === null OR
 * transferredCents === null -> true, unconditionally, matching today's
 * predicate exactly for those rows. transferredCents === 0 is a *recorded*
 * amount (not missing), but with refundRepairCents still null there is no
 * breakdown to reconcile against, so the same legacy rule applies. Only when
 * both values are present does the arithmetic
 * (transferredCents + refundRepairCents > repairCents) decide it. See spec
 * §3, CF4-15 / CF4-33.
 */
export function reversalExpected(r: ReversalExpectedRow): boolean {
  if (r.status !== 'REFUNDED') return false;
  if (r.stripeTransferId === null) return false;
  if (r.stripeTransferReversalId !== null) return false;
  if (r.refundRepairCents === null || r.transferredCents === null) return true;
  return r.transferredCents + r.refundRepairCents > r.repairCents;
}
