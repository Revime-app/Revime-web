import { z } from 'zod';
import { FR_POSTAL_CODE } from './postal.schemas.js';
import type { VerifiedBadge } from './offer.schemas.js';
import type { AvailabilityDay } from './repairer-availability.js';

/**
 * The directory's controls - design §6.3, extended by `CF-34` (design
 * `2026-09-02-cf-34-annuaire-filtres-design.md`).
 *
 * `sort` is NOT defaulted, and that is load-bearing rather than tidy: absent and `az`
 * produce the SAME order (displayName ascending, in SQL), so the screen can show
 * « A → Z » honestly while sending nothing. A default here would make the absent case
 * indistinguishable from a chosen one, which is the trap 4b §5.1 documents for the feed.
 * `distance` does not disturb that: it is only ever sent explicitly.
 *
 * 🛑 `distance` REPLACES this comment's former claim that there is « deliberately no `distance`
 * member: `Profile` carries no location for a client ». That reasoning was right and its
 * PRECONDITION changed rather than its logic: `Profile` still carries no location, so the client
 * supplies one per session as `near` and the server geocodes it. Nothing is stored. See
 * `CF-34`'s design §3.2, which also records why a stored `Profile.postalCode` was refused for
 * now - it would be null for all 19 client-capable accounts on day one.
 *
 * 🛑 STILL TRUE AND NOT WEAKENED BY ANY OF THIS: there is deliberately no filter keyed on a
 * BADGE, which Étape 5 §7 forbids outright on the client's own « ne doit absolument pas être
 * obligatoire », and no filter on `kind` (§4.4). `CF-34` asked for both by name and both are
 * refused - design §3.1. Do not add either.
 *
 * `radiusKm` and `minRating` are STRING enums rather than coerced numbers. Query params arrive
 * as strings; there is no `z.coerce` anywhere in this repo; the domain of each is exactly the
 * chip set the sheet renders; and `z.coerce.number()` on '' yields 0, which is the class of
 * silent value this file avoids elsewhere. The service converts once with `Number()`.
 */
export const directoryQuerySchema = z
  .object({
    q: z.string().trim().max(120, { message: 'Recherche trop longue.' }).optional(),
    sort: z.enum(['note', 'az', 'distance']).optional(),
    /**
     * `CF-33`. Filter to réparateurs who cover this category - design §7.
     *
     * ONE category, matching a demande's single `categoryId`, and it may be a root or a child.
     * The server expands it: a root filter also matches a réparateur who declared only one of
     * its children, and a child filter also matches one who declared the whole family.
     *
     * An unknown or deactivated id is REFUSED, not answered with an empty list.
     *
     * 🛑 MEASURED 2026-09-02: `RepairerCategory` is EMPTY, so this filter returns zero rows for
     * every category in production today. That is a réparateur-side data problem and not this
     * schema's defect, but do not read a green test here as "the filter works for a user".
     */
    categoryId: z.string().uuid({ message: 'Catégorie invalide.' }).optional(),
    /**
     * `CF-34`. The client's own position, as a French postal code he TYPES. Not stored, not
     * remembered between launches, and not derived from his last demande - design §3.2 refuses
     * that last one, because it would sort him by where his last broken phone was.
     *
     * Five digits exactly. The server hands it to `GeocodeService.lookupPostalCode` (BAN).
     *
     * 🛑 **`FR_POSTAL_CODE`, NOT A LITERAL REGEX**, corrected 2026-09-02 by the whole-branch
     * review. `apps/mobile`'s filter sheet has to ask the same question - « is there a usable
     * location » - and it was asking it with its own hand-copied `/^\d{5}$/` in the one workspace
     * that has no test harness to gate the agreement. Both sides now read the shared constant, and
     * `postal-code-predicate.spec.ts` asserts this schema and `isCompletePostalCode` agree case by
     * case. Change the rule in `postal.schemas.ts` or not at all.
     *
     * The `.trim()` stays HERE rather than moving into the constant: the predicate trims to match
     * it, while `postalCodeSchema` - the same rule on a WRITE - deliberately does not.
     */
    near: z.string().trim().regex(FR_POSTAL_CODE, { message: 'Code postal invalide.' }).optional(),
    /** `CF-34`. Maximum distance in km. Absent means « Partout », which is the sheet's default. */
    radiusKm: z.enum(['10', '25', '50']).optional(),
    /**
     * `CF-34`. Minimum average rating. Absent means « Toutes ».
     *
     * Deliberately INDEPENDENT of `near`: a rating is not geographic, so this member carries no
     * postal-code requirement. Measured 2026-09-02: 9 of 12 réparateurs are rated and 7 are at
     * 4 or above, so this filter has data - the code comments claiming zero reviews went stale
     * when the demo-data slice landed on 2026-08-20.
     */
    minRating: z.enum(['3', '4']).optional(),
  })
  /**
   * Two cross-field rules, both REFUSING rather than falling back to displayName order - the
   * same rule `resolveSpecialityMatch` applies to an unusable `categoryId`. A silent fallback
   * would let the screen show « Trier par distance » while serving alphabetical results.
   *
   * `.refine` with an explicit `path`, matching `createDemandeSchema`'s `budgetPresent`: the
   * path is what puts the French message on the named field in `AppException.fields`. Both come
   * back as **400 `VALIDATION_FAILED`** through `ZodValidationPipe`, NOT 422 - 422 is reserved
   * for the service's own geocode refusal.
   */
  .refine((v) => v.radiusKm === undefined || v.near !== undefined, {
    message: 'Indiquez un code postal pour filtrer par distance.',
    path: ['radiusKm'],
  })
  .refine((v) => v.sort !== 'distance' || v.near !== undefined, {
    message: 'Indiquez un code postal pour trier par distance.',
    path: ['sort'],
  });

