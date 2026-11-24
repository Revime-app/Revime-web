import { describe, expect, it } from 'vitest';
import {
  directoryQuerySchema,
  updateRepairerProfileSchema,
  verifiedBadgeFor,
  NO_VALUE,
} from '@revime/shared';

describe('directoryQuerySchema', () => {
  it('accepts an empty object, because the directory has no required control', () => {
    expect(directoryQuerySchema.parse({})).toEqual({});
  });

  it('trims q, so a trailing space is not a different search', () => {
    expect(directoryQuerySchema.parse({ q: '  dupont  ' }).q).toBe('dupont');
  });

  it('rejects a q over 120 characters', () => {
    const res = directoryQuerySchema.safeParse({ q: 'a'.repeat(121) });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.message).toBe('Recherche trop longue.');
  });

  it('rejects an unknown sort', () => {
    expect(directoryQuerySchema.safeParse({ sort: 'prix' }).success).toBe(false);
  });

  // THE guard on spec 6.3. Absent sort and sort=az produce the same order, and the
  // screen relies on being able to send NOTHING while displaying « A → Z ». A default
  // here would make the absent case indistinguishable from a chosen one.
  it('leaves sort UNDEFINED when absent rather than filling it in', () => {
    expect(directoryQuerySchema.parse({}).sort).toBeUndefined();
    expect('sort' in directoryQuerySchema.parse({})).toBe(false);
  });
});

describe('updateRepairerProfileSchema', () => {
  it('accepts an empty object: a PATCH may change neither field', () => {
    expect(updateRepairerProfileSchema.parse({})).toEqual({});
  });

  it('trims both fields', () => {
    const out = updateRepairerProfileSchema.parse({ displayName: '  Atelier  ', bio: '  Bonjour  ' });
    expect(out.displayName).toBe('Atelier');
    expect(out.bio).toBe('Bonjour');
  });

  it('rejects a displayName under 2 characters, trimmed', () => {
    const res = updateRepairerProfileSchema.safeParse({ displayName: ' A ' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.message).toBe('Nom trop court.');
  });

  it('rejects a displayName over 60 characters', () => {
    const res = updateRepairerProfileSchema.safeParse({ displayName: 'a'.repeat(61) });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.message).toBe('Nom trop long.');
  });

  it('rejects a bio over 600 characters', () => {
    const res = updateRepairerProfileSchema.safeParse({ bio: 'a'.repeat(601) });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0]?.message).toBe('Description trop longue.');
  });

  it('accepts a bio of exactly 600, so the boundary is inclusive', () => {
    expect(updateRepairerProfileSchema.safeParse({ bio: 'a'.repeat(600) }).success).toBe(true);
  });

  // This is what stops a hostile body naming its own kind or postalCode. The
  // protection is Zod's rather than ours, which is exactly why it is pinned here.
  it('STRIPS unknown keys, including kind and postalCode', () => {
    const out = updateRepairerProfileSchema.parse({
      displayName: 'Atelier',
      kind: 'PRO',
      postalCode: '75001',
    } as Record<string, unknown>);
    expect(out).toEqual({ displayName: 'Atelier' });
  });
});

describe('verifiedBadgeFor', () => {
  it('maps the two badge levels to themselves', () => {
    expect(verifiedBadgeFor('BUSINESS')).toBe('BUSINESS');
    expect(verifiedBadgeFor('IDENTITY')).toBe('IDENTITY');
  });

  // The fail-closed property, and the whole reason for the extraction. BASIC means a
  // verified email or phone, which says nothing about who the person is.
  it('fails CLOSED for BASIC, NONE, null and undefined', () => {
    expect(verifiedBadgeFor('BASIC')).toBeNull();
    expect(verifiedBadgeFor('NONE')).toBeNull();
    expect(verifiedBadgeFor(null)).toBeNull();
    expect(verifiedBadgeFor(undefined)).toBeNull();
  });
});

describe('NO_VALUE as the directory sort uses it', () => {
  // The comparator the directory actually runs. Asserting the CONSTANT would be
  // near-vacuous - MAX_SAFE_INTEGER is trivially greater than any negated rating - so
  // this pins the BEHAVIOUR the sort depends on instead.
  const rank = (rating: number | null): number => (rating === null ? NO_VALUE : -rating);

  it('ranks an unrated réparateur after a five-star one', () => {
    expect(rank(null)).toBeGreaterThan(rank(5));
  });

  it('ranks a five-star réparateur before a one-star one', () => {
    expect(rank(5)).toBeLessThan(rank(1));
  });

  // The whole reason the sentinel must be FINITE. With Infinity this subtraction is
  // NaN, and a comparator returning NaN leaves Array.prototype.sort free to produce ANY
  // order - a non-deterministic directory. Two unrated réparateurs are the ORDINARY
  // case in production, not an edge one.
  it('makes two unrated réparateurs compare exactly equal, not NaN', () => {
    expect(rank(null) - rank(null)).toBe(0);
    expect(Number.isFinite(NO_VALUE)).toBe(true);
  });
});
