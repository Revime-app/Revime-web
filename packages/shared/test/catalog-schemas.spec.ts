import { describe, expect, it } from 'vitest';
import {
  catalogBrandsQuerySchema,
  catalogModelsQuerySchema,
  categoryTree,
  type CategoryDto,
} from '../src/index.js';

describe('Catalog Schemas & Trees (CF5-05)', () => {
  it('categoryTree structures parent and children properly', () => {
    const categories: CategoryDto[] = [
      { id: 'cat-1', parentId: null, slug: 'electronique', labelFr: 'Électronique' },
      { id: 'cat-sub-1', parentId: 'cat-1', slug: 'smartphones', labelFr: 'Smartphones' },
      { id: 'cat-sub-2', parentId: 'cat-1', slug: 'ordinateurs', labelFr: 'Ordinateurs' },
    ];
    const tree = categoryTree(categories);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(2);
  });

  it('catalogBrandsQuerySchema validates optional categoryId', () => {
    expect(catalogBrandsQuerySchema.safeParse({}).success).toBe(true);
    expect(
      catalogBrandsQuerySchema.safeParse({
        categoryId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
    expect(catalogBrandsQuerySchema.safeParse({ categoryId: 'not-a-uuid' }).success).toBe(false);
  });

  it('catalogModelsQuerySchema validates brandId requirement and optional categoryId', () => {
    const validBrandId = '33333333-3333-4333-8333-333333333333';
    const validCatId = '11111111-1111-4111-8111-111111111111';

    expect(catalogModelsQuerySchema.safeParse({}).success).toBe(false);
    expect(catalogModelsQuerySchema.safeParse({ brandId: validBrandId }).success).toBe(true);
    expect(
      catalogModelsQuerySchema.safeParse({
        brandId: validBrandId,
        categoryId: validCatId,
      }).success,
    ).toBe(true);
    expect(
      catalogModelsQuerySchema.safeParse({
        brandId: 'invalid-brand',
      }).success,
    ).toBe(false);
  });
});
