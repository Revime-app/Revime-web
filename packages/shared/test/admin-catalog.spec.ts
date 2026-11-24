import { describe, expect, it } from 'vitest';
import {
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
  createCategorySchema,
  updateCategorySchema,
  toggleCategoryActiveSchema,
  createBrandSchema,
  updateBrandSchema,
  createDeviceModelSchema,
  updateDeviceModelSchema,
  adminBrandListQuerySchema,
  adminModelListQuerySchema,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type ToggleCategoryActiveInput,
  type CreateBrandInput,
  type UpdateBrandInput,
  type CreateDeviceModelInput,
  type UpdateDeviceModelInput,
  type AdminBrandListQuery,
  type AdminModelListQuery,
  type AdminCategoryTreeItem,
  type AdminBrandListItem,
  type AdminBrandListResponse,
  type AdminDeviceModelListItem,
  type AdminDeviceModelListResponse,
  type AdminCatalogOverviewDto,
} from '../src/index.js';

describe('Stage 6E Catalog Audit Actions', () => {
  const catalogActions = [
    'category.create',
    'category.create_sub',
    'category.update',
    'category.toggle_active',
    'brand.create',
    'brand.update',
    'brand.delete',
    'model.create',
    'model.update',
    'model.delete',
  ] as const;

  it('all 10 catalog actions are valid members of adminAuditActionSchema', () => {
    for (const action of catalogActions) {
      expect(adminAuditActionSchema.parse(action)).toBe(action);
    }
  });

  it('have exact French labels in ADMIN_AUDIT_ACTION_LABEL', () => {
    expect(ADMIN_AUDIT_ACTION_LABEL['category.create']).toBe("Création d'une catégorie");
    expect(ADMIN_AUDIT_ACTION_LABEL['category.create_sub']).toBe("Création d'une sous-catégorie");
    expect(ADMIN_AUDIT_ACTION_LABEL['category.update']).toBe("Modification d'une catégorie");
    expect(ADMIN_AUDIT_ACTION_LABEL['category.toggle_active']).toBe(
      'Activation / Désactivation de catégorie',
    );
    expect(ADMIN_AUDIT_ACTION_LABEL['brand.create']).toBe("Création d'une marque");
    expect(ADMIN_AUDIT_ACTION_LABEL['brand.update']).toBe("Modification d'une marque");
    expect(ADMIN_AUDIT_ACTION_LABEL['brand.delete']).toBe("Suppression d'une marque");
    expect(ADMIN_AUDIT_ACTION_LABEL['model.create']).toBe("Création d'un modèle");
    expect(ADMIN_AUDIT_ACTION_LABEL['model.update']).toBe("Modification d'un modèle");
    expect(ADMIN_AUDIT_ACTION_LABEL['model.delete']).toBe("Suppression d'un modèle");
  });
});

