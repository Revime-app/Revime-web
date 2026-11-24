import { Injectable } from '@nestjs/common';
import type { FavoriteDemandeItem, RepairerCardDto } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PUBLIC_DEMANDE_WHERE } from '../demandes/demande-predicates.js';
import { ACCEPTABLE_OFFER_WHERE } from '../offers/offer-predicates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { assertSameSide } from '../review-accounts/review-account.js';
import {
  assembleRepairerCards,
  CARD_SELECT,
  directoryWhere,
} from '../repairers/repairers.service.js';
import { repairerStats } from '../reviews/repairer-stats.js';
import { assembleFeedItems } from '../demandes/demandes.service.js';
import { isStorageConfigured, storageGateway } from '../storage/gateway.js';
import type { Coords } from '../geo/haversine.js';

/**
 * One hour, matching `READ_URL_TTL_SECONDS` in `demandes.service.ts` and
 * `PROFILE_MEDIA_READ_TTL_SECONDS` in `repairers.service.ts` and `users.service.ts` - the two
 * files this service's signing calls were copied from, both of which name the number.
 *
 * A separate constant rather than an import, for the reason `users.service.ts` already states: the
 * TTLs may diverge later without one silently changing the other, and if they are still equal the
 * next time somebody reads this, that is a choice rather than a coupling.
 *
 * 🛑 It exists because `3600` was written as a bare literal TWICE in this file - once per list read
 * - which is one literal too many to keep in step by hand.
 */
const READ_URL_TTL_SECONDS = 3600;

