import { DEMO_EMAIL_SUFFIX } from '../admin/admin-constants.js';

/**
 * CF4-37 (spec L2). A review is demo when its author OR its réparateur is a seeded demo
 * account: a demo réparateur's review is fictitious even when a real client wrote it, because
 * no real repair backs the relationship. DERIVED, no column.
 *
 * Case-insensitive, unlike the admin user list's marker: an e-mail's domain is
 * case-insensitive, and a demo review shown as real is the failure the charter (§21) forbids.
 */
export function isDemoReview(authorEmail: string, repairerEmail: string): boolean {
  const suffix = DEMO_EMAIL_SUFFIX.toLowerCase();
  return authorEmail.toLowerCase().endsWith(suffix) || repairerEmail.toLowerCase().endsWith(suffix);
}

/**
 * PRE-2 (« de faux avis visibles du public sont une pratique commerciale trompeuse »): `isDemoReview`
 * as a query filter, so that a demo review is neither listed NOR counted in a rating. Every PUBLIC
 * review read spreads this: the list (`ReviewsService.listForRepairer`) and the aggregate
 * (`repairerStats`, read by the offers, favourites and fiche screens). The admin moderation list
 * deliberately does not: an operator must see a demo review, flagged, to hide or restore it.
 */
export const NOT_DEMO_REVIEW_WHERE = {
  author: { email: { not: { endsWith: DEMO_EMAIL_SUFFIX }, mode: 'insensitive' as const } },
  repairer: { email: { not: { endsWith: DEMO_EMAIL_SUFFIX }, mode: 'insensitive' as const } },
};
