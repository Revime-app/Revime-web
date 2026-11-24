/**
 * CF4-19 (task 7 brief). Pure formatters behind `RefundDetailDrawer` - no React,
 * so they are unit tested directly without mounting the drawer.
 */

/**
 * The drawer's payment-method line: "Visa •••• 4242" with the brand capitalised
 * (Stripe returns it lowercase, e.g. "visa"), or "Indisponible" when either the
 * gateway read failed (`available: false`) or the brand itself is null - the
 * brief's two conditions for the fallback are combined here rather than left for
 * each caller to re-derive.
 */
export function formatCardMethod(stripe: {
  cardBrand: string | null;
  cardLast4: string | null;
  available: boolean;
}): string {
  if (!stripe.available || stripe.cardBrand === null) {
    return 'Indisponible';
  }
  const brand = stripe.cardBrand.charAt(0).toUpperCase() + stripe.cardBrand.slice(1);
  const last4 = stripe.cardLast4 ?? '????';
  return `${brand} •••• ${last4}`;
}

/** The brief's exact Stripe refund status mapping, first match wins. */
const STRIPE_REFUND_STATUS_LABEL: Record<string, string> = {
  succeeded: 'Effectué',
  pending: 'En attente',
  requires_action: 'Action requise',
  failed: 'Échoué',
  canceled: 'Annulé',
};

/**
 * The drawer's "Statut Stripe" line. `null` (no refund status recorded) or an
 * unavailable gateway read both fall back to "Indisponible", same as the card
 * method - either is "we don't know", not a status value of its own.
 */
export function formatStripeRefundStatus(stripe: { refundStatus: string | null; available: boolean }): string {
  if (!stripe.available || stripe.refundStatus === null) {
    return 'Indisponible';
  }
  return STRIPE_REFUND_STATUS_LABEL[stripe.refundStatus] ?? 'Indisponible';
}
