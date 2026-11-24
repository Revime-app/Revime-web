import type { TourState } from './tour.schemas.js';
import type { SignupMethod } from './signup-completion.js';
import { z } from 'zod';
import { postalCodeSchema } from './postal.schemas.js';
import { usernameSchema } from './username.schemas.js';
import type { AvailabilityDay } from './repairer-availability.js';
import type { ProfileCompletion } from './profile-completion.js';

export const modeSchema = z.enum(['CLIENT', 'REPAIRER']);

export const repairerKindSchema = z.enum(['PRO', 'INDIVIDUAL']);

export const verificationLevelSchema = z.enum(['NONE', 'BASIC', 'IDENTITY', 'BUSINESS']);

export const updateModesSchema = z
  .object({
    clientEnabled: z.boolean().optional(),
    repairerEnabled: z.boolean().optional(),
    activeMode: modeSchema.optional(),
    kind: repairerKindSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Aucune modification fournie.' });

export type UpdateModesInput = z.infer<typeof updateModesSchema>;

/**
 * The réparateur's own base.
 *
 * 🛑 THIS COMMENT USED TO SAY « One postal code, no radius: a service radius belongs to Étape 4b's
 * distance filters. » BOTH HALVES ARE NOW WRONG. `CF-51` added the radius here on 2026-09-01, and
 * it is DISPLAY-ONLY on the fiche rather than a distance filter - filtering was considered and
 * rejected, because a radius that hid demandes from his own feed would make him silently stop
 * seeing work he used to see.
 *
 * `serviceRadiusKm` is OPTIONAL and absent means « leave alone »; an explicit `null` clears it.
 * 🛑 THAT IS THE OPPOSITE OF ITS SIBLINGS ON THIS ROUTE, deliberately: `lat`, `lng` and
 * `serviceAreaLabel` are DERIVED from `postalCode`, so the service rewrites all three on every
 * call. The radius is independent user input, so an older app sending only `postalCode` must not
 * null it.
 */
export const updateRepairerSchema = z.object({
  postalCode: postalCodeSchema,
  serviceRadiusKm: z
    .number()
    .int({ message: 'Rayon invalide.' })
    .min(1, { message: 'Rayon trop petit.' })
    .max(150, { message: 'Rayon trop grand.' })
    .nullable()
    .optional(),
});

export type UpdateRepairerInput = z.infer<typeof updateRepairerSchema>;

/**
 * A handle rename. Unlimited and unthrottled in V1 - impersonation churn is a
 * moderation concern and there is no moderation queue for handles, so inventing
 * a cooldown here would be a rule nobody can lift.
 */
export const updateUsernameSchema = z.object({
  username: usernameSchema,
});

export type UpdateUsernameInput = z.infer<typeof updateUsernameSchema>;

/**
 * `CF-23`. Mints a signed upload URL for a profile photo.
 *
 * NO `draftId`, unlike `signPhotoSchema`: an avatar has no wizard to be abandoned mid-way, so
 * there is no grouping level and nothing for a cleanup cron to sweep. The path is
 * `avatars/{userId}/{objectId}` and the server chooses both parts.
 *
 * 🛑 A SEPARATE ROUTE FROM `POST /demandes/photos/sign`, WHICH CANNOT BE REUSED. That one calls
 * `assertClientEnabled` (`demandes.service.ts:93`) and would refuse a réparateur-only account -
 * exactly the account the client asked for this feature for.
 *
 * The two content types are the only ones the shared bucket allows, and rejecting here as well
 * as at the bucket is what gives the app a French message instead of a storage error. iOS hands
 * back HEIC by default, so the picker must ask for JPEG explicitly.
 */
export const signAvatarSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png'], { message: 'Format non pris en charge.' }),
});
export type SignAvatarInput = z.infer<typeof signAvatarSchema>;

