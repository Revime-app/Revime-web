import { z } from 'zod';
import { postalCodeSchema } from './postal.schemas.js';
import type { ProgressCommande } from './repair-status.js';
import type { QuoteRequestInfo } from './quote-request.js';

/**
 * The prototype's own cap (`repareme-web/src/screens/Publier.tsx:6`). Read by the wizard's
 * counter, the Zod cap on createDemandeSchema and the server's check, so one number governs
 * all three.
 */
export const MAX_DEMANDE_PHOTOS = 10;

/**
 * The shortest title and description a demande accepts. `CF3-08` (V3) set them so « TV », « PS5 » and
 * « Bac fissuré » publish. Read by this schema, the mobile wizard's Continuer gate, and the
 * « Au moins N caractères » hints on the publish and edit screens.
 *
 * 🛑 V7 `FND7-074`: the schema and the hints moved to 2 and 10 in V3 while the wizard's gate kept a
 * hard-coded 5 and 20, so the screen promised 2 and refused anything under 5. Never write these
 * numbers anywhere else.
 */
export const DEMANDE_TITLE_MIN = 2;
export const DEMANDE_DESCRIPTION_MIN = 10;

export const demandeModeSchema = z.enum(['OFFERS', 'BUDGET']);
export const demandeStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
export type DemandeStatus = z.infer<typeof demandeStatusSchema>;
export const partsPreferenceSchema = z.enum([
  'UNKNOWN',
  'ORIGINAL',
  'COMPATIBLE',
  'CLIENT_SUPPLIED',
]);

/**
 * The eleven fields a demande carries from its author, shared by create and update.
 *
 * 🛑 EXTRACTED SO THE TWO CANNOT DRIFT. `CF-16` added an update path with the same field set;
 * two independent `z.object`s would let a field gain a bound on one and not the other, and the
 * mismatch would surface as a create that accepts what an edit rejects.
 */
const demandeFields = z.object({
  categoryId: z.string().uuid({ message: 'Choisissez une catégorie.' }),
  brand: z.string().max(60, { message: 'Marque trop longue.' }).optional(),
  model: z.string().max(60, { message: 'Modèle trop long.' }).optional(),
  title: z
    .string()
    .min(DEMANDE_TITLE_MIN, { message: `Donnez un titre d'au moins ${DEMANDE_TITLE_MIN} caractères.` })
    .max(120, { message: 'Titre trop long.' }),
  description: z
    .string()
    .min(DEMANDE_DESCRIPTION_MIN, {
      message: `Décrivez le problème (au moins ${DEMANDE_DESCRIPTION_MIN} caractères).`,
    })
    .max(2000, { message: 'Description trop longue.' }),
  parts: partsPreferenceSchema.default('UNKNOWN'),
  mode: demandeModeSchema,
  budgetCents: z
    .int({ message: 'Budget invalide.' })
    .positive({ message: 'Budget invalide.' })
    .max(10_000_000, { message: 'Budget trop élevé.' })
    .optional(),
  locationLabel: z
    .string()
    .min(2, { message: 'Indiquez votre localisation.' })
    .max(120, { message: 'Localisation trop longue.' }),
  postalCode: postalCodeSchema,
  /**
   * Storage paths for photos already uploaded during the wizard, in display order.
   *
   * `.default([])` rather than `.optional()`, deliberately: ten existing integration
   * specs POST create bodies without it and the client's installed binary sends none, so
   * a default keeps every one of them valid while the service still always receives an
   * array. The server re-checks every path -- see the storage module's `checkPhotoPaths`
   * plus the existence check -- because a path is a client-supplied string.
   */
  photoPaths: z
    .array(z.string().min(1).max(300))
    .max(MAX_DEMANDE_PHOTOS, { message: 'Dix photos au maximum.' })
    .default([]),
});

/** `mode: 'BUDGET'` without a budget is the one cross-field rule, and both schemas need it. */
const budgetPresent = (v: z.infer<typeof demandeFields>) =>
  v.mode !== 'BUDGET' || v.budgetCents !== undefined;
const budgetMessage = { message: 'Indiquez votre budget.', path: ['budgetCents'] };

