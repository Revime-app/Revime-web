export type Coords = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/**
 * Great-circle distance in kilometres, or null when either end is unlocated.
 *
 * Null is a first-class result rather than an error: a demande whose postal code
 * could not be geocoded must still be publishable and listable, so every caller
 * has to handle an absent distance anyway.
 */
export function distanceKm(a: Coords | null, b: Coords | null): number | null {
  if (!a || !b) return null;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Nulls last, so a row with no coordinates never masquerades as the nearest one.
 *
 * 🆕 `CF-34`. Lifted out of `demandes.service.ts`'s `byDistance` and generalised from
 * `FeedItem` to two nullable numbers, because the réparateur directory now needs the identical
 * ordering. ONE definition rather than two: a four-branch comparator copied into a second file
 * drifts with no compiler error, which is the hazard `directoryWhere` and `CARD_SELECT` already
 * exist to prevent, and the roadmap already carries a follow-up about eight copies of one
 * predicate.
 *
 * 🛑 IT BRANCHES RATHER THAN RANKING THROUGH A SENTINEL, AND THAT IS THE SAFER FORM ON PURPOSE.
 * `NO_VALUE`'s documented hazard is that `rank(a) - rank(b)` can subtract two sentinels and
 * yield NaN, which puts the result outside what `Array.prototype.sort` guarantees. A comparator
 * that returns early on null never performs that subtraction. `NO_VALUE` stays correct for the
 * RATING sort, which genuinely does the arithmetic - it simply has no role in distance.
 */
export function byDistanceKm(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a - b;
}
