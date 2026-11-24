import { z } from 'zod';

/**
 * CF4-38 « Conseils du jour » (spec L5, §4.2). The tip rules shared by the app's
 * `GET /tips/daily` and the admin list, so the dashboard's « Aujourd'hui » line and the app
 * run the SAME selection and cannot disagree.
 *
 * Days are Europe/Paris calendar days (DST-correct), not UTC days: a tip « jusqu'au 31 oct. »
 * must still show at 23:30 Paris on 31 Oct.
 */

export const tipCategorySchema = z.enum(['CLIENT', 'REPAIRER', 'ALL']);
export type TipCategory = z.infer<typeof tipCategorySchema>;

export const tipStateSchema = z.enum(['ACTIVE', 'SCHEDULED', 'EXPIRED', 'DISABLED']);
export type TipState = z.infer<typeof tipStateSchema>;

export const TIP_STATE_LABEL: Record<TipState, string> = {
  ACTIVE: 'Actif',
  SCHEDULED: 'Programmé',
  EXPIRED: 'Expiré',
  DISABLED: 'Désactivé',
};

type Instant = Date | string | null;
const ms = (v: Date | string) => (typeof v === 'string' ? Date.parse(v) : v.getTime());

/**
 * DISABLED wins over the window. `startsAt` is inclusive, `endsAt` EXCLUSIVE (the admin form
 * stores the day AFTER the chosen end day at 00:00 Paris). A null bound is open.
 */
export function tipState(t: { active: boolean; startsAt: Instant; endsAt: Instant }, now: Date): TipState {
  if (!t.active) return 'DISABLED';
  const n = now.getTime();
  if (t.startsAt != null && ms(t.startsAt) > n) return 'SCHEDULED';
  if (t.endsAt != null && ms(t.endsAt) <= n) return 'EXPIRED';
  return 'ACTIVE';
}