export const createDemandeSchema = demandeFields.refine(budgetPresent, budgetMessage);
export type CreateDemandeInput = z.infer<typeof createDemandeSchema>;

/**
 * `CF-16`. Structurally identical to create: a FULL REPLACE of the editable set, not a sparse
 * patch. A sparse patch would make absent, explicit-null and value three distinct states for
 * `brand`, `model` and `budgetCents`; the edit screen is prefilled with everything anyway, so
 * full replace costs the client nothing. Which fields MAY move is not expressed here - it
 * depends on the demande's state and its live offer count, so `DemandesService.update`
 * enforces `demandeEditPolicy` against the stored row. See spec §3.3.
 */
export const updateDemandeSchema = demandeFields.refine(budgetPresent, budgetMessage);
export type UpdateDemandeInput = z.infer<typeof updateDemandeSchema>;

/**
 * What `POST /demandes/photos/sign` accepts.
 *
 * `draftId` is a UUID the app generates once per wizard session, so one abandoned wizard is
 * one storage prefix and the cleanup job has a unit to reason about.
 *
 * There is deliberately NO `path` field. The server builds the whole path from the session's
 * userId, this draftId and an id it generates itself, which is what makes a signed upload URL
 * unable to point outside the caller's own prefix. Accepting any part of the path from the
 * client would hand that guarantee away.
 *
 * The two content types are the only ones the bucket allows. Rejecting here as well as at the
 * bucket gives the client a French message instead of a storage error, and it is what keeps
 * HEIC out: iOS hands back HEIC by default, so the app must ask for JPEG explicitly.
 */
export const signPhotoSchema = z.object({
  draftId: z.string().uuid({ message: 'Brouillon invalide.' }),
  contentType: z.enum(['image/jpeg', 'image/png'], { message: 'Format non pris en charge.' }),
});
export type SignPhotoInput = z.infer<typeof signPhotoSchema>;

/** What `POST /demandes/photos/sign` answers. */
export type SignPhotoResponse = {
  /** The storage path to submit in `photoPaths` when the demande is published. */
  path: string;
  /** Complete and pre-signed. PUT the bytes here; no other credential is needed. */
  uploadUrl: string;
};

export const feedSortSchema = z.enum(['recentes', 'prix', 'distance'], {
  message: 'Tri invalide.',
});

/**
 * Query parameters for GET /demandes/feed. Every field is optional, so the
 * réparateur's FAB feed calls the same endpoint with nothing and gets exactly
 * today's behaviour.
 *
 * `sort` is deliberately NOT defaulted. The feed orders nearest-first when the
 * réparateur has coordinates and newest-first otherwise, which is the ordering
 * piece D existed to give an input to. A .default('recentes') would undo it for
 * every caller. Absent means "keep current behaviour"; the screen makes the
 * effective choice visible in its picker instead.
 */
export const feedQuerySchema = z.object({
  q: z.string().trim().max(120, { message: 'Recherche trop longue.' }).optional(),
  categoryId: z.string().uuid({ message: 'Catégorie invalide.' }).optional(),
  sort: feedSortSchema.optional(),
  /**
   * CF4-26 / G8. « Pour moi »: only the demandes matching his declared categories, built
   * from the same where-clause as the dashboard's count. A literal `'1'` because query
   * strings are strings; absent = today's feed.
   */
  matching: z.literal('1', { message: 'Filtre invalide.' }).optional(),
});

export type FeedQuery = z.infer<typeof feedQuerySchema>;

