import { randomUUID } from 'node:crypto';
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  ProviderRevocationService,
  type RevocationInput,
} from '../auth/provider-revocation/provider-revocation.service.js';
import type {
  MeResponse,
  MyParticularQuotaResponse,
  SetAvatarInput,
  SetBannerInput,
  SignAvatarInput,
  SignBannerInput,
  SignPhotoResponse,
  UpdateModesInput,
  UpdateNotificationPreferencesInput,
  UpdateRepairerInput,
  UpdateRepairerProfileInput,
  UpdateRepairerCategoriesInput,
  UpdateUsernameInput,
  UpdateAvailabilityInput,
  TourState,
  UpdateTourInput,
} from '@revime/shared';
import { redactIdentityForUser } from '../identity/redact-identity.js';
import {
  newerTourMode,
  parseTourState,
  DELETED_USER_NAME,
  deletedUserEmail,
  deletedUsername,
  publicIdentity,
  MAX_SPECIALITIES,
  normaliseSpecialities,
  repairerProfileCompletion,
} from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { GeocodeService } from '../geo/geocode.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  avatarPrefixFor,
  buildAvatarPath,
  checkAvatarPath,
} from '../storage/avatar-paths.js';
import {
  bannerPrefixFor,
  buildBannerPath,
  checkBannerPath,
} from '../storage/banner-paths.js';
import { isStorageConfigured, storageGateway } from '../storage/gateway.js';
import { allowSignature } from '../storage/sign-limit.js';
import {
  isIdentityGateEnabled,
  isVerificationGateEnabled,
} from '../verification/gate.js';
import { arePaymentsEnabled, isStripeTestMode } from '../payments/config.js';
import { isConnectEnabled } from '../connect/config.js';
import { isMessagingEnabled } from '../conversations/flag.js';
import { isShippingQuotesEnabled } from '../shipping/config.js';
import { USABLE_CATEGORY } from '../catalog/usable-category.js';
import { REPAIRER_SUSPENDED } from '../offers/offers.service.js';
import { readParticularQuota } from '../verification/particular-quota.js';
import { closeQuoteRequestsOfDeletedUser } from '../quote-requests/quote-request-closure.js';

/**
 * One hour, matching `READ_URL_TTL_SECONDS` in `demandes.service.ts`. A separate constant rather
 * than an import so demande photos and profile media can diverge without one silently changing the
 * other; if they are still equal the next time someone reads this, that is a choice and not a
 * coupling.
 *
 * 🆕 RENAMED FROM `AVATAR_READ_TTL_SECONDS` BY `CF-24`: it now governs the banner as well, and a
 * name saying « avatar » is exactly how a second, needless constant gets added for the banner.
 */
