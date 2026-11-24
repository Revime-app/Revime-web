/**
 * PRE-3 Maintenance Utility: Isolate Test Data & Clean Test Artifacts.
 *
 * Removes test categories from the catalog ('test', 'chocolat', 'tmp-parent-off', 'tmp-child-on'),
 * removes test demandes linked to test categories (e.g. chocolat), and soft-hides the
 * 'Iphone 25' test demande so it no longer appears in public feeds or searches.
 *
 * Usage:
 *   npx tsx scripts/clean-test-data.ts
 *   npm run clean:test-data -w @revime/api
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

export interface CleanTestDataResult {
  deletedDemandesCount: number;
  deletedCategoriesCount: number;
  hiddenIphone25Count: number;
  remainingCategoriesCount: number;
}

export async function cleanTestData(
  prisma: Pick<PrismaClient, 'category' | 'demande'>,
): Promise<CleanTestDataResult> {
  const testCategorySlugs = ['test', 'chocolat', 'tmp-parent-off', 'tmp-child-on'];

  // 1. Delete test demandes linked to test categories (e.g. chocolat)
  const testCategories = await prisma.category.findMany({
    where: { slug: { in: testCategorySlugs } },
    select: { id: true, slug: true },
  });
  const testCategoryIds = testCategories.map((c) => c.id);

  let deletedDemandesCount = 0;
  if (testCategoryIds.length > 0) {
    const resDemandes = await prisma.demande.deleteMany({
      where: { categoryId: { in: testCategoryIds } },
    });
    deletedDemandesCount = resDemandes.count;
  }

  // 2. Delete test categories
  const resCategories = await prisma.category.deleteMany({
    where: { slug: { in: testCategorySlugs } },
  });
  const deletedCategoriesCount = resCategories.count;

  // 3. Soft-hide 'Iphone 25' test demande
  const iphone25Demandes = await prisma.demande.findMany({
    where: {
      OR: [
        { model: { contains: 'iphone 25', mode: 'insensitive' } },
        { title: { contains: 'iphone 25', mode: 'insensitive' } },
      ],
      hiddenAt: null,
    },
    select: { id: true },
  });

  let hiddenIphone25Count = 0;
  if (iphone25Demandes.length > 0) {
    const resHide = await prisma.demande.updateMany({
      where: { id: { in: iphone25Demandes.map((d) => d.id) } },
      data: {
        hiddenAt: new Date(),
        hiddenReason: 'Demande de test (Iphone 25) masquée avant ouverture au public',
      },
    });
    hiddenIphone25Count = resHide.count;
  }

  // Verify remaining categories
  const remainingCategories = await prisma.category.findMany({
    where: { slug: { in: testCategorySlugs } },
    select: { id: true, slug: true },
  });
  if (remainingCategories.length > 0) {
    throw new Error(
      `Safety assertion failed: expected 0 test categories, found ${remainingCategories.length}.`,
    );
  }

  const allCategoriesCount = await prisma.category.count();

  return {
    deletedDemandesCount,
    deletedCategoriesCount,
    hiddenIphone25Count,
    remainingCategoriesCount: allCategoriesCount,
  };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is required.');
    process.exit(1);
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  console.log('--- PRE-3: Test Data Isolation & Cleanup ---');
  try {
    const res = await cleanTestData(prisma);
    console.log(`Deleted test demandes:      ${res.deletedDemandesCount}`);
    console.log(`Deleted test categories:    ${res.deletedCategoriesCount}`);
    console.log(`Hidden 'Iphone 25' demands: ${res.hiddenIphone25Count}`);
    console.log(`Remaining valid categories: ${res.remainingCategoriesCount}`);
    console.log('✅ Test data successfully isolated & cleaned.');
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectCliRun =
  !process.env.VITEST &&
  Boolean(
    process.argv[1] &&
      (process.argv[1].endsWith('clean-test-data.ts') ||
        process.argv[1].endsWith('clean-test-data.js')),
  );

if (isDirectCliRun) {
  main().catch((err) => {
    console.error('Fatal error during clean-test-data:', err);
    process.exit(1);
  });
}