@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Idempotent by `upsert` on the composite unique, NOT by a read-then-write. The caller is
   * a heart being tapped; a second tap must not surface a unique-constraint violation as a
   * 500, and a check-then-insert would still race.
   */
  async addRepairer(userId: string, repairerUserId: string): Promise<void> {
    if (userId === repairerUserId) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Vous ne pouvez pas vous ajouter en favori.");
    }
    // PUB-33 (DECP-23): across the store-review seal the réparateur does not exist (404).
    await assertSameSide(this.prisma, userId, repairerUserId);

    /**
     * 🛑 **`directoryWhere` ITSELF, AND-ED WITH THE TARGET ID - NOT A HAND-WRITTEN COPY OF ITS
     * CLAUSES. Rewritten 2026-08-31; this used to read `prisma.profile.findFirst` with three
     * clauses spelled out, above a comment claiming they were « the same three questions
     * `directoryWhere` asks ». They were not.** That predicate asks `deletedAt: null` and
     * `userId: { not: caller }` on `RepairerProfile`, plus `repairerEnabled`, `deletedAt`, and
     * `repairerSuspendedAt` on the nested `Profile` - while the code here asked two conditions
     * of a different table (`Profile`, not `RepairerProfile`), and omitted
     * `RepairerProfile.deletedAt: null` entirely.
     *
     * The divergence was unreachable today, because nothing in the API ever writes
     * `RepairerProfile.deletedAt` non-null. **So the defect was the false comment**, and the fix
     * chosen is the one that removes the CLASS rather than the instance: asking the predicate
     * makes it impossible for the add and the list to disagree, which is the whole reason
     * `directoryWhere` was extracted (see its own header). A comment asserting two expressions
     * agree is worth less than one expression.
     *
     * **AND composition rather than spread:** favourites adds its own `userId: repairerUserId`,
     * which under a spread would overwrite `directoryWhere`'s `userId: { not: caller }` and
     * silently remove the self-exclusion. `list()` and `getPublicProfile` add no colliding keys,
     * so they spread-compose safely.
     *
     * Behaviourally identical on every row that exists: `users.service.ts` sets
     * `repairerEnabled: true` and upserts a `RepairerProfile` with `deletedAt: null` in ONE
     * transaction, so `repairerEnabled` and a live `RepairerProfile` are the same fact.
     *
     * The self-check above still runs FIRST and is not redundant: `directoryWhere` would refuse a
     * self-favourite too (`userId: { not: callerUserId }`), but with the generic message. The
     * specific one is better copy, and it costs one comparison rather than a query.
     */
    const target = await this.prisma.repairerProfile.findFirst({
      where: { AND: [directoryWhere(userId), { userId: repairerUserId }] },
      select: { userId: true },
    });
    if (!target) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Ce réparateur n'est pas disponible.");
    }

    await this.prisma.favoriteRepairer.upsert({
      where: { userId_repairerUserId: { userId, repairerUserId } },
      create: { userId, repairerUserId },
      update: {},
    });
  }

  /** `deleteMany`, not `delete`: absent is the same outcome as removed, so this cannot P2025. */
  async removeRepairer(userId: string, repairerUserId: string): Promise<void> {
    await this.prisma.favoriteRepairer.deleteMany({ where: { userId, repairerUserId } });
  }

  async listRepairers(userId: string): Promise<RepairerCardDto[]> {
    const rows = await this.prisma.favoriteRepairer.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { repairerUserId: true },
    });
    const ids = rows.map((r) => r.repairerUserId);
    if (ids.length === 0) return [];

    // 🛑 `directoryWhere` rather than a fourth copy of its three clauses. A favourite whose
    // target deleted their account or switched réparateur mode off is DROPPED here, which is
    // what keeps this list agreeing with the directory. Task 7 also deletes those rows, so
    // this is the second line of defence rather than the only one.
    //
    // 🛑 Uses `AND` array to compose the two where clauses without key collision. The
    // brief's original `{ ...directoryWhere(userId), userId: { in: ids } }` is WRONG:
    // spreading `userId: { in: ids }` OVERWRITES `userId: { not: userId }` from
    // `directoryWhere`, silently removing the self-exclusion. Object spread is NOT a deep
    // merge. This was the defect the task's corrections section identified.
    const profiles = await this.prisma.repairerProfile.findMany({
      where: { AND: [directoryWhere(userId), { userId: { in: ids } }] },
      select: CARD_SELECT,
    });

    /**
     * 🛑 **RESTORE THE SAVED-AT ORDER, WHICH THE `in:` QUERY DOES NOT PRESERVE. Added 2026-08-31;
     * without it the `orderBy: { createdAt: 'desc' }` above was DEAD CODE.** `findMany` with an
     * `in:` list returns rows in whatever order Postgres finds convenient - physical order in
     * practice - so this list was nondeterministic between refreshes, and « newest saved first »
     * was a property of the ids array alone, thrown away the moment the profiles came back.
     *
     * `listDemandes` below already does exactly this, and migration 27's own comment on
     * `@@index([userId, createdAt])` calls it « the list read's exact shape: one owner, newest
     * first » - so the index, the `orderBy` and the DTO now agree instead of two out of three.
     *
     * The sort runs BEFORE `repairerStats` and before signing, so both keep operating on the array
     * they are handed and neither depends on the order.
     */
    const order = new Map(ids.map((id, i) => [id, i]));
    profiles.sort((a, b) => (order.get(a.userId) ?? 0) - (order.get(b.userId) ?? 0));

    const stats = await repairerStats(this.prisma, profiles.map((p) => p.userId));

    // ONE signing call for all avatars, matching `list()`'s batching pattern.
    //
    // 🛑 The gateway is imported STATICALLY at the top of this file. This used to be a
    // `await import('../storage/gateway.js')` destructured here, which SHADOWED the static
    // `storageGateway` the file already had and that `listDemandes` uses - the same module pulled
    // in twice, one binding hiding the other.
    const paths = profiles.map((p) => p.user.profile?.avatarPath ?? null).filter((p): p is string => p !== null);
    const signed = paths.length === 0 || !isStorageConfigured()
      ? new Map<string, string>()
      : await storageGateway().createSignedReadUrls(paths, READ_URL_TTL_SECONDS);

    // Assembly is shared with `list()`, extracted for the reason `directoryWhere` and
    // `CARD_SELECT` are shared: two copies of a 17-line mapping drift with no compiler error.
    return assembleRepairerCards(profiles, stats, signed);
  }

  /**
   * Idempotent by `upsert` on the composite unique, matching `addRepairer`'s pattern.
   */
  async addDemande(userId: string, demandeId: string): Promise<void> {
    const demande = await this.prisma.demande.findFirst({
      where: { id: demandeId, ...PUBLIC_DEMANDE_WHERE },
      select: { authorUserId: true },
    });
    if (!demande) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Cette annonce n'est plus disponible.");
    }
    // PUB-33 (DECP-23): across the store-review seal the demande does not exist (404).
    await assertSameSide(this.prisma, userId, demande.authorUserId);
    // Mirrors the feed's « never your own » rule. Saving your own annonce is not a favourite;
    // « Mes demandes » is where your own live.
    if (demande.authorUserId === userId) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Vous ne pouvez pas enregistrer votre propre annonce.");
    }

    await this.prisma.favoriteDemande.upsert({
      where: { userId_demandeId: { userId, demandeId } },
      create: { userId, demandeId },
      update: {},
    });
  }

  /** `deleteMany`, not `delete`: absent is the same outcome as removed, so this cannot P2025. */
  async removeDemande(userId: string, demandeId: string): Promise<void> {
    await this.prisma.favoriteDemande.deleteMany({ where: { userId, demandeId } });
  }

  async listDemandes(userId: string): Promise<FavoriteDemandeItem[]> {
    const saved = await this.prisma.favoriteDemande.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { demandeId: true },
    });
    const ids = saved.map((r) => r.demandeId);
    if (ids.length === 0) return [];

    const me = await this.prisma.repairerProfile.findFirst({
      where: { userId, deletedAt: null },
      select: { lat: true, lng: true },
    });
    const from: Coords | null =
      me?.lat != null && me?.lng != null ? { lat: me.lat, lng: me.lng } : null;

    // 🛑 NO `status` FILTER, and no author exclusion. This is the one place that deliberately
    // diverges from `demandes.service.ts:feed` - a saved demande that closed must still be
    // listed, or the list loses items with no explanation. `deletedAt` IS filtered: a
    // moderated demande is gone, not closed. CF4-25: public only - a private request is
    // never an « annonce » a third party could have saved.
    const rows = await this.prisma.demande.findMany({
      where: { id: { in: ids }, ...PUBLIC_DEMANDE_WHERE },
      select: {
        id: true,
        title: true,
        status: true,
        locationLabel: true,
        postalCode: true,
        brand: true,
        model: true,
        mode: true,
        budgetCents: true,
        lat: true,
        lng: true,
        createdAt: true,
        category: { select: { labelFr: true } },
        /**
         * ACCEPTABLE, matching `feed()` exactly - this list hands its rows to the SAME
         * `assembleFeedItems`, so a divergence here would show one offer count on a saved
         * annonce and another on the feed card for the same demande. B2 spec §5.2.
         *
         * 🛑 The `hasMyOffer` straddle `feed()` documents at length applies here identically;
         * that comment is the one place it is spelled out rather than being restated twice.
         */
        offers: {
          where: ACCEPTABLE_OFFER_WHERE,
          select: { repairerUserId: true },
        },
        photos: { orderBy: { sortOrder: 'asc' }, take: 1, select: { storagePath: true } },
      },
    });

    // Preserve the favourite order, which the `in:` query does not. Newest-saved first.
    const order = new Map(ids.map((id, i) => [id, i]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    // ONE signing call for the whole list, matching feed()'s batching pattern.
    const firsts = rows
      .map((r) => r.photos[0]?.storagePath)
      .filter((p): p is string => p !== undefined);
    const signed = await storageGateway().createSignedReadUrls(firsts, READ_URL_TTL_SECONDS);

    // Assembly reuses feed()'s extracted helper, then adds `status`. The helper computes
    // distanceKm from viewer coords, offerCount, hasMyOffer, and signed photoUrl.
    const baseItems = assembleFeedItems(rows, from, userId, signed);
    return baseItems.map((item, i) => {
      const row = rows[i];
      if (!row) throw new Error('Invariant: baseItems and rows length mismatch');
      return {
        ...item,
        status: row.status,
      };
    });
  }
}
