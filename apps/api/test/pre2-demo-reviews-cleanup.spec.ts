// apps/api/test/pre2-demo-reviews-cleanup.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanDemoReviews } from '../scripts/clean-demo-reviews.js';
import { assertDemoSeedAllowed } from '../scripts/seed-demo/guards.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * PRE-2: Remove demo reviews (deceptive commercial practice under Code de la consommation L. 121-4 21°).
 *
 * Test suite verifying:
 * 1. Migration SQL integrity (20261017203000_remove_demo_reviews/migration.sql)
 * 2. CLI maintenance function (cleanDemoReviews)
 * 3. Demo seed guard (assertDemoSeedAllowed)
 */

describe('PRE-2: Demo Reviews Cleanup & Shielding Suite', () => {
  describe('1. Migration SQL Integrity', () => {
    const migrationPath = resolve(
      __dirname,
      '../prisma/migrations/20261017203000_remove_demo_reviews/migration.sql',
    );

    it('migration file exists on disk in prisma/migrations', () => {
      expect(existsSync(migrationPath)).toBe(true);
    });

    it('contains DELETE FROM "Review" targeting demo reviews by author or repairer email', () => {
      const sql = readFileSync(migrationPath, 'utf8');

      // Asserts that it contains DELETE FROM "Review"
      expect(sql).toContain('DELETE FROM "Review"');

      // Asserts that it joins "user" for author (u_author) and repairer (u_repairer)
      expect(sql).toMatch(/JOIN\s+"user"\s+u_author\s+ON\s+r\."authorUserId"\s+=\s+u_author\."id"/);
      expect(sql).toMatch(/JOIN\s+"user"\s+u_repairer\s+ON\s+r\."repairerUserId"\s+=\s+u_repairer\."id"/);

      // Asserts that it uses case-insensitive match on @demo.revime.fr
      expect(sql).toContain('LOWER(u_author."email") LIKE \'%@demo.revime.fr\'');
      expect(sql).toContain('LOWER(u_repairer."email") LIKE \'%@demo.revime.fr\'');

      // Asserts that it targets both author and repairer (OR)
      expect(sql).toMatch(
        /WHERE\s+LOWER\(u_author\."email"\)\s+LIKE\s+'%@demo\.revime\.fr'\s+OR\s+LOWER\(u_repairer\."email"\)\s+LIKE\s+'%@demo\.revime\.fr'/,
      );
    });
  });

  describe('2. CLI Maintenance Function (cleanDemoReviews)', () => {
    it('deletes demo reviews and returns cleanup metrics when demo reviews exist', async () => {
      const demo1 = {
        id: 'rev-demo-1',
        author: { email: 'client@demo.revime.fr' },
        repairer: { email: 'pro@repareme.fr' },
      };
      const demo2 = {
        id: 'rev-demo-2',
        author: { email: 'client@gmail.com' },
        repairer: { email: 'atelier@DEMO.REVIME.FR' },
      };
      const real1 = {
        id: 'rev-real-1',
        author: { email: 'client@real.com' },
        repairer: { email: 'pro@repareme.fr' },
      };

      const deleteManyMock = vi.fn().mockResolvedValue({ count: 2 });
      const findManyMock = vi
        .fn()
        .mockResolvedValueOnce([demo1, demo2, real1]) // initial query
        .mockResolvedValueOnce([real1]); // remaining query for safety assertion

      const prismaMock = {
        review: {
          findMany: findManyMock,
          deleteMany: deleteManyMock,
        },
      } as any;

      const result = await cleanDemoReviews(prismaMock);

      expect(result).toEqual({
        initialTotalReviews: 3,
        initialDemoReviews: 2,
        deletedCount: 2,
        remainingTotalReviews: 1,
        remainingDemoReviews: 0,
      });

      expect(deleteManyMock).toHaveBeenCalledTimes(1);
      expect(deleteManyMock).toHaveBeenCalledWith({
        where: { id: { in: ['rev-demo-1', 'rev-demo-2'] } },
      });
    });

    it('handles zero demo reviews idempotently without calling deleteMany', async () => {
      const real1 = {
        id: 'rev-real-1',
        author: { email: 'client@real.com' },
        repairer: { email: 'pro@repareme.fr' },
      };

      const deleteManyMock = vi.fn();
      const findManyMock = vi.fn().mockResolvedValue([real1]);

      const prismaMock = {
        review: {
          findMany: findManyMock,
          deleteMany: deleteManyMock,
        },
      } as any;

      const result = await cleanDemoReviews(prismaMock);

      expect(result).toEqual({
        initialTotalReviews: 1,
        initialDemoReviews: 0,
        deletedCount: 0,
        remainingTotalReviews: 1,
        remainingDemoReviews: 0,
      });

      expect(deleteManyMock).not.toHaveBeenCalled();
    });

    it('safety assertion: throws an error if remaining demo reviews count > 0 after delete', async () => {
      const demo1 = {
        id: 'rev-demo-1',
        author: { email: 'client@demo.revime.fr' },
        repairer: { email: 'pro@repareme.fr' },
      };

      const deleteManyMock = vi.fn().mockResolvedValue({ count: 1 });
      const findManyMock = vi
        .fn()
        .mockResolvedValueOnce([demo1]) // initial query
        .mockResolvedValueOnce([demo1]); // still present in verification query!

      const prismaMock = {
        review: {
          findMany: findManyMock,
          deleteMany: deleteManyMock,
        },
      } as any;

      await expect(cleanDemoReviews(prismaMock)).rejects.toThrow(
        /Safety assertion failed: expected 0 remaining demo reviews, but found 1\./,
      );
    });

    it('preserves non-demo reviews: verifies non-demo review IDs are NOT in the deleteMany in list', async () => {
      const realReview = {
        id: 'rev-genuine-99',
        author: { email: 'real.customer@gmail.com' },
        repairer: { email: 'real.repairer@orange.fr' },
      };
      const demoReview = {
        id: 'rev-demo-10',
        author: { email: 'bot@demo.revime.fr' },
        repairer: { email: 'real.repairer@orange.fr' },
      };

      const deleteManyMock = vi.fn().mockResolvedValue({ count: 1 });
      const findManyMock = vi
        .fn()
        .mockResolvedValueOnce([realReview, demoReview])
        .mockResolvedValueOnce([realReview]);

      const prismaMock = {
        review: {
          findMany: findManyMock,
          deleteMany: deleteManyMock,
        },
      } as any;

      await cleanDemoReviews(prismaMock);

      expect(deleteManyMock).toHaveBeenCalledTimes(1);
      const callArgs = deleteManyMock.mock.calls[0]![0];
      expect(callArgs.where.id.in).toEqual(['rev-demo-10']);
      expect(callArgs.where.id.in).not.toContain('rev-genuine-99');
    });
  });

  // The public shield (ReviewsService.listForRepairer and the repairerStats rating) is tested where it
  // lives: demo-review.spec.ts and ru31-test-data-shielding.spec.ts, which EVALUATE the predicate.

  describe('3. Demo Seed Guard (assertDemoSeedAllowed)', () => {
    const refusal = /ALLOW_DEMO_SEED=yes/;

    it('refuses --seed and --reset unless ALLOW_DEMO_SEED is exactly "yes", whatever NODE_ENV says', () => {
      for (const mode of ['seed', 'reset']) {
        for (const env of [{}, { NODE_ENV: 'development' }, { NODE_ENV: 'production' }, { ALLOW_DEMO_SEED: 'true' }, { ALLOW_DEMO_SEED: '1' }]) {
          expect(() => assertDemoSeedAllowed(env, { mode, dryRun: false })).toThrow(refusal);
        }
      }
    });

    it('lets --seed and --reset through with the explicit opt-in', () => {
      for (const mode of ['seed', 'reset']) {
        expect(() => assertDemoSeedAllowed({ ALLOW_DEMO_SEED: 'yes' }, { mode, dryRun: false })).not.toThrow();
      }
    });

    it('needs nothing for --cleanup or any --dry-run: they write no demo data', () => {
      expect(() => assertDemoSeedAllowed({}, { mode: 'cleanup', dryRun: false })).not.toThrow();
      for (const mode of ['seed', 'cleanup', 'reset']) {
        expect(() => assertDemoSeedAllowed({}, { mode, dryRun: true })).not.toThrow();
      }
    });
  });
});
