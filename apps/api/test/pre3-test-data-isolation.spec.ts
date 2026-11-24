import { existsSync, readFileSync } from 'node:fs';
import { NO_ATTENTION } from './no-attention.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanTestData,
  type CleanTestDataResult,
} from '../scripts/clean-test-data.js';
import {
  DEMO_EMAIL_SUFFIX,
  GENUINE_COMMANDE_PAID_WHERE,
  GENUINE_USER_WHERE,
  LIVE,
  TEST_FIXTURE_EMAIL_SUFFIX,
} from '../src/admin/admin-constants.js';
import { AdminOverviewService, paidWithin } from '../src/admin/admin-overview.service.js';

const PRISMA_DIR = fileURLToPath(new URL('../prisma/', import.meta.url));
const MIGRATION_PATH = join(
  PRISMA_DIR,
  'migrations',
  '20261017213000_isolate_test_data',
  'migration.sql',
);

/**
 * Creates a stubbed Prisma client for AdminOverviewService tests.
 */
const makeOverviewPrisma = (over: Record<string, unknown> = {}) => {
  let seq = 1;
  return {
    $transaction: (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]),
    user: { count: vi.fn(() => Promise.resolve(seq++)) },
    session: {
      findMany: vi
        .fn()
        .mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]),
    },
    profile: { count: vi.fn(() => Promise.resolve(seq++)) },
    repairerProfile: { count: vi.fn(() => Promise.resolve(seq++)), findMany: vi.fn().mockResolvedValue([]) }, // findMany: V8 E1 setup figures
    identityVerification: { count: vi.fn(() => Promise.resolve(seq++)) },
    businessVerification: { count: vi.fn(() => Promise.resolve(0)) },
    cancellationRequest: { count: vi.fn(() => Promise.resolve(0)) },
    conversationReport: { count: vi.fn(() => Promise.resolve(0)) },
    staffInvitation: { count: vi.fn(() => Promise.resolve(0)) },
    demande: {
      count: vi.fn(() => Promise.resolve(seq++)),
      findMany: vi.fn().mockResolvedValue([]),
    },
    offer: { count: vi.fn(() => Promise.resolve(seq++)) },
    commande: {
      count: vi.fn(() => Promise.resolve(seq++)),
      aggregate: vi.fn().mockResolvedValue({
        _sum: { totalCents: 100000, protectionCents: 5000 },
      }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    dispute: {
      count: vi.fn().mockResolvedValue(0),
    },
    ...over,
  };
};

