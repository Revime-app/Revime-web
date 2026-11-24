import { parisDayStart, type TipCategory } from '@revime/shared';

/**
 * CF4-38 « Conseils du jour » (spec §4.3 / §4.4). Pure helpers - no React.
 *
 * The form works in CALENDAR DAYS (Europe/Paris); the API stores instants. The start is
 * 00:00 Paris of the chosen start day, the end is 00:00 Paris of the day AFTER the chosen end
 * day (endsAt is exclusive), so « au 15 oct. » keeps the tip showing all of 15 Oct.
 */

export const TIP_POOL_LABEL: Record<TipCategory, string> = {
  CLIENT: 'Clients',
  REPAIRER: 'Réparateurs',
  ALL: 'Tous',
};

const PARIS = 'Europe/Paris';
const dayMonth = new Intl.DateTimeFormat('fr-FR', { timeZone: PARIS, day: 'numeric', month: 'short' });
const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The last day an exclusive `endsAt` covers: one millisecond before it, on the Paris calendar. */
const lastDay = (endsAt: string) => new Date(Date.parse(endsAt) - 1);

const nextYmd = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export function periodLabel(startsAt: string | null, endsAt: string | null): string {
  const s = startsAt ? dayMonth.format(new Date(startsAt)) : null;
  const e = endsAt ? dayMonth.format(lastDay(endsAt)) : null;
  if (s && e) return `Du ${s} au ${e}`;
  if (s) return `À partir du ${s}`;
  if (e) return `Jusqu'au ${e}`;
  return 'Sans limite';
}

/** Form `<input type="date">` values (`''` = open) → the API's ISO instants. */
export function formDatesToInstants(start: string, end: string): { startsAt: string | null; endsAt: string | null } {
  return {
    startsAt: start ? parisDayStart(start).toISOString() : null,
    endsAt: end ? parisDayStart(nextYmd(end)).toISOString() : null,
  };
}

/** The inverse, to pre-fill the edit form. */
export function instantsToFormDates(startsAt: string | null, endsAt: string | null): { start: string; end: string } {
  return {
    start: startsAt ? ymd.format(new Date(startsAt)) : '',
    end: endsAt ? ymd.format(lastDay(endsAt)) : '',
  };
}