export type DemandeDto = {
  id: string;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  parts: z.infer<typeof partsPreferenceSchema>;
  mode: z.infer<typeof demandeModeSchema>;
  budgetCents: number | null;
  locationLabel: string;
  postalCode: string;
  status: z.infer<typeof demandeStatusSchema>;
  /**
   * The demande's commande, or null when none exists.
   *
   * 🛑 RAW FACTS, NEVER A LABEL. `repairStatus()` in this package owns the rule that
   * turns these into the client's status ladder, and a second place deciding it is how
   * the two come to disagree. A label here would also put French UI copy into an API
   * response and make a wording change a Render deploy.
   *
   * Purely additive, so the client's installed binary receives a superset and behaves
   * identically - the same argument Stage 4b's query params used.
   */
  commande: ProgressCommande | null;
  category: { id: string; slug: string; labelFr: string };
  /**
   * `CF-16`. Live offers on this demande - SENT only, the definition `liveOffers` fixes, so
   * this cannot disagree with `DemandeListItem.offerCount` or the feed's.
   *
   * On the DETAIL dto and not only the list one because the edit screen needs it to decide
   * whether contract fields are locked (`demandeEditPolicy`). Visible to a réparateur, which
   * is not a blind-bidding widening: `FeedItem.offerCount` already shows him the count, and
   * blind bidding governs offer CONTENTS - `listForDemande` stays author-only.
   */
  offerCount: number;
  /**
   * `CF-16`. The author's own photos, as storage paths PAIRED with their signed URL. Null for
   * every viewer who is not the author.
   *
   * 🛑 PAIRED, AND NOT TWO ARRAYS. `photoUrls` below drops any path it cannot sign, so an
   * index into it does not identify a row - `present()`'s own comment says so and names this
   * feature as the moment it would matter. Two arrays of different lengths would let a client
   * remove the third photo they can see and delete a different one.
   *
   * 🛑 AN UNSIGNABLE ENTRY IS KEPT, with `url: null`. Dropping it would remove the photo from
   * the edit form, and the form submits what it holds, so the next save would delete a photo
   * the author never chose to remove.
   *
   * Withheld from other viewers because a path is `demandes/<userId>/<draftId>/<uuid>.<ext>`,
   * and `author` deliberately exposes only `username` and `memberSince`.
   *
   * 🛑 That withholding is DEFENCE IN DEPTH and not a fresh secret, which the reviewer of the
   * next photo change needs to know: a signed read URL embeds the path it signs, so `photoUrls`
   * ALREADY hands a réparateur the same string, author `userId` included. What this avoids is
   * publishing it as a stable, parseable field that a consumer would be tempted to key on.
   * Closing the URL-borne exposure is a change to `photoUrls` and is deliberately not in scope.
   */
  photos: Array<{ path: string; url: string | null }> | null;
  /**
   * Signed, time-limited URLs the app can load directly, in `sortOrder`.
   *
   * Renamed from `photoPaths` on 2026-08-20. The bucket is private, so a raw storage path is
   * useless to a client; returning one would be a field that must never be used. Safe to
   * rename rather than add: a repo-wide grep found no mobile consumer.
   */
  photoUrls: string[];
  /**
   * How far the VIEWER is from this demande, in km to one decimal - the « · 1,2 km » on the
   * prototype's detail screen. Rounded the same way `FeedItem.distanceKm` is, so one demande
   * cannot read « 392 km » in a list and « 392.0384 km » on its own screen.
   *
   * Null when EITHER side lacks coordinates: a réparateur with no postal code, or a demande
   * whose geocoding never resolved. Null and never 0, because 0 km reads as « next door ».
   */
  distanceKm: number | null;
  /**
   * The author as a bidder may see them - handle and join date, nothing contactable. The
   * detail screen's « CLIENT » card, whose own copy promises « Coordonnées visibles après
   * acceptation d'une offre. », so this deliberately carries no email, phone or surname.
   *
   * The legal name (both first and last) was removed by CF-05, the client's 2026-08-21 feedback.
   *
   * 🛑 **NULL when the viewer IS the author**, and that null does double duty on the screen:
   * it suppresses a « CLIENT » card about yourself, and it gates « Faire une offre » - a
   * client really can reach that screen, because `commande/[id].tsx` links to it and both
   * parties open a commande.
   *
   * There is deliberately **no rating**. `Review.repairerUserId` is required and the aggregate
   * indexes on it, so reviews only ever run client → réparateur; a client rating would need a
   * reverse-review subsystem. The prototype's « ★ 4.8 » on this card has nothing behind it.
   */
  author: { username: string; memberSince: string } | null;
  /**
   * CF4-25. The private-request facts, or null on a public demande. Additive: older builds
   * ignore it. Only ever non-null for the author, the target réparateur and admins - no one
   * else can read a private demande at all (`PUBLIC_DEMANDE_WHERE`).
   */
  quoteRequest: QuoteRequestInfo | null;
  /**
   * CF6-16. Explicit boolean indicator of whether this request is private (addressed to a specific
   * repairer) or public. True when quoteRequest is non-null (targetRepairerUserId set).
   */
  isPrivate: boolean;
  createdAt: string;
};

