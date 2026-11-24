import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldPurge } from '../src/cron/photo-orphans.js';
import { CronService } from '../src/cron/cron.service.js';
import {
  FakeStorageGateway,
  __resetStorageGateway,
  storageGateway,
} from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { CommandesService } from '../src/commandes/commandes.service.js';
import type { PaymentsService } from '../src/payments/payments.service.js';
import type { PushService } from '../src/push/push.service.js';
import type { ShipmentsService } from '../src/shipping/shipments.service.js';

/**
 * 🛑 ANCHORED TO THE RUN'S CLOCK, NOT TO A CALENDAR DATE, AND THAT IS LOAD-BEARING.
 *
 * `shouldPurge` takes `now` as a parameter, so the predicate tests below are deterministic
 * whatever these values are. **The `purgeOrphanPhotos` job tests are not:** the job reads its
 * own clock (`cron.service.ts`, `const now = new Date()`) and compares against
 * `ORPHAN_MIN_AGE_MS` of 24h. So an ABSOLUTE `NEW` stops meaning "recent" exactly 24 hours
 * after whichever date is written here, and the two tests that depend on it start failing.
 *
 * That is not hypothetical: this file pinned `2026-08-20T12:00:00Z` and CI went red at
 * 2026-08-21T15:11Z on a docs-only push, having passed at 02:43Z the same morning. The fuse
 * expired at 12:00Z in between. « removes unreferenced objects older than 24h » saw acted 2
 * where it wanted 1, and « does nothing when all objects are recent » saw 2 where it wanted 0,
 * because `recentOrphan` had aged past the threshold.
 *
 * Relative fixtures remove the coupling rather than re-dating it, which is why this is not
 * simply a bumped constant. The alternative considered and rejected was
 * `vi.useFakeTimers()` + `vi.setSystemTime()`: it would keep these dates readable as absolutes,
 * but it adds fake-timer machinery to async tests for a guarantee arithmetic already gives.
 *
 * The few milliseconds between this module evaluating and the job calling `new Date()` are
 * irrelevant against a 24-hour threshold, and NEW being marginally in the past is the correct
 * direction anyway -- it can only ever be younger than the cutoff, never older.
 */
const NOW = new Date();
const OLD = new Date(NOW.getTime() - 48 * 3600_000).toISOString();
const NEW = NOW.toISOString();

const saved = { ...process.env };

beforeEach(() => {
  __resetStorageGateway();
  delete process.env.STORAGE_DRIVER;
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  process.env = { ...saved };
  __resetStorageGateway();
});

