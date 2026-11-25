import { Injectable } from '@nestjs/common';
import {
  NO_REPAIRER_STATS,
  NO_VALUE,
  specialityLabel,
  verifiedBadgeFor,
  type DirectoryCardDto,
  type DirectoryQuery,
  type RepairerCardDto,
  type RepairerProfileDto,
  type RepairerStats,
} from '@revime/shared';
import { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { USABLE_CATEGORY } from '../catalog/usable-category.js';
import { GeocodeService } from '../geo/geocode.service.js';
import { byDistanceKm, distanceKm, type Coords } from '../geo/haversine.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertSameSide, isReviewUser, viewerSideWhere } from '../review-accounts/review-account.js';
import { repairerStats } from '../reviews/repairer-stats.js';
import { isStorageConfigured, storageGateway } from '../storage/gateway.js';
import { specialityMatchIds } from './speciality-match.js';

/** One hour, matching every other signed read URL in this API. */
const PROFILE_MEDIA_READ_TTL_SECONDS = 3600;

/**
 * What every row of the directory selects. Named rather than inlined for the reason
 * `OFFER_INCLUDE` and `COUNTERPART_SELECT` exist: an inline spread of a nested select
 * is silently OVERWRITTEN rather than merged, so two copies drift with no compiler
 * error -- and the detail read spreads this exact fragment plus `bio` and `createdAt`.
 */
export const CARD_SELECT = {
  userId: true,
  displayName: true,
  serviceAreaLabel: true,
  // `avatarPath` joins `verificationLevel` on Profile rather than on RepairerProfile: `CF-23`
  // put the column on the PERSON, so one photo serves both modes. Selecting it here is what
  // makes the directory and the public profile show the same face -- adding it to the detail
  // read alone would let the same réparateur render a photo on one screen and initials on the
  // other, which is the exact drift this named fragment exists to prevent.
  user: {
    select: {
      username: true,
      profile: { select: { verificationLevel: true, avatarPath: true } },
    },
  },
} as const;

/**
 * WHAT MAKES A RÉPARATEUR LISTABLE, and nothing about who is asking.
 *
 * Split out of `directoryWhere` by Stage 6 piece B2 for a measured reason rather than for
 * tidiness: `getPublicProfile` HAND-WROTE these same clauses, because directoryWhere
 * excludes the caller and a fiche read needs a specific userId. So a fourth condition added
 * to directoryWhere alone would have hidden a suspended réparateur from the directory and
 * left his public profile being served. Both now read this.
 *
 * 🛑 `repairerSuspendedAt` sits INSIDE the `profile` clause, not beside `user`. Putting it
 * beside `user` would be a TYPE error - the column lives on `Profile`, not `RepairerProfile`,
 * so tsc catches it. The tsc-invisible hazard is a second spread `user:` key: both spellings
 * are valid `Prisma.RepairerProfileWhereInput`, so a caller spreading `{ user: {...} }` after
 * this fragment REPLACES its `user` key rather than merging. See `list()`'s clobber warning.
 *
 * `deletedAt: null` on RepairerProfile is INERT today - measured 2026-09-03, nothing in the
 * API writes that column. Kept deliberately: an inert guard costs nothing and removing it
 * would be wrong the day something does write it.
 */
export function listableRepairerWhere(): Prisma.RepairerProfileWhereInput {
  return {
    deletedAt: null,
    user: { profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } },
  };
}

/**
 * The directory's read: listable, minus the caller himself.
 *
 * 🛑 SPREAD-COMPOSED, NOT `AND`-COMPOSED, because `list()` spreads this and then spreads the
 * category filter's own `{ AND: [...] }`. Had this returned `{ AND: [...] }`, the category
 * spread would have REPLACED it - so a réparateur who turned the mode off, deleted his
 * account, or is suspended would reappear in any category-filtered directory. Both spellings
 * are valid `Prisma.RepairerProfileWhereInput`, so tsc cannot see the difference. The clobber
 * warning in `list()` exists to prevent exactly this.
 *
 * **The composition form depends on whether the caller adds a colliding key:** `list()` and
 * `getPublicProfile` add no colliding keys, so spread is safe. `favorites.service.ts:69` and
 * `:108` add their own `userId` key, which under a spread would overwrite this fragment's
 * `userId: { not: caller }` and silently remove the self-exclusion - so those two wrap this
 * in `{ AND: [directoryWhere(...), { userId: ... }] }`.
 */