export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;

/**
 * One row of the directory - design §5.
 *
 * `kind` is ABSENT ON PURPOSE and must not be added. A self-declared « Professionnel »
 * rendered where « Professionnel vérifié » would go re-creates the confusion
 * `offers.service.ts` prevents by keeping `kind` out of its query's select entirely, so
 * that the fabricated badge is unreachable rather than merely forbidden. Design §4.4.
 */
export type RepairerCardDto = {
  /** The person, not the RepairerProfile row: every consumer addresses users. */
  userId: string;
  displayName: string;
  serviceAreaLabel: string | null;
  username: string;
  /** Derived from Profile.verificationLevel via verifiedBadgeFor. Never from kind. */
  verifiedBadge: VerifiedBadge | null;
  /**
   * Null for a réparateur with no reviews and NEVER 0 - a zero renders as a
   * catastrophic rating rather than an absent one.
   *
   * 🛑 CORRECTED 2026-09-02. This used to say « This is the ORDINARY case in production, not an
   * edge one: there are zero reviews. » **There are 36 reviews**, across 9 of the 12 listable
   * réparateurs, and it stopped being true on 2026-08-20 when the demo-data slice seeded them.
   * Null is still the ordinary case for the OTHER 3, so keep the never-zero rule; but do not
   * conclude from this comment that a rating filter has nothing to filter. It was that
   * conclusion that kept `CF-34` unbuilt.
   */
  rating: number | null;
  reviewCount: number;
  /**
   * `CF-23`. The signed URL of his uploaded profile photo, or null when he has none - which is
   * every réparateur until one uploads one. Expires after an hour, like every read URL here.
   *
   * On the CARD rather than only on the profile, deliberately: `RepairerProfileDto` extends this
   * type, so one field feeds the directory and the public profile from one `CARD_SELECT`. Adding
   * it to the profile alone would let the same réparateur show a photo on one screen and initials
   * on the other.
   *
   * Null does NOT fall back to an OAuth `image` here, unlike `MeResponse.avatarUrl`. A
   * provider-supplied avatar is private to the account that signed in; publishing it on a public
   * directory card would put a photo on the internet that its owner never chose to publish.
   * Null means the consumer renders initials.
   */
  avatarUrl: string | null;
};

/**
 * One row of the DIRECTORY: a card, plus how far that réparateur is from the postal code the
 * client typed this session. `CF-34`, design §3.4.
 *
 * 🛑 A SEPARATE TYPE RATHER THAN A FIELD ON `RepairerCardDto`, AND THE REASON IS THE ASYMMETRY
 * THE TWO FIELDS ABOVE ALREADY DOCUMENT. `avatarUrl` is on the shared card *because* the
 * directory and the fiche must not show one person two faces. `bannerUrl` and `serviceRadiusKm`
 * are profile-only *because* each has exactly one rendering surface. A distance has exactly one
 * surface, so it follows the BANNER's precedent, not the avatar's.
 *
 * Concretely, this keeps `assembleRepairerCards` and `CF-18`'s favourites read untouched, and
 * keeps a permanently-null `distanceKm` off `RepairerProfileDto` - the public profile is fetched
 * with no `near` context and could never populate it.
 *
 * `null` when the client sent no `near`, AND when this réparateur has no coordinates (1 of 12
 * today). One absent state: a row has nothing useful to say about WHICH of the two it is.
 *
 * Rounded to one decimal by the service, matching `DemandeDto.distanceKm`.
 */
export type DirectoryCardDto = RepairerCardDto & {
  distanceKm: number | null;
};