const DAY_MS = 86_400_000;
const PARIS = 'Europe/Paris';
const parisYmd = new Intl.DateTimeFormat('en-CA', { timeZone: PARIS, year: 'numeric', month: '2-digit', day: '2-digit' });
const parisParts = new Intl.DateTimeFormat('en-GB', {
  timeZone: PARIS,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const ymdToUtcMs = (ymd: string): number => {
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
};

/** Whole days since 1970-01-01 counted on the Europe/Paris calendar date of `now`. */
export function parisDayIndex(now: Date): number {
  return Math.round(ymdToUtcMs(parisYmd.format(now)) / DAY_MS);
}

/** The Europe/Paris calendar date of `now`, `YYYY-MM-DD`. */
export function parisYmdOf(now: Date): string {
  return parisYmd.format(now);
}

/** Paris wall-clock minus UTC, in ms, at the instant `t`. */
function parisOffsetMs(t: number): number {
  const p = Object.fromEntries(parisParts.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  const wall = Date.UTC(+p.year!, +p.month! - 1, +p.day!, +p.hour!, +p.minute!, +p.second!);
  return wall - Math.floor(t / 1000) * 1000;
}

/** The instant of 00:00 Europe/Paris on the calendar day `YYYY-MM-DD`. */
export function parisDayStart(ymd: string): Date {
  const utcMidnight = ymdToUtcMs(ymd);
  let t = utcMidnight - parisOffsetMs(utcMidnight);
  // Re-read the offset AT the candidate: it differs when a DST switch lies between.
  t = utcMidnight - parisOffsetMs(t);
  return new Date(t);
}

/**
 * The tip a pool shows today. Candidates are the pool's tips plus ALL (pool `ALL` → ALL tips
 * only), in state ACTIVE, ordered `createdAt` asc then `id` (so the result does not depend on
 * the input order); pick `parisDayIndex(now) % n`. Null when none is eligible.
 */
export function pickDailyTip<
  T extends { id: string; category: TipCategory; active: boolean; startsAt: Date | null; endsAt: Date | null; createdAt: Date },
>(tips: readonly T[], pool: TipCategory, now: Date): T | null {
  const candidates = tips
    .filter((t) => (t.category === pool || t.category === 'ALL') && tipState(t, now) === 'ACTIVE')
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (candidates.length === 0) return null;
  return candidates[parisDayIndex(now) % candidates.length]!;
}

const TIP_TEXT_REQUIRED = 'Le texte du conseil est requis.';
const END_AFTER_START = 'La date de fin doit être après la date de début.';

const tipTextSchema = z
  .string({ message: TIP_TEXT_REQUIRED })
  .trim()
  .min(1, { message: TIP_TEXT_REQUIRED })
  .max(280, { message: '280 caractères maximum.' });

const tipInstantSchema = z.iso.datetime({ offset: true, message: 'Date invalide.' }).nullable();

export const TIP_URL_MAX_LENGTH = 2048;
const TIP_URL_INVALID = 'Adresse invalide : une URL commençant par https:// est requise.';

/**
 * P23. The ONLY URLs a tip may carry: absolute https. The tip is served to anonymous clients
 * (`GET /tips/daily`) and rendered as `<a href>` / `<img src>` by the admin list, so `javascript:`,
 * `data:` and plain http must never be stored. Returns the normalised URL, or null when it is not one.
 */
export function httpsUrlOrNull(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '' || trimmed.length > TIP_URL_MAX_LENGTH) return null;
  try {
    const u = new URL(trimmed);
    return u.protocol === 'https:' && u.hostname !== '' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Blank means « none » (null); anything else must pass `httpsUrlOrNull`. Stored as typed, trimmed. */
const tipUrlSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z
    .string()
    .trim()
    .refine((v) => httpsUrlOrNull(v) !== null, { message: TIP_URL_INVALID })
    .nullable()
    .optional(),
);

/** What the app receives for the day's tip: the five fields it renders, nothing else of the row. */
export type DailyTipDto = {
  id: string;
  text: string;
  category: TipCategory;
  imageUrl: string | null;
  linkUrl: string | null;
};

const endAfterStart = (v: { startsAt?: string | null; endsAt?: string | null }, ctx: z.RefinementCtx) => {
  if (v.startsAt != null && v.endsAt != null && Date.parse(v.endsAt) <= Date.parse(v.startsAt)) {
    ctx.addIssue({ code: 'custom', message: END_AFTER_START, path: ['endsAt'] });
  }
};

/** Create body. Dates are ISO instants computed by the form (`parisDayStart`), or null. */
export const adminTipInputSchema = z
  .object({
    text: tipTextSchema,
    category: tipCategorySchema,
    active: z.boolean().default(true),
    imageUrl: tipUrlSchema,
    linkUrl: tipUrlSchema,
    startsAt: tipInstantSchema.default(null),
    endsAt: tipInstantSchema.default(null),
  })
  .superRefine(endAfterStart);
export type AdminTipInput = z.infer<typeof adminTipInputSchema>;

/** Update body: every field optional, NO defaults (an absent field is left untouched). */
export const adminTipUpdateSchema = z
  .object({
    text: tipTextSchema,
    category: tipCategorySchema,
    active: z.boolean(),
    imageUrl: tipUrlSchema,
    linkUrl: tipUrlSchema,
    startsAt: tipInstantSchema,
    endsAt: tipInstantSchema,
  })
  .partial()
  .superRefine(endAfterStart);
export type AdminTipUpdate = z.infer<typeof adminTipUpdateSchema>;

export const adminTipListQuerySchema = z.object({
  category: tipCategorySchema.optional(),
  state: tipStateSchema.optional(),
});
export type AdminTipListQuery = z.infer<typeof adminTipListQuerySchema>;

export type AdminTipItem = {
  id: string;
  text: string;
  category: TipCategory;
  active: boolean;
  imageUrl?: string | null;
  linkUrl?: string | null;
  startsAt: string | null;
  endsAt: string | null;
  state: TipState;
  createdAt: string;
};

/** `today` holds the id of the tip each pool shows today (same `pickDailyTip` as the app). */
export type AdminTipsResponse = {
  items: AdminTipItem[];
  today: { CLIENT: string | null; REPAIRER: string | null };
};
