import type { OfferListItem } from './offer.schemas.js';

/**
 * Lifted out of `apps/mobile/app/mes-propositions.tsx` on 2026-08-25, where it was a
 * PRIVATE const. It moved for the same reason `demande-status.ts` was created: a second
 * copy of a status map is how one of them comes to disagree with the other.
 *
 * A withdrawn offer stays in the réparateur's list, marked. Since piece C the client's
 * view keeps it too, under « Offres retirées ». ACCEPTED and REJECTED are now reachable
 * - the accept-and-pay stage exists - but the map must be total regardless.
 */
export const OFFER_STATUS_LABEL: Record<OfferListItem['status'], string> = {
  SENT: 'Envoyée',
  ACCEPTED: 'Acceptée',
  REJECTED: 'Non retenue',
  WITHDRAWN: 'Retirée',
};

/** `Badge`'s three tones only. A Record rather than a ternary, which invited 'green'. */
export const OFFER_STATUS_TONE: Record<
  OfferListItem['status'],
  'verified' | 'neutral' | 'amber'
> = {
  SENT: 'amber',
  ACCEPTED: 'verified',
  REJECTED: 'neutral',
  WITHDRAWN: 'neutral',
};