/** The public profile - design §5 and §7.3. */
export type RepairerProfileDto = RepairerCardDto & {
  /**
   * `CF-24`. The signed URL of his banner, or null - which is every réparateur until one uploads
   * one. Rendered as the fiche's cover strip; null falls back to the app's own motif.
   *
   * 🛑 ON THE PROFILE ONLY, AND DELIBERATELY THE REVERSE OF `avatarUrl` ONE FIELD ABOVE. That one
   * is on the CARD so the directory and the fiche cannot show the same réparateur two different
   * faces. A banner has no such risk, because there is exactly one surface that draws one: the
   * directory row is a 44pt avatar with two lines of text and has no cover to fill. Putting it on
   * `RepairerCardDto` would therefore mean signing one extra URL per row on an UNBOUNDED list
   * endpoint for something nothing renders - so the asymmetry between these two fields is the
   * design, not an oversight, and adding it to the card is a decision rather than a tidy-up.
   */
  bannerUrl: string | null;
  /**
   * `CF-51`. How far he travels, in kilometres, or null when he has not said.
   *
   * 🛑 ON THE PROFILE ONLY, the same asymmetry `bannerUrl` above documents and for the same
   * reason: `list` has no `take`. The card already carries `serviceAreaLabel`, which is the part
   * a 44pt directory row has room for. Adding this to the card is a decision, not a tidy-up.
   */
  serviceRadiusKm: number | null;
  /**
   * `CF-52`. His week, ordered Monday first by the query. EMPTY when he has answered nothing,
   * which the fiche renders by hiding the block - not as « closed all week », which is what
   * seven closed rows mean.
   */
  availability: AvailabilityDay[];
  bio: string | null;
  /** 0 IS a true value here, unlike a rating of 0, so it renders as 0 rather than « - ». */
  repairCount: number;
  /**
   * ISO. `RepairerProfile.createdAt` - when he became a RÉPARATEUR, not when he joined
   * Revime, which is `user.createdAt`. Rendered « Réparateur depuis » and NEVER the
   * prototype's « sur Revime », because that label under this column would assert more
   * than the data delivers. Design §4.3.
   */
  repairerSince: string;
  /**
   * `CF-25`. The categories he DECLARES he works on - « Spécialités ».
   *
   * 🛑 THE DELIBERATE COUNTERPART TO `categoriesTreated` DIRECTLY BELOW, and the pair is the
   * design rather than a duplication. This is a CLAIM he made; that one is a FACT derived from
   * his offer history. The fiche renders both, declared first, on the owner's decision - see
   * the design §3 Q2. Do not collapse them.
   *
   * Labels, not ids, unlike `MeResponse.repairer.categoryIds`: nothing on a public fiche
   * resolves an id, and this endpoint has no use for them. « Électronique » for a declared
   * root, « Électronique · Smartphones » for a declared child, composed by `specialityLabel`.
   *
   * Taxonomy order - root `sortOrder`, then child `sortOrder` - NOT newest-first like
   * `categoriesTreated`. Recency is meaningful for a derived fact and meaningless for a
   * declared set, and a stable order stops the chips reshuffling between saves.
   *
   * Empty for every réparateur until one declares something. The screen hides the section
   * rather than rendering an empty one.
   */
  specialities: string[];
  /**
   * Distinct category labels he has a non-deleted offer on, newest category first.
   * DERIVED from offer history and never self-declared, which is why it renders under
   * « Catégories traitées » rather than the prototype's « Spécialités »: a specialty is a
   * claim he would make, this is a fact about what he has quoted on. Design §4.3.
   *
   * 🛑 CORRECTED 2026-09-02: this said « Empty for everybody in production today, because there
   * are zero offers. » **There are 47 live offers.** Stale since the demo-data slice, same date
   * as the rating comment above. It is still empty for a réparateur who has quoted on nothing.
   * The screen hides the whole section rather than rendering an empty one.
   */
  categoriesTreated: string[];
};

/**
 * What a réparateur may change about his own public profile - design §4.6.
 *
 * `kind` is absent for §4.4's reason. `postalCode` is absent because
 * `PATCH /users/me/repairer` owns réparateur geography and writes all four of its
 * fields on every call; splitting one field off would let coordinates go stale.
 *
 * Both fields optional, so a PATCH may carry either or neither. Zod strips unknown
 * keys, which is what stops a hostile body naming `kind` or `postalCode` - pinned in
 * this schema's own test, because the protection is Zod's rather than ours.
 */
export const updateRepairerProfileSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(2, { message: 'Nom trop court.' })
    .max(60, { message: 'Nom trop long.' })
    .optional(),
  /**
   * 600 is a CHOICE, not a measurement - the same standing as piece 5's 5-second
   * registry timeout. Empty-after-trim is normalised to null by the SERVICE, not here,
   * so that « no bio » has exactly one representation in the column and a screen cannot
   * invent a second by sending ''. Identical reasoning to `Review.comment`.
   */
  bio: z.string().trim().max(600, { message: 'Description trop longue.' }).optional(),
});

export type UpdateRepairerProfileInput = z.infer<typeof updateRepairerProfileSchema>;