const PROFILE_MEDIA_READ_TTL_SECONDS = 3600;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
    // V9 U3. Optional so the many hand-built test instances keep working; Nest always injects it.
    @Optional() private readonly revocation?: ProviderRevocationService,
  ) {}

  /** V7 A10 (U7): the CGU art. 53 counter for the repairer himself, from the dashboard's own rule. */
  myParticularQuota(userId: string): Promise<MyParticularQuotaResponse> {
    return readParticularQuota(this.prisma, userId);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        profile: { where: { deletedAt: null } },
        repairerProfile: { where: { deletedAt: null } },
        repairerCategories: {
          // Deterministic order for the picker's checkbox seeding. DISPLAY order is derived from
          // the taxonomy's sortOrder at read time on the fiche, never from this.
          orderBy: { createdAt: 'asc' },
          // Filter deactivated categories so `me()` and `declaredSpecialities` agree: a category
          // deactivated after someone declared it would otherwise be counted by profil-public's
          // « N catégories » but absent from his fiche's chips and invisible in the picker, yet
          // still in `selected` - so his next save would 422 with no row he can untick.
          where: { category: { ...USABLE_CATEGORY } },
          select: { categoryId: true },
        },
        repairerAvailability: {
          // Ordered here so no consumer sorts, and ASC by day because the fiche renders a
          // Monday-first French week.
          orderBy: { dayOfWeek: 'asc' },
          select: { dayOfWeek: true, closed: true, opensAt: true, closesAt: true },
        },
      },
    });
    return this.present(user);
  }

  /**
   * `CF-23`. Mints a signed upload URL for a profile photo.
   *
   * 🛑 DELIBERATELY NOT A REUSE OF `demandes.signPhotoUpload`, which calls `assertClientEnabled`
   * and would refuse a réparateur-only account - the exact account the client asked for this
   * feature for (« Dans le profil réparateur, ajouter : modification de la photo de profil »).
   * There is no verification gate either: setting a photo publishes nothing and spends nothing,
   * so `assertBasicVerified` would be a rule with no risk behind it.
   *
   * The `objectId` is generated HERE rather than accepted from the client, so two changes in the
   * same millisecond cannot collide and a client cannot aim a signed URL at an object that
   * already exists in order to overwrite it.
   *
   * The rate limit comes first, before any other work: refusing early is the point of a limit. It
   * is the SAME per-user bucket demande photos use, so a client cannot get a second allowance of
   * bucket writes just by choosing a different route.
   */
  async signAvatarUpload(userId: string, input: SignAvatarInput): Promise<SignPhotoResponse> {
    if (!allowSignature(userId)) {
      throw new AppException('TOO_MANY_REQUESTS', 'Trop de photos envoyées. Réessayez plus tard.');
    }

    // Fails CLOSED rather than handing back a fake URL no upload can use: a client that PUT its
    // bytes to a fake URL would believe the photo was stored.
    if (!isStorageConfigured()) {
      throw new AppException('INTERNAL', "L'envoi de photos est indisponible.");
    }

    const path = buildAvatarPath(userId, randomUUID(), input.contentType);
    return storageGateway().createSignedUpload(path, input.contentType);
  }

  /**
   * `CF-23`. Points the profile at an uploaded object, or clears it when `path` is null.
   *
   * Three checks, in this order, and each closes a hole the others do not:
   *
   *  1. **Shape and ownership** (`checkAvatarPath`) - refuses another account's prefix, and also
   *     refuses the caller's OWN demande photo path. That second case matters: a demande object
   *     is one this caller genuinely owns, so an ownership-only check would let them point their
   *     profile at an image the orphan cron may delete 24 hours later, blanking the photo with
   *     no error anywhere.
   *  2. **Existence in the bucket** - signing a URL creates nothing, so without this a client
   *     could name a well-formed path it never uploaded.
   *  3. Only then the write.
   *
   * 🛑 THE ORDER OF THE LAST TWO STEPS IS LOAD-BEARING. The column is written FIRST and the stale
   * objects deleted afterwards, best-effort. The column is the user-visible outcome, so a bucket
   * that refuses the delete must leak an object rather than fail the change the user asked for.
   * The reverse order would delete the old photo and then, on a failed write, leave the profile
   * pointing at nothing.
   *
   * 🆕 THE CLEANUP IS A PREFIX PRUNE SINCE `CF-24`, NOT A DELETE OF THE PREVIOUS COLUMN VALUE, and
   * that closes a leak rather than tidying one. Signing creates no object, so an upload whose
   * commit never arrives - dropped connection, backgrounded app, a 422 on the second attempt -
   * left an object referenced by nothing, and nothing swept it: the orphan cron is anchored at
   * `demandes`. Pruning the whole prefix states the invariant the feature actually wants, which is
   * that the caller's prefix holds exactly the committed object or nothing. It costs no extra round
   * trip, because the existence check already lists that prefix, and it removes the need to read
   * the previous column value at all - one fewer query than before.
   */
  async setAvatar(userId: string, input: SetAvatarInput): Promise<MeResponse> {
    if (input.path !== null) {
      const check = checkAvatarPath(input.path, userId);
      if (!check.ok) {
        throw new AppException('UNPROCESSABLE_ENTITY', check.message, { path: check.message });
      }
      if (!isStorageConfigured()) {
        throw new AppException('INTERNAL', "L'envoi de photos est indisponible.");
      }
    }

    // ONE listing, used for BOTH the existence check and the prune. The SESSION's userId, not one
    // parsed back out of the path: `checkAvatarPath` has already proved the two agree, and
    // re-deriving it from client input would reintroduce the question that check exists to settle.
    const prefix = avatarPrefixFor(userId);
    const owned = await this.ownedObjectsUnder(prefix);

    if (input.path !== null && !owned.includes(input.path)) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Photo de profil introuvable.', {
        path: 'Photo de profil introuvable.',
      });
    }

    await this.prisma.profile.update({
      where: { userId },
      data: { avatarPath: input.path },
    });

    await this.pruneExcept(owned, input.path, 'avatar');

    return this.me(userId);
  }

  /**
   * `CF-24`. Mints a signed upload URL for a réparateur's fiche-publique banner.
   *
   * 🛑 GATED ON RÉPARATEUR MODE, WHICH THE AVATAR ROUTE DELIBERATELY IS NOT - and gated HERE, on
   * the SIGN, rather than only on the commit. Two reasons, and the second is the one that bites:
   * `bannerPath` lives on `RepairerProfile`, a row that does not exist until réparateur mode is
   * enabled, so a client's commit would raise Prisma's P2025 and surface as an opaque 500 instead
   * of an explanation. And signing without the gate would let a client PUT bytes into `banners/`
   * that no route can ever reference and no cron sweeps, because there is no cron for that prefix.
   *
   * 🛑 THE RATE LIMIT COMES FIRST, BEFORE THE GATE, and the order is asserted rather than assumed.
   * Refusing early is the point of a limit - a client hammering this route must not get its own
   * refusals for free. It is the SAME per-user bucket demande photos and avatars use, so nobody
   * gets a third allowance of bucket writes by picking a different route.
   */
  async signBannerUpload(userId: string, input: SignBannerInput): Promise<SignPhotoResponse> {
    if (!allowSignature(userId)) {
      throw new AppException('TOO_MANY_REQUESTS', 'Trop de photos envoyées. Réessayez plus tard.');
    }

    await this.assertRepairerEnabled(userId);

    // Fails CLOSED rather than handing back a fake URL no upload can use: a réparateur that PUT its
    // bytes to a fake URL would believe the banner was stored.
    if (!isStorageConfigured()) {
      throw new AppException('INTERNAL', "L'envoi de photos est indisponible.");
    }

    const path = buildBannerPath(userId, randomUUID(), input.contentType);
    return storageGateway().createSignedUpload(path, input.contentType);
  }

  /**
   * `CF-24`. Points the réparateur profile at an uploaded banner, or clears it when `path` is null.
   *
   * The same steps as `setAvatar`, in the same order and for the same reasons - read its comment,
   * which is the record for both, including why the column is written BEFORE the prune and why the
   * prune covers the whole prefix. Two differences, both deliberate:
   *
   *  1. The réparateur gate, for the reason `signBannerUpload` states. First, so a client-only
   *     account is refused before anything is read or listed.
   *  2. `checkBannerPath` refuses an AVATAR path as well as a demande one. Both are objects this
   *     caller genuinely owns, so ownership alone would accept either - and because the prune
   *     clears everything else under the prefix it is handed, a crossed path would point the fiche
   *     at the avatar object and then delete it on the next photo change, with no error anywhere.
   *     See `checkProfileMediaPath`.
   */
  async setBanner(userId: string, input: SetBannerInput): Promise<MeResponse> {
    await this.assertRepairerEnabled(userId);

    if (input.path !== null) {
      const check = checkBannerPath(input.path, userId);
      if (!check.ok) {
        throw new AppException('UNPROCESSABLE_ENTITY', check.message, { path: check.message });
      }
      if (!isStorageConfigured()) {
        throw new AppException('INTERNAL', "L'envoi de photos est indisponible.");
      }
    }

    const prefix = bannerPrefixFor(userId);
    const owned = await this.ownedObjectsUnder(prefix);

    if (input.path !== null && !owned.includes(input.path)) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Bannière introuvable.', {
        path: 'Bannière introuvable.',
      });
    }

    await this.prisma.repairerProfile.update({
      where: { userId },
      data: { bannerPath: input.path },
    });

    await this.pruneExcept(owned, input.path, 'banner');

    return this.me(userId);
  }

  /**
   * Every object currently under one of the caller's own profile-media prefixes, as FULL paths.
   *
   * `listPrefix` returns names relative to the prefix - a contract stated on the gateway interface
   * and honoured by both implementations - so they are re-absolutised here, once, rather than at
   * each of the three call sites that compare or delete them.
   *
   * Returns empty rather than throwing when storage is unconfigured, so that CLEARING a photo still
   * works with no bucket: the column is the user-visible state and there is nothing to prune.
   */
  private async ownedObjectsUnder(prefix: string): Promise<string[]> {
    if (!isStorageConfigured()) return [];
    const objects = await storageGateway().listPrefix(prefix);
    return objects.map((o) => `${prefix}/${o.name}`);
  }

  /**
   * Deletes every listed object except the one just committed, best-effort.
   *
   * 🛑 PREFIX-SCOPED BY CONSTRUCTION: it can only delete what `ownedObjectsUnder` was asked to
   * list, so it cannot reach the caller's OTHER profile-media prefix. Do not "simplify" this into
   * a per-user sweep - that would delete a réparateur's banner every time he changed his photo.
   */
  private async pruneExcept(
    owned: string[],
    keep: string | null,
    label: 'avatar' | 'banner',
  ): Promise<void> {
    const stale = owned.filter((p) => p !== keep);
    if (stale.length === 0) return;
    try {
      await storageGateway().remove(stale);
    } catch (error) {
      // Warn rather than throw: the column HAS changed by this point, and telling the user the
      // change failed would be false. Leaked objects are the cheapest possible outcome here.
      this.logger.warn(
        `Failed to prune stale ${label} objects ${stale.join(', ')}: ${String(error)}`,
      );
    }
  }

  /**
   * The réparateur-mode refusal, in one place.
   *
   * 🆕 EXTRACTED BY `CF-24`. It was inlined verbatim in `updateRepairer` and
   * `updateRepairerProfile`, whose comment already said the duplication existed « so the two
   * refusals cannot drift apart » - a rule that stops scaling at two copies, and this slice adds
   * two more callers.
   */
  private async assertRepairerEnabled(userId: string): Promise<void> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId, deletedAt: null },
      select: { repairerEnabled: true },
    });
    if (!profile?.repairerEnabled) {
      throw new AppException('FORBIDDEN', 'Activez le mode réparateur.');
    }
  }

  /**
   * One path, one signed URL, or null. Serves the avatar and - since `CF-24` - the banner.
   *
   * Returns null for an unconfigured bucket without calling out, because the fake gateway signs
   * nothing and would answer with an empty map anyway - this makes that the explicit contract
   * rather than an accident of which gateway got selected.
   *
   * 🛑 ONE PATH PER CALL, so `present` makes TWO round trips for a réparateur with both images.
   * That is acceptable HERE and would not be in a list: `me` returns one row, and the alternative
   * is a batching helper whose only caller passes at most two paths. `repairers.service.ts` batches
   * for real, because the directory is unbounded.
   */
  private async signProfileMedia(path: string | null): Promise<string | null> {
    if (path === null || !isStorageConfigured()) return null;
    const signed = await storageGateway().createSignedReadUrls(
      [path],
      PROFILE_MEDIA_READ_TTL_SECONDS,
    );
    return signed.get(path) ?? null;
  }

  async updateModes(userId: string, input: UpdateModesInput): Promise<MeResponse> {
    const current = await this.prisma.profile.findUniqueOrThrow({ where: { userId } });

    const clientEnabled = input.clientEnabled ?? current.clientEnabled;
    const repairerEnabled = input.repairerEnabled ?? current.repairerEnabled;
    const activeMode = input.activeMode ?? current.activeMode;

    if (!clientEnabled && !repairerEnabled) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        'Au moins un mode doit rester activé.',
      );
    }
    if (activeMode === 'REPAIRER' && !repairerEnabled) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        "Activez d'abord le mode réparateur.",
      );
    }

    // Only the false → true transition, never every request that mentions
    // réparateur mode. A réparateur who is already enabled must keep being able
    // to switch modes, or flipping the flag traps them in réparateur mode.
    if (repairerEnabled && !current.repairerEnabled) {
      /**
       * 🛑 B2 GUARD 7. WITHOUT THIS THE SUSPENSION IS UNDOABLE BY ITS TARGET: he turns the
       * mode off and on again, and this method re-upserts a live RepairerProfile while the
       * marker still stands.
       *
       * Nothing else stops him, and since CF4-01 this is the ONLY guard on this transition.
       * The identity check (`assertIdentityVerified(…, 'become')`) used to sit here and
       * deadlocked the journey: an unverified client could not become a réparateur, and the
       * verification screen is reached from réparateur mode. Identity is now required on
       * ACTIONS (`assertIdentityVerified(…, 'offer')` in offers.service.ts), not on the mode,
       * so a réparateur can enable the mode, browse, and verify before sending an offer.
       *
       * On the false → true transition and deliberately not on `activeMode`:
       * refusing a mode SWITCH would trap a suspended réparateur in réparateur mode with no
       * route back to his client side, which is the failure this method's existing comments
       * warn about twice.
       *
       * The message names no reason. `repairerSuspendedReason` is the operator's note, aimed
       * at the audit log and the fiche, not at the person.
       */
      if (current.repairerSuspendedAt !== null) {
        throw new AppException('FORBIDDEN', REPAIRER_SUSPENDED);
      }
    }

    // V7 A10 Q10 (`DEC7-22`, `ISS7-011`): approval makes him PRO (V7 D4), and setting himself back to
    // « Particulier » would bring back D4's contradiction and put him under the CGU art. 53 cap. Read
    // only when the request names that kind, so a plain mode switch costs no query.
    if (input.kind === 'INDIVIDUAL') {
      const business = await this.prisma.businessVerification.findUnique({
        where: { userId },
        select: { status: true },
      });
      if (business?.status === 'APPROVED') {
        throw new AppException(
          'UNPROCESSABLE_ENTITY',
          'Votre entreprise est vérifiée : votre statut reste Professionnel.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.profile.update({
        where: { userId },
        data: {
          clientEnabled,
          repairerEnabled,
          activeMode,
          ...(current.onboardingCompletedAt === null ? { onboardingCompletedAt: new Date() } : {}),
        },
      });

      if (repairerEnabled) {
        const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true } });
        await tx.repairerProfile.upsert({
          where: { userId },
          create: {
            userId,
            // 🛑 The handle, NOT `user.name`. This default used to be the composed
            // legal name, and `displayName` is the PUBLIC repairer identity on
            // nine surfaces - the directory, the public profile, every offer card,
            // comparaison, paiement, acceptée, the commande header, the
            // conversation header and avis. So every repairer who never
            // hand-edited their profile was publishing their legal name, which is
            // exactly what the client's CF-05 forbids. Measured 2026-08-21: 3 of 3
            // real profiles were in that state. Migration 22 remediates the
            // existing rows; this stops new ones.
            displayName: publicIdentity({ username: user.username, displayName: null }),
            kind: input.kind ?? 'INDIVIDUAL',
          },
          update: {
            deletedAt: null,
            ...(input.kind ? { kind: input.kind } : {}),
          },
        });
      }
    });

    return this.me(userId);
  }

  /**
   * V8 E2 (`DEC8-09` (2)). Writes one mode's help-bubble state. The newer `updatedAt` wins
   * (`newerTourMode`), so a stale write from a second device, or one landing after « Revoir la
   * visite », never undoes a newer state; the other mode is never touched. Read and write in one
   * transaction so two writes for the two modes cannot drop each other. Returns the whole state, which
   * is all the app needs back (it does not re-render from `/me` for this).
   */
  async updateTour(userId: string, input: UpdateTourInput): Promise<TourState> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.profile.findUniqueOrThrow({ where: { userId }, select: { tourState: true } });
      const current = parseTourState(row.tourState) ?? { CLIENT: null, REPAIRER: null };
      const next: TourState = { ...current, [input.mode]: newerTourMode(current[input.mode], input.state) };
      await tx.profile.update({ where: { userId }, data: { tourState: next } });
      return next;
    });
  }

  /**
   * `CF-47`. Flips one or more notification groups.
   *
   * 🛑 A PARTIAL update, and the guard below is the reason it is safe. Each key is
   * copied across only when present, so a screen that flips one switch sends one key
   * and cannot clobber the other two with a stale cached value. An empty body writes
   * NOTHING rather than issuing an update with `data: {}` - Prisma would accept that
   * and touch `updatedAt` for no reason.
   *
   * Returns `MeResponse` like every other mutation on this controller, so the app
   * re-renders from the server's answer rather than from optimistic local state.
   */
  async updateNotificationPreferences(
    userId: string,
    input: UpdateNotificationPreferencesInput,
  ): Promise<MeResponse> {
    const data: {
      notifyOffers?: boolean;
      notifyMessages?: boolean;
      notifyCommandes?: boolean;
    } = {};
    if (input.offers !== undefined) data.notifyOffers = input.offers;
    if (input.messages !== undefined) data.notifyMessages = input.messages;
    if (input.commandes !== undefined) data.notifyCommandes = input.commandes;

    if (Object.keys(data).length > 0) {
      await this.prisma.profile.update({ where: { userId }, data });
    }

    if (input.marketing !== undefined) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          marketingConsent: input.marketing,
          marketingConsentEmail: input.marketing,
          marketingConsentSms: input.marketing,
          marketingConsentAt: input.marketing ? new Date() : null,
        },
      });
    }

    return this.me(userId);
  }

  /**
   * Rename a handle. Goes through this controller rather than Better Auth's
   * /update-user so the validation is ours; the hook in normalise-username.ts
   * still guards that raw route as a second line rather than the only one.
   *
   * 🛑 Deliberately does NOT chase `RepairerProfile.displayName`, even when the
   * displayName is still exactly the old `'@' + username`. The derivation is a
   * DEFAULT AT CREATION, not a binding: once the row exists, displayName is
   * independently owned, and a repairer may have set it to that value on purpose.
   * There is no way to tell the two cases apart, so overwriting would silently
   * destroy a chosen trade name.
   */
  async updateUsername(userId: string, input: UpdateUsernameInput): Promise<MeResponse> {
    const taken = await this.prisma.user.findFirst({
      where: { username: input.username, id: { not: userId } },
      select: { id: true },
    });
    if (taken) {
      // AppException('CONFLICT', …) is 409 per STATUS_BY_CODE in
      // common/app-exception.ts, and the third argument is the `fields` record the
      // mobile form reads - profil-public.tsx:68 already does
      // `e.fields?.displayName ?? e.message`, so the handle form gets the message on
      // the field rather than in a banner for free.
      throw new AppException('CONFLICT', 'Ce nom d\'utilisateur est déjà pris.', {
        username: 'Ce nom d\'utilisateur est déjà pris.',
      });
    }
    try {
      // V9 B1 (`DEC9-06` (2)): saving the handle, even unchanged, is the username step done.
      await this.prisma.user.update({
        where: { id: userId },
        data: { username: input.username, usernameConfirmedAt: new Date() },
      });
    } catch (e) {
      // Lost race: another request took the handle between the check and the update.
      if (isUniqueViolation(e)) {
        throw new AppException('CONFLICT', 'Ce nom d\'utilisateur est déjà pris.', {
          username: 'Ce nom d\'utilisateur est déjà pris.',
        });
      }
      throw e;
    }
    return this.me(userId);
  }

  /**
   * The single writer of réparateur geography. Presentation -- displayName and bio --
   * is `updateRepairerProfile` below, and the split is deliberate: see its own comment.
   *
   * All four fields are written every time, deliberately. A réparateur moving
   * from 69003 to a code BAN cannot resolve must not keep the old Lyon
   * coordinates, or the feed sorts confidently on a lie that no UI can show,
   * because both surfaces display only postalCode.
   */
  async updateRepairer(userId: string, input: UpdateRepairerInput): Promise<MeResponse> {
    await this.assertRepairerEnabled(userId);

    // Best-effort by contract: an unreachable BAN must not stop the save.
    const result = await this.geocode.lookupPostalCode(input.postalCode);

    await this.prisma.repairerProfile.update({
      where: { userId },
      data: {
        postalCode: input.postalCode,
        lat: result?.lat ?? null,
        lng: result?.lng ?? null,
        serviceAreaLabel: result?.city ?? null,
        // 🛑 SPREAD, NOT A PLAIN ASSIGNMENT, and it is the one line on this route that does not
        // overwrite. The three fields above are DERIVED from postalCode, so they are rewritten
        // every call. The radius is independent user input: an app older than this change sends
        // only postalCode, and assigning `input.serviceRadiusKm` directly would null it.
        // Explicit null still clears, which is what the editor's « Non renseigné » sends.
        ...(input.serviceRadiusKm === undefined ? {} : { serviceRadiusKm: input.serviceRadiusKm }),
      },
    });

    return this.me(userId);
  }

  /**
   * The single writer of réparateur PRESENTATION -- piece C 4.6.
   *
   * A separate route from `updateRepairer` rather than a widening of it, and the reason
   * is semantic rather than cosmetic: that method writes all four geography fields on
   * every call deliberately, so that moving to a postal code BAN cannot resolve nulls
   * the old coordinates instead of keeping a confident lie. A partial-update semantic
   * cannot share a method with an overwrite-everything one.
   *
   * `kind` is absent on purpose (4.4) and `postalCode` belongs to the geography writer.
   * Zod strips both from the body, so neither can arrive here -- and the integration spec
   * drives each of them through the route rather than trusting that.
   *
   * A rename propagates retroactively to the offer card, the conversation counterpart
   * and the commande screens, because all of them read `displayName` live. That is
   * ordinary for a display name and is recorded as a V1 property in the spec, not
   * guarded here: with one operator and three accounts, moderating it would be
   * disproportionate.
   */
  async updateRepairerProfile(
    userId: string,
    input: UpdateRepairerProfileInput,
  ): Promise<MeResponse> {
    // Was a verbatim copy of `updateRepairer`'s refusal « so the two cannot drift apart ». `CF-24`
    // added two more callers, at which point a shared method is the only version of that rule that
    // keeps working.
    await this.assertRepairerEnabled(userId);

    await this.prisma.repairerProfile.update({
      where: { userId },
      data: {
        // Each field written ONLY when present, so a PATCH carrying one does not null
        // the other. `undefined` is Prisma's "leave alone"; `null` would be a write.
        ...(input.displayName === undefined ? {} : { displayName: input.displayName }),
        // Zod has already trimmed, so an all-whitespace bio arrives as ''. Normalising
        // it to null here rather than in the schema keeps « no bio » to exactly one
        // representation in the column while letting the schema stay a pure validator.
        ...(input.bio === undefined ? {} : { bio: input.bio === '' ? null : input.bio }),
      },
    });

    return this.me(userId);
  }

  /**
   * `CF-25`. Replaces the réparateur's declared speciality set wholesale - design §6 and §10.
   *
   * PUT, not PATCH: the verb means « set this to exactly this », which is what a multi-select
   * editor saves. `favorites.controller.ts` already uses `@Put` for idempotent set semantics.
   *
   * FOUR steps, in this order, and the order is the design:
   *   1. réparateur gate - a client has no fiche, so his declaration would be data with no
   *      surface to render it;
   *   2. validate every id against USABLE_CATEGORY, the SAME rule the catalog read and
   *      `DemandesService.create` use. Refused, never silently dropped;
   *   3. normalise (a root absorbs its children);
   *   4. THEN check the cap. Reversing 3 and 4 would refuse a legal body: a stale app can send
   *      a root plus its ten children, which is 11 ids meaning ONE thing.
   */
  async setCategories(
    userId: string,
    input: UpdateRepairerCategoriesInput,
  ): Promise<MeResponse> {
    await this.assertRepairerEnabled(userId);

    const unique = [...new Set(input.categoryIds)];

    // No round trip for the clear case: there is nothing to validate.
    const rows =
      unique.length === 0
        ? []
        : await this.prisma.category.findMany({
            // USABLE_CATEGORY IS SPREAD LAST, per its own header: a sibling condition using OR
            // would clobber its OR key and lose the parent-activeness rule.
            where: { id: { in: unique }, ...USABLE_CATEGORY },
            select: { id: true, parentId: true },
          });

    if (rows.length !== unique.length) {
      // Same code and same French as `DemandesService.create` for the identical condition.
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette catégorie est introuvable.');
    }

    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    const normalised = normaliseSpecialities(unique, parentOf);

    if (normalised.length > MAX_SPECIALITIES) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        `Vous pouvez choisir jusqu'à ${MAX_SPECIALITIES} catégories.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.repairerCategory.deleteMany({ where: { repairerUserId: userId } });
      if (normalised.length > 0) {
        await tx.repairerCategory.createMany({
          data: normalised.map((categoryId) => ({ repairerUserId: userId, categoryId })),
        });
      }
    });

    return this.me(userId);
  }

  /**
   * `CF-52`. Replaces his whole week.
   *
   * A whole-collection PUT rather than per-day PATCHes, the same shape `setCategories` uses:
   * the editor is a seven-row form, so a partial write has no caller, and delete-then-insert
   * makes the route idempotent without a diffing step.
   *
   * The schema has already refused anything that is not seven days or none, and has already
   * refused a closed day carrying hours. Migration 29's CHECK enforces the same rule at the
   * column, so a row that bypassed this route still cannot be malformed.
   */
  async setAvailability(userId: string, input: UpdateAvailabilityInput): Promise<MeResponse> {
    await this.assertRepairerEnabled(userId);

    await this.prisma.$transaction(async (tx) => {
      await tx.repairerAvailability.deleteMany({ where: { repairerUserId: userId } });
      if (input.days.length > 0) {
        await tx.repairerAvailability.createMany({
          // The SESSION's userId on every row. Nothing from the body addresses a user, so
          // there is no path to writing another account's hours.
          data: input.days.map((d) => ({
            repairerUserId: userId,
            dayOfWeek: d.dayOfWeek,
            closed: d.closed,
            opensAt: d.opensAt,
            closesAt: d.closesAt,
          })),
        });
      }
    });

    return this.me(userId);
  }

  /**
   * `CF-47`. Deletes the caller's account - SOFT, with a PII scrub. See the design §9.
   *
   * Soft rather than hard because `User` has 25 relations and two of them are not ours
   * to erase: `Commande` rows are financial records, and `Review` rows are the OTHER
   * party's reputation. So the row survives, stripped of everything identifying, and
   * every surface that joins `User.name` renders the tombstone without knowing about
   * this feature.
   *
   * Idempotent: an already-deleted profile returns quietly. A second DELETE is a retry,
   * not an error, and answering 409 to it would make a dropped response look like a
   * failure the user has to act on.
   */
  async deleteAccount(userId: string, opts?: { revoke?: Omit<RevocationInput, 'userId'> }): Promise<void> {
    const profile = await this.prisma.profile.findFirst({
      where: { userId },
      select: { userId: true, deletedAt: true },
    });
    if (!profile || profile.deletedAt) return;

    /**
     * 🛑 THE ONE HARD REFUSAL. `status: PAID` with `step` short of `RELEASED` means the
     * platform is holding this pair's money against a repair that has not finished.
     * PENDING_PAYMENT does not block - no money has moved and the reconciliation cron
     * abandons it. ABANDONED, REFUNDED and PAID-at-RELEASED are terminal.
     *
     * Counted on BOTH sides: a réparateur mid-repair is exactly as blocking as a client
     * mid-repair, and checking one side would let the other walk away.
     *
     * The `step` guard is `{ not: 'RELEASED' }`, which UNDER SQL THREE-VALUED LOGIC
     * excludes NULL rows: `NULL <> 'RELEASED'` is NULL, not true. So a PAID row with a
     * null step would not be counted as blocking. That row is unreachable: the schema
     * states step is "Written to PAID in the same transaction that sets status PAID",
     * so `status: 'PAID'` implies a non-null step. An explicit null arm would obscure
     * the guard in order to cover a state the schema forbids.
     */
    const inEscrow = await this.prisma.commande.count({
      where: {
        status: 'PAID',
        step: { not: 'RELEASED' },
        OR: [{ clientUserId: userId }, { repairerUserId: userId }],
      },
    });
    if (inEscrow > 0) {
      throw new AppException(
        'CONFLICT',
        'Vous avez une réparation en cours. Terminez-la ou demandez un remboursement avant de supprimer votre compte.',
      );
    }

    /**
     * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (5), `DEC9-09` (5)). Revoke the Apple / Google sign-in BEFORE
     * the scrub, which deletes the login rows the revocation reads; after the escrow refusal, so a
     * refused deletion revokes nothing. `revokeAll` never throws: its outcome never stops the deletion.
     */
    if (opts?.revoke && this.revocation) {
      await this.revocation.revokeAll({ userId, ...opts.revoke }).catch(() => []);
    }

    const now = new Date();

    try {
      await this.prisma.$transaction(
        async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });

      /**
       * CF5-01 / CF5-09: client requirement - at least 2 active Super Admins at all times
       * so dashboard access can never be lost again. Refuse deletion if active Super Admins <= 2.
       */
      if (user?.role === 'super_admin') {
        const activeSuperAdmins = await tx.user.count({
          where: {
            role: 'super_admin',
            profile: { deletedAt: null },
          },
        });
        if (activeSuperAdmins <= 2) {
          throw new AppException(
            'CONFLICT',
            'Ce compte est Super Admin. La plateforme doit conserver au moins 2 Super Admins actifs en permanence. Nommez un autre Super Admin depuis le dashboard avant de supprimer ce compte.',
          );
        }
      }

      /**
       * The tombstone values are CONSTRAINED, not arbitrary. `email` is NOT NULL and
       * unique and `username` is NOT NULL, unique and `[a-z0-9_]`-only, so neither can
       * be nulled - both are replaced with a collision-free stand-in. `phone` IS
       * nullable and unique, so nulling it both scrubs it and frees the number.
       * Freeing the phone and the address is deliberate: someone who deletes an account
       * and signs up again should be able to use their own contacts.
       */
      await tx.user.update({
        where: { id: userId },
        data: {
          name: DELETED_USER_NAME,
          firstName: null,
          lastName: null,
          email: deletedUserEmail(userId),
          username: deletedUsername(userId),
          // CF5-01: clear staff / super_admin role on tombstone so a deleted account never retains privileges
          role: 'user',
          phone: null,
          phoneVerifiedAt: null,
          emailVerified: false,
          image: null,
          // The admin() plugin already refuses sign-in for a banned user, so this is a
          // shipped mechanism rather than a new gate. The COPY a deleted user sees is
          // still ban-flavoured; see the design §9.4.
          banned: true,
          banReason: 'account_deleted',
        },
      });

      await tx.profile.update({
        where: { userId },
        data: {
          deletedAt: now,
          avatarPath: null,
          clientEnabled: false,
          repairerEnabled: false,
        },
      });

      // updateMany, not update: a client-only account has no RepairerProfile row, and
      // `update` would throw P2025 on it.
      await tx.repairerProfile.updateMany({
        where: { userId },
        data: {
          displayName: DELETED_USER_NAME,
          bio: null,
          bannerPath: null,
          postalCode: null,
          serviceAreaLabel: null,
          lat: null,
          lng: null,
        },
      });

      // Sessions: the ban blocks a NEW sign-in; this ends the ones already open.
      await tx.session.deleteMany({ where: { userId } });

      /**
       * 🛑 ACCOUNTS MUST GO, not be scrubbed. `Account` holds the credential hash in
       * `password` and the OAuth linkage in `accountId` + `providerId`. A surviving
       * Google row would make a fresh Google signup RE-LINK to this tombstoned user
       * instead of creating a new one.
       */
      await tx.account.deleteMany({ where: { userId } });

      /**
       * 🛑 AND SO MUST VERIFICATION ATTEMPTS, for a correctness reason rather than a
       * privacy one. `target` holds the E.164 phone or the email address and is counted
       * against per-target limits through @@index([target, createdAt]). Since the scrub
       * FREES both contacts, leaving these rows would charge this account's rate-limit
       * and BLOCKED history to whoever next signs up with that address.
       */
      await tx.verificationAttempt.deleteMany({ where: { userId } });

      /**
       * `CF-18`. Favourites in BOTH directions.
       *
       * 🛑 THE FOREIGN KEYS DO NOT COVER THIS. `onDelete: Cascade` fires on a row delete and this
       * is an UPDATE - the tombstone above. So these two statements are the whole of it.
       *
       * Both directions, and the second is the one that is easy to forget: other people's saved
       * réparateurs pointing at this account. `listRepairers` also filters them out through
       * `directoryWhere`, but leaving the rows would make that filter the only thing standing
       * between a deleted account and somebody's Favoris list.
       */
      await tx.favoriteRepairer.deleteMany({
        where: { OR: [{ userId }, { repairerUserId: userId }] },
      });
      // One direction only: a favourite OF this user's demandes is not about this user's data, and
      // the demande itself survives the scrub - see the design §6 and the open retention decision
      // in PROJECT_ROADMAP.md §2. This slice does not widen that decision.
      await tx.favoriteDemande.deleteMany({ where: { userId } });

      /**
       * `CF-25`. His declared specialities.
       *
       * 🛑 THE FOREIGN KEY DOES NOT COVER THIS. `onDelete: Cascade` fires on a row delete and
       * this is an UPDATE - the tombstone above - exactly as the favourites note says.
       *
       * ONE direction, unlike `FavoriteRepairer`: a category is not a user, so there is no
       * reverse edge pointing at this account.
       *
       * 🛑 AND THIS IS DELETION-ONLY. `updateModes` must NOT do it: disabling réparateur mode
       * soft-deletes the profile and re-enabling restores it, so the declaration has to survive
       * that, which is the whole reason this table is keyed on User.
       */
      await tx.repairerCategory.deleteMany({ where: { repairerUserId: userId } });

      /**
       * `CF-52`. His opening hours.
       *
       * 🛑 THE FOREIGN KEY DOES NOT COVER THIS, for the reason the categories note directly above
       * gives: `onDelete: Cascade` fires on a row DELETE and the account deletion is an UPDATE -
       * the tombstone. Without this line a deleted réparateur's hours survive him.
       *
       * 🛑 AND THIS IS DELETION-ONLY. `updateModes` must NOT do it: disabling réparateur mode
       * soft-deletes the profile and re-enabling restores it, so the hours have to survive that,
       * which is the whole reason this table is keyed on User.
       */
      await tx.repairerAvailability.deleteMany({ where: { repairerUserId: userId } });

      /**
       * CF4-25. His open private quote requests, both directions: sent → CANCELLED_BY_CLIENT,
       * addressed to him → DECLINED. There is no foreign key on `targetRepairerUserId` to do
       * this, deliberately (spec §4.1), and a request left OPEN would wait a week for a party
       * who no longer exists.
       */
      await closeQuoteRequestsOfDeletedUser(tx, userId);

      /**
       * Bug B16: Unassign any active litiges (disputes) and signalements (reports)
       * assigned to this user so they don't remain stuck with "Assigné à : Utilisateur supprimé".
       */
      await tx.dispute.updateMany({
        where: { assignedToUserId: userId },
        data: { assignedToUserId: null, assignedAt: null },
      });
      await tx.conversationReport.updateMany({
        where: { assignedToUserId: userId },
        data: { assignedToUserId: null, assignedAt: null },
      });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'P2034') {
        throw new AppException('CONFLICT', 'Une autre opération est en cours. Veuillez réessayer.');
      }
      throw err;
    }

    /**
     * The identity erasure half of `CF-08`'s condition (c). Best-effort and deliberately AFTER
     * the transaction, for the same reason the storage cleanup below is: a third-party call that
     * fails must not roll back an account deletion.
     *
     * 🛑 NOTE WHAT THIS METHOD DOES *NOT* DO: it does not delete the `IdentityVerification` row,
     * and that is now a DECISION rather than the omission it used to be. `onDelete: Cascade`
     * fires on a row DELETE and this method is an UPDATE - the same trap the favourites,
     * categories and availability notes above record - so the row survives on purpose. The
     * session id is the only handle on Stripe's copy of the document, and after a redaction the
     * row is the evidence we discharged the duty.
     *
     * 🛑 AND THE SECOND HALF OF THE DUTY IS NOT HERE. The user must be told to contact Stripe
     * support themselves, because redaction does not reach Stripe's own servers. That is on
     * `app/parametres/supprimer.tsx`. A redaction nobody hears about discharges nothing.
     *
     * Accepted limitation: a session in `PROCESSING` cannot be redacted, so this throws for that
     * user and the deletion proceeds without a redaction. The warn below is the only record, and
     * the deletion screen's « contact Stripe » line is what he is left with.
     */
    try {
      await redactIdentityForUser(this.prisma, userId);
    } catch (error) {
      this.logger.warn('[users] identity redaction failed for deleted user %s', userId, error);
    }

    // Best-effort, and deliberately AFTER the transaction: the columns are the
    // user-visible outcome, and a bucket that refuses a delete must leak an object
    // rather than roll back an account deletion. Same ordering rule as `setAvatar`.
    if (isStorageConfigured()) {
      try {
        const avatarPrefix = avatarPrefixFor(userId);
        const avatarOwned = await this.ownedObjectsUnder(avatarPrefix);
        if (avatarOwned.length > 0) {
          await this.pruneExcept(avatarOwned, null, 'avatar');
        }

        const bannerPrefix = bannerPrefixFor(userId);
        const bannerOwned = await this.ownedObjectsUnder(bannerPrefix);
        if (bannerOwned.length > 0) {
          await this.pruneExcept(bannerOwned, null, 'banner');
        }
      } catch (error) {
        // Both listing and pruning can throw, and neither must fail the deletion.
        this.logger.warn('[users] storage cleanup failed for deleted user %s', userId, error);
      }
    }
  }

  /**
   * 🆕 ASYNC as of `CF-23`, because `avatarUrl` has to be signed and signing is a network call.
   * `CF-24` added a second signed field, `repairer.bannerUrl`, so there are now TWO awaits - and
   * therefore two sequential round trips for a réparateur holding both images. Left sequential
   * deliberately: `me` returns one row, and the alternative is a batching helper whose only caller
   * would pass at most two paths. `repairers.service.ts` batches for real, because its list is
   * unbounded. If a THIRD signed field is ever added here, batch it.
   *
   * Every mutating route on this service returns `this.me(userId)` rather than presenting a row it
   * already holds, so this method has exactly ONE caller. That is worth knowing before adding a
   * second: presenting a row without going through `me` would be the one path on which `avatarUrl`
   * or `bannerUrl` could silently come back null.
   */
  private async present(user: {
    id: string; email: string; name: string; firstName: string | null; lastName: string | null;
    username: string;
    phone: string | null; emailVerified: boolean; phoneVerifiedAt: Date | null;
    image: string | null; role: string | null; marketingConsent: boolean; cguVersion?: string | null;
    signupMethod?: MeResponse['signupMethod']; usernameConfirmedAt?: Date | null; privacyVersion?: string | null;
    profile: { clientEnabled: boolean; repairerEnabled: boolean; activeMode: 'CLIENT' | 'REPAIRER'; verificationLevel: MeResponse['profile']['verificationLevel']; onboardingCompletedAt: Date | null; avatarPath: string | null; deletedAt: Date | null; notifyOffers: boolean; notifyMessages: boolean; notifyCommandes: boolean; tourState?: unknown } | null;
    repairerProfile: { kind: 'PRO' | 'INDIVIDUAL'; displayName: string; bio: string | null; postalCode: string | null; serviceAreaLabel: string | null; serviceRadiusKm: number | null; bannerPath: string | null; deletedAt: Date | null; fiscalCompletedAt?: Date | null } | null;
    repairerCategories: { categoryId: string }[];
    repairerAvailability: { dayOfWeek: number; closed: boolean; opensAt: number | null; closesAt: number | null }[];
  }): Promise<MeResponse> {
    const profile = user.profile;
    if (!profile || profile.deletedAt) throw new Error(`Profile missing for user ${user.id}`);
    const repairer = user.repairerProfile && !user.repairerProfile.deletedAt ? user.repairerProfile : null;

    // Hoisted out of the object literal because `completion` reads both. Two awaits, as before -
    // `signProfileMedia` takes one path per call, which is acceptable for a single-row read.
    const avatarUrl = await this.signProfileMedia(profile.avatarPath);
    const bannerUrl = repairer ? await this.signProfileMedia(repairer.bannerPath) : null;
    const categoryIds = user.repairerCategories.map((r) => r.categoryId);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      phone: user.phone,
      emailVerified: user.emailVerified,
      // A timestamp on the wire would imply the app cares when. It cares whether.
      phoneVerified: user.phoneVerifiedAt !== null,
      verificationRequired: isVerificationGateEnabled(),
      identityRequired: isIdentityGateEnabled(),
      paymentsEnabled: arePaymentsEnabled(),
      marketingConsent: user.marketingConsent,
      connectEnabled: isConnectEnabled(),
      messagingEnabled: isMessagingEnabled(),
      shippingQuotesEnabled: isShippingQuotesEnabled(),
      stripeTestMode: isStripeTestMode(),
      image: user.image,
      // Null when the account has no photo AND when the column outlives its object:
      // `createSignedReadUrls` omits a path with no object rather than fabricating a URL, so the
      // app is never handed a link that renders as a broken image. One absent state on purpose,
      // the same choice `DemandeListItem.photoUrl` makes.
      avatarUrl,
      role: user.role,
      // V7 D5 (U9b): what the app compares with the active CGU version.
      cguVersion: user.cguVersion ?? null,
      // V9 B1: what `nextSignupStep` reads to decide the completion steps an account still owes.
      signupMethod: user.signupMethod ?? null,
      usernameConfirmedAt: user.usernameConfirmedAt?.toISOString() ?? null,
      privacyVersion: user.privacyVersion ?? null,
      profile: {
        clientEnabled: profile.clientEnabled,
        repairerEnabled: profile.repairerEnabled,
        activeMode: profile.activeMode,
        verificationLevel: profile.verificationLevel,
        onboardingCompletedAt: profile.onboardingCompletedAt?.toISOString() ?? null,
        notifyOffers: profile.notifyOffers,
        notifyMessages: profile.notifyMessages,
        notifyCommandes: profile.notifyCommandes,
        // V8 E2 (`DEC8-09` (2)): null = never offered; a corrupt column reads as both modes empty.
        tour: parseTourState(profile.tourState),
      },
      repairer: repairer
        ? {
            kind: repairer.kind,
            displayName: repairer.displayName,
            bio: repairer.bio,
            postalCode: repairer.postalCode,
            serviceAreaLabel: repairer.serviceAreaLabel,
            categoryIds,
            bannerUrl,
            serviceRadiusKm: repairer.serviceRadiusKm,
            availability: user.repairerAvailability,
            // `CF-49`. Computed from the response being built, so the count and the fields it
            // counts cannot disagree. `image` is the OAuth avatar and counts towards the photo
            // row, because the fiche renders `avatarUrl ?? image`.
            completion: repairerProfileCompletion({
              avatarUrl,
              image: user.image,
              bannerUrl,
              bio: repairer.bio,
              categoryIds,
              postalCode: repairer.postalCode,
              availabilityDays: user.repairerAvailability.length,
            }),
            fiscalCompleted: Boolean(repairer.fiscalCompletedAt),
          }
        : null,
    };
  }
}
