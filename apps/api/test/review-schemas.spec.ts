import { describe, expect, it } from 'vitest';
import { createReviewSchema, NO_REPAIRER_STATS } from '@revime/shared';

describe('createReviewSchema', () => {
  it('accepts a rating alone, because every other field is facultatif', () => {
    const parsed = createReviewSchema.parse({ rating: 5 });
    expect(parsed.rating).toBe(5);
    expect(parsed.comment).toBeUndefined();
    expect(parsed.qualityRating).toBeUndefined();
  });

  it('accepts the full prototype payload', () => {
    const parsed = createReviewSchema.parse({
      rating: 4,
      qualityRating: 5,
      delayRating: 3,
      communicationRating: 4,
      comment: 'Travail soigné et rapide.',
    });
    expect(parsed.delayRating).toBe(3);
    expect(parsed.comment).toBe('Travail soigné et rapide.');
  });

  it('refuses a missing rating in French', () => {
    const res = createReviewSchema.safeParse({ comment: 'Sans note.' });
    expect(res.success).toBe(false);
    expect(res.error!.issues[0]!.message).toBe('Note invalide.');
  });

  it('refuses 0 and 6, so a zero rating cannot be stored', () => {
    expect(createReviewSchema.safeParse({ rating: 0 }).success).toBe(false);
    expect(createReviewSchema.safeParse({ rating: 6 }).success).toBe(false);
  });

  it('refuses a fractional rating', () => {
    expect(createReviewSchema.safeParse({ rating: 4.5 }).success).toBe(false);
  });

  it('refuses a comment over 500 characters, matching the screen', () => {
    const res = createReviewSchema.safeParse({ rating: 5, comment: 'a'.repeat(501) });
    expect(res.success).toBe(false);
    expect(res.error!.issues[0]!.message).toBe('Commentaire trop long.');
    expect(createReviewSchema.safeParse({ rating: 5, comment: 'a'.repeat(500) }).success).toBe(true);
  });

  it('strips unknown keys, so a hostile repairerUserId never reaches the service', () => {
    const parsed = createReviewSchema.parse({ rating: 5, repairerUserId: 'someone-else' });
    expect('repairerUserId' in parsed).toBe(false);
  });

  it('a réparateur with no history reads as null rather than zero', () => {
    // Spec §7: a zero would render as a catastrophic rating rather than an absent one.
    expect(NO_REPAIRER_STATS.rating).toBeNull();
    expect(NO_REPAIRER_STATS.reviewCount).toBe(0);
    expect(NO_REPAIRER_STATS.repairCount).toBe(0);
  });
});