export function directoryWhere(callerUserId: string | null): Prisma.RepairerProfileWhereInput {
  return callerUserId === null
    ? listableRepairerWhere()
    : { ...listableRepairerWhere(), userId: { not: callerUserId } };
}

/**
 * One signing round trip for however many paths it is handed, keyed by path.
 *
 * 🛑 A BATCH, NOT A SIGN-PER-ROW. Neither `list` nor the inbox has a `take`, so a per-row call
 * would be an N+1 that stays invisible until real accounts have photos -- the same reason
 * `listMine` signs its thumbnails in one call. The empty-input short circuit is not a
 * micro-optimisation either: it keeps a directory of réparateurs with no photos, which is every
 * réparateur today, from making a round trip whose answer is already known.
 *
 * 🆕 RENAMED FROM `signAvatars` BY `CF-24` rather than joined by a sibling, because it was never
 * about avatars: it takes paths and returns signed URLs, and the fiche now hands it an avatar and a
 * banner in one array. The old name would have read as a reason to write a second copy.
 */
async function signProfileMedia(
  paths: (string | null)[],
): Promise<Map<string, string>> {
  const present = paths.filter((p): p is string => p !== null);
  if (present.length === 0 || !isStorageConfigured()) return new Map();
  return storageGateway().createSignedReadUrls(present, PROFILE_MEDIA_READ_TTL_SECONDS);
}

/**
 * Assembles `RepairerCardDto` from profile rows, stats, and signed URLs. Shared by
 * `list()` and `CF-18`'s favourites read, extracted for the same reason `directoryWhere`
 * and `CARD_SELECT` are named fragments: two copies of a 17-line mapping drift with no
 * compiler error.
 *
 * @param rows - Profile data from a `findMany` with `select: CARD_SELECT`.
 * @param stats - Map from `repairerStats`, keyed by userId.
 * @param signedUrls - Map from `signProfileMedia`, keyed by storage path.
 */
export function assembleRepairerCards(
  rows: Array<{
    userId: string;
    displayName: string;
    serviceAreaLabel: string | null;
    user: {
      username: string;
      profile: {
        verificationLevel: string | null;
        avatarPath: string | null;
      } | null;
    };
  }>,
  stats: Map<string, RepairerStats>,
  signedUrls: Map<string, string>,
): RepairerCardDto[] {
  return rows.map((r) => {
    const s = stats.get(r.userId) ?? NO_REPAIRER_STATS;
    const avatarPath = r.user.profile?.avatarPath ?? null;
    return {
      userId: r.userId,
      displayName: r.displayName,
      serviceAreaLabel: r.serviceAreaLabel,
      username: r.user.username,
      verifiedBadge: verifiedBadgeFor(r.user.profile?.verificationLevel),
      rating: s.rating,
      reviewCount: s.reviewCount,
      // Null when he has no photo AND when the column outlives its object, since
      // `createSignedReadUrls` omits a path with no object rather than fabricating a URL. One
      // absent state: a card has nothing useful to say about WHY there is no photo.
      avatarUrl: avatarPath === null ? null : (signedUrls.get(avatarPath) ?? null),
    };
  });
}

