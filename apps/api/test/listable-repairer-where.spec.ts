import { describe, expect, it } from 'vitest';
import { directoryWhere, listableRepairerWhere } from '../src/repairers/repairers.service.js';

/**
 * These are predicate-SHAPE assertions, not database round trips: there is no test database
 * on this project. The value being asserted is the value Prisma will receive, which is what
 * a filter bug actually looks like.
 */
describe('listableRepairerWhere is the one definition of "listable"', () => {
  it('excludes a suspended réparateur through the profile clause', () => {
    expect(listableRepairerWhere()).toEqual({
      deletedAt: null,
      user: { profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } },
    });
  });

  /**
   * 🛑 The marker sits INSIDE the existing `profile` clause rather than in a second `user`
   * key. The clobber warning inside `RepairersService.list()`'s `findMany` already records that
   * a second spread `user:` key REPLACES the first and that tsc cannot tell the two spellings
   * apart. Cited BY NAME, not by line: the `:278` this comment carried had already drifted
   * twice, once inside the commit that created it.
   */
  it('keeps the suspension clause nested under profile, not beside user', () => {
    const w = listableRepairerWhere() as { user: { profile: Record<string, unknown> } };
    expect(w.user.profile).toHaveProperty('repairerSuspendedAt', null);
  });
});

describe('directoryWhere is the listable predicate plus the self-exclusion', () => {
  /**
   * 🛑 SPREAD-COMPOSED, NOT `AND`-COMPOSED, to stay compatible with the category filter inside
   * `RepairersService.list()` - named rather than numbered, because the line this comment used
   * to cite had already drifted past the thing it pointed at. `list()` spreads
   * `directoryWhere` and then spreads
   * the category filter's own `{ AND: [...] }`. Had `directoryWhere` returned `{ AND: [...] }`,
   * the category spread would have REPLACED it - so a réparateur who turned the mode off,
   * deleted his account, or is suspended would reappear in any category-filtered directory.
   * Both spellings are valid `Prisma.RepairerProfileWhereInput`, so tsc cannot see the
   * difference.
   */
  it('spreads the fragment with the caller exclusion, staying flat for list()', () => {
    expect(directoryWhere('me')).toEqual({
      deletedAt: null,
      user: { profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } },
      userId: { not: 'me' },
    });
  });

  it('has no caller to exclude for a signed-out visitor of the website', () => {
    expect(directoryWhere(null)).toEqual({
      deletedAt: null,
      user: { profile: { repairerEnabled: true, deletedAt: null, repairerSuspendedAt: null } },
    });
  });

  it('still excludes the caller', () => {
    const w = directoryWhere('me') as { userId?: { not: string } };
    expect(w.userId).toEqual({ not: 'me' });
  });

  /**
   * Verifies that the fragment can be spread-composed with a userId to build a fiche predicate.
   * This is not coverage of `getPublicProfile` itself - that is pinned in banner-read-dtos.spec.ts
   * which asserts the actual `where` clause after a real call.
   */
  it('can be spread-composed with a userId for a fiche read', () => {
    const shared = listableRepairerWhere();
    const fiche = { ...shared, userId: 'target' };
    expect((fiche as { user: { profile: Record<string, unknown> } }).user.profile)
      .toHaveProperty('repairerSuspendedAt', null);
  });

  /**
   * 🛑 THE REGRESSION THAT WOULD HAVE SHIPPED had directoryWhere used `AND` composition.
   * `list()` spreads `directoryWhere` and then spreads the category filter's own `{ AND: [...] }`.
   * This simulates that composition and asserts that the listable clauses survive ALONGSIDE the
   * category `AND`, rather than being replaced by it.
   *
   * The real call site is exercised by directory-category-filter.spec.ts:68-70, which asserts
   * the actual `where` after a `list()` call with a category filter.
   */
  it('composes with list()\'s category filter without clobbering the listable clauses', () => {
    const composed = {
      ...directoryWhere('me'),
      AND: [{ user: { repairerCategories: { some: { categoryId: { in: ['cat1', 'cat2'] } } } } }],
    };
    // The listable clauses must still be present
    expect(composed.deletedAt).toBeNull();
    expect(composed.userId).toEqual({ not: 'me' });
    expect((composed as { user: { profile: Record<string, unknown> } }).user.profile).toEqual({
      repairerEnabled: true,
      deletedAt: null,
      repairerSuspendedAt: null,
    });
    // And the category filter must also be present
    expect(composed.AND).toHaveLength(1);
  });
});
