import { COMMANDE_STATUS_LABEL } from '@revime/shared';
import { frozenStepLabel } from './cancellation-admin';

/**
 * « Commandes à surveiller » row formatting. Pure, so it is testable without a DOM.
 * The values arrive as wire strings, so an unknown one falls back to itself rather than
 * rendering « undefined ».
 */
export function attentionStatusLabel(status: string): string {
  return (COMMANDE_STATUS_LABEL as Record<string, string>)[status] ?? status;
}

/**
 * Same wording as the payments table and the order page (shared `STEP_LABEL`).
 * Bug B12: If an order is refunded, escrow is closed, returning « — » regardless
 * of frozen step.
 */
export function attentionStepLabel(step: string | null, status?: string): string {
  if (status === 'REFUNDED') return '—';
  return frozenStepLabel(step);
}

export function attentionAmount(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/**
 * Bug B3: Generates the Stripe dashboard verification URL.
 * If a stripePaymentIntentId is present, links directly to the payment transaction.
 * Otherwise, falls back to a search query for the commandeId.
 */
export function getStripePaymentUrl(item: {
  stripePaymentIntentId?: string | null;
  commandeId: string;
}): string {
  if (item.stripePaymentIntentId) {
    return `https://dashboard.stripe.com/payments/${encodeURIComponent(item.stripePaymentIntentId)}`;
  }
  return `https://dashboard.stripe.com/search?query=${encodeURIComponent(item.commandeId)}`;
}