export type DemandeListItem = {
  id: string;
  title: string;
  status: z.infer<typeof demandeStatusSchema>;
  /**
   * The demande's commande, or null when none exists.
   *
   * 🛑 RAW FACTS, NEVER A LABEL. `repairStatus()` in this package owns the rule that
   * turns these into the client's status ladder, and a second place deciding it is how
   * the two come to disagree. A label here would also put French UI copy into an API
   * response and make a wording change a Render deploy.
   *
   * Purely additive, so the client's installed binary receives a superset and behaves
   * identically - the same argument Stage 4b's query params used.
   */
  commande: ProgressCommande | null;
  categoryLabelFr: string;
  locationLabel: string;
  offerCount: number;
  /** The first photo only, signed, for the list thumbnail. Null when there are none. */
  photoUrl: string | null;
  /**
   * CF4-25. The private-request facts, or null on a public demande - what « Mes réparations »
   * needs for `quoteRequestLabel` (with `offerCount > 0` as its live-quote flag). Additive.
   */
  quoteRequest: QuoteRequestInfo | null;
  /**
   * CF6-16. Explicit boolean indicator of whether this request is private (addressed to a specific
   * repairer) or public. True when quoteRequest is non-null (targetRepairerUserId set).
   */
  isPrivate: boolean;
  createdAt: string;
};

/**
 * `CF-16` / `CF-17`. The eleven fields a client may change on their own demande, split into
 * two classes by `CF-D7`, which the owner settled on 2026-09-01.
 *
 * 🛑 TOTAL, NOT SPARSE, AND THE `Record` IS THE GATE. A twelfth editable field added later is
 * `TS2741` here - in the package that declared it - rather than an unclassified field that
 * silently defaults to editable. Same mechanism as `ICON_FOR` in `NotificationRow.tsx`, which
 * earned its keep on 2026-08-30.
 *
 * `description` is DESCRIPTIVE on purpose and it is the debatable one: a réparateur quotes on
 * the description more than on the category. The owner was told so and chose this split,
 * because the notification in `DEMANDE_UPDATED` is what covers the risk. See spec §1.2.
 */
export type EditableDemandeField =
  | 'title' | 'description' | 'brand' | 'model' | 'parts' | 'photoPaths'
  | 'categoryId' | 'mode' | 'budgetCents' | 'locationLabel' | 'postalCode';

export const DEMANDE_FIELD_CLASS: Record<EditableDemandeField, 'descriptive' | 'contract'> = {
  title: 'descriptive',
  description: 'descriptive',
  brand: 'descriptive',
  model: 'descriptive',
  parts: 'descriptive',
  photoPaths: 'descriptive',
  categoryId: 'contract',
  mode: 'contract',
  budgetCents: 'contract',
  locationLabel: 'contract',
  postalCode: 'contract',
};

/**
 * ONE definition of what may be edited or deleted, enforced by `DemandesService` and rendered
 * by `app/demande/[id]/modifier.tsx`. Two copies of this rule would let the screen offer a
 * control the server refuses - the shape `hasSufficientIdentity` exists to prevent for the
 * identity gate.
 *
 * `liveOfferCount` is SENT-only, matching `liveOffers` in `offer.schemas.ts`, whose comment
 * binds that definition to `DemandesService`'s `offerCount` so counts cannot disagree.
 */
export function demandeEditPolicy(
  status: DemandeDto['status'],
  liveOfferCount: number,
): { canEdit: boolean; contractLocked: boolean; canDelete: boolean } {
  const open = status === 'OPEN';
  return {
    canEdit: open,
    contractLocked: open && liveOfferCount > 0,
    canDelete: open,
  };
}