/**
 * `CF-23`. Points the profile at an uploaded object, or clears it.
 *
 * `null` REMOVES the photo, rather than a separate DELETE route. « Supprimer la photo » and
 * « Changer la photo » then travel the same code path, so the old object is deleted by the same
 * line in both cases and cannot be leaked by only one of them.
 *
 * The shape is validated here only far enough to be a string. Whether it is a path this caller
 * could have been handed is decided by `checkAvatarPath` on the server, against the SESSION's
 * userId - a check Zod cannot make, because the schema does not know who is calling.
 */
export const setAvatarSchema = z.object({
  path: z.string().max(200, { message: 'Photo de profil invalide.' }).nullable(),
});
export type SetAvatarInput = z.infer<typeof setAvatarSchema>;

/**
 * `CF-24`. Mints a signed upload URL for a réparateur's fiche-publique banner.
 *
 * Identical in SHAPE to `signAvatarSchema` and deliberately a separate schema rather than a reuse,
 * because the two routes differ in a way no schema can express: the banner routes refuse an account
 * without réparateur mode, since `bannerPath` lives on `RepairerProfile` and that row does not exist
 * until the mode is enabled. Sharing the schema would suggest the routes are interchangeable.
 *
 * The two content types are the only ones the shared bucket allows. iOS hands back HEIC by default,
 * so the picker must ask for JPEG explicitly - see `photo-upload.ts`.
 */
export const signBannerSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png'], { message: 'Format non pris en charge.' }),
});
export type SignBannerInput = z.infer<typeof signBannerSchema>;

/**
 * `CF-24`. Points the réparateur profile at an uploaded banner, or clears it.
 *
 * `null` REMOVES it, rather than a separate DELETE route, for the reason `setAvatarSchema` records:
 * « Supprimer » and « Changer » then travel the same code path, so the stale objects are pruned by
 * the same line in both cases and cannot be leaked by only one of them.
 *
 * Validated here only far enough to be a bounded string. Whether it is a path this caller could
 * have been handed - and in particular whether it is a BANNER path rather than the caller's own
 * avatar - is decided by `checkBannerPath` against the session's userId, which Zod cannot see.
 */
export const setBannerSchema = z.object({
  path: z.string().max(200, { message: 'Bannière invalide.' }).nullable(),
});
export type SetBannerInput = z.infer<typeof setBannerSchema>;