describe('orphan photo purge', () => {
  describe('shouldPurge predicate', () => {
    it('deletes an object that is unreferenced AND older than 24h', () => {
      expect(shouldPurge({ createdAt: OLD, referenced: false }, NOW)).toBe(
        true,
      );
    });

    it('KEEPS an unreferenced object younger than 24h -- it is mid-wizard', () => {
      expect(shouldPurge({ createdAt: NEW, referenced: false }, NOW)).toBe(
        false,
      );
    });

    it('KEEPS a referenced object however old -- it belongs to a published demande', () => {
      expect(shouldPurge({ createdAt: OLD, referenced: true }, NOW)).toBe(
        false,
      );
    });

    it('KEEPS a referenced young object', () => {
      expect(shouldPurge({ createdAt: NEW, referenced: true }, NOW)).toBe(
        false,
      );
    });
  });

  describe('purgeOrphanPhotos job', () => {
    const U = '11111111-1111-4111-8111-111111111111';
    const D = '22222222-2222-4222-8222-222222222222';

    function createMockCronService(referencedPaths: string[]): CronService {
      const mockPrisma = {
        demandePhoto: {
          findMany: vi
            .fn()
            .mockResolvedValue(
              referencedPaths.map((path) => ({ storagePath: path })),
            ),
        },
      } as unknown as PrismaService;

      const mockCommandes = {} as CommandesService;
      const mockPayments = {} as PaymentsService;
      const mockShipments = {} as ShipmentsService;

      return new CronService(
        mockPrisma,
        mockCommandes,
        mockPayments,
        mockShipments,
        {} as PushService,
        {} as any,
        {} as never, // QuoteRequestsService (CF4-25), unused here
        {} as never, // FiscalService (CMP-D3), unused here
        {} as never, // SetupRemindersService (V8 E1), unused here
      );
    }

    it('returns zeros when storage is not configured', async () => {
      // No STORAGE_DRIVER set, so isStorageConfigured() returns false
      const service = createMockCronService([]);
      const result = await service['purgeOrphanPhotos']();
      expect(result).toEqual({ scanned: 0, acted: 0, failed: 0 });
    });

    it('removes unreferenced objects older than 24h', async () => {
      process.env.STORAGE_DRIVER = 'fake';
      __resetStorageGateway();

      const gateway = storageGateway() as FakeStorageGateway;
      const oldOrphan = `demandes/${U}/${D}/old-orphan.jpg`;
      const recentOrphan = `demandes/${U}/${D}/recent-orphan.jpg`;
      const oldReferenced = `demandes/${U}/${D}/old-referenced.jpg`;

      gateway.seed(oldOrphan, OLD);
      gateway.seed(recentOrphan, NEW);
      gateway.seed(oldReferenced, OLD);

      const service = createMockCronService([oldReferenced]);
      const result = await service['purgeOrphanPhotos']();

      expect(result.scanned).toBe(3);
      expect(result.acted).toBe(1);
      expect(result.failed).toBe(0);

      // Verify the correct object was deleted by walking the full 3-level structure
      const leafObjects: string[] = [];
      const userEntries = await gateway.listPrefix('demandes');
      for (const userEntry of userEntries) {
        const draftEntries = await gateway.listPrefix(
          `demandes/${userEntry.name}`,
        );
        for (const draftEntry of draftEntries) {
          const objEntries = await gateway.listPrefix(
            `demandes/${userEntry.name}/${draftEntry.name}`,
          );
          for (const objEntry of objEntries) {
            leafObjects.push(
              `demandes/${userEntry.name}/${draftEntry.name}/${objEntry.name}`,
            );
          }
        }
      }
      expect(leafObjects).toContain(recentOrphan);
      expect(leafObjects).toContain(oldReferenced);
      expect(leafObjects).not.toContain(oldOrphan);
    });

    it('removes multiple old orphans in one batch', async () => {
      process.env.STORAGE_DRIVER = 'fake';
      __resetStorageGateway();

      const gateway = storageGateway() as FakeStorageGateway;
      const orphan1 = `demandes/${U}/${D}/orphan1.jpg`;
      const orphan2 = `demandes/${U}/${D}/orphan2.jpg`;
      const orphan3 = `demandes/${U}/${D}/orphan3.jpg`;

      gateway.seed(orphan1, OLD);
      gateway.seed(orphan2, OLD);
      gateway.seed(orphan3, OLD);

      const service = createMockCronService([]);
      const result = await service['purgeOrphanPhotos']();

      expect(result.scanned).toBe(3);
      expect(result.acted).toBe(3);
      expect(result.failed).toBe(0);

      // Verify all objects were deleted
      const userEntries = await gateway.listPrefix('demandes');
      expect(userEntries).toEqual([]);
    });

    it('does nothing when all objects are referenced', async () => {
      process.env.STORAGE_DRIVER = 'fake';
      __resetStorageGateway();

      const gateway = storageGateway() as FakeStorageGateway;
      const photo1 = `demandes/${U}/${D}/photo1.jpg`;
      const photo2 = `demandes/${U}/${D}/photo2.jpg`;

      gateway.seed(photo1, OLD);
      gateway.seed(photo2, OLD);

      const service = createMockCronService([photo1, photo2]);
      const result = await service['purgeOrphanPhotos']();

      expect(result.scanned).toBe(2);
      expect(result.acted).toBe(0);
      expect(result.failed).toBe(0);

      // Verify objects are still present
      const leafObjects = await gateway.listPrefix(`demandes/${U}/${D}`);
      expect(leafObjects).toHaveLength(2);
    });

    it('does nothing when all objects are recent', async () => {
      process.env.STORAGE_DRIVER = 'fake';
      __resetStorageGateway();

      const gateway = storageGateway() as FakeStorageGateway;
      const photo1 = `demandes/${U}/${D}/photo1.jpg`;
      const photo2 = `demandes/${U}/${D}/photo2.jpg`;

      gateway.seed(photo1, NEW);
      gateway.seed(photo2, NEW);

      const service = createMockCronService([]);
      const result = await service['purgeOrphanPhotos']();

      expect(result.scanned).toBe(2);
      expect(result.acted).toBe(0);
      expect(result.failed).toBe(0);

      // Verify objects are still present
      const leafObjects = await gateway.listPrefix(`demandes/${U}/${D}`);
      expect(leafObjects).toHaveLength(2);
    });

    /**
     * `CF-23`, widened by `CF-24`. PROFILE MEDIA shares this bucket and is separated from demande
     * photos by its path prefix ALONE -- see `avatar-paths.ts` for why a second bucket was
     * rejected. This asserts the half of that separation which lives here.
     *
     * 🆕 THERE ARE NOW TWO SUCH PREFIXES, `avatars/` and `banners/`, and this test covers both in
     * one pass deliberately rather than as two near-copies: the claim being made is about the
     * CRON's reach, which is one property, and asserting `scanned` is 1 with TWO profile-media
     * objects present is a stronger statement than doing it twice with one.
     *
     * 🛑 IT PASSED THE FIRST TIME IT WAS RUN, in both its `CF-23` and `CF-24` forms, and is a
     * regression guard rather than red-green: the job already anchors its walk at
     * `const prefix = 'demandes'` -- grep `cron.service.ts` for that line -- so nothing needed to
     * change to make it green. It exists because the failure it guards against is silent and
     * destructive: widening that walk, or swapping the three explicit levels for a recursive list,
     * would delete every user's profile photo and every réparateur's banner 24 hours after upload
     * with no error anywhere. There is no cron for either prefix to notice, and neither object has
     * a `DemandePhoto` row, so both would look unreferenced to any predicate that reached them.
     *
     * The `listPrefix` assertions at the top are not decoration: without them a broken `seed` would
     * make the whole test pass by storing nothing.
     */
    it('leaves PROFILE MEDIA untouched -- it shares the bucket but not the prefix', async () => {
      process.env.STORAGE_DRIVER = 'fake';
      __resetStorageGateway();

      const gateway = storageGateway() as FakeStorageGateway;
      const orphan = `demandes/${U}/${D}/orphan.jpg`;
      const avatar = `avatars/${U}/${D}.jpg`;
      const banner = `banners/${U}/${D}.jpg`;

      gateway.seed(orphan, OLD);
      gateway.seed(avatar, OLD);
      gateway.seed(banner, OLD);

      // Both really are in the bucket, so a pass below means "not swept" rather than
      // "never stored".
      expect(
        (await gateway.listPrefix(`avatars/${U}`)).map((o) => o.name),
      ).toEqual([`${D}.jpg`]);
      expect(
        (await gateway.listPrefix(`banners/${U}`)).map((o) => o.name),
      ).toEqual([`${D}.jpg`]);

      const service = createMockCronService([]);
      const result = await service['purgeOrphanPhotos']();

      // ONE, not three: neither profile-media object is even scanned, so neither can be judged
      // unreferenced.
      expect(result.scanned).toBe(1);
      expect(result.acted).toBe(1);

      expect(
        (await gateway.listPrefix(`avatars/${U}`)).map((o) => o.name),
      ).toEqual([`${D}.jpg`]);
      expect(
        (await gateway.listPrefix(`banners/${U}`)).map((o) => o.name),
      ).toEqual([`${D}.jpg`]);
      expect(await gateway.listPrefix(`demandes/${U}/${D}`)).toEqual([]);
    });

    it('does NOT treat directory entries as purgeable objects', async () => {
      process.env.STORAGE_DRIVER = 'fake';
      __resetStorageGateway();

      const gateway = storageGateway() as FakeStorageGateway;
      const photo = `demandes/${U}/${D}/photo.jpg`;

      gateway.seed(photo, OLD);

      const service = createMockCronService([]);
      const result = await service['purgeOrphanPhotos']();

      // Only the leaf object counts as scanned, not the user/draft directory entries
      expect(result.scanned).toBe(1);
      expect(result.acted).toBe(1);

      // Verify the directory structure is still queryable (not deleted)
      const userEntries = await gateway.listPrefix('demandes');
      expect(userEntries.some((e) => e.name === U)).toBe(false); // User dir removed since it has no objects
    });
  });
});
