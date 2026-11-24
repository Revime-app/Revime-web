import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminCatalogService } from '../src/admin/admin-catalog.service.js';
import type {
  AdminBrandListQuery,
  AdminCatalogOverviewDto,
  AdminModelListQuery,
  CreateBrandInput,
  CreateCategoryInput,
  CreateDeviceModelInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateDeviceModelInput,
} from '@revime/shared';

function makePrismaMock() {
  const mock = {
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    repairerCategory: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    brand: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    brandCategory: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    deviceModel: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    faultType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn((callbackOrOps: any) => {
      if (typeof callbackOrOps === 'function') {
        return callbackOrOps(mock);
      }
      return Promise.all(callbackOrOps);
    }),
  } as any;
  return mock;
}

function getErrorStatus(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined;
  if ('getStatus' in err && typeof (err as any).getStatus === 'function') {
    return (err as any).getStatus();
  }
  if ('status' in err && typeof (err as any).status === 'number') {
    return (err as any).status;
  }
  return undefined;
}

describe('AdminCatalogService', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AdminCatalogService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminCatalogService(prisma);
  });

  // =========================================================================
  // 1. Overview & Statistics
  // =========================================================================
  describe('getCatalogOverview', () => {
    it('aggregates counts for root categories, subcategories, brands, and models', async () => {
      prisma.category.count
        .mockImplementation(async (args?: any) => {
          if (args?.where?.parentId === null) return 8;
          if (args?.where?.parentId) return 36;
          return 44;
        });
      prisma.brand.count.mockResolvedValue(25);
      prisma.deviceModel.count.mockResolvedValue(150);

      const overview: AdminCatalogOverviewDto = await service.getCatalogOverview();

      expect(overview).toEqual({
        totalRootCategories: 8,
        totalSubCategories: 36,
        totalBrands: 25,
        totalModels: 150,
        totalFaultTypes: 0,
      });
      expect(prisma.category.count).toHaveBeenCalledWith({ where: { parentId: null } });
      expect(prisma.category.count).toHaveBeenCalledWith({ where: { parentId: { not: null } } });
      expect(prisma.brand.count).toHaveBeenCalled();
      expect(prisma.deviceModel.count).toHaveBeenCalled();
      expect(prisma.faultType.count).toHaveBeenCalled();
    });

    it('returns zero values when the catalog tables are empty', async () => {
      prisma.category.count.mockResolvedValue(0);
      prisma.brand.count.mockResolvedValue(0);
      prisma.deviceModel.count.mockResolvedValue(0);
      prisma.faultType.count.mockResolvedValue(0);

      const overview = await service.getCatalogOverview();

      expect(overview).toEqual({
        totalRootCategories: 0,
        totalSubCategories: 0,
        totalBrands: 0,
        totalModels: 0,
        totalFaultTypes: 0,
      });
    });
  });

  // =========================================================================
  // 2. Category Taxonomy
  // =========================================================================
  describe('listCategoriesTree', () => {
    it('builds nested tree from flat category rows and sorts roots and children by sortOrder', async () => {
      const flatRows = [
        {
          id: 'cat-root-2',
          parentId: null,
          slug: 'mobilite',
          labelFr: 'Mobilité',
          sortOrder: 2,
          active: true,
          _count: { demandes: 4, repairers: 2 },
        },
        {
          id: 'cat-root-1',
          parentId: null,
          slug: 'electronique',
          labelFr: 'Électronique',
          sortOrder: 1,
          active: true,
          _count: { demandes: 10, repairers: 5 },
        },
        {
          id: 'cat-sub-1b',
          parentId: 'cat-root-1',
          slug: 'ordinateurs',
          labelFr: 'Ordinateurs',
          sortOrder: 2,
          active: true,
          _count: { demandes: 3, repairers: 2 },
        },
        {
          id: 'cat-sub-1a',
          parentId: 'cat-root-1',
          slug: 'smartphones',
          labelFr: 'Smartphones',
          sortOrder: 1,
          active: false,
          _count: { demandes: 7, repairers: 3 },
        },
      ];

      prisma.category.findMany.mockResolvedValue(flatRows);

      const tree = await service.listCategoriesTree();

      expect(tree).toHaveLength(2);
      // Roots sorted by sortOrder ascending
      expect(tree[0]!.id).toBe('cat-root-1');
      expect(tree[0]!.sortOrder).toBe(1);
      expect(tree[1]!.id).toBe('cat-root-2');
      expect(tree[1]!.sortOrder).toBe(2);

      // Children nested and sorted by sortOrder ascending
      expect(tree[0]!.children).toHaveLength(2);
      expect(tree[0]!.children[0]!.id).toBe('cat-sub-1a');
      expect(tree[0]!.children[0]!.sortOrder).toBe(1);
      expect(tree[0]!.children[0]!.active).toBe(false);
      expect(tree[0]!.children[1]!.id).toBe('cat-sub-1b');
      expect(tree[0]!.children[1]!.sortOrder).toBe(2);

      // Childless root has empty children array
      expect(tree[1]!.children).toEqual([]);
    });

    it('maps the demande count and the distinct réparateurs of the category links', async () => {
      const flatRows = [
        {
          id: 'cat-1',
          parentId: null,
          slug: 'electronique',
          labelFr: 'Électronique',
          sortOrder: 1,
          active: true,
          _count: { demandes: 42, repairers: 17 },
        },
      ];

      prisma.category.findMany.mockResolvedValue(flatRows);
      // 17 links, one person twice: 16 distinct réparateurs
      prisma.repairerCategory.findMany.mockResolvedValue([
        ...Array.from({ length: 16 }, (_, i) => ({ categoryId: 'cat-1', repairerUserId: `u${i}` })),
        { categoryId: 'cat-1', repairerUserId: 'u0' },
      ]);

      const tree = await service.listCategoriesTree();

      expect(tree[0]!.demandesCount).toBe(42);
      expect(tree[0]!.repairersCount).toBe(16);
    });

    it('keeps a stable order when two siblings hold the same sortOrder (production still has some)', async () => {
      prisma.category.findMany.mockResolvedValue([
        { id: 'b', parentId: null, slug: 'b', labelFr: 'Zeta', sortOrder: 5, active: true, _count: { demandes: 0, repairers: 0 } },
        { id: 'a', parentId: null, slug: 'a', labelFr: 'Alpha', sortOrder: 5, active: true, _count: { demandes: 0, repairers: 0 } },
      ]);

      const tree = await service.listCategoriesTree();

      expect(tree.map((c) => c.id)).toEqual(['a', 'b']);
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: [{ sortOrder: 'asc' }, { labelFr: 'asc' }] }),
      );
    });

    it('handles orphaned categories without crashing or losing valid nodes', async () => {
      const flatRows = [
        {
          id: 'cat-root-1',
          parentId: null,
          slug: 'electronique',
          labelFr: 'Électronique',
          sortOrder: 1,
          active: true,
          _count: { demandes: 0, repairers: 0 },
        },
        {
          id: 'cat-orphan',
          parentId: 'deleted-parent-id',
          slug: 'orphelin',
          labelFr: 'Orphelin',
          sortOrder: 1,
          active: true,
          _count: { demandes: 0, repairers: 0 },
        },
      ];

      prisma.category.findMany.mockResolvedValue(flatRows);

      const tree = await service.listCategoriesTree();

      expect(tree).toHaveLength(1);
      expect(tree[0]!.id).toBe('cat-root-1');
      expect(tree[0]!.children).toEqual([]);
    });
  });

  describe('createCategory', () => {
    it('creates a root category when parentId is null and explicit slug is provided', async () => {
      const input: CreateCategoryInput = {
        labelFr: 'Maison & Jardin',
        slug: 'maison-jardin',
        sortOrder: 3,
        parentId: null,
      };

      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue({
        id: 'cat-new-1',
        labelFr: 'Maison & Jardin',
        slug: 'maison-jardin',
        parentId: null,
        sortOrder: 3,
        active: true,
      });

      const created = await service.createCategory(input);

      expect(created.id).toBe('cat-new-1');
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          labelFr: 'Maison & Jardin',
          slug: 'maison-jardin',
          parentId: null,
          sortOrder: 3,
        }),
      });
    });

    it('auto-generates a clean slug from labelFr when slug is omitted', async () => {
      const input: CreateCategoryInput = {
        labelFr: 'Électroménager & Multimédia',
        sortOrder: 1,
      };

      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockImplementation(async ({ data }: any) => ({
        id: 'cat-new-2',
        ...data,
        active: true,
      }));

      await service.createCategory(input);

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: expect.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        }),
      });
    });

    it('creates a subcategory when valid parentId is provided and parent exists', async () => {
      const parentId = '11111111-1111-4111-8111-111111111111';
      const input: CreateCategoryInput = {
        labelFr: 'Smartphones',
        slug: 'smartphones',
        parentId,
      };

      prisma.category.findUnique
        .mockImplementation(async (args: any) => {
          if (args?.where?.id === parentId) {
            return { id: parentId, labelFr: 'Électronique', parentId: null };
          }
          return null; // slug not taken
        });

      prisma.category.create.mockResolvedValue({
        id: 'cat-sub-1',
        labelFr: 'Smartphones',
        slug: 'smartphones',
        parentId,
        active: true,
      });

      const created = await service.createCategory(input);

      expect(created.parentId).toBe(parentId);
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentId,
          slug: 'smartphones',
        }),
      });
    });

    it('throws 409 ConflictException when the category slug is already taken', async () => {
      const input: CreateCategoryInput = {
        labelFr: 'Électronique',
        slug: 'electronique',
      };

      prisma.category.findUnique.mockResolvedValue({
        id: 'existing-cat',
        slug: 'electronique',
      });

      try {
        await service.createCategory(input);
        expect.fail('Should have thrown 409 ConflictException');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(409);
      }
    });

    it('throws 404 NotFoundException when parentId is provided but parent category does not exist', async () => {
      const input: CreateCategoryInput = {
        labelFr: 'Smartphones',
        slug: 'smartphones',
        parentId: 'non-existent-parent',
      };

      prisma.category.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.id === 'non-existent-parent') return null;
        return null;
      });

      try {
        await service.createCategory(input);
        expect.fail('Should have thrown 404 NotFoundException');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });
  });

  describe('updateCategory', () => {
    it('modifies label, slug, and sortOrder for an existing category', async () => {
      const categoryId = 'cat-100';
      const input: UpdateCategoryInput = {
        labelFr: 'Informatique & Ordinateurs',
        slug: 'informatique-ordinateurs',
        sortOrder: 5,
      };

      prisma.category.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.id === categoryId) {
          return { id: categoryId, slug: 'ordinateurs', labelFr: 'Ordinateurs' };
        }
        if (args?.where?.slug === 'informatique-ordinateurs') {
          return null; // new slug free
        }
        return null;
      });

      prisma.category.update.mockResolvedValue({
        id: categoryId,
        labelFr: 'Informatique & Ordinateurs',
        slug: 'informatique-ordinateurs',
        sortOrder: 5,
        active: true,
      });

      const updated = await service.updateCategory(categoryId, input);

      expect(updated.slug).toBe('informatique-ordinateurs');
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: categoryId },
          data: expect.objectContaining({
            labelFr: 'Informatique & Ordinateurs',
            slug: 'informatique-ordinateurs',
            sortOrder: 5,
          }),
        }),
      );
    });

    it('allows keeping the same slug on update without triggering a 409 conflict', async () => {
      const categoryId = 'cat-100';
      const input: UpdateCategoryInput = {
        labelFr: 'Ordinateurs Portables',
        slug: 'ordinateurs',
      };

      prisma.category.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.id === categoryId) {
          return { id: categoryId, slug: 'ordinateurs', labelFr: 'Ordinateurs' };
        }
        if (args?.where?.slug === 'ordinateurs') {
          return { id: categoryId, slug: 'ordinateurs' }; // same category
        }
        return null;
      });

      prisma.category.update.mockResolvedValue({
        id: categoryId,
        labelFr: 'Ordinateurs Portables',
        slug: 'ordinateurs',
        active: true,
      });

      await expect(service.updateCategory(categoryId, input)).resolves.toBeDefined();
    });

    it('throws 404 NotFoundException if category to update is not found', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      try {
        await service.updateCategory('missing-id', { labelFr: 'Test' });
        expect.fail('Should have thrown 404');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });

    it('throws 409 ConflictException if new slug is taken by another category', async () => {
      const categoryId = 'cat-100';
      prisma.category.findUnique.mockImplementation(async (args: any) => {
        if (args?.where?.id === categoryId) {
          return { id: categoryId, slug: 'my-category' };
        }
        if (args?.where?.slug === 'other-slug') {
          return { id: 'other-cat-200', slug: 'other-slug' }; // another category owns this slug
        }
        return null;
      });

      try {
        await service.updateCategory(categoryId, { slug: 'other-slug' });
        expect.fail('Should have thrown 409');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(409);
      }
    });
  });

  describe('toggleCategoryActive', () => {
    it('updates active boolean status of category to false or true', async () => {
      const categoryId = 'cat-1';
      prisma.category.findUnique.mockResolvedValue({ id: categoryId, active: true });
      prisma.category.update.mockResolvedValue({ id: categoryId, active: false });

      const updated = await service.toggleCategoryActive(categoryId, false);

      expect(updated.active).toBe(false);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: categoryId },
          data: { active: false },
        }),
      );
    });

    it('supports toggleCategoryActive with object parameter { active }', async () => {
      const categoryId = 'cat-1';
      prisma.category.findUnique.mockResolvedValue({ id: categoryId, active: false });
      prisma.category.update.mockResolvedValue({ id: categoryId, active: true });

      const updated = await service.toggleCategoryActive(categoryId, { active: true } as any);

      expect(updated.active).toBe(true);
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: categoryId },
          data: { active: true },
        }),
      );
    });

    it('throws 404 NotFoundException if category to toggle does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      try {
        await service.toggleCategoryActive('missing-id', false);
        expect.fail('Should have thrown 404');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });
  });

  // =========================================================================
  // 3. Brands Catalog
  // =========================================================================
  describe('listBrands', () => {
    it('filters brands by search query q across name and slug', async () => {
      const query: AdminBrandListQuery = { q: 'apple', page: 1, pageSize: 25 };
      prisma.brand.findMany.mockResolvedValue([]);
      prisma.brand.count.mockResolvedValue(0);

      await service.listBrands(query);

      expect(prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'apple' }) }),
              expect.objectContaining({ slug: expect.objectContaining({ contains: 'apple' }) }),
            ]),
          }),
        }),
      );
    });

    it('filters brands by categoryId via BrandCategory join relation', async () => {
      const query: AdminBrandListQuery = { categoryId: 'cat-smartphones', page: 1, pageSize: 25 };
      prisma.brand.findMany.mockResolvedValue([]);
      prisma.brand.count.mockResolvedValue(0);

      await service.listBrands(query);

      expect(prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categories: {
              some: {
                categoryId: 'cat-smartphones',
              },
            },
          }),
        }),
      );
    });

    it('filters brands by active status: true, false, or ALL', async () => {
      prisma.brand.findMany.mockResolvedValue([]);
      prisma.brand.count.mockResolvedValue(0);

      // active = true
      await service.listBrands({ active: 'true' });
      expect(prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: true }),
        }),
      );

      // active = false
      await service.listBrands({ active: 'false' });
      expect(prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: false }),
        }),
      );

      // active = ALL
      await service.listBrands({ active: 'ALL' });
      const lastCall = prisma.brand.findMany.mock.calls.at(-1)![0];
      expect(lastCall.where?.active).toBeUndefined();
    });

    it('handles pagination with skip and take and counts associated models', async () => {
      const mockBrandRow = {
        id: 'brand-1',
        name: 'Apple',
        slug: 'apple',
        active: true,
        sortOrder: 1,
        createdAt: new Date('2026-09-20T10:00:00.000Z'),
        categories: [
          {
            category: { id: 'cat-1', labelFr: 'Smartphones' },
          },
        ],
        _count: { models: 12 },
      };

      prisma.brand.findMany.mockResolvedValue([mockBrandRow]);
      prisma.brand.count.mockResolvedValue(35);

      const res = await service.listBrands({ page: 2, pageSize: 10 });

      expect(prisma.brand.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
      expect(res.page).toBe(2);
      expect(res.pageSize).toBe(10);
      expect(res.total).toBe(35);
      expect(res.items[0]).toEqual({
        id: 'brand-1',
        name: 'Apple',
        slug: 'apple',
        logoUrl: null,
        active: true,
        sortOrder: 1,
        categories: [{ id: 'cat-1', labelFr: 'Smartphones' }],
        modelsCount: 12,
        createdAt: '2026-09-20T10:00:00.000Z',
      });
    });
  });

  describe('createBrand', () => {
    it('creates brand, links categoryIds, and returns created brand item', async () => {
      const input: CreateBrandInput = {
        name: 'Apple',
        slug: 'apple',
        categoryIds: ['cat-1', 'cat-2'],
        sortOrder: 1,
      };

      prisma.brand.findFirst.mockResolvedValue(null);
      prisma.brand.create.mockResolvedValue({
        id: 'brand-10',
        name: 'Apple',
        slug: 'apple',
        active: true,
        sortOrder: 1,
        createdAt: new Date('2026-09-22T00:00:00.000Z'),
        categories: [],
      });

      const created = await service.createBrand(input);

      expect(created.id).toBe('brand-10');
      expect(prisma.brand.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Apple',
            slug: 'apple',
            sortOrder: 1,
          }),
        }),
      );
    });

    it('auto-generates slug from brand name if slug is omitted', async () => {
      const input: CreateBrandInput = {
        name: 'Sony Interactive Entertainment',
      };

      prisma.brand.findFirst.mockResolvedValue(null);
      prisma.brand.create.mockImplementation(async ({ data }: any) => ({
        id: 'brand-11',
        ...data,
        active: true,
        createdAt: new Date(),
        categories: [],
      }));

      await service.createBrand(input);

      expect(prisma.brand.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: expect.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
          }),
        }),
      );
    });

    it('throws 409 ConflictException when brand name or slug already exists', async () => {
      const input: CreateBrandInput = {
        name: 'Samsung',
        slug: 'samsung',
      };

      prisma.brand.findFirst.mockResolvedValue({
        id: 'brand-existing',
        name: 'Samsung',
        slug: 'samsung',
      });

      try {
        await service.createBrand(input);
        expect.fail('Should have thrown 409 ConflictException');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(409);
      }
    });
  });

  describe('updateBrand', () => {
    it('updates name, slug, sortOrder, active, and synchronizes category associations', async () => {
      const brandId = 'brand-1';
      const input: UpdateBrandInput = {
        name: 'Apple Inc.',
        slug: 'apple-inc',
        categoryIds: ['cat-1', 'cat-3'],
        active: true,
        sortOrder: 2,
      };

      prisma.brand.findUnique.mockResolvedValue({
        id: brandId,
        name: 'Apple',
        slug: 'apple',
      });
      prisma.brand.findFirst.mockResolvedValue(null); // no conflict
      prisma.brand.update.mockResolvedValue({
        id: brandId,
        name: 'Apple Inc.',
        slug: 'apple-inc',
        active: true,
        sortOrder: 2,
      });

      const updated = await service.updateBrand(brandId, input);

      expect(updated.name).toBe('Apple Inc.');
      expect(prisma.brand.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: brandId },
          data: expect.objectContaining({
            name: 'Apple Inc.',
            slug: 'apple-inc',
            active: true,
            sortOrder: 2,
          }),
        }),
      );
    });

    it('throws 404 NotFoundException when brand to update is missing', async () => {
      prisma.brand.findUnique.mockResolvedValue(null);

      try {
        await service.updateBrand('missing-brand', { name: 'New Name' });
        expect.fail('Should have thrown 404');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });

    it('throws 409 ConflictException when new brand name or slug conflicts with another brand', async () => {
      const brandId = 'brand-1';
      prisma.brand.findUnique.mockResolvedValue({
        id: brandId,
        name: 'Apple',
        slug: 'apple',
      });
      prisma.brand.findFirst.mockResolvedValue({
        id: 'brand-2', // different brand
        name: 'Samsung',
        slug: 'samsung',
      });

      try {
        await service.updateBrand(brandId, { name: 'Samsung' });
        expect.fail('Should have thrown 409');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(409);
      }
    });
  });

  describe('deleteBrand', () => {
    it('deletes brand and returns success when brand exists', async () => {
      const brandId = 'brand-1';
      prisma.brand.findUnique.mockResolvedValue({ id: brandId, name: 'Brand To Delete' });
      prisma.brand.delete.mockResolvedValue({ id: brandId });

      const res = await service.deleteBrand(brandId);

      expect(res).toEqual(expect.objectContaining({ success: true }));
      expect(prisma.brand.delete).toHaveBeenCalledWith({ where: { id: brandId } });
    });

    it('throws 404 NotFoundException if brand to delete is not found', async () => {
      prisma.brand.findUnique.mockResolvedValue(null);

      try {
        await service.deleteBrand('missing-brand');
        expect.fail('Should have thrown 404');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });
  });

  // =========================================================================
  // 4. Device Models
  // =========================================================================
  describe('listModels', () => {
    it('filters device models by brandId, categoryId, q, and active flag with pagination', async () => {
      const query: AdminModelListQuery = {
        brandId: 'brand-apple',
        categoryId: 'cat-smartphones',
        q: 'iPhone 15',
        active: 'true',
        page: 1,
        pageSize: 20,
      };

      const mockModelRow = {
        id: 'model-1',
        brandId: 'brand-apple',
        name: 'iPhone 15 Pro',
        slug: 'iphone-15-pro',
        categoryId: 'cat-smartphones',
        active: true,
        sortOrder: 1,
        createdAt: new Date('2026-09-21T00:00:00.000Z'),
        brand: { name: 'Apple' },
        category: { labelFr: 'Smartphones' },
      };

      prisma.deviceModel.findMany.mockResolvedValue([mockModelRow]);
      prisma.deviceModel.count.mockResolvedValue(1);

      const res = await service.listModels(query);

      expect(prisma.deviceModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-apple',
            categoryId: 'cat-smartphones',
            active: true,
            OR: expect.arrayContaining([
              expect.objectContaining({ name: expect.objectContaining({ contains: 'iPhone 15' }) }),
              expect.objectContaining({ slug: expect.objectContaining({ contains: 'iPhone 15' }) }),
            ]),
          }),
          skip: 0,
          take: 20,
        }),
      );

      expect(res.total).toBe(1);
      expect(res.items[0]).toEqual({
        id: 'model-1',
        brandId: 'brand-apple',
        brandName: 'Apple',
        name: 'iPhone 15 Pro',
        slug: 'iphone-15-pro',
        categoryId: 'cat-smartphones',
        categoryLabelFr: 'Smartphones',
        active: true,
        sortOrder: 1,
        createdAt: '2026-09-21T00:00:00.000Z',
      });
    });

    it('handles active filter: ALL, true, and false', async () => {
      prisma.deviceModel.findMany.mockResolvedValue([]);
      prisma.deviceModel.count.mockResolvedValue(0);

      await service.listModels({ active: 'false' });
      expect(prisma.deviceModel.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ active: false }),
        }),
      );

      await service.listModels({ active: 'ALL' });
      const lastCall = prisma.deviceModel.findMany.mock.calls.at(-1)![0];
      expect(lastCall.where?.active).toBeUndefined();
    });
  });

  describe('createModel', () => {
    it('creates a model under an existing brand with explicit slug', async () => {
      const input: CreateDeviceModelInput = {
        brandId: '11111111-1111-4111-8111-111111111111',
        name: 'iPhone 15 Pro',
        slug: 'iphone-15-pro',
        categoryId: '22222222-2222-4222-8222-222222222222',
        sortOrder: 1,
      };

      prisma.brand.findUnique.mockResolvedValue({ id: input.brandId, name: 'Apple' });
      prisma.deviceModel.findFirst.mockResolvedValue(null);
      prisma.deviceModel.create.mockResolvedValue({
        id: 'model-new-1',
        ...input,
        active: true,
        createdAt: new Date(),
      });

      const created = await service.createModel(input);

      expect(created.id).toBe('model-new-1');
      expect(prisma.deviceModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          brandId: input.brandId,
          name: 'iPhone 15 Pro',
          slug: 'iphone-15-pro',
          categoryId: input.categoryId,
          sortOrder: 1,
        }),
      });
    });

    it('auto-generates slug from model name if slug is omitted', async () => {
      const input: CreateDeviceModelInput = {
        brandId: '11111111-1111-4111-8111-111111111111',
        name: 'Galaxy S24 Ultra',
      };

      prisma.brand.findUnique.mockResolvedValue({ id: input.brandId, name: 'Samsung' });
      prisma.deviceModel.findFirst.mockResolvedValue(null);
      prisma.deviceModel.create.mockImplementation(async ({ data }: any) => ({
        id: 'model-new-2',
        ...data,
        active: true,
      }));

      await service.createModel(input);

      expect(prisma.deviceModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: expect.stringMatching(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
        }),
      });
    });

    it('throws 404 NotFoundException when brandId does not exist', async () => {
      const input: CreateDeviceModelInput = {
        brandId: 'missing-brand-id',
        name: 'Model Test',
      };

      prisma.brand.findUnique.mockResolvedValue(null);

      try {
        await service.createModel(input);
        expect.fail('Should have thrown 404 NotFoundException');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });

    it('throws 409 ConflictException when model slug already exists for that brand', async () => {
      const input: CreateDeviceModelInput = {
        brandId: '11111111-1111-4111-8111-111111111111',
        name: 'iPhone 15',
        slug: 'iphone-15',
      };

      prisma.brand.findUnique.mockResolvedValue({ id: input.brandId, name: 'Apple' });
      prisma.deviceModel.findFirst.mockResolvedValue({
        id: 'model-dup',
        brandId: input.brandId,
        slug: 'iphone-15',
      });

      try {
        await service.createModel(input);
        expect.fail('Should have thrown 409 ConflictException');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(409);
      }
    });
  });

  describe('updateModel', () => {
    it('updates model name, slug, categoryId, active status, and sortOrder', async () => {
      const modelId = 'model-1';
      const input: UpdateDeviceModelInput = {
        name: 'iPhone 15 Plus',
        slug: 'iphone-15-plus',
        categoryId: 'cat-phones',
        active: false,
        sortOrder: 3,
      };

      prisma.deviceModel.findUnique.mockResolvedValue({
        id: modelId,
        brandId: 'brand-apple',
        slug: 'iphone-15',
      });
      prisma.deviceModel.findFirst.mockResolvedValue(null); // no conflict
      prisma.deviceModel.update.mockResolvedValue({
        id: modelId,
        brandId: 'brand-apple',
        name: 'iPhone 15 Plus',
        slug: 'iphone-15-plus',
        categoryId: 'cat-phones',
        active: false,
        sortOrder: 3,
      });

      const updated = await service.updateModel(modelId, input);

      expect(updated.name).toBe('iPhone 15 Plus');
      expect(prisma.deviceModel.update).toHaveBeenCalledWith({
        where: { id: modelId },
        data: expect.objectContaining({
          name: 'iPhone 15 Plus',
          slug: 'iphone-15-plus',
          categoryId: 'cat-phones',
          active: false,
          sortOrder: 3,
        }),
      });
    });

    it('throws 404 NotFoundException if model to update is not found', async () => {
      prisma.deviceModel.findUnique.mockResolvedValue(null);

      try {
        await service.updateModel('missing-model', { name: 'Test' });
        expect.fail('Should have thrown 404');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });

    it('throws 409 ConflictException if updated slug conflicts with another model under the same brand', async () => {
      const modelId = 'model-1';
      prisma.deviceModel.findUnique.mockResolvedValue({
        id: modelId,
        brandId: 'brand-apple',
        slug: 'iphone-15',
      });
      prisma.deviceModel.findFirst.mockResolvedValue({
        id: 'model-2', // different model
        brandId: 'brand-apple',
        slug: 'iphone-15-pro',
      });

      try {
        await service.updateModel(modelId, { slug: 'iphone-15-pro' });
        expect.fail('Should have thrown 409');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(409);
      }
    });
  });

  describe('deleteModel', () => {
    it('deletes model and returns success when model exists', async () => {
      const modelId = 'model-1';
      prisma.deviceModel.findUnique.mockResolvedValue({ id: modelId, name: 'Model to Delete' });
      prisma.deviceModel.delete.mockResolvedValue({ id: modelId });

      const res = await service.deleteModel(modelId);

      expect(res).toEqual(expect.objectContaining({ success: true }));
      expect(prisma.deviceModel.delete).toHaveBeenCalledWith({ where: { id: modelId } });
    });

    it('throws 404 NotFoundException if model to delete is not found', async () => {
      prisma.deviceModel.findUnique.mockResolvedValue(null);

      try {
        await service.deleteModel('missing-model');
        expect.fail('Should have thrown 404');
      } catch (err) {
        expect(getErrorStatus(err)).toBe(404);
      }
    });
  });
});
