import { describe, expect, it } from 'vitest';
import { specialityMatchIds } from '../src/repairers/speciality-match.js';

/**
 * `CF-33`. The six rows of design §7's truth table, against the pure builder.
 *
 * A PURE FUNCTION rather than an assertion on query results, and the reason is on the record:
 * `repairer-schemas.spec.ts` exists because `repairers.int.spec.ts` PASSED with a broken sort
 * comparator - V8 left a short array alone when it returned NaN. Eleven réparateurs and one
 * taxonomy cannot distinguish this rule from one that is too broad.
 */

const ROOT = 'root-electronique';
const CHILD = 'child-smartphones';
const SIBLING = 'child-ordinateurs';
const LONE_ROOT = 'root-autres';

describe('specialityMatchIds', () => {
  it('a CHILD filter matches that child and its root', () => {
    // « Smartphones » must find a réparateur who declared Smartphones, and one who declared
    // all of Électronique.
    expect(specialityMatchIds({ id: CHILD, parentId: ROOT, childIds: [] }).sort()).toEqual(
      [CHILD, ROOT].sort(),
    );
  });

  it('a ROOT filter matches the root and every one of its children', () => {
    // « Électronique » must find a réparateur who declared only Smartphones: she asked broadly
    // and he covers part of it.
    expect(
      specialityMatchIds({ id: ROOT, parentId: null, childIds: [CHILD, SIBLING] }).sort(),
    ).toEqual([CHILD, ROOT, SIBLING].sort());
  });

  it('a CHILD filter does NOT match a sibling', () => {
    expect(specialityMatchIds({ id: CHILD, parentId: ROOT, childIds: [] })).not.toContain(SIBLING);
  });

  it('a ROOT filter does NOT match another family', () => {
    const ids = specialityMatchIds({ id: ROOT, parentId: null, childIds: [CHILD] });
    expect(ids).not.toContain(LONE_ROOT);
  });

  it('a childless root matches only itself -- `Autres` is the live example', () => {
    expect(specialityMatchIds({ id: LONE_ROOT, parentId: null, childIds: [] })).toEqual([LONE_ROOT]);
  });

  it('never returns duplicates, so the IN list stays minimal', () => {
    const ids = specialityMatchIds({ id: ROOT, parentId: null, childIds: [CHILD, CHILD] });
    expect(ids).toHaveLength(new Set(ids).size);
  });
});
