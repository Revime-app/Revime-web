import { delayLabel, isVerified } from './offer.schemas.js';
import type { OfferDto } from './offer.schemas.js';

export type CompareCriterion = {
  /** French row label, and the identity of the criterion. */
  key: string;
  /** What the cell shows. Distinctness is judged on THIS, not on rank. */
  get: (o: OfferDto) => string;
  /** Lower is better. Equal for every offer means "not rankable". */
  rank: (o: OfferDto) => number;
};

/**
 * The single French money formatter for the app.
 * Euros with a French comma, and no ",00" when the amount is whole.
 */
export function euros(cents: number): string {
  const whole = cents % 100 === 0;
  return whole ? `${cents / 100} €` : `${(cents / 100).toFixed(2).replace('.', ',')} €`;
}

/**
 * Formats a rating with a French comma decimal separator.
 */
export function ratingLabel(rating: number): string {
  return String(rating).replace('.', ',');
}

/**
 * Normalises free-typed money input for a French keyboard: comma becomes a
 * dot, junk is stripped, only the FIRST dot survives, and at most two
 * decimals are kept.
 *
 * Two failures this prevents, both seen in this project: `Number('89,50')`
 * is NaN, which silently disables a submit button with no explanation; and
 * `89.5.5` is also NaN by the same route. Truncating rather than rounding
 * the third decimal keeps 89.999 from becoming 90,00 € on a real offer.
 */
export function normalisePriceInput(raw: string): string {
  const cleaned = raw.replace(',', '.').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  const whole = parts[0] ?? '';
  const rest = parts.slice(1);
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join('').slice(0, 2)}`;
}

/**
 * Sorts an offer with no value for a criterion LAST, and it MUST be finite.
 *
 * `Number.POSITIVE_INFINITY` stood here for Distance and it is a real bug, not a
 * stylistic one: `comparaison.tsx:40` sorts with `active.rank(a) - active.rank(b)`, so
 * two valueless offers make it compute `Infinity - Infinity`, which is `NaN` - and a
 * comparator returning `NaN` leaves `Array.prototype.sort` free to produce ANY order.
 * That is a non-deterministic list on the screen carrying this product's named
 * differentiator, and it is the ORDINARY case for Distance rather than an edge one: a
 * null distance needs only a réparateur with no postal code, which is every réparateur
 * today.
 *
 * A large finite sentinel makes two valueless offers compare EQUAL, which is a stable
 * order. `MAX_SAFE_INTEGER` rather than a hand-picked magnitude: it exceeds any rating
 * (at most 5) or any distance in kilometres this app can produce, and subtracting it
 * from itself is exactly 0.
 *
 * EXPORTED in Étape 4b piece C, whose directory sorts on the same nullable rating.
 * Exported rather than re-declared so the two surfaces cannot disagree about where an
 * unrated réparateur belongs, which is the same argument NO_REPAIRER_STATS makes about
 * what « no reviews » looks like.
 */
export const NO_VALUE = Number.MAX_SAFE_INTEGER;

const ALL: (CompareCriterion & { has: (o: OfferDto) => boolean })[] = [
  {
    key: 'Prix',
    get: (o) => euros(o.priceCents),
    rank: (o) => o.priceCents,
    has: () => true,
  },
  {
    key: 'Note',
    // One decimal with a French comma, and « - » for unrated exactly as Distance
    // renders its own absence. A 0 here would read as a catastrophic rating rather
    // than an absent one, which is why `rating` is nullable and never zeroed.
    get: (o) => (o.rating === null ? '-' : ratingLabel(o.rating)),
    // Negated because higher is better and `rank` is lower-is-better. An unrated
    // réparateur sorts LAST, which is conventional and merit-based: spec §7's rule is
    // about VERIFICATION level, a different axis, and nothing here folds the two
    // together or weights the rating by `reviewCount`.
    rank: (o) => (o.rating === null ? NO_VALUE : -o.rating),
    // Keeps unrated offers out of the separability test, so a set where nobody is
    // rated shows no Note row at all rather than a column of « - ».
    has: (o) => o.rating !== null,
  },
  {
    key: 'Délai',
    get: (o) => delayLabel(o.delayHours),
    rank: (o) => o.delayHours,
    has: () => true,
  },
  {
    key: 'Distance',
    get: (o) => (o.distanceKm === null ? '-' : `${String(o.distanceKm).replace('.', ',')} km`),
    rank: (o) => o.distanceKm ?? NO_VALUE,
    has: (o) => o.distanceKm !== null,
  },
  {
    key: 'Déplacement',
    get: (o) => (o.travel === 'HOME' ? 'À domicile' : 'En atelier'),
    // Deliberately unrankable: neither mode is objectively better, so
    // Comparaison must never crown a winner on this row.
    rank: () => 0,
    has: () => true,
  },
  {
    key: 'Vérifié',
    // « Oui » rather than the badge's own label, deliberately. The two badges are
    // equal, so printing « Professionnel vérifié » beside « Réparateur vérifié »
    // in a table that bolds a winner per row would read as one being better -
    // and by tying instead, this row simply drops out when both are verified,
    // which is the honest statement.
    get: (o) => (isVerified(o) ? 'Oui' : 'Non'),
    rank: (o) => (isVerified(o) ? 0 : 1),
    has: () => true,
  },
  {
    key: 'Nb de réparations',
    get: (o) => String(o.repairCount),
    rank: (o) => -o.repairCount,
    // No null case, deliberately, and this is the difference from Note: 0 is a TRUE
    // and meaningful value for a count, whereas a rating of 0 is not a rating. So the
    // row needs no `has` filter and disappears on its own the day it cannot separate
    // anyone - with every count at 0 the values are identical and the second condition
    // below drops it. That is production on the day this ships.
    has: () => true,
  },
];

/**
 * A criterion is shown only when it can actually separate these offers.
 *
 * Two conditions, both necessary:
 *   1. at least two offers have a value for it, and
 *   2. those values are not all identical.
 *
 * That single rule is why part 2 needs no hardcoded list of "criteria to hide".
 * Vérifié ties at "Non" until Étape 3b verifies someone; Note is absent for anyone
 * unrated and réparations ties at 0 until a repair completes. Each row then appears on
 * its own the moment its data starts to differ.
 *
 * This comment used to claim that Note and réparations needed "no code change in 3b or
 * Étape 5". That was FALSE - they had no entry in `ALL` at all, so Étape 5 piece 3
 * added exactly the code change the comment promised it would not. Corrected in the
 * commit that added the two rows, per this project's own constraint that a comment
 * asserting more than the code delivers is itself the defect.
 *
 * It also handles the ordinary case where three réparateurs happen to quote the
 * same delay: that row simply drops out rather than showing a column nobody can
 * choose on.
 */
export function visibleCriteria(offers: OfferDto[]): CompareCriterion[] {
  if (offers.length < 2) return [];

  return ALL.filter((c) => {
    const values = offers.filter((o) => c.has(o)).map((o) => c.get(o));
    if (values.length < 2) return false;
    return new Set(values).size > 1;
  }).map(({ key, get, rank }) => ({ key, get, rank }));
}