export type MeResponse = {
  id: string;
  email: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  /**
   * The signed-in user's own handle. On `MeResponse` because the « Nom
   * d'utilisateur » form seeds itself from the session, and a route that returns
   * `MeResponse` after writing a handle must return the handle it wrote.
   */
  username: string;
  phone: string | null;
  /**
   * Per-channel verification state, so the verification screen can show which
   * half is done and which is still open.
   *
   * The level alone is not enough. 🛑 Since `CF-D1` (2026-09-04) BASIC is e-mail OR
   * phone, so the level turns BASIC at the FIRST verified half and cannot say which half
   * that was; without these two flags the screen could not mark one card « Confirmé »
   * and leave the other open. (Before that date this comment described the opposite
   * problem: the level turned BASIC only once BOTH halves were done, so a half-verified
   * account looked brand new.)
   */
  emailVerified: boolean;
  phoneVerified: boolean;
  /**
   * Whether the server is currently enforcing the BASIC gate on publishing and
   * offering.
   *
   * The app must not infer this from the level. The gate is behind a flag that
   * ships OFF, so a client gating its own UI on `verificationLevel === 'NONE'`
   * alone would refuse to publish while the server happily accepted it. Reading
   * the server's own answer keeps the two in step by construction.
   */
  verificationRequired: boolean;
  /**
   * Whether the server is currently enforcing the IDENTITY gate on becoming and
   * acting as a réparateur.
   *
   * Separate from `verificationRequired` because the two flags are waiting on
   * different things - that one on an EAS build, this one on a grant path to
   * IDENTITY - so they will be flipped on different days. Read this rather than
   * inferring it, for the same reason: it ships off, so an app gating réparateur
   * mode on the level alone would refuse what the server still allows.
   *
   * Read by `profil.tsx`'s identity gate card, which renders on exactly this plus
   * `connectEnabled` and a réparateur who is not yet enabled.
   *
   * This said "no mobile surface reads it yet" until 2026-08-19, which stopped being
   * true when P2 built the identity flow and its Profil card on 2026-08-17. Corrected
   * rather than left standing, for the reason this repository keeps rediscovering: a
   * comment that outlives its truth is read as current by the next change.
   */
  identityRequired: boolean;
  /**
   * Whether the server will accept a payment right now.
   *
   * The app must not infer this. Payment is behind a flag that ships OFF, so a
   * screen that renders « Choisir » on its own judgement would send the user to a
   * 422. Reading the server's own answer keeps the two in step by construction -
   * the same reasoning as `verificationRequired`.
   */
  paymentsEnabled: boolean;
  /**
   * Pre-launch Item 3. Marketing consent.
   */
  marketingConsent: boolean;
  /**
   * Whether the server will start Connect onboarding right now.
   *
   * A third flag rather than a reuse of `paymentsEnabled`, because the two wait on
   * different things: that one on the checkout webhook secret, this one on a
   * CONNECT webhook endpoint that exists in neither mode. They will be flipped on
   * different days.
   *
   * The app must not infer it. A « Configurer » button that the server answers 422
   * to is the divergence these fields exist to prevent - the same reasoning as
   * `verificationRequired`.
   */
  connectEnabled: boolean;
  /**
   * Whether the server will accept a message right now.
   *
   * Read rather than inferred, for the reason every other flag on this type is:
   * `MESSAGING_ENABLED` ships absent, so an app that showed a « Contacter » button
   * or an enabled composer without asking would offer an action the server refuses
   * with 422. The composer renders disabled and explains itself instead.
   */
  messagingEnabled: boolean;
  /**
   * Livraison Boxtal. Whether the server will quote and order shipments right now. Read rather
   * than inferred, like every flag above: when false, the payment screen renders the flat
   * « Envoi par colis » exactly as before, and a checkout sends no quote id.
   */
  shippingQuotesEnabled: boolean;
  /**
   * `CF6-07`. Whether Stripe is running with TEST keys right now (or the fake driver). The payment
   * screen shows its « Mode test » banner, with the « aucun débit réel » promise, on exactly this.
   *
   * The SERVER decides, never the build: the previous banner keyed on an `EXPO_PUBLIC_*` publishable
   * key inlined at build time, so an installed build would have kept promising « aucun débit réel »
   * after the live switch while the server charged real cards. An older API omits the field, so the
   * app reads it as absent = no banner (a missing promise is safe, a false one is not).
   */
  stripeTestMode: boolean;
  image: string | null;
  /**
   * `CF-23`. The signed URL of the photo this account UPLOADED, or null when it has none.
   * Expires - one hour, the same TTL as every other read URL in this API - so it is fetched
   * with the session rather than stored.
   *
   * 🛑 THIS IS NOT `image`, AND THE PRECEDENCE IS `avatarUrl ?? image`. `image` is the avatar an
   * OAuth provider supplied at sign-in (a `lh3.googleusercontent.com` URL for Google), which
   * this app has never been able to change; one live account has one. `avatarUrl` is the one the
   * user chose. A user who uploads a photo must see the photo they uploaded, so the uploaded one
   * wins wherever both exist. Written down because both are `string | null` on the same object,
   * so nothing in the type stops a screen reading the wrong one.
   */
  avatarUrl: string | null;
  role: string | null;
  /**
   * V7 D5 (U9b). The CGU version this user last accepted, null if none was ever recorded (Google /
   * Apple sign-ups, and accounts older than the field). The app compares it with the active version
   * to decide whether to show the re-acceptance screen. Read through `?? null`: an API older than
   * U9b does not send it.
   */
  cguVersion: string | null;
  /**
   * V9 B1. How the account was created (`null` for seeded accounts with no login row). Read through
   * `?? null`: an API older than V9 does not send these three.
   */
  signupMethod: SignupMethod | null;
  /** V9 B1. When the user confirmed his username; null on an Apple / Google account that never did. */
  usernameConfirmedAt: string | null;
  /** V9 B1. The privacy-policy version the user accepted, null before V9. */
  privacyVersion: string | null;
  profile: {
    clientEnabled: boolean;
    repairerEnabled: boolean;
    activeMode: z.infer<typeof modeSchema>;
    verificationLevel: z.infer<typeof verificationLevelSchema>;
    onboardingCompletedAt: string | null;
    /**
     * `CF-47`. Notification groups the user still wants. Default true, which is the
     * behaviour every account had before this field existed.
     *
     * 🛑 READ THROUGH `?? true` ON MOBILE. An app newer than the API it is pointed at
     * receives these as `undefined`, and `undefined` handed to a `Switch`'s `value`
     * makes it uncontrolled - it moves under the finger and then snaps back. Same
     * rule `apps/mobile/AGENTS.md` states for `DemandeDto.author`, one type over.
     */
    notifyOffers: boolean;
    notifyMessages: boolean;
    notifyCommandes: boolean;
    /**
     * V8 E2 (`DEC8-09` (2)): the help bubbles' state per mode, `null` when never written (the tour
     * is offered). 🛑 READ THROUGH `?? null` ONLY AFTER CHECKING FOR `undefined`: an API older than
     * E2 omits it, and the app then shows no tour at all rather than offering it on every launch.
     */
    tour: TourState | null;
  };
  repairer: {
    kind: 'PRO' | 'INDIVIDUAL';
    displayName: string;
    /**
     * The réparateur's own public description - piece C §4.6. Null until he saves one,
     * and null rather than '' so « no bio » has exactly one representation.
     *
     * On `MeResponse` as well as on `RepairerProfileDto` because « Mon profil public »
     * seeds its form from the session rather than waiting for the profile read, and a
     * route that returns `MeResponse` after writing a bio must return the bio it wrote.
     */
    bio: string | null;
    /** null until the réparateur saves one. The app prompts on exactly this. */
    postalCode: string | null;
    /** BAN's municipality name, display only. null when geocoding did not resolve. */
    serviceAreaLabel: string | null;
    /**
     * `CF-25`. The ids he has declared - roots and children mixed, already normalised by the
     * server so no root sits beside its own child.
     *
     * IDS rather than labels, unlike `RepairerProfileDto.specialities`: this feeds the PICKER,
     * which needs to check boxes against the catalog it already fetched, and the profile row's
     * « 3 catégories » count. Labels would make the picker re-resolve them.
     *
     * 🛑 READ THROUGH `?? []` ON MOBILE. An app newer than the API it points at receives this
     * as `undefined`, and `undefined.length` throws during render - which unwinds the whole tree
     * through the global handler, not just this screen. `apps/mobile/AGENTS.md` records three
     * sites in one slice where that rule was broken while being obeyed at a fourth.
     */
    categoryIds: string[];
    /**
     * `CF-24`. The signed URL of his fiche-publique banner, or null when he has none - which is
     * every réparateur until one uploads one. Expires after an hour, like every read URL here.
     *
     * 🛑 NESTED HERE RATHER THAN BESIDE `avatarUrl` AT THE TOP LEVEL, and the placement carries
     * the product rule: `repairer` is null for a client-only account, so « a client has no
     * banner » is a fact this type states instead of a null every reader must remember. The
     * avatar sits at the top level for the mirror-image reason - `avatarPath` is on `Profile`,
     * the person, and serves both modes.
     *
     * On `MeResponse` as well as on `RepairerProfileDto` for the reason `bio` gives above:
     * « Mon profil public » is the editor and seeds from the session, so it needs to know whether
     * a banner exists in order to show a preview and a « Supprimer » control at all.
     */
    bannerUrl: string | null;
    /**
     * `CF-51`. His stated travel radius in kilometres, or null when he has not said.
     * Null is « not stated », never « zero ». 🛑 READ THROUGH `?? null` ON MOBILE.
     */
    serviceRadiusKm: number | null;
    /**
     * `CF-52`. Seven rows, or EMPTY when he has answered nothing - and those are different
     * statements: seven closed rows means « closed all week ». Ordered by `dayOfWeek`, so a
     * consumer never sorts.
     *
     * 🛑 READ THROUGH `?? []` ON MOBILE. An app newer than the API receives this as `undefined`,
     * and `.length` on it throws during render, which unwinds the whole tree through the global
     * handler rather than just this screen.
     */
    availability: AvailabilityDay[];
    /**
     * `CF-49`. « 2 / 6 complétées ». Computed server-side so the arithmetic and its call site are
     * both covered by a gate - `apps/mobile` has no test runner.
     *
     * 🛑 READ THROUGH `?? null` ON MOBILE and render nothing when absent, rather than `0 / 0`.
     */
    completion: ProfileCompletion;
    /** CMP-D1: Fiscal declaration completion flag. */
    fiscalCompleted?: boolean;
  } | null;
};

