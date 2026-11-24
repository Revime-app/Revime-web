import { euros, type RefundMotif } from '@revime/shared';

/**
 * CF4-D task 7 (spec §5). Pure logic behind `RefundForm` - no React, so it is unit
 * tested directly (`test/refund-form.spec.ts`) without mounting a component.
 */

/**
 * Parses a French euro amount typed by the operator into integer cents.
 *
 * MONEY PATH: string arithmetic only, never `parseFloat(input) * 100` - a float
 * multiply can land a cent off (e.g. `0.1 + 0.2 !== 0.3`), and this number is what
 * Stripe moves. Accepts a single `,` or `.` separator, 0-2 fraction digits, no
 * spaces, no thousands separator, no sign. Anything else (a second separator,
 * stray characters, a 3rd fraction digit) is a `null` - the caller shows a
 * per-field error rather than guessing what the operator meant.
 */
export function parseEuros(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Reject anything but digits and at most one `,`/`.` up front - this also
  // rejects a leading `-` (no sign allowed) and spaces (no thousands separator).
  // The separator, when present, must be followed by at least one fraction digit
  // (`\d{1,2}`, not `\d{0,2}`): "5." is an unfinished amount, not "5,00" - the
  // operator has not typed the fraction yet, and this money-path input should not
  // silently guess. "5" (no separator at all) is unaffected and still means 5,00 €.
  if (!/^\d+([.,]\d{1,2})?$/.test(trimmed)) return null;

  const separatorMatch = trimmed.match(/[.,]/);
  if (!separatorMatch) {
    // Whole euros only, e.g. "80".
    return Number(trimmed) * 100;
  }

  const separatorIndex = separatorMatch.index!;
  const wholePart = trimmed.slice(0, separatorIndex);
  const fractionPart = trimmed.slice(separatorIndex + 1);

  // Pad a single fraction digit ("12,5" -> "50" cents), leave two as-is.
  const paddedFraction = fractionPart.padEnd(2, '0');

  const wholeCents = Number(wholePart) * 100;
  const fractionCents = Number(paddedFraction);
  return wholeCents + fractionCents;
}

/**
 * Re-export point for the shared French formatter (Ruling R3), so every caller in
 * this module imports money formatting from one place. Whole amounts render like
 * "80 €" (no ",00") - `euros()` already does this.
 */
export function formatEuros(cents: number): string {
  return euros(cents);
}

/**
 * The three amounts as the operator typed them (comma form the parser accepts),
 * pre-filled from a `suggestedRefund()` result. `8000` -> `"80,00"`.
 */
export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export type RefunderVerb = 'versés' | 'conservés' | 'repris';

export interface RefundSummaryInput {
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
}

export interface OrderForSummary {
  repairCents: number;
  transferred: boolean;
  shippingCents: number;
  insuranceCents: number;
  protectionCents: number;
}

export interface RefundSummary {
  clientCents: number;
  repairerCents: number;
  repairerVerb: RefunderVerb;
  revimeKeepsCents: number;
}

/**
 * The live summary lines shown above the confirmation (spec §5): what the client
 * gets back, what the réparateur ends up with and how, and what REVIME keeps.
 *
 * Mirrors the API's `refundPlan` table (spec §3) purely for display - it does not
 * call Stripe and it is not the source of truth for what actually moves; the
 * server re-derives and enforces the real ceilings and movements.
 */
export function refundSummary(amounts: RefundSummaryInput, order: OrderForSummary): RefundSummary {
  const clientCents = amounts.repairCents + amounts.shippingCents + amounts.protectionCents;
  const repairerCents = order.repairCents - amounts.repairCents;

  let repairerVerb: RefunderVerb;
  if (!order.transferred) {
    // Not yet paid: the réparateur's share (if any) is transferred now.
    repairerVerb = 'versés';
  } else if (repairerCents > 0) {
    // Already paid, partial refund of his repair share: nothing is clawed back
    // beyond X, so he keeps the rest.
    repairerVerb = 'conservés';
  } else {
    // Already paid, full refund of the repair (X = repair): the whole transfer is
    // reversed, so he ends up with nothing of it - "repris" (taken back).
    repairerVerb = 'repris';
  }

  const revimeKeepsCents =
    order.shippingCents + order.insuranceCents - amounts.shippingCents + (order.protectionCents - amounts.protectionCents);

  return { clientCents, repairerCents, repairerVerb, revimeKeepsCents };
}