describe('createCategorySchema', () => {
  const validParentId = '11111111-1111-4111-8111-111111111111';

  it('validates a correct payload for root category', () => {
    const parsed = createCategorySchema.parse({
      labelFr: 'Électronique',
      slug: 'electronique',
      sortOrder: 1,
    });
    expect(parsed.labelFr).toBe('Électronique');
    expect(parsed.slug).toBe('electronique');
    expect(parsed.sortOrder).toBe(1);
    expect(parsed.parentId).toBeUndefined();
  });

  it('validates a subcategory payload with parentId', () => {
    const parsed = createCategorySchema.parse({
      labelFr: 'Smartphones',
      parentId: validParentId,
    });
    expect(parsed.labelFr).toBe('Smartphones');
    expect(parsed.parentId).toBe(validParentId);
    expect(parsed.sortOrder).toBe(0);
  });

  it('accepts null for parentId to represent root category explicitly', () => {
    const parsed = createCategorySchema.parse({
      labelFr: 'Maison & Jardin',
      parentId: null,
    });
    expect(parsed.parentId).toBeNull();
  });

  it('rejects labelFr shorter than 2 characters', () => {
    const res = createCategorySchema.safeParse({ labelFr: 'A' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe(
        'Le libellé doit comporter au moins 2 caractères.',
      );
    }
  });

  it('rejects invalid slug formatting', () => {
    expect(createCategorySchema.safeParse({ labelFr: 'Test', slug: 'Invalid Slug' }).success).toBe(
      false,
    );
    expect(createCategorySchema.safeParse({ labelFr: 'Test', slug: 'UPPERCASE' }).success).toBe(
      false,
    );
    expect(createCategorySchema.safeParse({ labelFr: 'Test', slug: '-leading' }).success).toBe(
      false,
    );
    expect(createCategorySchema.safeParse({ labelFr: 'Test', slug: 'trailing-' }).success).toBe(
      false,
    );
    expect(createCategorySchema.safeParse({ labelFr: 'Test', slug: 'valid-slug-123' }).success).toBe(
      true,
    );
  });

  it('rejects invalid parentId UUID', () => {
    const res = createCategorySchema.safeParse({
      labelFr: 'Smartphones',
      parentId: 'not-a-uuid',
    });
    expect(res.success).toBe(false);
  });
});

describe('updateCategorySchema', () => {
  it('accepts partial updates', () => {
    const parsed = updateCategorySchema.parse({
      labelFr: 'Informatique & Téléphonie',
      sortOrder: 3,
      active: false,
    });
    expect(parsed.labelFr).toBe('Informatique & Téléphonie');
    expect(parsed.sortOrder).toBe(3);
    expect(parsed.active).toBe(false);
  });

  it('accepts empty object for no-op update', () => {
    expect(updateCategorySchema.parse({})).toEqual({});
  });

  it('validates slug format when provided', () => {
    expect(updateCategorySchema.safeParse({ slug: 'valid-slug' }).success).toBe(true);
    expect(updateCategorySchema.safeParse({ slug: 'Bad Slug!' }).success).toBe(false);
  });

  it('rejects labelFr shorter than 2 characters when provided', () => {
    const res = updateCategorySchema.safeParse({ labelFr: 'X' });
    expect(res.success).toBe(false);
  });
});

describe('toggleCategoryActiveSchema', () => {
  it('accepts boolean active status', () => {
    expect(toggleCategoryActiveSchema.parse({ active: true })).toEqual({ active: true });
    expect(toggleCategoryActiveSchema.parse({ active: false })).toEqual({ active: false });
  });

  it('rejects missing or non-boolean active status', () => {
    expect(toggleCategoryActiveSchema.safeParse({}).success).toBe(false);
    expect(toggleCategoryActiveSchema.safeParse({ active: 'true' }).success).toBe(false);
  });
});

describe('createBrandSchema', () => {
  const cat1 = '11111111-1111-4111-8111-111111111111';
  const cat2 = '22222222-2222-4222-8222-222222222222';

  it('validates a valid brand payload', () => {
    const parsed = createBrandSchema.parse({
      name: 'Apple',
      categoryIds: [cat1, cat2],
      sortOrder: 1,
    });
    expect(parsed.name).toBe('Apple');
    expect(parsed.categoryIds).toEqual([cat1, cat2]);
    expect(parsed.sortOrder).toBe(1);
  });

  it('handles optional slug and default empty categoryIds', () => {
    const parsed = createBrandSchema.parse({
      name: 'Samsung',
    });
    expect(parsed.name).toBe('Samsung');
    expect(parsed.categoryIds).toEqual([]);
    expect(parsed.sortOrder).toBe(0);
  });

  it('rejects short brand name', () => {
    const res = createBrandSchema.safeParse({ name: 'A' });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toBe(
        'Le nom de la marque doit comporter au moins 2 caractères.',
      );
    }
  });

  it('rejects invalid categoryIds', () => {
    const res = createBrandSchema.safeParse({
      name: 'Sony',
      categoryIds: ['invalid-uuid'],
    });
    expect(res.success).toBe(false);
  });

  it('validates optional slug format when provided', () => {
    expect(createBrandSchema.safeParse({ name: 'Dyson', slug: 'dyson' }).success).toBe(true);
    expect(createBrandSchema.safeParse({ name: 'Dyson', slug: 'Dyson Brand' }).success).toBe(
      false,
    );
  });
});

describe('updateBrandSchema', () => {
  it('accepts partial updates including active boolean and sortOrder', () => {
    const parsed = updateBrandSchema.parse({
      name: 'Apple Inc.',
      active: false,
      sortOrder: 10,
    });
    expect(parsed.name).toBe('Apple Inc.');
    expect(parsed.active).toBe(false);
    expect(parsed.sortOrder).toBe(10);
  });

  it('accepts categoryIds update', () => {
    const catId = '11111111-1111-4111-8111-111111111111';
    const parsed = updateBrandSchema.parse({ categoryIds: [catId] });
    expect(parsed.categoryIds).toEqual([catId]);
  });
});

describe('createDeviceModelSchema', () => {
  const brandId = '33333333-3333-4333-8333-333333333333';
  const categoryId = '44444444-4444-4444-8444-444444444444';

  it('validates a valid model payload', () => {
    const parsed = createDeviceModelSchema.parse({
      brandId,
      name: 'iPhone 15 Pro',
      slug: 'iphone-15-pro',
      categoryId,
      sortOrder: 2,
    });
    expect(parsed.brandId).toBe(brandId);
    expect(parsed.name).toBe('iPhone 15 Pro');
    expect(parsed.slug).toBe('iphone-15-pro');
    expect(parsed.categoryId).toBe(categoryId);
    expect(parsed.sortOrder).toBe(2);
  });

  it('accepts payload without categoryId or slug', () => {
    const parsed = createDeviceModelSchema.parse({
      brandId,
      name: 'PlayStation 5',
    });
    expect(parsed.brandId).toBe(brandId);
    expect(parsed.name).toBe('PlayStation 5');
    expect(parsed.categoryId).toBeUndefined();
    expect(parsed.sortOrder).toBe(0);
  });

  it('rejects invalid brandId UUID', () => {
    const res = createDeviceModelSchema.safeParse({
      brandId: 'not-a-uuid',
      name: 'Galaxy S24',
    });
    expect(res.success).toBe(false);
  });

  it('rejects short name (<2 chars)', () => {
    const res = createDeviceModelSchema.safeParse({
      brandId,
      name: 'X',
    });
    expect(res.success).toBe(false);
  });
});

