/**
 * PRE-2 Maintenance Utility: Remove Demo Reviews.
 *
 * Permanently removes all seeded demo reviews from the database where either
 * author or repairer email ends with @demo.revime.fr.
 *
 * Usage:
 *   npx tsx scripts/clean-demo-reviews.ts
 *   npm run clean:demo-reviews -w @revime/api
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { isDemoReview } from '../src/reviews/demo-review.js';

export interface CleanDemoReviewsResult {
  initialTotalReviews: number;
  initialDemoReviews: number;
  deletedCount: number;
  remainingTotalReviews: number;
  remainingDemoReviews: number;
}

export async function cleanDemoReviews(
  prisma: Pick<PrismaClient, 'review'>,
): Promise<CleanDemoReviewsResult> {
  const allReviews = await prisma.review.findMany({
    select: {
      id: true,
      author: { select: { email: true } },
      repairer: { select: { email: true } },
    },
  });

  const demoReviewIds = allReviews
    .filter((r) => isDemoReview(r.author.email, r.repairer.email))
    .map((r) => r.id);

  const initialTotalReviews = allReviews.length;
  const initialDemoReviews = demoReviewIds.length;

  let deletedCount = 0;
  if (demoReviewIds.length > 0) {
    const deleteResult = await prisma.review.deleteMany({
      where: { id: { in: demoReviewIds } },
    });
    deletedCount = deleteResult.count;
  }

  const remainingReviews = await prisma.review.findMany({
    select: {
      id: true,
      author: { select: { email: true } },
      repairer: { select: { email: true } },
    },
  });

  const remainingDemoReviews = remainingReviews.filter((r) =>
    isDemoReview(r.author.email, r.repairer.email),
  ).length;

  if (remainingDemoReviews > 0) {
    throw new Error(
      `Safety assertion failed: expected 0 remaining demo reviews, but found ${remainingDemoReviews}.`,
    );
  }

  return {
    initialTotalReviews,
    initialDemoReviews,
    deletedCount,
    remainingTotalReviews: remainingReviews.length,
    remainingDemoReviews,
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

  console.log('--- PRE-2: Demo Reviews Cleanup ---');
  try {
    const res = await cleanDemoReviews(prisma);
    console.log(`Initial total reviews:     ${res.initialTotalReviews}`);
    console.log(`Demo reviews found:        ${res.initialDemoReviews}`);
    console.log(`Demo reviews deleted:      ${res.deletedCount}`);
    console.log(`Remaining total reviews:   ${res.remainingTotalReviews}`);
    console.log(`Remaining demo reviews:    ${res.remainingDemoReviews}`);
    console.log('✅ Demo reviews successfully removed.');
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectCliRun =
  !process.env.VITEST &&
  Boolean(
    process.argv[1] &&
      (process.argv[1].endsWith('clean-demo-reviews.ts') ||
        process.argv[1].endsWith('clean-demo-reviews.js')),
  );

if (isDirectCliRun) {
  main().catch((err) => {
    console.error('Fatal error during clean-demo-reviews:', err);
    process.exit(1);
  });
}
