import { z } from 'zod';

export type CategoryDto = {
  id: string;
  /** null for a top-level category. */
  parentId: string | null;
  slug: string;
  labelFr: string;
};

/** A top-level category with its subcategories, as the picker consumes it. */
export type CategoryNode = CategoryDto & { children: CategoryDto[] };

/**
 * Groups a flat category list into one level of parents with their children.
 *
 * `sortOrder` is per level, so the API's order is already correct within each
 * group and this function preserves it rather than re-sorting.
 *
 * A child whose parentId matches no parent in the same list is DROPPED. The API
 * excludes children of inactive parents, so this should be unreachable, but a
 * phone running an older bundle against a newer API must not try to render a
 * chip it cannot place.
 */
export function categoryTree(rows: CategoryDto[]): CategoryNode[] {
  const parents: CategoryNode[] = [];
  const byId = new Map<string, CategoryNode>();

  for (const row of rows) {
    if (row.parentId === null) {
      const node: CategoryNode = { ...row, children: [] };
      byId.set(row.id, node);
      parents.push(node);
    }
  }

  for (const row of rows) {
    if (row.parentId === null) continue;
    byId.get(row.parentId)?.children.push(row);
  }

  return parents;
}

/** CF5-05: Public active brand DTO consumed by mobile pickers */
export type PublicBrandDto = {
  id: string;
  name: string;
  slug: string;
};

/** CF5-05: Public active device model DTO consumed by mobile pickers */
export type PublicDeviceModelDto = {
  id: string;
  brandId: string;
  name: string;
  slug: string;
  categoryId: string | null;
};

export const catalogBrandsQuerySchema = z.object({
  categoryId: z.string().uuid({ message: 'Identifiant de catégorie invalide.' }).optional(),
});
export type CatalogBrandsQuery = z.infer<typeof catalogBrandsQuerySchema>;

export const catalogModelsQuerySchema = z.object({
  brandId: z.string().uuid({ message: 'Identifiant de marque invalide.' }),
  categoryId: z.string().uuid({ message: 'Identifiant de catégorie invalide.' }).optional(),
});
export type CatalogModelsQuery = z.infer<typeof catalogModelsQuerySchema>;

