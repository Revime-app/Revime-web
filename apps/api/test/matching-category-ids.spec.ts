import { describe, expect, it, vi } from 'vitest';
import { matchingCategoryIds, specialityMatchIds } from '../src/repairers/speciality-match.js';
import {
  loadMatchingCategoryIds,
  matchingDemandeWhere,
} from '../src/demandes/matching-demande-where.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

/**
 * CF4-26 (spec §4.3, G1/G2). The declared set expanded to every demande category it covers,
 * and the Prisma where-clause shared by the dashboard count and the feed « Pour moi » filter.
 */

const TREE = [
  { id: 'r1', parentId: null },
  { id: 'r1a', parentId: 'r1' },
  { id: 'r1b', parentId: 'r1' },
  { id: 'r1c', parentId: 'r1' },
  { id: 'r2', parentId: null },
  { id: 'r2a', parentId: 'r2' },
  { id: 'r2b', parentId: 'r2' },
  { id: 'r2c', parentId: 'r2' },
];

const sorted = (xs: string[]) => [...xs].sort();

describe('matchingCategoryIds', () => {
  it('[] for no declaration', () => {
    expect(matchingCategoryIds([], TREE)).toEqual([]);
  });

  it('declared child -> child and its parent', () => {
    expect(sorted(matchingCategoryIds(['r1a'], TREE))).toEqual(['r1', 'r1a']);
  });

  it('declared root -> root and all its children', () => {
    expect(sorted(matchingCategoryIds(['r2'], TREE))).toEqual(['r2', 'r2a', 'r2b', 'r2c']);
  });

  it('mixed declaration, deduplicated', () => {
    expect(sorted(matchingCategoryIds(['r1', 'r1b', 'r2c'], TREE))).toEqual(
      sorted(['r1', 'r1a', 'r1b', 'r1c', 'r2', 'r2c']),
    );
  });

  it('an id absent from the tree is kept as-is', () => {
    expect(matchingCategoryIds(['ghost'], TREE)).toEqual(['ghost']);
  });

  it('agrees with specialityMatchIds for every category and several declarations', () => {
    const targetOf = (c: { id: string; parentId: string | null }) => ({
      id: c.id,
      parentId: c.parentId,
      childIds: TREE.filter((t) => t.parentId === c.id).map((t) => t.id),
    });
    const declarations = [
      [],
      ['r1'],
      ['r1a'],
      ['r1a', 'r2'],
      ['r1b', 'r2c'],
      ['r1', 'r2'],
      ['r2b'],
    ];
    for (const declared of declarations) {
      const ids = matchingCategoryIds(declared, TREE);
      for (const c of TREE) {
        const viaFilter = specialityMatchIds(targetOf(c)).some((id) => declared.includes(id));
        expect(ids.includes(c.id), `declared=${declared.join(',')} c=${c.id}`).toBe(viaFilter);
      }
    }
  });
});

describe('matchingDemandeWhere', () => {
  it('builds the exact where', () => {
    expect(matchingDemandeWhere('u1', ['a'])).toEqual({
      status: 'OPEN',
      deletedAt: null,
      hiddenAt: null,
      // CF4-25: public only.
      targetRepairerUserId: null,
      authorUserId: { not: 'u1' },
      categoryId: { in: ['a'] },
      offers: { none: { repairerUserId: 'u1', deletedAt: null } },
    });
  });

  it('a soft-deleted offer does not block (Review Focus 2)', () => {
    const w = matchingDemandeWhere('u1', ['a']);
    expect(w.offers).toEqual({ none: { repairerUserId: 'u1', deletedAt: null } });
  });

  it('never his own demande (Review Focus 1)', () => {
    expect(matchingDemandeWhere('u1', ['a']).authorUserId).toEqual({ not: 'u1' });
  });

  it('copies the id list rather than aliasing it', () => {
    const ids = ['a'];
    const w = matchingDemandeWhere('u1', ids);
    ids.push('b');
    expect(w.categoryId).toEqual({ in: ['a'] });
  });
});

describe('loadMatchingCategoryIds', () => {
  it('no declared rows -> [] without querying Category', async () => {
    const category = { findMany: vi.fn() };
    const prisma = {
      repairerCategory: { findMany: vi.fn().mockResolvedValue([]) },
      category,
    } as unknown as PrismaService;
    expect(await loadMatchingCategoryIds(prisma, 'u1')).toEqual([]);
    expect(category.findMany).not.toHaveBeenCalled();
  });

  it('reads his declarations and the active tree, then expands', async () => {
    const repairerCategory = {
      findMany: vi.fn().mockResolvedValue([{ categoryId: 'r1a' }]),
    };
    const category = { findMany: vi.fn().mockResolvedValue(TREE) };
    const prisma = { repairerCategory, category } as unknown as PrismaService;
    expect(sorted(await loadMatchingCategoryIds(prisma, 'u1'))).toEqual(['r1', 'r1a']);
    expect(repairerCategory.findMany.mock.calls[0]?.[0].where).toEqual({ repairerUserId: 'u1' });
    expect(category.findMany.mock.calls[0]?.[0].where).toEqual({ active: true });
  });
});
