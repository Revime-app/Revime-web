import { categoryTree, type CategoryDto, type CategoryNode } from '@revime/shared';

/**
 * `CF-25`. The picker's rows: every root as a SELECTABLE row, with its children under it.
 *
 * 🛑 A SIBLING OF `category-search.ts`, NOT A FLAG ON IT. `searchRows` deliberately omits a
 * root-with-children - see its own header - because in Recherche a root is a filter chip and a
 * row for it would put eight near-duplicates above their own subcategories. Here the opposite
 * is required: declaring « toute l'Électronique » in one tap is the feature, so the root must be
 * a row. That exclusion is a requirement of the search, not an accident to reuse around.
 *
 * ORDER comes from the API: `CatalogService.listCategories` orders by parentId then sortOrder,
 * and `categoryTree` preserves it rather than re-sorting. Nothing here sorts.
 *
 * MATCHING mirrors `searchRows`: a child matches on its own label or its root's, so typing
 * « electronique » surfaces that family's ten children rather than nothing.
 */
export type PickerGroup = {
  root: CategoryNode;
  /** The children to draw. Filtered by the query; may be empty for `Autres` or a root-only hit. */
  children: CategoryDto[];
};

const fold = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export function pickerGroups(categories: CategoryDto[] | undefined, q: string): PickerGroup[] {
  const roots = categoryTree(categories ?? []);
  const needle = fold(q.trim());
  if (needle === '') return roots.map((root) => ({ root, children: root.children }));

  const groups: PickerGroup[] = [];
  for (const root of roots) {
    const rootHit = fold(root.labelFr).includes(needle);
    // A root hit shows the whole family, so « electronique » does not hide the ten children the
    // réparateur is looking for.
    const children = rootHit
      ? root.children
      : root.children.filter((c) => fold(c.labelFr).includes(needle));
    if (rootHit || children.length > 0) groups.push({ root, children });
  }
  return groups;
}
