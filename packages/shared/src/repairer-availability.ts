import { z } from 'zod';

/**
 * `CF-52`. A réparateur's weekly opening hours.
 *
 * Minutes from midnight rather than `"09:00"` strings, and that is a data-integrity choice
 * rather than a style one: there is nothing to normalise, `"9:00"` versus `"09:00"` cannot
 * happen, comparison is arithmetic, and if « ouvert maintenant » is ever wanted the column is
 * already the right shape for it. The display strings are built here so no screen invents its
 * own format.
 */

/** 1440 is midnight at the END of the day, which is why a closing time may equal it. */
export const MINUTES_MAX = 1440;

export const DAYS_IN_WEEK = 7;

/**
 * ISO-8601 weekday numbering: 1 = lundi … 7 = dimanche.
 *
 * 🛑 NOT JavaScript's `Date.getDay()`, which is 0-based and Sunday-first. The fiche renders a
 * Monday-first French week, and an off-by-one between the two conventions is invisible to
 * `tsc`, to `typecheck` and to every other gate this repo has.
 */
export type DayOfWeek = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * 🛑 A PLAIN LITERAL WITH NO `as Record<DayOfWeek, string>` CAST. The cast satisfies the
 * annotation, so `tsc` would exit 0 with a day missing - a totality gate that cannot fail.
 * Written this way, dropping a day is a compile error. Same rule `category-icons.ts` records.
 */
export const DAY_LABELS_FR: Record<DayOfWeek, string> = {
  1: 'Lundi',
  2: 'Mardi',
  3: 'Mercredi',
  4: 'Jeudi',
  5: 'Vendredi',
  6: 'Samedi',
  7: 'Dimanche',
};

export type AvailabilityDay = {
  dayOfWeek: number;
  closed: boolean;
  opensAt: number | null;
  closesAt: number | null;
};

/**
 * The Zod mirror of migration 29's `RepairerAvailability_hours` CHECK. Both exist on purpose:
 * this one produces a French message the réparateur reads, the constraint makes the bad row
 * impossible whatever writes it.
 */
export const availabilityDaySchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(DAYS_IN_WEEK, { message: 'Jour invalide.' }),
    closed: z.boolean(),
    opensAt: z.number().int().min(0).max(MINUTES_MAX).nullable(),
    closesAt: z.number().int().min(0).max(MINUTES_MAX).nullable(),
  })
  .refine(
    (d) =>
      d.closed
        ? d.opensAt === null && d.closesAt === null
        : d.opensAt !== null && d.closesAt !== null && d.opensAt < d.closesAt,
    { message: 'Horaires invalides.' },
  );

/**
 * SEVEN DAYS OR NONE, nothing partial - so the fiche's rendering is total over the week and
 * « missing Wednesday » cannot occur. An empty array is how hours are cleared, and it is
 * distinguishable from seven closed days: no rows means « has not answered », seven closed
 * rows means « closed all week ». The fiche renders those differently.
 *
 * `{ days: [...] }` rather than a bare array body, matching
 * `updateRepairerCategoriesSchema`'s `{ categoryIds: [...] }`.
 */
export const updateAvailabilitySchema = z.object({
  days: z
    .array(availabilityDaySchema)
    .refine((ds) => ds.length === 0 || ds.length === DAYS_IN_WEEK, {
      message: 'Indiquez les sept jours de la semaine.',
    })
    .refine((ds) => new Set(ds.map((d) => d.dayOfWeek)).size === ds.length, {
      message: 'Un jour est renseigné deux fois.',
    }),
});

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

/**
 * « 09h », « 09h30 ». French convention, so no `:` and no minutes when they are zero.
 *
 * `MINUTES_MAX` renders « 24h » rather than « 00h »: as a CLOSING time it means the end of
 * the day, and « 09h – 00h » reads as a range that ends before it starts.
 */
export function formatMinutes(m: number): string {
  if (m === MINUTES_MAX) return '24h';
  const hours = Math.floor(m / 60);
  const minutes = m % 60;
  const hh = String(hours).padStart(2, '0');
  return minutes === 0 ? `${hh}h` : `${hh}h${String(minutes).padStart(2, '0')}`;
}

/**
 * One row's right-hand text.
 *
 * The null check is NOT redundant with `closed`: an app newer than the API, or a row written
 * before the CHECK existed, can present a non-closed day with no hours, and interpolating null
 * into the range would render « NaNh – NaNh ». Absence collapses to « Fermé », which is the
 * safe reading - it under-promises rather than inventing hours.
 */
export function formatDayHours(d: AvailabilityDay): string {
  if (d.closed || d.opensAt === null || d.closesAt === null) return 'Fermé';
  return `${formatMinutes(d.opensAt)} – ${formatMinutes(d.closesAt)}`;
}
