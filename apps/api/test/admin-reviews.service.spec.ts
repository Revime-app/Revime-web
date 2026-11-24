import { describe, expect, it, vi } from 'vitest';
import { AdminReviewsService } from '../src/admin/admin-reviews.service.js';
import { AppException } from '../src/common/app-exception.js';
import { PAGE_SIZE } from '../src/admin/admin-constants.js';

/**
 * CF4-37 « Avis » (spec L3, L4, §4.3). Prisma mocked - never PrismaService (vitest loads
 * `.env`, whose DATABASE_URL is production).
 */

type Row = Record<string, any>;

const reviewRow = (over: Row = {}): Row => ({
  id: 'rev-1',
  createdAt: new Date('2026-09-10T08:00:00Z'),
  rating: 2,
  comment: 'Pas terrible',
  qualityRating: 3,
  delayRating: null,
  communicationRating: 2,
  authorUserId: 'u-a',
  repairerUserId: 'u-r',
  commandeId: 'cmd-1',
  deletedAt: null,
  moderationMotif: null,
  moderationNote: null,
  moderatedByUserId: null,
  author: { username: 'lea', email: 'lea@gmail.com' },
  repairer: { username: 'atelier', email: 'atelier@orange.fr' },
  commande: {
    id: 'cmd-1',
    status: 'PAID',
    step: 'RELEASED',
    repairCents: 8000,
    shippingCents: 500,
    protectionCents: 150,
    totalCents: 8650,
    createdAt: new Date('2026-09-01T08:00:00Z'),
    paidAt: new Date('2026-09-01T09:00:00Z'),
    releasedAt: new Date('2026-09-05T09:00:00Z'),
    demande: { title: 'Écran iPhone' },
  },
  ...over,
});

function makePrisma(opts: { rows?: Row[]; count?: number; updated?: number; exists?: Row | null; moderator?: Row | null } = {}) {
  const rows = opts.rows ?? [reviewRow()];
  return {
    review: {
      findMany: vi.fn().mockResolvedValue(rows),
      count: vi.fn().mockResolvedValue(opts.count ?? rows.length),
      groupBy: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(opts.exists === undefined ? rows[0] : opts.exists),
      updateMany: vi.fn().mockResolvedValue({ count: opts.updated ?? 1 }),
    },
    user: { findUnique: vi.fn().mockResolvedValue(opts.moderator ?? null) },
  };
}

const whereOf = async (q: Record<string, unknown>) => {
  const prisma = makePrisma();
  await new AdminReviewsService(prisma as any).list({ page: 1, ...q } as any);
  const arg = prisma.review.findMany.mock.calls[0]![0];
  expect(prisma.review.count).toHaveBeenCalledWith({ where: arg.where });
  return arg;
};

const DEMO = { endsWith: '@demo.revime.fr', mode: 'insensitive' };

