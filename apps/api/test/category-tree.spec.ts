import { describe, expect, it } from 'vitest';
import type { CategoryDto } from '@revime/shared';
import { categoryTree } from '@revime/shared';

const cat = (id: string, labelFr: string, parentId: string | null = null): CategoryDto => ({
  id,
  parentId,
  slug: id,
  labelFr,
});

describe('categoryTree', () => {
  it('groups children under their parent', () => {
    const tree = categoryTree([
      cat('electronique', 'Électronique'),
      cat('smartphone', 'Smartphones', 'electronique'),
      cat('ordinateur', 'Ordinateurs', 'electronique'),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.labelFr).toBe('Électronique');
    expect(tree[0]!.children.map((c) => c.labelFr)).toEqual(['Smartphones', 'Ordinateurs']);
  });

  it('preserves wire order among parents and within each parent', () => {
    const tree = categoryTree([
      cat('electronique', 'Électronique'),
      cat('mobilite', 'Mobilité'),
      cat('velos', 'Vélos', 'mobilite'),
      cat('smartphone', 'Smartphones', 'electronique'),
      cat('velos-electriques', 'Vélos électriques', 'mobilite'),
    ]);

    expect(tree.map((p) => p.labelFr)).toEqual(['Électronique', 'Mobilité']);
    expect(tree[1]!.children.map((c) => c.labelFr)).toEqual(['Vélos', 'Vélos électriques']);
  });

  it('gives a childless parent an empty children array, which is the Autres case', () => {
    const tree = categoryTree([cat('autres', 'Autres')]);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toEqual([]);
  });

  it('drops a child whose parent is absent from the response', () => {
    // Reachable when a phone runs an older bundle against a newer API, or if a
    // parent is deactivated. An unplaceable chip must not render at all.
    const tree = categoryTree([
      cat('electronique', 'Électronique'),
      cat('orphan', 'Orpheline', 'disparu'),
    ]);

    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toEqual([]);
    expect(JSON.stringify(tree)).not.toContain('Orpheline');
  });

  it('returns nothing for an empty list', () => {
    expect(categoryTree([])).toEqual([]);
  });
});
