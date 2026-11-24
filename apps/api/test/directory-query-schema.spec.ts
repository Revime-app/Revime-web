import { describe, expect, it } from 'vitest';
import { directoryQuerySchema } from '@revime/shared';

/**
 * `CF-34`. What the directory accepts as a query, and - the half that matters - what it
 * REFUSES rather than silently ignoring.
 *
 * Query params arrive as STRINGS, which is why `radiusKm` and `minRating` are string enums
 * rather than coerced numbers: there is no `z.coerce` anywhere in this repo, and
 * `z.coerce.number()` on '' yields 0.
 */
const ok = (input: unknown) => directoryQuerySchema.safeParse(input);
const fieldsOf = (input: unknown) => {
  const r = directoryQuerySchema.safeParse(input);
  if (r.success) throw new Error('expected a refusal');
  return r.error.issues.map((i) => [i.path.join('.'), i.message] as const);
};

describe('near', () => {
  it('accepts a five-digit postal code', () => {
    expect(ok({ near: '69003' }).success).toBe(true);
  });

  it.each(['6900', '690033', '6900A', 'lyon', ''])('refuses %o', (value) => {
    expect(ok({ near: value }).success).toBe(false);
  });

  it('refuses with our own French message, on the near field', () => {
    expect(fieldsOf({ near: '6900' })).toContainEqual(['near', 'Code postal invalide.']);
  });
});

describe('radiusKm and minRating are closed sets', () => {
  it.each(['10', '25', '50'])('accepts radiusKm %o alongside near', (value) => {
    expect(ok({ near: '69003', radiusKm: value }).success).toBe(true);
  });

  it.each(['5', '100', '10km', '0', ''])('refuses radiusKm %o', (value) => {
    expect(ok({ near: '69003', radiusKm: value }).success).toBe(false);
  });

  it.each(['3', '4'])('accepts minRating %o with no near at all', (value) => {
    // Rating is independent of location: it must NOT inherit the near requirement.
    expect(ok({ minRating: value }).success).toBe(true);
  });

  it.each(['2', '5', '4.5', ''])('refuses minRating %o', (value) => {
    expect(ok({ minRating: value }).success).toBe(false);
  });
});

describe('the two cross-field refusals', () => {
  it('refuses radiusKm without near, naming radiusKm', () => {
    expect(fieldsOf({ radiusKm: '10' })).toContainEqual([
      'radiusKm',
      'Indiquez un code postal pour filtrer par distance.',
    ]);
  });

  it('refuses sort=distance without near, naming sort', () => {
    expect(fieldsOf({ sort: 'distance' })).toContainEqual([
      'sort',
      'Indiquez un code postal pour trier par distance.',
    ]);
  });

  it('accepts sort=distance WITH near', () => {
    expect(ok({ near: '69003', sort: 'distance' }).success).toBe(true);
  });
});

describe('what must not change', () => {
  it('still accepts the empty query, which is the unfiltered path', () => {
    expect(ok({}).success).toBe(true);
  });

  it.each(['note', 'az'])('still accepts the pre-existing sort %o with no near', (value) => {
    expect(ok({ sort: value }).success).toBe(true);
  });

  it('still refuses an unknown sort', () => {
    expect(ok({ sort: 'prix' }).success).toBe(false);
  });

  it('strips unknown keys rather than refusing, so a hostile kind cannot ride along', () => {
    const r = directoryQuerySchema.safeParse({ kind: 'PRO', near: '69003' });
    expect(r.success).toBe(true);
    expect(r.success && 'kind' in r.data).toBe(false);
  });
});
