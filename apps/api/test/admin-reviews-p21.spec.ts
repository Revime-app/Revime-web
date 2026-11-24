import { describe, expect, it, vi } from 'vitest';
import { AdminReviewsService } from '../src/admin/admin-reviews.service.js';
import { PAGE_SIZE } from '../src/admin/admin-constants.js';
import { NOT_DEMO_REVIEW_WHERE } from '../src/reviews/demo-review.js';

type Row = Record<string, any>;

const reviewRow = (over: Row = {}): Row => ({
  id: 'rev-1',
  createdAt: new Date('2026-09-10T08:00:00Z'),
  rating: 4,
  comment: 'Super réparation',
  authorUserId: 'u-a',
  repairerUserId: 'u-r',
  commandeId: 'cmd-1',
  deletedAt: null,
  moderationMotif: null,
  author: { username: 'lea', email: 'lea@gmail.com' },
  repairer: { username: 'atelier', email: 'atelier@orange.fr' },
  commande: {
    demande: { title: 'Écran iPhone' },
  },
  ...over,
});

function makePrisma(opts: {
  rows?: Row[];
  count?: number;
  groupByResult?: Array<{ rating: number; _count: { _all: number } }>;
} = {}) {
  const rows = opts.rows ?? [reviewRow()];
  return {
    review: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(opts.count ?? rows.length),
      findUnique: vi.fn().mockResolvedValue(rows[0] ?? null),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      groupBy: vi.fn().mockResolvedValue(opts.groupByResult ?? []),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
}

describe('P21: AdminReviewsService - Summary, Negative Filter & Moderation Reason', () => {
  describe('rating summary computation', () => {
    it('returns summary with averageRating, totalReviews and 5-tier distribution from groupBy', async () => {
      const groupByResult = [
        { rating: 5, _count: { _all: 10 } },
        { rating: 4, _count: { _all: 5 } },
        { rating: 2, _count: { _all: 1 } },
        { rating: 1, _count: { _all: 2 } },
      ];
      // totalReviews = 10 + 5 + 1 + 2 = 18
      // sum = 5*10 + 4*5 + 2*1 + 1*2 = 50 + 20 + 2 + 2 = 74
      // average = 74 / 18 = 4.11111... -> 4.1
      const prisma = makePrisma({ groupByResult });
      const service = new AdminReviewsService(prisma as any);

      const res = await service.list({ page: 1 });

      // the figure customers see: neither hidden nor demo reviews (PRE-2), like every public rating
      expect(prisma.review.groupBy).toHaveBeenCalledWith({
        by: ['rating'],
        where: { deletedAt: null, ...NOT_DEMO_REVIEW_WHERE },
        _count: { _all: true },
      });

      expect(res.summary).toBeDefined();
      expect(res.summary).toEqual({
        averageRating: 4.1,
        totalReviews: 18,
        distribution: {
          1: 2,
          2: 1,
          3: 0,
          4: 5,
          5: 10,
        },
      });
    });

    it('is not narrowed by the list filters (the summary is global)', async () => {
      const prisma = makePrisma();
      const service = new AdminReviewsService(prisma as any);

      await service.list({ rating: 'negative' as any, state: 'hidden' as any, demo: 'yes' as any, q: 'lea' });

      const where = prisma.review.groupBy.mock.calls[0]![0].where;
      expect(Object.keys(where).sort()).toEqual(['author', 'deletedAt', 'repairer']);
    });

    it('returns 0 average and empty distribution when no reviews exist', async () => {
      const prisma = makePrisma({ rows: [], count: 0, groupByResult: [] });
      const service = new AdminReviewsService(prisma as any);

      const res = await service.list({ page: 1 });

      expect(res.summary).toEqual({
        averageRating: 0,
        totalReviews: 0,
        distribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      });
    });
  });

  describe('negative rating filter', () => {
    it('applies where.rating = { lte: 2 } when query.rating === "negative"', async () => {
      const prisma = makePrisma();
      const service = new AdminReviewsService(prisma as any);

      await service.list({ rating: 'negative' as any });

      const findManyArg = prisma.review.findMany.mock.calls[0]![0];
      expect(findManyArg.where.AND).toContainEqual({
        rating: { lte: 2 },
      });
      expect(prisma.review.count).toHaveBeenCalledWith({
        where: findManyArg.where,
      });
    });

    it('applies exact rating when numeric rating is passed', async () => {
      const prisma = makePrisma();
      const service = new AdminReviewsService(prisma as any);

      await service.list({ rating: 3 });

      const findManyArg = prisma.review.findMany.mock.calls[0]![0];
      expect(findManyArg.where.AND).toContainEqual({
        rating: 3,
      });
    });
  });

  describe('moderation motif preservation in toItem', () => {
    it('preserves moderationMotif when review is hidden', async () => {
      const hiddenReview = reviewRow({
        id: 'rev-hidden-1',
        deletedAt: new Date('2026-10-10T12:00:00Z'),
        moderationMotif: 'ABUSIVE',
      });
      const prisma = makePrisma({ rows: [hiddenReview] });
      const service = new AdminReviewsService(prisma as any);

      const res = await service.list({ page: 1, state: 'hidden' });

      expect(res.items[0]).toMatchObject({
        id: 'rev-hidden-1',
        hidden: true,
        moderationMotif: 'ABUSIVE',
      });
    });

    it('sets moderationMotif to null when review is visible', async () => {
      const visibleReview = reviewRow({
        id: 'rev-vis-1',
        deletedAt: null,
        moderationMotif: 'ABUSIVE', // even if dirty in db, toItem clears it when visible
      });
      const prisma = makePrisma({ rows: [visibleReview] });
      const service = new AdminReviewsService(prisma as any);

      const res = await service.list({ page: 1 });

      expect(res.items[0]).toMatchObject({
        id: 'rev-vis-1',
        hidden: false,
        moderationMotif: null,
      });
    });
  });
});
