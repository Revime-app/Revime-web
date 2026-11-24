/**
 * « il y a 5 min » - the age of a timestamp, in French, for a list row.
 *
 * Its own module rather than a helper inside a screen, for the reason `euros` and
 * `delayLabel` are shared: the réparateur feed, the nearby row on Accueil and anything
 * later that shows a demande's age must agree, and a second implementation is how they
 * stop agreeing.
 *
 * `now` is a REQUIRED parameter rather than a default of `new Date()`. Two reasons, and
 * the second is the load-bearing one: it makes every case above testable without faking
 * a clock, and `apps/mobile` cannot call `Date.now()` implicitly in a render path without
 * the value differing between two components rendering the same row in one frame.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Past this, a relative label stops being useful and starts being absurd - « il y a 400
 * jours » is worse than a date at conveying when something happened.
 */
const RELATIVE_LIMIT_DAYS = 30;

/**
 * dd/mm/yyyy, the French written order, built from the local date parts rather than
 * `toLocaleDateString`. Hermes ships a cut-down ICU and its locale output is not
 * guaranteed to be the same on device as it is in this test suite, so the format is
 * assembled explicitly instead of trusted.
 */
function frenchDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `le ${day}/${month}/${d.getFullYear()}`;
}

/**
 * Returns null when `iso` cannot be parsed, so a caller renders nothing rather than
 * « il y a NaN min ». A null is checkable; a NaN inside a template string is not.
 */
export function timeAgoLabel(iso: string, now: Date): string | null {
  const then = new Date(iso);
  const ms = then.getTime();
  if (Number.isNaN(ms)) return null;

  // Clamped, not signed. A negative age means the two clocks disagree, not that the row
  // is from the future, and there is no honest label for a time that has not happened.
  const elapsed = Math.max(0, now.getTime() - ms);

  if (elapsed < MINUTE_MS) return 'à l’instant';

  const minutes = Math.floor(elapsed / MINUTE_MS);
  if (minutes < 60) return `il y a ${minutes} min`;

  const hours = Math.floor(elapsed / HOUR_MS);
  // « h » is the French symbol and takes no plural, unlike « jours » below.
  if (hours < 24) return `il y a ${hours} h`;

  const days = Math.floor(elapsed / DAY_MS);
  if (days < RELATIVE_LIMIT_DAYS) return `il y a ${days} jour${days > 1 ? 's' : ''}`;

  return frenchDate(then);
}

/**
 * Does `iso` fall in the same CALENDAR month as `now`? Backs « ce mois » on the réparateur's
 * activity card.
 *
 * A calendar month rather than a rolling 30 days, because « ce mois » names something a user
 * can point at: on 2 September, a réparateur reads it as September, and a rolling window
 * would still be counting late August.
 *
 * The month is the DEVICE's, read through local getters, because a réparateur in Paris means
 * the month his phone shows him. That makes any instant within a few hours of a boundary
 * timezone-dependent by design - see this function's spec for why its cases are built from
 * local date parts rather than UTC literals.
 *
 * Both years are compared. Month alone would make August 2025 count as "this month" in
 * August 2026, so a réparateur's first month would reappear in his totals a year later.
 *
 * False for an unparseable value: a row whose date cannot be read must not be counted.
 */
export function isSameMonth(iso: string, now: Date): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}
