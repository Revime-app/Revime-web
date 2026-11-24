import { z } from 'zod';
import { modeSchema } from './user.schemas.js';

/**
 * V8 E2 (`DEC8-09`, `DEC8-10`): the first-use help bubbles' state, kept on the account per mode
 * (`Profile.tourState`, `PATCH /users/me/tour`), so the app and the API validate one shape.
 *
 * The eleven pages the two modes cover between them (`FND8-024`): client mode uses accueil, publier,
 * recherche, messages, reparations, offres, profil, parametres; repairer mode uses accueil, demandes
 * (the `publier` tab's feed), recherche, messages, reparations, propositions, tableau, profil,
 * parametres.
 */
export const TOUR_PAGE_IDS = [
  'accueil',
  'publier',
  'demandes',
  'recherche',
  'messages',
  'reparations',
  'offres',
  'propositions',
  'tableau',
  'profil',
  'parametres',
] as const;
export type TourPageId = (typeof TOUR_PAGE_IDS)[number];

/**
 * One mode's state. `offer: null` = never offered (every account before E2, `DEC8-09` (4));
 * `STARTED` = « Commencer la visite » (or « Revoir la visite »); `DECLINED` = « Plus tard », which
 * keeps the bubbles off until « Revoir la visite » (`DEC8-09` (3)). `updatedAt` is the writer's
 * clock and decides which of two writes wins (`newerTourMode`).
 */
export const tourModeStateSchema = z.object({
  offer: z.enum(['STARTED', 'DECLINED']).nullable(),
  seen: z.array(z.enum(TOUR_PAGE_IDS)).max(TOUR_PAGE_IDS.length),
  updatedAt: z.string().datetime(),
});
export type TourModeState = z.infer<typeof tourModeStateSchema>;

export const tourStateSchema = z.object({
  CLIENT: tourModeStateSchema.nullable(),
  REPAIRER: tourModeStateSchema.nullable(),
});
export type TourState = z.infer<typeof tourStateSchema>;

export const updateTourSchema = z.object({
  mode: modeSchema,
  state: tourModeStateSchema,
});
export type UpdateTourInput = z.infer<typeof updateTourSchema>;

/**
 * The stored column as the API presents it. `null` (never written) stays `null`. Anything that
 * fails the schema reads as both modes empty: the tour is offered again rather than `/me` failing.
 */
export function parseTourState(raw: unknown): TourState | null {
  if (raw === null || raw === undefined) return null;
  const parsed = tourStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : { CLIENT: null, REPAIRER: null };
}

/**
 * Of the stored state `a` and an incoming write `b`, the one with the later `updatedAt`; `b` wins a
 * tie. Used by the API on every write and by the app when it merges the account with its device
 * copy, so a « Revoir la visite » reset is never undone by an older « seen ».
 */
export function newerTourMode(a: TourModeState | null, b: TourModeState | null): TourModeState | null {
  if (a === null) return b;
  if (b === null) return a;
  return Date.parse(a.updatedAt) > Date.parse(b.updatedAt) ? a : b;
}