describe('PRE-3 Test Data Isolation & Cleanup Test Suite', () => {
  describe('1. Migration SQL Integrity (20261017213000_isolate_test_data/migration.sql)', () => {
    it('reads the PRE-3 migration file from disk and verifies it exists', () => {
      expect(existsSync(MIGRATION_PATH)).toBe(true);
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      expect(sql).toBeTruthy();
      expect(sql.length).toBeGreaterThan(0);
    });

    it('asserts it deletes test demandes linked to category "chocolat"', () => {
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      const normalizedSql = sql.replace(/\s+/g, ' ');

      expect(normalizedSql).toMatch(/DELETE FROM "Demande"/);
      expect(normalizedSql).toMatch(
        /WHERE "categoryId" IN \(SELECT "id" FROM "Category" WHERE "slug" = 'chocolat'\)/,
      );
    });

    it('asserts it deletes test categories ("test", "chocolat", "tmp-parent-off", "tmp-child-on")', () => {
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      const normalizedSql = sql.replace(/\s+/g, ' ');

      expect(normalizedSql).toMatch(/DELETE FROM "Category"/);
      expect(normalizedSql).toMatch(
        /WHERE "slug" IN \('test',\s*'chocolat',\s*'tmp-parent-off',\s*'tmp-child-on'\)/,
      );
    });

    it('asserts it soft-hides the "Iphone 25" test demande with hiddenAt = NOW() and hiddenReason', () => {
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      const normalizedSql = sql.replace(/\s+/g, ' ');

      expect(normalizedSql).toMatch(/UPDATE "Demande"/);
      expect(normalizedSql).toMatch(/SET "hiddenAt" = NOW\(\)/);
      expect(normalizedSql).toMatch(
        /"hiddenReason" = 'Demande de test \(Iphone 25\) masquée avant ouverture au public'/,
      );
      expect(normalizedSql).toMatch(/LOWER\("model"\) LIKE '%iphone 25%'/);
      expect(normalizedSql).toMatch(/LOWER\("title"\) LIKE '%iphone 25%'/);
    });

    it('asserts only rows with hiddenAt IS NULL are updated', () => {
      const sql = readFileSync(MIGRATION_PATH, 'utf-8');
      const normalizedSql = sql.replace(/\s+/g, ' ');

      expect(normalizedSql).toMatch(/AND "hiddenAt" IS NULL/);
    });
  });

  describe('2. CLI Maintenance Function (cleanTestData)', () => {
    it('deletes test categories and test demandes when they exist, returning exact counts', async () => {
      const testCategories = [
        { id: 'cat-chocolat', slug: 'chocolat' },
        { id: 'cat-test', slug: 'test' },
      ];
      const iphoneDemandes = [{ id: 'dem-iphone-25' }];

      const categoryFindManyMock = vi
        .fn()
        .mockResolvedValueOnce(testCategories) // first call: retrieve test categories
        .mockResolvedValueOnce([]); // second call: safety verification (remaining categories)

      const demandeDeleteManyMock = vi
        .fn()
        .mockResolvedValue({ count: 5 }); // 5 test demandes deleted

      const categoryDeleteManyMock = vi
        .fn()
        .mockResolvedValue({ count: 2 }); // 2 test categories deleted

      const demandeFindManyMock = vi
        .fn()
        .mockResolvedValue(iphoneDemandes); // 1 iphone 25 demande found

      const demandeUpdateManyMock = vi
        .fn()
        .mockResolvedValue({ count: 1 }); // 1 iphone 25 demande soft-hidden

      const categoryCountMock = vi.fn().mockResolvedValue(18); // 18 genuine categories remaining

      const prismaMock = {
        category: {
          findMany: categoryFindManyMock,
          deleteMany: categoryDeleteManyMock,
          count: categoryCountMock,
        },
        demande: {
          findMany: demandeFindManyMock,
          deleteMany: demandeDeleteManyMock,
          updateMany: demandeUpdateManyMock,
        },
      };

      const result: CleanTestDataResult = await cleanTestData(
        prismaMock as never,
      );

      expect(result).toEqual({
        deletedDemandesCount: 5,
        deletedCategoriesCount: 2,
        hiddenIphone25Count: 1,
        remainingCategoriesCount: 18,
      });

      // Assert category queries
      expect(categoryFindManyMock).toHaveBeenNthCalledWith(1, {
        where: {
          slug: { in: ['test', 'chocolat', 'tmp-parent-off', 'tmp-child-on'] },
        },
        select: { id: true, slug: true },
      });

      // Assert test demandes deletion
      expect(demandeDeleteManyMock).toHaveBeenCalledWith({
        where: {
          categoryId: { in: ['cat-chocolat', 'cat-test'] },
        },
      });

      // Assert test categories deletion
      expect(categoryDeleteManyMock).toHaveBeenCalledWith({
        where: {
          slug: { in: ['test', 'chocolat', 'tmp-parent-off', 'tmp-child-on'] },
        },
      });

      // Assert iphone 25 search and soft-hide
      expect(demandeFindManyMock).toHaveBeenCalledWith({
        where: {
          OR: [
            { model: { contains: 'iphone 25', mode: 'insensitive' } },
            { title: { contains: 'iphone 25', mode: 'insensitive' } },
          ],
          hiddenAt: null,
        },
        select: { id: true },
      });

      expect(demandeUpdateManyMock).toHaveBeenCalledWith({
        where: { id: { in: ['dem-iphone-25'] } },
        data: {
          hiddenAt: expect.any(Date),
          hiddenReason:
            'Demande de test (Iphone 25) masquée avant ouverture au public',
        },
      });

      // Assert post-clean safety check
      expect(categoryFindManyMock).toHaveBeenNthCalledWith(2, {
        where: {
          slug: { in: ['test', 'chocolat', 'tmp-parent-off', 'tmp-child-on'] },
        },
        select: { id: true, slug: true },
      });
      expect(categoryCountMock).toHaveBeenCalled();
    });

    it('returns zero counts when no test categories or test demandes exist', async () => {
      const categoryFindManyMock = vi
        .fn()
        .mockResolvedValueOnce([]) // no test categories found
        .mockResolvedValueOnce([]); // safety check: no remaining test categories

      const demandeDeleteManyMock = vi.fn();
      const categoryDeleteManyMock = vi.fn().mockResolvedValue({ count: 0 });
      const demandeFindManyMock = vi.fn().mockResolvedValue([]); // no iphone 25 demandes
      const demandeUpdateManyMock = vi.fn();
      const categoryCountMock = vi.fn().mockResolvedValue(15);

      const prismaMock = {
        category: {
          findMany: categoryFindManyMock,
          deleteMany: categoryDeleteManyMock,
          count: categoryCountMock,
        },
        demande: {
          findMany: demandeFindManyMock,
          deleteMany: demandeDeleteManyMock,
          updateMany: demandeUpdateManyMock,
        },
      };

      const result = await cleanTestData(prismaMock as never);

      expect(result).toEqual({
        deletedDemandesCount: 0,
        deletedCategoriesCount: 0,
        hiddenIphone25Count: 0,
        remainingCategoriesCount: 15,
      });

      // demande.deleteMany should NOT be called since no category IDs existed
      expect(demandeDeleteManyMock).not.toHaveBeenCalled();
      // demande.updateMany should NOT be called since no iphone 25 demandes existed
      expect(demandeUpdateManyMock).not.toHaveBeenCalled();
    });

    it('throws a safety assertion error if test categories remain after deletion attempt', async () => {
      const remainingTestCategory = [{ id: 'cat-chocolat', slug: 'chocolat' }];

      const categoryFindManyMock = vi
        .fn()
        .mockResolvedValueOnce(remainingTestCategory) // initial check
        .mockResolvedValueOnce(remainingTestCategory); // post-deletion safety check: STILL EXISTS!

      const prismaMock = {
        category: {
          findMany: categoryFindManyMock,
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          count: vi.fn().mockResolvedValue(16),
        },
        demande: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
          updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      };

      await expect(cleanTestData(prismaMock as never)).rejects.toThrow(
        /Safety assertion failed: expected 0 test categories, found 1\./,
      );
    });
  });

  describe('3. Shared Genuine Predicates (GENUINE_USER_WHERE & GENUINE_COMMANDE_PAID_WHERE)', () => {
    it('asserts GENUINE_USER_WHERE filters on both TEST_FIXTURE_EMAIL_SUFFIX and DEMO_EMAIL_SUFFIX', () => {
      expect(TEST_FIXTURE_EMAIL_SUFFIX).toBe('@repareme.test');
      expect(DEMO_EMAIL_SUFFIX).toBe('@demo.revime.fr');

      expect(GENUINE_USER_WHERE).toBeDefined();
      expect(Array.isArray(GENUINE_USER_WHERE.AND)).toBe(true);
      // Three since PUB-33 (DECP-23): the store-review domain is the third (pub-u7-review-accounts.spec.ts).
      expect(GENUINE_USER_WHERE.AND).toHaveLength(3);

      // Case-insensitive: ru31-test-data-shielding.spec.ts evaluates the predicate on real e-mails.
      expect(GENUINE_USER_WHERE.AND).toContainEqual({
        email: { not: { endsWith: TEST_FIXTURE_EMAIL_SUFFIX }, mode: 'insensitive' },
      });
      expect(GENUINE_USER_WHERE.AND).toContainEqual({
        email: { not: { endsWith: DEMO_EMAIL_SUFFIX }, mode: 'insensitive' },
      });
    });

    it('asserts GENUINE_COMMANDE_PAID_WHERE enforces status PAID, stripePaymentIntentId, and genuine users', () => {
      expect(GENUINE_COMMANDE_PAID_WHERE).toEqual({
        status: 'PAID',
        stripePaymentIntentId: { not: null },
        client: GENUINE_USER_WHERE,
        repairer: GENUINE_USER_WHERE,
      });
    });
  });

  describe('4. Overview Analytics Shielding Integration', () => {
    let prisma: ReturnType<typeof makeOverviewPrisma>;
    let service: AdminOverviewService;

    beforeEach(() => {
      prisma = makeOverviewPrisma();
      service = new AdminOverviewService(prisma as never, NO_ATTENTION as never);
    });

    it('verifies usersTotal and usersRecent queries carry GENUINE_USER_WHERE', async () => {
      await service.overview();

      // Find the first two profile.count calls executed inside $transaction
      const profileCountCalls = prisma.profile.count.mock.calls as unknown as [
        { where: Record<string, unknown> },
      ][];

      // Query 1: usersTotal -> profile.count with LIVE and GENUINE_USER_WHERE
      const usersTotalCall = profileCountCalls.find(
        (c) =>
          c[0].where &&
          !c[0].where.repairerEnabled &&
          !c[0].where.verificationLevel &&
          c[0].where.deletedAt === null &&
          c[0].where.user &&
          !(c[0].where.user as Record<string, unknown>).createdAt,
      );
      expect(usersTotalCall, 'usersTotal query was not found').toBeDefined();
      expect(usersTotalCall![0].where).toMatchObject({
        ...LIVE,
        user: GENUINE_USER_WHERE,
      });

      // Query 2: usersRecent -> profile.count with LIVE, GENUINE_USER_WHERE, and createdAt
      const usersRecentCall = profileCountCalls.find(
        (c) =>
          c[0].where &&
          !c[0].where.repairerEnabled &&
          !c[0].where.verificationLevel &&
          c[0].where.deletedAt === null &&
          c[0].where.user &&
          Boolean((c[0].where.user as Record<string, unknown>).createdAt),
      );
      expect(usersRecentCall, 'usersRecent query was not found').toBeDefined();
      expect(usersRecentCall![0].where.user).toMatchObject({
        ...GENUINE_USER_WHERE,
        createdAt: expect.objectContaining({ gte: expect.any(Date) }),
      });
    });

    it('verifies repairersTotal carries GENUINE_USER_WHERE', async () => {
      await service.overview();

      const profileCountCalls = prisma.profile.count.mock.calls as unknown as [
        { where: Record<string, unknown> },
      ][];

      const repairerTotalCall = profileCountCalls.find(
        (c) =>
          c[0].where &&
          c[0].where.repairerEnabled === true &&
          !c[0].where.createdAt,
      );
      expect(
        repairerTotalCall,
        'repairersTotal query was not found',
      ).toBeDefined();
      expect(repairerTotalCall![0].where).toMatchObject({
        ...LIVE,
        repairerEnabled: true,
        user: GENUINE_USER_WHERE,
      });

      // Rolling repairer window queries must also filter genuine users
      const repairerWindowCalls = profileCountCalls.filter(
        (c) =>
          c[0].where &&
          c[0].where.repairerEnabled === true &&
          Boolean(c[0].where.createdAt),
      );
      expect(repairerWindowCalls).toHaveLength(2);
      for (const call of repairerWindowCalls) {
        expect(call[0].where.user).toEqual(GENUINE_USER_WHERE);
      }
    });

    it('verifies money aggregate queries carry GENUINE_COMMANDE_PAID_WHERE', async () => {
      await service.overview();

      const aggregateCalls = prisma.commande.aggregate.mock.calls as unknown as [
        { where: Record<string, unknown>; _sum: Record<string, boolean> },
      ][];

      // 3 aggregate queries: all-time total money, current 30d window, previous 30d window
      expect(aggregateCalls).toHaveLength(3);

      for (const call of aggregateCalls) {
        expect(call[0].where).toMatchObject(GENUINE_COMMANDE_PAID_WHERE);
        expect(call[0]._sum).toEqual({
          totalCents: true,
          protectionCents: true,
        });
      }
    });

    it('verifies trendsCommandes carries GENUINE_COMMANDE_PAID_WHERE', async () => {
      await service.overview();

      const cmdFindManyCalls = prisma.commande.findMany.mock.calls as unknown as [
        {
          where: Record<string, unknown>;
          select: Record<string, boolean>;
        },
      ][];

      expect(cmdFindManyCalls.length).toBeGreaterThanOrEqual(1);
      const trendsCommandesCall = cmdFindManyCalls[0]!;
      expect(trendsCommandesCall).toBeDefined();

      expect(trendsCommandesCall[0].where).toMatchObject(
        GENUINE_COMMANDE_PAID_WHERE,
      );
      expect(trendsCommandesCall[0].where.OR).toEqual(
        paidWithin({ gte: expect.any(Date) }).OR,
      );
      expect(trendsCommandesCall[0].select).toEqual({
        paidAt: true,
        createdAt: true,
        totalCents: true,
      });
    });

    it('verifies published demandes and offers queries carry GENUINE_USER_WHERE', async () => {
      await service.overview();

      // Demandes published
      const demandeCountCalls = prisma.demande.count.mock.calls as unknown as [
        { where: Record<string, unknown> },
      ][];
      const publishedDemandesCall = demandeCountCalls.find(
        (c) =>
          c[0].where &&
          c[0].where.hiddenAt === null &&
          !c[0].where.status &&
          !c[0].where.createdAt,
      );
      expect(publishedDemandesCall).toBeDefined();
      expect(publishedDemandesCall![0].where.author).toEqual(
        GENUINE_USER_WHERE,
      );

      // Trends demandes
      const demandeFindManyCalls = prisma.demande.findMany.mock
        .calls as unknown as [
        { where: Record<string, unknown>; select: Record<string, boolean> },
      ][];
      expect(demandeFindManyCalls.length).toBeGreaterThanOrEqual(1);
      const trendsDemandesCall = demandeFindManyCalls[0]!;
      expect(trendsDemandesCall[0].where.author).toEqual(
        GENUINE_USER_WHERE,
      );

      // Offers queries
      const offerCountCalls = prisma.offer.count.mock.calls as unknown as [
        { where: Record<string, unknown> },
      ][];
      expect(offerCountCalls.length).toBeGreaterThan(0);
      for (const call of offerCountCalls) {
        expect(call[0].where.repairer).toEqual(GENUINE_USER_WHERE);
      }
    });
  });
});