/**
 * `CF-47`. A partial update: an absent key means « leave this group alone », which is
 * what a single switch flipping on one screen actually means. All three optional is
 * therefore deliberate, not laziness - a total body would make one switch overwrite
 * the other two with whatever the app last cached.
 */
export const updateNotificationPreferencesSchema = z.object({
  offers: z.boolean().optional(),
  messages: z.boolean().optional(),
  commandes: z.boolean().optional(),
  marketing: z.boolean().optional(),
});
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;

/**
 * `CF-47`. What a deleted account renders as, everywhere.
 *
 * 🛑 THIS IS WRITTEN INTO `User.name`, NOT APPLIED AT READ TIME, and that is the whole
 * design: 24 selections of `name`/`username`/`firstName` across ten service files join
 * and render that column, so scrubbing at the source makes all 24 correct with no edits
 * to any of them. A read-time filter would need all 24 to remember.
 */
export const DELETED_USER_NAME = 'Utilisateur supprimé';

/**
 * `User.email` is NOT NULL and unique, so it cannot be nulled - it is replaced. `.invalid`
 * is the RFC 2606 reserved TLD, so this can never collide with or reach a real mailbox,
 * and replacing it FREES the real address for a future signup, which is deliberate.
 */
export function deletedUserEmail(userId: string): string {
  return `deleted+${userId}@revime.invalid`;
}