@Injectable()
export class RepairersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly geocode: GeocodeService,
  ) {}

  /**
   * `CF-33`. The declared-category ids a filter on `categoryId` reaches - design §7.
   *
   * Refuses an unknown or deactivated id rather than returning an empty directory: a filter is
   * a read that accepts an id, and `USABLE_CATEGORY`'s rule runs in both directions.
   */
  private async resolveSpecialityMatch(categoryId: string): Promise<string[]> {
    const row = await this.prisma.category.findFirst({
      // USABLE_CATEGORY spread LAST, per its header.
      where: { id: categoryId, ...USABLE_CATEGORY },
      select: {
        id: true,
        parentId: true,
        // Only ACTIVE children: an inactive one cannot be declared, so widening the IN list
        // with it would be dead weight on an indexed lookup.
        children: { where: { active: true }, select: { id: true } },
      },
    });
    if (!row) {
      // Same code and French as `DemandesService.create` for the identical condition.
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette catégorie est introuvable.');
    }
    return specialityMatchIds({
      id: row.id,
      parentId: row.parentId,
      childIds: row.children.map((c) => c.id),
    });
  }

  /**
   * `CF-34`. The client's own position for this request - design §3.2.
   *
   * 🛑 REFUSES ONLY WHEN THE DISTANCE IS LOAD-BEARING, AND THAT CONDITION IS THE WHOLE POINT OF
   * THE `loadBearing` PARAMETER - do not simplify it back to a flat refusal.
   * `geocode.service.ts`'s own header states the contract this obeys: « NEVER THROWS. An
   * unreachable BAN, a timeout or an unknown code all yield null, because publishing a demande
   * must not depend on a third party being up. Distance is a comparison nicety; publishing is
   * the product. » Browsing the directory is the same kind of thing as publishing: `near` is
   * reachable with NEITHER `radiusKm` NOR `sort='distance'`, and in that state it exists only to
   * DISPLAY « à 3,2 km » on each row. A flat 422 there would let a French government service
   * being down EMPTY THE ENTIRE DIRECTORY, which is a third-party outage turned into a total
   * outage of our own product.
   *
   * So: when the caller is FILTERING or ORDERING by distance, a distance we cannot compute is
   * fatal and this refuses - silently returning rows that may not be within the radius, or an
   * order that is not the one asked for, is the worse failure by far. When the distance is
   * merely decoration, this answers null and every row renders `distanceKm: null`.
   *
   * The copy assigns NO BLAME on purpose. `lookupPostalCode` answers `null` for an unknown
   * postal code AND for an unreachable BAN, and **those two are not distinguishable from here.**
   * A message like « Ce code postal n'existe pas » would be a guess about which cause it was,
   * and would blame the client for our own outage. Recorded as a known limitation in the design
   * rather than papered over.
   *
   * 422 rather than 400: 400 is `ZodValidationPipe`'s answer for a malformed code (the schema
   * already enforces five digits), while this is a well-formed code we could not resolve.
   */
  private async resolveNear(postalCode: string, loadBearing: boolean): Promise<Coords | null> {
    const hit = await this.geocode.lookupPostalCode(postalCode);
    if (!hit) {
      if (!loadBearing) return null;
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        "Nous n'avons pas pu situer ce code postal.",
      );
    }
    return { lat: hit.lat, lng: hit.lng };
  }

  /**
   * The directory -- design 4.1 and 6.3, extended by `CF-34`.
   *
   * THREE clauses in the `where`, and the third is the one that is easy to miss.
   * `users.service.ts` NEVER deletes a `RepairerProfile`: disabling réparateur mode
   * leaves the row intact and the upsert's update arm only clears `deletedAt` on
   * re-enable. So a user who turned the mode back off keeps a complete profile, and
   * offering him as a service would be wrong. `verificationLevel` lives on `Profile`
   * rather than on `RepairerProfile`, so this join is needed for the badge anyway.
   *
   * There is deliberately NO verification filter. Étape 5 section 7: « no sort or filter
   * keyed on a badge », whose source is the client's own « il ne doit absolument pas être
   * obligatoire ». 🛑 `CF-34` ASKED FOR ONE BY NAME AND IT IS STILL REFUSED - see that
   * slice's design §3.1, which also measures why it would be inert: exactly one account is at
   * `IDENTITY`, and it is the owner's, whom this query excludes.
   *
   * UNBOUNDED, matching the feed and the review list. `take:` occurs once in the whole
   * hand-written API, and a page here would be its second exception.
   *
   * `CF-33` added an optional `categoryId` filter. A réparateur who has declared NOTHING
   * matches no category and therefore disappears from every filtered result - correct (he has
   * answered « je répare quoi » with silence). 🛑 MEASURED 2026-09-02: `RepairerCategory` is
   * EMPTY, so **all 12** live réparateur accounts vanish the moment a client touches that
   * filter. This comment previously said « all eleven », which was the count on 2026-08-31.
   * The screen says so in French rather than rendering a bare « 0 réparateur ».
   *
   * 🆕 `CF-34` added `near` + `radiusKm` (distance) and `minRating`. Both new filters run in
   * JAVASCRIPT after the fetch, because both are DERIVED - the same reason the `note` sort
   * below cannot be SQL. The unfiltered path still costs three DB queries; `near` adds one
   * outbound BAN call and no query.
   *
   * 🛑 **THAT BAN CALL IS ONCE PER POSTAL CODE PER PROCESS, NOT ONCE PER REQUEST**, and it is
   * `GeocodeService` that makes it so rather than anything here - corrected 2026-09-02 by the
   * whole-branch review. This method geocodes on EVERY request carrying `near`, so before the
   * memoisation each debounced search keystroke, each pull-to-refresh and each remount was a fresh
   * BAN lookup with a 4-second timeout sitting in the request path of a directory read, which is
   * the per-keystroke behaviour design §6.1 ruled out for the sheet. **Do not "optimise" this by
   * skipping `resolveNear` on some requests** - a miss must still be retried, which is exactly why
   * the cache stores successes only. Read `GeocodeService.cache` before changing either side.
   */
  async list(callerUserId: string | null, query: DirectoryQuery): Promise<DirectoryCardDto[]> {
    // Resolved FIRST, so an unusable id is refused before a page is fetched, and only when a
    // filter is present -- the unfiltered path stays at three queries.
    const match = query.categoryId ? await this.resolveSpecialityMatch(query.categoryId) : null;

    /**
     * 🛑 WHETHER A POSTAL CODE WE CANNOT SITUATE IS FATAL DEPENDS ON WHAT IT IS FOR, and this
     * const is the distinction. `radiusKm` FILTERS on the distance and `sort='distance'` ORDERS
     * on it, so neither can be honoured without one. `near` on its own only DECORATES the rows.
     * See `resolveNear`, which cites `geocode.service.ts`'s never-throws contract.
     */
    const distanceIsLoadBearing = query.radiusKm !== undefined || query.sort === 'distance';

    // Same rule as the category above, one caveat narrower: an unusable postal code is refused
    // before the PAGE is fetched, not before anything is read at all. `resolveSpecialityMatch`
    // runs first, so a request carrying an unusable categoryId AND an unusable postal code pays
    // that one `category.findFirst` before either refusal -- deliberately, because the category
    // is the more specific error and should be the one the client sees.
    const origin = query.near
      ? await this.resolveNear(query.near, distanceIsLoadBearing)
      : null;

    const rows = await this.prisma.repairerProfile.findMany({
      where: {
        ...directoryWhere(callerUserId),
        ...(query.q ? { displayName: { contains: query.q, mode: 'insensitive' } } : {}),
        /**
         * 🛑 UNDER `AND`, AND IT MUST NOT BECOME A SPREAD `user:` KEY. `directoryWhere` already
         * returns `user: { profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } }`,
         * so a second `user` key REPLACES it and the filtered directory would start returning
         * réparateurs who turned the mode off, deleted their account, or are suspended. Both
         * spellings are valid `RepairerProfileWhereInput`, so `tsc` cannot tell them apart - this
         * is the same class of silent clobber `USABLE_CATEGORY`'s header warns about for `OR`.
         * `directory-category-filter.spec.ts` pins it.
         */
        // PUB-33 (DECP-23): the store-review seal sits in the same `AND`, for the same reason.
        AND: [
          { user: await viewerSideWhere(this.prisma, callerUserId) },
          ...(match ? [{ user: { repairerCategories: { some: { categoryId: { in: match } } } } }] : []),
        ],
      },
      // Absent `sort` and `sort=az` are the SAME order, by design 6.3, so this runs
      // for both and only `note` and `distance` need the JavaScript pass below.
      orderBy: { displayName: 'asc' },
      /**
       * 🆕 `lat`/`lng` are selected HERE and deliberately NOT added to `CARD_SELECT`, which is
       * the named fragment doing its job: `getPublicProfile` spreads that fragment and has no
       * `near` context, so two coordinates it cannot use would be dead weight on every profile
       * read. These are top-level keys and cannot collide with the fragment's nested `user`
       * select - the clobber its header warns about needs the SAME key at the same level.
       */
      select: { ...CARD_SELECT, lat: true, lng: true },
    });

    // ONE aggregate for the whole page rather than one per row -- the reason
    // `repairerStats` takes an array. Two groupBy queries, so three in total here.
    const stats = await repairerStats(
      this.prisma,
      rows.map((r) => r.userId),
    );

    // ONE signing call for the whole page, beside the one aggregate for the whole page.
    const signed = await signProfileMedia(rows.map((r) => r.user.profile?.avatarPath ?? null));

    /**
     * Keyed by userId rather than zipped by index, matching how `stats` and `signed` are
     * consumed. `assembleRepairerCards` preserves order today, but a positional join to a
     * function in another scope is a silent-drift hazard for the sake of one lookup.
     */
    const distanceByUserId = new Map<string, number | null>(
      rows.map((r) => {
        const to = r.lat !== null && r.lng !== null ? { lat: r.lat, lng: r.lng } : null;
        const km = distanceKm(origin, to);
        // One decimal, matching `DemandeDto.distanceKm`.
        return [r.userId, km === null ? null : Math.round(km * 10) / 10];
      }),
    );

    let cards: DirectoryCardDto[] = assembleRepairerCards(rows, stats, signed).map((c) => ({
      ...c,
      // `?? null` rather than `!`: a userId absent from the map is a bug, and null is the
      // honest rendering of "we do not know" either way.
      distanceKm: distanceByUserId.get(c.userId) ?? null,
    }));

    /**
     * 🛑 BOTH NEW FILTERS EXCLUDE AN UNKNOWN RATHER THAN KEEPING IT, and that is the design
     * rather than an oversight: « within 25 km » and « 4 stars and up » are claims, and we
     * cannot make either about a réparateur with no coordinates (1 of 12 today) or no rating
     * (3 of 12). Keeping them would put rows in a filtered result that do not satisfy the
     * filter. Design §5 item 5.
     */
    if (query.radiusKm !== undefined) {
      const maxKm = Number(query.radiusKm);
      cards = cards.filter((c) => c.distanceKm !== null && c.distanceKm <= maxKm);
    }

    if (query.minRating !== undefined) {
      const min = Number(query.minRating);
      cards = cards.filter((c) => c.rating !== null && c.rating >= min);
    }

    // `rating` is DERIVED and therefore unsortable in SQL, which is the same reason
    // 4b section 6.3 kept the feed's sort in JavaScript.
    //
    // NO_VALUE must stay FINITE. Two unrated réparateurs are an ordinary case, and
    // `Infinity - Infinity` is NaN -- a comparator returning NaN puts the result
    // outside what `Array.prototype.sort` guarantees, so the order becomes a property of
    // the engine rather than of this code. A finite sentinel makes them compare equal.
    //
    // 🛑 Do NOT infer from a green integration test that an infinite sentinel would be
    // caught here. It was tried: `test/repairers.int.spec.ts`'s stability test PASSED
    // with POSITIVE_INFINITY, because V8's insertion sort happens to leave a short
    // array alone when the comparator returns NaN. The guarantee is pinned in
    // `test/repairer-schemas.spec.ts`, which calls the comparator directly.
    if (query.sort === 'note') {
      cards.sort((a, b) => rank(a.rating) - rank(b.rating));
    } else if (query.sort === 'distance') {
      // 🆕 `CF-34`. No sentinel here at all: `byDistanceKm` BRANCHES on null, so it never
      // subtracts two sentinels and NaN is unreachable. Shared with the demande feed, and
      // pinned directly in `test/haversine-comparator.spec.ts` for the reason above.
      cards.sort((a, b) => byDistanceKm(a.distanceKm, b.distanceKm));
    }

    return cards;
  }

  /**
   * One réparateur's public profile -- design 5.
   *
   * Does NOT exclude the caller, unlike `list`: « Mon profil public » reads this exact
   * route for his own id, so a réparateur can see what a client sees.
   *
   * 404 rather than an empty shape for a user with no live réparateur profile. That is
   * the opposite of `listForRepairer`'s choice to answer `[]` for an unknown id, and the
   * asymmetry is deliberate: « what has anyone said about this id » has an honest empty
   * answer, « show me this person's profile » does not.
   *
   * FOUR queries: this one, `repairerStats`'s two, and the categories. The categories
   * query is profile-only and deliberately absent from `list`, which keeps the list at
   * three for a whole page.
   */
  async getPublicProfile(userId: string, viewerUserId?: string | null): Promise<RepairerProfileDto> {
    // PUB-33 (DECP-23): across the store-review seal the profile does not exist (404).
    if (typeof viewerUserId === 'string') await assertSameSide(this.prisma, viewerUserId, userId);
    // A signed-out visitor (website) is on the real side: a review account's fiche is a 404.
    if (viewerUserId === null && (await isReviewUser(this.prisma, userId))) {
      throw new AppException('NOT_FOUND', 'Ressource introuvable.');
    }
    const row = await this.prisma.repairerProfile.findFirst({
      // 🛑 `listableRepairerWhere()` spread with the id, NOT a hand-written copy of its clauses.
      // This used to spell them out, and Stage 6 piece B2 found that a suspension added to
      // directoryWhere alone would leave this route serving a réparateur the directory had
      // already hidden. Any new listability condition now reaches both surfaces.
      where: { ...listableRepairerWhere(), userId },
      // `bannerPath` is added HERE and deliberately NOT to `CARD_SELECT`, which is the named
      // fragment doing its job in the opposite direction to `avatarPath` two lines up. The avatar
      // is in the fragment so the directory and the fiche cannot show one réparateur two faces;
      // the banner has exactly one surface that draws it, so putting it in the fragment would sign
      // one extra URL per row on an unbounded list for something no row renders. `CF-24`.
      select: {
        ...CARD_SELECT,
        bio: true,
        createdAt: true,
        bannerPath: true,
        serviceRadiusKm: true,
        user: {
          select: {
            ...CARD_SELECT.user.select,
            repairerAvailability: {
              // Monday first, so the fiche never sorts.
              orderBy: { dayOfWeek: 'asc' },
              select: { dayOfWeek: true, closed: true, opensAt: true, closesAt: true },
            },
          },
        },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', 'Ressource introuvable.');

    const avatarPath = row.user.profile?.avatarPath ?? null;
    const bannerPath = row.bannerPath ?? null;
    const [stats, categories, specialities, signed] = await Promise.all([
      repairerStats(this.prisma, [userId]),
      this.categoriesTreated(userId),
      // Joins the existing parallel batch rather than adding a serial round trip, the same
      // reasoning the signing call below carries.
      this.declaredSpecialities(userId),
      // Joins the existing parallel pair rather than adding a fifth serial round trip. Signing
      // does not depend on the stats or the categories, so making it wait for them would cost
      // latency for nothing.
      //
      // ONE call for both images rather than two, which is what makes `signProfileMedia`'s
      // batching shape worth keeping generic: the two paths go in the same array and come back in
      // the same map, so a réparateur with both costs no more round trips than one with either.
      signProfileMedia([avatarPath, bannerPath]),
    ]);
    const s = stats.get(userId) ?? NO_REPAIRER_STATS;

    return {
      userId: row.userId,
      displayName: row.displayName,
      serviceAreaLabel: row.serviceAreaLabel,
      username: row.user.username,
      verifiedBadge: verifiedBadgeFor(row.user.profile?.verificationLevel),
      rating: s.rating,
      reviewCount: s.reviewCount,
      avatarUrl: avatarPath === null ? null : (signed.get(avatarPath) ?? null),
      // Same absent-state rule as the avatar, and it matters more here: `createSignedReadUrls`
      // omits a path with no object rather than fabricating a URL, so a column outliving its
      // object renders the fiche's own motif rather than a broken full-width image. `CF-24`.
      bannerUrl: bannerPath === null ? null : (signed.get(bannerPath) ?? null),
      serviceRadiusKm: row.serviceRadiusKm,
      availability: row.user.repairerAvailability,
      bio: row.bio,
      repairCount: s.repairCount,
      // RepairerProfile.createdAt, NOT user.createdAt. This is when he became a
      // réparateur, which is the seniority a client choosing a repairer cares about,
      // and it is why the screen labels it « Réparateur depuis » rather than the
      // prototype's « sur Revime ».
      repairerSince: row.createdAt.toISOString(),
      specialities,
      categoriesTreated: categories,
    };
  }

  /**
   * `CF-25`. The categories he DECLARES - design §6 and §10.
   *
   * The counterpart to `categoriesTreated` below, and the contrast is the point: that one is
   * derived from offer history, this one is his own claim.
   *
   * `USABLE_CATEGORY` on the joined category, so a deactivated one disappears from the fiche
   * rather than showing a stale label. Same rule as every other read path.
   *
   * ORDERED IN JAVASCRIPT, not by SQL, and deliberately: a declared ROOT has to sort ahead of
   * any child in the same family, which means its own row needs a child-order of -1. Prisma
   * cannot express « the parent's sortOrder when there is a parent, otherwise mine » in an
   * `orderBy`, so doing it here is the honest version rather than a missed optimisation. The
   * set is capped at MAX_SPECIALITIES, so this sorts at most 12 items.
   */
  private async declaredSpecialities(repairerUserId: string): Promise<string[]> {
    const rows = await this.prisma.repairerCategory.findMany({
      where: { repairerUserId, category: { ...USABLE_CATEGORY } },
      select: {
        category: {
          select: {
            labelFr: true,
            sortOrder: true,
            parent: { select: { labelFr: true, sortOrder: true } },
          },
        },
      },
    });

    return rows
      .map(({ category }) => ({
        rootOrder: category.parent?.sortOrder ?? category.sortOrder,
        // -1 so a declared root precedes every child of its own family.
        childOrder: category.parent === null ? -1 : category.sortOrder,
        label: specialityLabel(
          category.parent?.labelFr ?? category.labelFr,
          category.parent === null ? null : category.labelFr,
        ),
      }))
      .sort((a, b) => a.rootOrder - b.rootOrder || a.childOrder - b.childOrder)
      .map((r) => r.label);
  }

  /**
   * The distinct categories he has quoted on -- design 4.3.
   *
   * DERIVED from offer history rather than self-declared, which is the whole reason the
   * screen says « Catégories traitées » and not « Spécialités »: a specialty is a claim
   * he would make, this is a fact about what he has done.
   *
   * 🆕 `CF-25` added `declaredSpecialities` above. That one is the CLAIM, this one is the FACT;
   * the fiche renders both, declared first. Neither replaces the other.
   *
   * `deletedAt: null` on the offer means a withdrawn offer still counts -- he did quote
   * on it -- matching `getOrCreate`'s reading that any non-deleted offer was a real
   * commitment.
   */
  private async categoriesTreated(repairerUserId: string): Promise<string[]> {
    const rows = await this.prisma.offer.findMany({
      where: { repairerUserId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { demande: { select: { category: { select: { labelFr: true } } } } },
    });
    // Deduplicated by a Set rather than by Prisma's `distinct`, and that is deliberate
    // rather than lazy. `distinct` could only dedup by `demandeId`, which does NOT dedup
    // categories -- two demandes in one category are two distinct demandeIds carrying the
    // same label -- so it would have to run alongside this Set anyway. And in Postgres a
    // `DISTINCT ON` requires the leading `ORDER BY` to match its expressions, which
    // `createdAt` does not, so pairing it with this ordering rests on an assumption about
    // Prisma's SQL that nothing here has verified.
    //
    // A Set preserves insertion order, so the newest category stays first.
    return [...new Set(rows.map((r) => r.demande.category.labelFr))];
  }
}

/** Lower is better, so a rating is negated and an absent one sorts last. */
function rank(rating: number | null): number {
  return rating === null ? NO_VALUE : -rating;
}
