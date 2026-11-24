import { describe, expect, it } from 'vitest';
import {
  MAX_SPECIALITIES,
  RAW_CATEGORY_IDS_MAX,
  normaliseSpecialities,
  specialityLabel,
  updateRepairerCategoriesSchema,
} from '@revime/shared';

/**
 * `CF-25`. The shared half: the write schema and the two pure functions, tested directly.
 *
 * Testing the functions rather than the route is the same choice `repairer-schemas.spec.ts`
 * made for the directory's sort comparator, and for the same recorded reason: an integration
 * test over eleven réparateurs and one taxonomy cannot distinguish a correct rule from one
 * that happens to be too broad, and `test:unit` excludes the integration suite anyway.
 */

const ROOT = '11111111-1111-4111-8111-111111111111';
const CHILD_A = '22222222-2222-4222-8222-222222222222';
const CHILD_B = '33333333-3333-4333-8333-333333333333';
const OTHER_ROOT = '44444444-4444-4444-8444-444444444444';
const LONE_ROOT = '55555555-5555-4555-8555-555555555555';

/** Électronique with two children, Mobilité with none - the live taxonomy's two shapes. */
const PARENTS = new Map<string, string | null>([
  [ROOT, null],
  [CHILD_A, ROOT],
  [CHILD_B, ROOT],
  [OTHER_ROOT, null],
  [LONE_ROOT, null],
]);

describe('updateRepairerCategoriesSchema', () => {
  it('accepts an empty set, which is how a réparateur clears his specialities', () => {
    const parsed = updateRepairerCategoriesSchema.parse({ categoryIds: [] });
    expect(parsed.categoryIds).toEqual([]);
  });

  it('accepts a set of uuids', () => {
    const parsed = updateRepairerCategoriesSchema.parse({ categoryIds: [ROOT, CHILD_A] });
    expect(parsed.categoryIds).toEqual([ROOT, CHILD_A]);
  });

  it('refuses a non-uuid id', () => {
    const result = updateRepairerCategoriesSchema.safeParse({ categoryIds: ['electronique'] });
    expect(result.success).toBe(false);
  });

  it('refuses an absurdly long array, which is a shape bound and NOT the cap', () => {
    const many = Array.from({ length: RAW_CATEGORY_IDS_MAX + 1 }, () => ROOT);
    expect(updateRepairerCategoriesSchema.safeParse({ categoryIds: many }).success).toBe(false);
  });

  it('does NOT enforce MAX_SPECIALITIES, because only the service can count a normalised set', () => {
    const thirteen = Array.from({ length: MAX_SPECIALITIES + 1 }, (_, i) => `${i}`.padStart(8, '0') + '-1111-4111-8111-111111111111');
    expect(updateRepairerCategoriesSchema.safeParse({ categoryIds: thirteen }).success).toBe(true);
  });
});

describe('normaliseSpecialities', () => {
  it('drops a child when its root is also present, because the root already covers it', () => {
    expect(normaliseSpecialities([ROOT, CHILD_A], PARENTS)).toEqual([ROOT]);
  });

  it('drops every child of a present root, not just the first', () => {
    expect(normaliseSpecialities([CHILD_A, ROOT, CHILD_B], PARENTS)).toEqual([ROOT]);
  });

  it('keeps a child whose root is absent', () => {
    expect(normaliseSpecialities([CHILD_A], PARENTS)).toEqual([CHILD_A]);
  });

  it('keeps two children of the same absent root', () => {
    expect(normaliseSpecialities([CHILD_A, CHILD_B], PARENTS)).toEqual([CHILD_A, CHILD_B]);
  });

  it('leaves a childless root alone -- `Autres` is the live example', () => {
    expect(normaliseSpecialities([LONE_ROOT], PARENTS)).toEqual([LONE_ROOT]);
  });

  it('does not let one root absorb another root\'s children', () => {
    expect(normaliseSpecialities([OTHER_ROOT, CHILD_A], PARENTS)).toEqual([OTHER_ROOT, CHILD_A]);
  });

  it('collapses duplicates', () => {
    expect(normaliseSpecialities([CHILD_A, CHILD_A], PARENTS)).toEqual([CHILD_A]);
  });

  it('accepts an empty set', () => {
    expect(normaliseSpecialities([], PARENTS)).toEqual([]);
  });

  it('preserves input order, so a saved set is deterministic', () => {
    expect(normaliseSpecialities([CHILD_B, CHILD_A], PARENTS)).toEqual([CHILD_B, CHILD_A]);
  });

  it('KEEPS an id it has no parent entry for, because removing redundancy is its only job', () => {
    // Validation against USABLE_CATEGORY is the SERVICE's step and happens first. If this
    // function silently dropped unknown ids, a taxonomy bug would present as a réparateur's
    // saved selection quietly shrinking, with no error anywhere.
    const unknown = '66666666-6666-4666-8666-666666666666';
    expect(normaliseSpecialities([unknown], PARENTS)).toEqual([unknown]);
  });
});

describe('specialityLabel', () => {
  it('is the root label alone for a root', () => {
    expect(specialityLabel('Électronique', null)).toBe('Électronique');
  });

  it('joins root and child with a middot, matching the Publier recap', () => {
    expect(specialityLabel('Électronique', 'Smartphones')).toBe('Électronique · Smartphones');
  });
});