/**
 * `User.username` is NOT NULL, unique, and the validator permits only `[a-z0-9_]`, so the
 * tombstone has to satisfy all three. Uses the full id lowercased to avoid collisions on the
 * unique index. Better Auth generates 32 mixed-case alphanumerics, so two ids differing only
 * in case could collide if truncated.
 */
export function deletedUsername(userId: string): string {
  return `supprime_${userId.toLowerCase()}`;
}

/**
 * CF5-23. True when a handle or name is a tombstone from a deleted account.
 */
export function isDeletedUsername(username: string | null | undefined): boolean {
  if (!username) return false;
  return username.startsWith('supprime_') || username === 'supprime' || username === DELETED_USER_NAME;
}

/**
 * Checks whether a user account has been deleted (by name, tombstone email, or explicit flag).
 */
export function isDeletedUser(
  name?: string | null,
  email?: string | null,
  isDeletedFlag?: boolean,
): boolean {
  if (isDeletedFlag) return true;
  if (
    name &&
    (name === DELETED_USER_NAME ||
      name.trim() === 'Utilisateur supprimé' ||
      name.startsWith('deleted+') ||
      name.includes('@revime.invalid') ||
      name.startsWith('supprime_') ||
      name === 'supprime')
  ) {
    return true;
  }
  if (email && (email.includes('@revime.invalid') || email.startsWith('deleted+'))) {
    return true;
  }
  return false;
}