describe('updateDeviceModelSchema', () => {
  it('accepts partial updates', () => {
    const parsed = updateDeviceModelSchema.parse({
      name: 'iPhone 15 Pro Max',
      active: false,
      sortOrder: 5,
    });
    expect(parsed.name).toBe('iPhone 15 Pro Max');
    expect(parsed.active).toBe(false);
    expect(parsed.sortOrder).toBe(5);
  });

  it('allows setting categoryId to null or valid UUID', () => {
    const catId = '44444444-4444-4444-8444-444444444444';
    expect(updateDeviceModelSchema.parse({ categoryId: null }).categoryId).toBeNull();
    expect(updateDeviceModelSchema.parse({ categoryId: catId }).categoryId).toBe(catId);
  });
});

describe('adminBrandListQuerySchema', () => {
  it('provides default pagination values', () => {
    const parsed = adminBrandListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it('coerces string numbers and handles filters', () => {
    const parsed = adminBrandListQuerySchema.parse({
      q: 'apple',
      categoryId: '11111111-1111-4111-8111-111111111111',
      active: 'true',
      page: '2',
      pageSize: '50',
    });
    expect(parsed.q).toBe('apple');
    expect(parsed.categoryId).toBe('11111111-1111-4111-8111-111111111111');
    expect(parsed.active).toBe('true');
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });
});

describe('adminModelListQuerySchema', () => {
  it('provides default pagination values', () => {
    const parsed = adminModelListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it('coerces string numbers and handles filters', () => {
    const parsed = adminModelListQuerySchema.parse({
      q: 'galaxy',
      brandId: '33333333-3333-4333-8333-333333333333',
      categoryId: '44444444-4444-4444-8444-444444444444',
      active: 'false',
      page: '3',
      pageSize: '10',
    });
    expect(parsed.q).toBe('galaxy');
    expect(parsed.brandId).toBe('33333333-3333-4333-8333-333333333333');
    expect(parsed.categoryId).toBe('44444444-4444-4444-8444-444444444444');
    expect(parsed.active).toBe('false');
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(10);
  });
});

describe('DTO Type Compatibility', () => {
  it('validates AdminCategoryTreeItem shape', () => {
    const treeItem: AdminCategoryTreeItem = {
      id: 'cat-1',
      parentId: null,
      slug: 'electronique',
      labelFr: 'Électronique',
      active: true,
      sortOrder: 1,
      demandesCount: 15,
      repairersCount: 42,
      children: [
        {
          id: 'cat-sub-1',
          parentId: 'cat-1',
          slug: 'smartphones',
          labelFr: 'Smartphones',
          active: true,
          sortOrder: 1,
          demandesCount: 10,
          repairersCount: 30,
          children: [],
        },
      ],
    };
    expect(treeItem.id).toBe('cat-1');
    expect(treeItem.children).toHaveLength(1);
  });

  it('validates AdminBrandListItem & AdminBrandListResponse shapes', () => {
    const brandItem: AdminBrandListItem = {
      id: 'brand-1',
      name: 'Apple',
      slug: 'apple',
      active: true,
      sortOrder: 1,
      categories: [{ id: 'cat-sub-1', labelFr: 'Smartphones' }],
      modelsCount: 12,
      createdAt: '2026-09-22T00:00:00.000Z',
    };
    const brandResponse: AdminBrandListResponse = {
      items: [brandItem],
      total: 1,
      page: 1,
      pageSize: 25,
    };
    expect(brandResponse.items[0]?.name).toBe('Apple');
    expect(brandResponse.total).toBe(1);
  });

  it('validates AdminDeviceModelListItem & AdminDeviceModelListResponse shapes', () => {
    const modelItem: AdminDeviceModelListItem = {
      id: 'model-1',
      brandId: 'brand-1',
      brandName: 'Apple',
      name: 'iPhone 15 Pro',
      slug: 'iphone-15-pro',
      categoryId: 'cat-sub-1',
      categoryLabelFr: 'Smartphones',
      active: true,
      sortOrder: 1,
      createdAt: '2026-09-22T00:00:00.000Z',
    };
    const modelResponse: AdminDeviceModelListResponse = {
      items: [modelItem],
      total: 1,
      page: 1,
      pageSize: 25,
    };
    expect(modelResponse.items[0]?.brandName).toBe('Apple');
    expect(modelResponse.total).toBe(1);
  });

  it('validates AdminCatalogOverviewDto shape', () => {
    const overview: AdminCatalogOverviewDto = {
      totalRootCategories: 8,
      totalSubCategories: 36,
      totalBrands: 25,
      totalModels: 120,
      totalFaultTypes: 50,
    };
    expect(overview.totalRootCategories).toBe(8);
    expect(overview.totalBrands).toBe(25);
    expect(overview.totalFaultTypes).toBe(50);
  });
});