describe('AdminReviewsService.list where', () => {
  it('no filter: empty AND, newest first, first page', async () => {
    const arg = await whereOf({});
    expect(arg.where).toEqual({ AND: [] });
    expect(arg.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    expect(arg.skip).toBe(0);
    expect(arg.take).toBe(PAGE_SIZE);
  });

  it('hidden → deletedAt not null; visible → deletedAt null', async () => {
    expect((await whereOf({ state: 'hidden' })).where.AND).toEqual([{ deletedAt: { not: null } }]);
    expect((await whereOf({ state: 'visible' })).where.AND).toEqual([{ deletedAt: null }]);
  });

  it('rating filter', async () => {
    expect((await whereOf({ rating: 1 })).where.AND).toEqual([{ rating: 1 }]);
  });

  it('period on createdAt, Paris days, `to` inclusive', async () => {
    expect((await whereOf({ from: '2026-09-01', to: '2026-09-30' })).where.AND).toEqual([
      { createdAt: { gte: new Date('2026-08-31T22:00:00.000Z') } },
      { createdAt: { lt: new Date('2026-09-30T22:00:00.000Z') } },
    ]);
  });

  it('demo yes → author OR réparateur e-mail endsWith the suffix (insensitive)', async () => {
    expect((await whereOf({ demo: 'yes' })).where.AND).toEqual([
      { OR: [{ author: { email: DEMO } }, { repairer: { email: DEMO } }] },
    ]);
  });

  it('demo no → NEITHER side is demo', async () => {
    expect((await whereOf({ demo: 'no' })).where.AND).toEqual([
      { NOT: { author: { email: DEMO } } },
      { NOT: { repairer: { email: DEMO } } },
    ]);
  });

  it('q → OR over usernames, e-mails, commandeId and comment, insensitive contains', async () => {
    const c = { contains: 'lea', mode: 'insensitive' };
    expect((await whereOf({ q: 'lea' })).where.AND).toEqual([
      {
        OR: [
          { author: { username: c } },
          { author: { email: c } },
          { repairer: { username: c } },
          { repairer: { email: c } },
          { commandeId: c },
          { comment: c },
        ],
      },
    ]);
  });

  it('filters combine in AND, so demo and q ORs cannot collide', async () => {
    const and = (await whereOf({ demo: 'yes', q: 'x', state: 'hidden' })).where.AND;
    expect(and).toHaveLength(3);
  });

  it('page 3 skips two pages', async () => {
    expect((await whereOf({ page: 3 })).skip).toBe(2 * PAGE_SIZE);
  });
});

describe('AdminReviewsService.list rows', () => {
  it('maps a visible row, with isDemo and demande title', async () => {
    const res = await new AdminReviewsService(makePrisma({ count: 41 }) as any).list({ page: 2 } as any);
    expect(res).toMatchObject({ total: 41, page: 2, pageSize: PAGE_SIZE });
    expect(res.items[0]).toEqual({
      id: 'rev-1',
      createdAt: '2026-09-10T08:00:00.000Z',
      rating: 2,
      comment: 'Pas terrible',
      authorUserId: 'u-a',
      authorUsername: 'lea',
      authorEmail: 'lea@gmail.com',
      repairerUserId: 'u-r',
      repairerUsername: 'atelier',
      repairerEmail: 'atelier@orange.fr',
      commandeId: 'cmd-1',
      demandeTitle: 'Écran iPhone',
      isDemo: false,
      hidden: false,
      moderationMotif: null,
    });
  });

  it('demo réparateur with a real author is demo', async () => {
    const rows = [reviewRow({ repairer: { username: 'd', email: 'd@demo.revime.fr' } })];
    const res = await new AdminReviewsService(makePrisma({ rows }) as any).list({ page: 1 } as any);
    expect(res.items[0]!.isDemo).toBe(true);
  });

  it('Review Focus 5: hidden before L (deletedAt set, no motif) lists as hidden with a null motif', async () => {
    const rows = [reviewRow({ deletedAt: new Date('2026-09-02T00:00:00Z'), moderationMotif: null })];
    const res = await new AdminReviewsService(makePrisma({ rows }) as any).list({ page: 1 } as any);
    expect(res.items[0]).toMatchObject({ hidden: true, moderationMotif: null });
  });
});

describe('AdminReviewsService.detail', () => {
  it('carries sub-ratings, the commande and the moderation trail with the moderator name', async () => {
    const hidden = reviewRow({
      deletedAt: new Date('2026-09-20T10:00:00Z'),
      moderationMotif: 'PERSONAL_DATA',
      moderationNote: 'Numéro de téléphone',
      moderatedByUserId: 'admin-1',
    });
    const prisma = makePrisma({ rows: [hidden], moderator: { username: 'ops', name: 'Ops' } });
    const d = await new AdminReviewsService(prisma as any).detail('rev-1');
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'admin-1' }, select: { username: true } });
    expect(d).toMatchObject({
      hidden: true,
      moderationMotif: 'PERSONAL_DATA',
      qualityRating: 3,
      delayRating: null,
      communicationRating: 2,
      commande: {
        id: 'cmd-1',
        status: 'PAID',
        step: 'RELEASED',
        totalCents: 8650,
        createdAt: '2026-09-01T08:00:00.000Z',
        paidAt: '2026-09-01T09:00:00.000Z',
        releasedAt: '2026-09-05T09:00:00.000Z',
      },
      moderation: {
        motif: 'PERSONAL_DATA',
        note: 'Numéro de téléphone',
        moderatorUserId: 'admin-1',
        moderatorName: 'ops',
        at: '2026-09-20T10:00:00.000Z',
      },
    });
  });

  it('a deleted moderator account leaves the trail with a null name', async () => {
    const hidden = reviewRow({ deletedAt: new Date(), moderationMotif: 'FAKE', moderatedByUserId: 'gone' });
    const d = await new AdminReviewsService(makePrisma({ rows: [hidden], moderator: null }) as any).detail('rev-1');
    expect(d.moderation).toMatchObject({ moderatorUserId: 'gone', moderatorName: null });
  });

  it('visible → moderation null, no moderator lookup', async () => {
    const prisma = makePrisma();
    const d = await new AdminReviewsService(prisma as any).detail('rev-1');
    expect(d.moderation).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('unknown id → NOT_FOUND', async () => {
    const err = await new AdminReviewsService(makePrisma({ exists: null }) as any).detail('x').catch((e) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('NOT_FOUND');
  });
});

describe('AdminReviewsService.hide (Review Focus 3)', () => {
  it('writes the four fields only where the review is still visible', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-30T08:00:00Z'));
    const prisma = makePrisma();
    await new AdminReviewsService(prisma as any).hide('rev-1', { motif: 'OTHER', note: 'Doublon' }, 'admin-1');
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'rev-1', deletedAt: null },
      data: {
        deletedAt: new Date('2026-09-30T08:00:00Z'),
        moderationMotif: 'OTHER',
        moderationNote: 'Doublon',
        moderatedByUserId: 'admin-1',
      },
    });
    vi.useRealTimers();
  });

  it('no note → moderationNote null', async () => {
    const prisma = makePrisma();
    await new AdminReviewsService(prisma as any).hide('rev-1', { motif: 'ABUSIVE' }, 'admin-1');
    expect(prisma.review.updateMany.mock.calls[0]![0].data.moderationNote).toBeNull();
  });

  it('second hide: count 0 and the row exists → CONFLICT « Cet avis est déjà masqué. », nothing else written', async () => {
    const prisma = makePrisma({ updated: 0 });
    const err = await new AdminReviewsService(prisma as any).hide('rev-1', { motif: 'FAKE' }, 'admin-2').catch((e) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).code).toBe('CONFLICT');
    expect((err as AppException).message).toBe('Cet avis est déjà masqué.');
    expect(prisma.review.updateMany).toHaveBeenCalledTimes(1);
  });

  it('missing row → NOT_FOUND', async () => {
    const err = await new AdminReviewsService(makePrisma({ updated: 0, exists: null }) as any)
      .hide('x', { motif: 'FAKE' }, 'a')
      .catch((e) => e);
    expect((err as AppException).code).toBe('NOT_FOUND');
  });
});

describe('AdminReviewsService.restore', () => {
  it('clears the four fields only where the review is hidden', async () => {
    const prisma = makePrisma();
    await new AdminReviewsService(prisma as any).restore('rev-1');
    expect(prisma.review.updateMany).toHaveBeenCalledWith({
      where: { id: 'rev-1', deletedAt: { not: null } },
      data: { deletedAt: null, moderationMotif: null, moderationNote: null, moderatedByUserId: null },
    });
  });

  it('visible review → CONFLICT « Cet avis est déjà visible. »', async () => {
    const err = await new AdminReviewsService(makePrisma({ updated: 0 }) as any).restore('rev-1').catch((e) => e);
    expect((err as AppException).code).toBe('CONFLICT');
    expect((err as AppException).message).toBe('Cet avis est déjà visible.');
  });

  it('missing row → NOT_FOUND', async () => {
    const err = await new AdminReviewsService(makePrisma({ updated: 0, exists: null }) as any).restore('x').catch((e) => e);
    expect((err as AppException).code).toBe('NOT_FOUND');
  });
});
