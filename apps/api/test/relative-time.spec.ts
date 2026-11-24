import { describe, expect, it } from 'vitest';
import { isSameMonth, timeAgoLabel } from '@revime/shared';

/**
 * A fixed "now" rather than `new Date()`, so these assertions mean the same thing in
 * five years. Every case below is expressed as an offset from it.
 */
const NOW = new Date('2026-08-20T12:00:00.000Z');

/** `n` units before NOW, as the ISO string the API actually returns. */
function ago(ms: number): string {
  return new Date(NOW.getTime() - ms).toISOString();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('timeAgoLabel', () => {
  it('reads « à l’instant » under a minute, because « il y a 0 min » is not French', () => {
    expect(timeAgoLabel(ago(0), NOW)).toBe('à l’instant');
    expect(timeAgoLabel(ago(59_000), NOW)).toBe('à l’instant');
  });

  it('counts whole minutes up to the hour', () => {
    expect(timeAgoLabel(ago(MIN), NOW)).toBe('il y a 1 min');
    expect(timeAgoLabel(ago(5 * MIN), NOW)).toBe('il y a 5 min');
    expect(timeAgoLabel(ago(59 * MIN), NOW)).toBe('il y a 59 min');
  });

  it('counts whole hours up to the day, and « 1 h » has no plural', () => {
    expect(timeAgoLabel(ago(HOUR), NOW)).toBe('il y a 1 h');
    expect(timeAgoLabel(ago(23 * HOUR), NOW)).toBe('il y a 23 h');
  });

  it('counts days, and pluralises « jours » but not « jour »', () => {
    expect(timeAgoLabel(ago(DAY), NOW)).toBe('il y a 1 jour');
    expect(timeAgoLabel(ago(2 * DAY), NOW)).toBe('il y a 2 jours');
    expect(timeAgoLabel(ago(29 * DAY), NOW)).toBe('il y a 29 jours');
  });

  /**
   * NOW is anchored at 12:00 UTC on purpose. The date parts come from the LOCAL calendar,
   * which is what a user should see, so a midnight anchor would make these two assertions
   * depend on the machine's timezone. A midday one holds from UTC-11 to UTC+11.
   */
  it('stops counting days at 30 and gives a date instead, so nothing reads « il y a 400 jours »', () => {
    expect(timeAgoLabel(ago(30 * DAY), NOW)).toBe('le 21/07/2026');
    expect(timeAgoLabel(ago(400 * DAY), NOW)).toBe('le 16/07/2025');
  });

  /**
   * A demande created a second in the future is not a hypothetical: the API stamps
   * `createdAt` from the DATABASE clock and this label is rendered against the PHONE's,
   * so any clock skew at all produces a negative age. « il y a -1 min » is the visible
   * result, and clamping to the floor label is the only honest thing a formatter can do
   * without inventing a time.
   */
  it('clamps a future timestamp rather than rendering a negative age', () => {
    expect(timeAgoLabel(new Date(NOW.getTime() + 5 * MIN).toISOString(), NOW)).toBe(
      'à l’instant',
    );
  });

  it('returns null for an unparseable value instead of « il y a NaN min »', () => {
    expect(timeAgoLabel('not-a-date', NOW)).toBeNull();
    expect(timeAgoLabel('', NOW)).toBeNull();
  });
});

/**
 * Backs « ce mois » on the réparateur's activity card. Calendar month, not a rolling
 * 30 days: « ce mois » names the month a user can point at on a calendar, so on the 2nd of
 * September it must NOT still be counting the 25th of August.
 */
describe('isSameMonth', () => {
  /**
   * 🛑 The month is the DEVICE's local one, not UTC, and these cases are built from local
   * date parts for that reason rather than from UTC literals.
   *
   * Local is the correct semantics - a réparateur in Paris means the month his phone shows
   * him - but it makes any UTC instant near a boundary ambiguous. `2026-08-31T22:00:00Z` is
   * already 1 September on this machine (UTC+5:30), so asserting it as August would pin the
   * developer's timezone into the suite and fail in France. `localNoon` sidesteps that: noon
   * local is the same local day in every timezone on earth.
   */
  function localNoon(year: number, month1: number, day: number): string {
    return new Date(year, month1 - 1, day, 12, 0, 0).toISOString();
  }

  it('is true anywhere within the same calendar month, first day to last', () => {
    expect(isSameMonth(localNoon(2026, 8, 1), NOW)).toBe(true);
    expect(isSameMonth(localNoon(2026, 8, 20), NOW)).toBe(true);
    expect(isSameMonth(localNoon(2026, 8, 31), NOW)).toBe(true);
  });

  it('is false for the previous month even one day earlier', () => {
    expect(isSameMonth(localNoon(2026, 7, 31), NOW)).toBe(false);
  });

  it('is false for the next month', () => {
    expect(isSameMonth(localNoon(2026, 9, 1), NOW)).toBe(false);
  });

  /**
   * The one this exists to pin. Comparing the month alone makes August 2025 count as "this
   * month" in August 2026 - a réparateur's first month would silently reappear in his
   * totals a year later.
   */
  it('is false for the same month in a different YEAR', () => {
    expect(isSameMonth(localNoon(2025, 8, 20), NOW)).toBe(false);
    expect(isSameMonth(localNoon(2027, 8, 20), NOW)).toBe(false);
  });

  it('is false for an unparseable value rather than counting it', () => {
    expect(isSameMonth('not-a-date', NOW)).toBe(false);
    expect(isSameMonth('', NOW)).toBe(false);
  });
});
