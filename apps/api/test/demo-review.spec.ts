import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_AUDIT_ACTION_LABEL,
  ADMIN_AUDIT_ACTIONS,
  adminReviewListQuerySchema,
  hideReviewInputSchema,
  REVIEW_MODERATION_MOTIF_LABEL,
} from '@revime/shared';
import { isDemoReview, NOT_DEMO_REVIEW_WHERE } from '../src/reviews/demo-review.js';
import { ReviewsService } from '../src/reviews/reviews.service.js';

/**
 * CF4-37 (spec L1, L2, §4.2, §4.3). Demo is DERIVED: a review is demo when its author OR its
 * réparateur has a `@demo.revime.fr` e-mail. Prisma mocked - never PrismaService (vitest loads
 * `.env`, whose DATABASE_URL is production).
 */

describe('isDemoReview (Review Focus 4)', () => {
  it.each([
    ['author demo', 'a@demo.revime.fr', 'r@gmail.com', true],
    ['réparateur demo, author real', 'a@gmail.com', 'atelier@demo.revime.fr', true],
    ['both demo', 'a@demo.revime.fr', 'r@demo.revime.fr', true],
    ['neither', 'a@gmail.com', 'r@orange.fr', false],
    ['upper-case suffix', 'a@gmail.com', 'R@DEMO.Revime.FR', true],
    ['suffix only as a substring', 'a@demo.revime.fr.evil.com', 'r@notdemo.revime.fr.com', false],
  ])('%s → %s', (_l, author, repairer, expected) => {
    expect(isDemoReview(author, repairer)).toBe(expected);
  });
});

describe('ReviewsService.listForRepairer demo shield', () => {
  const base = {
    rating: 5,
    qualityRating: null,
    delayRating: null,
    communicationRating: null,
    comment: 'Top',
    createdAt: new Date('2026-09-01T10:00:00Z'),
  };

  function make(rows: unknown[]) {
    const findMany = vi.fn().mockResolvedValue(rows);
    return { svc: new ReviewsService({ review: { findMany } } as any), findMany };
  }

  it('cuts demo reviews in the query itself (the same predicate as the rating) and reads no e-mail', async () => {
    const { svc, findMany } = make([]);
    await svc.listForRepairer('rep-1');
    const arg = findMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ repairerUserId: 'rep-1', deletedAt: null, ...NOT_DEMO_REVIEW_WHERE });
    expect(arg.select.author).toEqual({ select: { username: true } });
    expect(arg.select.repairer).toBeUndefined();
  });

  it('maps the rows the database returned, with no isDemo flag and no e-mail in the DTO', async () => {
    const { svc } = make([{ ...base, id: 'r2', author: { username: 'tom' } }]);
    const dtos = await svc.listForRepairer('rep-1');
    expect(dtos.map((d) => d.id)).toEqual(['r2']);
    expect('isDemo' in dtos[0]!).toBe(false);
    expect(JSON.stringify(dtos)).not.toMatch(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
  });
});

describe('hideReviewInputSchema', () => {
  it('accepts a motif alone', () => {
    expect(hideReviewInputSchema.parse({ motif: 'PERSONAL_DATA' })).toEqual({ motif: 'PERSONAL_DATA' });
  });

  it('refuses a missing or unknown motif « Choisissez un motif. »', () => {
    for (const body of [{}, { motif: 'NEGATIVE' }]) {
      const r = hideReviewInputSchema.safeParse(body);
      expect(r.error?.issues[0]).toMatchObject({ message: 'Choisissez un motif.', path: ['motif'] });
    }
  });

  it('OTHER requires a note « Précisez le motif. » (blank counts as missing)', () => {
    for (const body of [{ motif: 'OTHER' }, { motif: 'OTHER', note: '   ' }]) {
      const r = hideReviewInputSchema.safeParse(body);
      expect(r.error?.issues[0]).toMatchObject({ message: 'Précisez le motif.', path: ['note'] });
    }
    expect(hideReviewInputSchema.parse({ motif: 'OTHER', note: ' Doublon ' })).toEqual({ motif: 'OTHER', note: 'Doublon' });
  });

  it('refuses a note over 500 characters', () => {
    const r = hideReviewInputSchema.safeParse({ motif: 'FAKE', note: 'a'.repeat(501) });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['note']);
  });
});

describe('adminReviewListQuerySchema', () => {
  it('parses filters, coerces rating and page, drops empty strings', () => {
    expect(
      adminReviewListQuerySchema.parse({ state: 'hidden', rating: '2', demo: 'yes', from: '2026-09-01', to: '', q: ' lea ', page: '3' }),
    ).toEqual({ state: 'hidden', rating: 2, demo: 'yes', from: '2026-09-01', q: 'lea', page: 3 });
  });

  it('defaults page to 1 and refuses a rating out of 1..5', () => {
    expect(adminReviewListQuerySchema.parse({})).toEqual({ page: 1 });
    expect(adminReviewListQuerySchema.safeParse({ rating: '6' }).success).toBe(false);
    expect(adminReviewListQuerySchema.safeParse({ state: 'deleted' }).success).toBe(false);
    expect(adminReviewListQuerySchema.safeParse({ from: 'hier' }).success).toBe(false);
  });
});

describe('review moderation labels and audit actions', () => {
  it('motif labels are the spec §4.2 wording, and there is no « negative » motif', () => {
    expect(REVIEW_MODERATION_MOTIF_LABEL).toEqual({
      ABUSIVE: 'Propos injurieux ou discriminatoires',
      PERSONAL_DATA: 'Données personnelles',
      OFF_TOPIC: 'Hors sujet / sans lien avec la réparation',
      FAKE: 'Faux avis ou avis manipulé',
      OTHER: 'Autre',
    });
  });

  it.each([
    ['review.hide', "Masquage d'avis"],
    ['review.restore', "Rétablissement d'avis"],
  ] as const)('%s is an audit action labelled « %s »', (action, label) => {
    expect(ADMIN_AUDIT_ACTIONS).toContain(action);
    expect(ADMIN_AUDIT_ACTION_LABEL[action]).toBe(label);
  });
});