export interface RefundFormFields {
  motif: RefundMotif | '';
  note: string;
  repairInput: string;
  shippingInput: string;
  protectionInput: string;
}

export interface RefundFormFieldErrors {
  motif?: string;
  note?: string;
  repair?: string;
  shipping?: string;
  protection?: string;
}

export interface RefundBodySnapshot {
  motif: RefundMotif;
  note: string;
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
}

export type BuildRefundBodyResult =
  | { ok: true; body: RefundBodySnapshot }
  | { ok: false; errors: RefundFormFieldErrors };

/**
 * Validates the operator's raw field strings against the order's ceilings and,
 * on success, returns the exact body `onSubmit` will post - the frozen
 * "snapshot" the confirmation step shows and Confirmer sends unchanged.
 *
 * Pure and side-effect free on purpose: `RefundForm` calls this once when the
 * operator first submits (review step) and keeps the returned `body` in state
 * for the confirmation line and the eventual POST, so editing an input afterwards
 * cannot change what Confirmer sends without going through this function again
 * (which the component only does by returning to the editing step).
 */
export function buildRefundBody(fields: RefundFormFields, order: OrderForSummary): BuildRefundBodyResult {
  const errors: RefundFormFieldErrors = {};
  const shippingCeilingCents = order.shippingCents + order.insuranceCents;

  const parsedRepair = parseEuros(fields.repairInput);
  const parsedShipping = parseEuros(fields.shippingInput);
  const parsedProtection = parseEuros(fields.protectionInput);

  if (fields.motif === '') {
    errors.motif = 'Motif requis.';
  }
  if (fields.note.trim().length < 3) {
    errors.note = 'Justification requise (au moins 3 caractères).';
  }
  if (parsedRepair === null || parsedRepair > order.repairCents) {
    errors.repair = `Montant invalide (max ${formatEuros(order.repairCents)}).`;
  }
  if (parsedShipping === null || parsedShipping > shippingCeilingCents) {
    errors.shipping = `Montant invalide (max ${formatEuros(shippingCeilingCents)}).`;
  }
  if (parsedProtection === null || parsedProtection > order.protectionCents) {
    errors.protection = `Montant invalide (max ${formatEuros(order.protectionCents)}).`;
  }
  if (
    Object.keys(errors).length === 0 &&
    (parsedRepair ?? 0) + (parsedShipping ?? 0) + (parsedProtection ?? 0) <= 0
  ) {
    errors.repair = 'Le remboursement doit être supérieur à 0 €.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  // Non-null: every error branch above that could leave a parsed value null also
  // set a field error, so reaching here means all three parsed to a number.
  return {
    ok: true,
    body: {
      motif: fields.motif as RefundMotif,
      note: fields.note.trim(),
      repairCents: parsedRepair as number,
      shippingCents: parsedShipping as number,
      protectionCents: parsedProtection as number,
    },
  };
}

/**
 * Resolves the target commande ID from search parameters for /remboursement.
 * Supports canonical `commande` param as well as fallback `id` param (Bug B1 fix).
 */
export function resolveRefundCommandeId(searchParams: { get(key: string): string | null } | URLSearchParams): string {
  return searchParams.get('commande') ?? searchParams.get('id') ?? '';
}

/**
 * Determines whether an order is eligible for refund.
 * Only orders with status 'PAID' can be refunded (Bug B2 fix).
 */
export function isOrderRefundable(status: string): boolean {
  return status === 'PAID';
}

/**
 * Returns a human-readable explanation when an order cannot be refunded due to its status.
 */
export function getUnrefundableReason(status: string): string {
  switch (status) {
    case 'PENDING_PAYMENT':
      return 'Cette commande est en attente de paiement (non payée). Seules les commandes payées peuvent être remboursées.';
    case 'ABANDONED':
      return 'Cette commande a été abandonnée sans paiement. Seules les commandes payées peuvent être remboursées.';
    case 'REFUNDED':
      return 'Cette commande a déjà été remboursée.';
    default:
      return `Cette commande n'a pas été payée (statut : ${status}). Seules les commandes payées peuvent être remboursées.`;
  }
}
