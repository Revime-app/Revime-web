import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminCatalogService } from '../src/admin/admin-catalog.service.js';

function makePrismaMock() {
  const mock = {
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
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
      count: vi.fn(),
    },
    $transaction: vi.fn((ops: any) => {
      if (typeof ops === 'function') {
        return ops(mock);
      }
      return Promise.all(ops);
    }),
  } as any;
  return mock;
}

describe('P22: AdminCatalogService — Categories & Brands Improvements', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AdminCatalogService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminCatalogService(prisma);
  });

  describe('1. Category Tree with Parent Aggregated Counters', () => {
    it('sums demandesCount and repairersCount from child subcategories into parent roots', async () => {
      prisma.category.findMany.mockResolvedValue([
        {
          id: 'cat-root-1',
          parentId: null,
          slug: 'smartphones-tablettes',
          labelFr: 'Smartphones & Tablettes',
          icon: '📱',
          description: 'Tous les appareils mobiles',
          active: true,
          sortOrder: 10,
          _count: { demandes: 4, repairers: 3 },
        },
        {
          id: 'cat-sub-1',
          parentId: 'cat-root-1',
          slug: 'smartphones',
          labelFr: 'Smartphones',
          icon: null,
          description: null,
          active: true,
          sortOrder: 10,
          _count: { demandes: 10, repairers: 5 },
        },
        {
          id: 'cat-sub-2',
          parentId: 'cat-root-1',
          slug: 'tablettes',
          labelFr: 'Tablettes',
          icon: null,
          description: null,
          active: true,
          sortOrder: 20,
          _count: { demandes: 6, repairers: 2 },
        },
        {
          id: 'cat-root-2',
          parentId: null,
          slug: 'informatique',
          labelFr: 'Informatique',
          icon: '💻',
          description: 'PC et Mac',
          active: true,
          sortOrder: 20,
          _count: { demandes: 7, repairers: 4 },
        },
      ]);

      // u3 is registered on the root AND on Smartphones, u7 on Smartphones AND Tablettes: one person each.
      const links = (categoryId: string, users: string[]) =>
        users.map((repairerUserId) => ({ categoryId, repairerUserId }));
      prisma.repairerCategory.findMany.mockResolvedValue([
        ...links('cat-root-1', ['u1', 'u2', 'u3']),
        ...links('cat-sub-1', ['u3', 'u4', 'u5', 'u6', 'u7']),
        ...links('cat-sub-2', ['u7', 'u8']),
        ...links('cat-root-2', ['u9', 'u10', 'u11', 'u12']),
      ]);

      const tree = await service.listCategoriesTree();

      expect(tree).toHaveLength(2);

      // Root 1 adds up 4 (direct) + 10 (sub1) + 6 (sub2) = 20 demandes, but counts DISTINCT réparateurs:
      // u1..u8 = 8, not 3 + 5 + 2 = 10.
      const root1 = tree.find((c) => c.id === 'cat-root-1')!;
      expect(root1.demandesCount).toBe(20);
      expect(root1.repairersCount).toBe(8);
      expect(root1.icon).toBe('📱');
      expect(root1.description).toBe('Tous les appareils mobiles');
      expect(root1.children).toHaveLength(2);

      // Subcategories keep their direct counters
      const sub1 = root1.children.find((c) => c.id === 'cat-sub-1')!;
      expect(sub1.demandesCount).toBe(10);
      expect(sub1.repairersCount).toBe(5);

      const sub2 = root1.children.find((c) => c.id === 'cat-sub-2')!;
      expect(sub2.demandesCount).toBe(6);
      expect(sub2.repairersCount).toBe(2);

      // Root 2 with 0 children retains its direct counts
      const root2 = tree.find((c) => c.id === 'cat-root-2')!;
      expect(root2.demandesCount).toBe(7);
      expect(root2.repairersCount).toBe(4);
      expect(root2.icon).toBe('💻');
      expect(root2.description).toBe('PC et Mac');
      expect(root2.children).toHaveLength(0);
    });
  });

  describe('2. Cascade Disable for Parent Categories', () => {
    it('cascades deactivation to all child subcategories when parent is deactivated', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-root-1',
        parentId: null,
        slug: 'telephonie',
        labelFr: 'Téléphonie',
        active: true,
      });

      prisma.category.updateMany.mockResolvedValue({ count: 3 });
      prisma.category.update.mockResolvedValue({
        id: 'cat-root-1',
        parentId: null,
        slug: 'telephonie',
        labelFr: 'Téléphonie',
        icon: null,
        description: null,
        active: false,
        sortOrder: 10,
        _count: { demandes: 0, repairers: 0 },
      });

      const result = await service.toggleCategoryActive('cat-root-1', { active: false });

      expect(prisma.category.updateMany).toHaveBeenCalledWith({
        where: { parentId: 'cat-root-1' },
        data: { active: false },
      });
      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-root-1' },
          data: { active: false },
        }),
      );
      expect(result.active).toBe(false);
      // the cascade and the parent's own write are ONE transaction (a half-applied cascade leaves live
      // subcategories under a hidden parent)
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect((prisma.$transaction as any).mock.calls[0][0]).toHaveLength(2);
    });

    it('cascades the same way when the OTHER writer of active (updateCategory) deactivates a root', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-root-1',
        parentId: null,
        slug: 'telephonie',
        labelFr: 'Téléphonie',
        active: true,
      });
      prisma.category.updateMany.mockResolvedValue({ count: 3 });
      prisma.category.update.mockResolvedValue({
        id: 'cat-root-1',
        parentId: null,
        slug: 'telephonie',
        labelFr: 'Téléphonie',
        icon: null,
        description: null,
        active: false,
        sortOrder: 10,
        _count: { demandes: 0, repairers: 0 },
      });

      await service.updateCategory('cat-root-1', { active: false });

      expect(prisma.category.updateMany).toHaveBeenCalledWith({
        where: { parentId: 'cat-root-1' },
        data: { active: false },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('does NOT cascade deactivation when a subcategory (with parentId) is deactivated', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-sub-1',
        parentId: 'cat-root-1',
        slug: 'smartphones',
        labelFr: 'Smartphones',
        active: true,
      });

      prisma.category.update.mockResolvedValue({
        id: 'cat-sub-1',
        parentId: 'cat-root-1',
        slug: 'smartphones',
        labelFr: 'Smartphones',
        icon: null,
        description: null,
        active: false,
        sortOrder: 10,
        _count: { demandes: 0, repairers: 0 },
      });

      const result = await service.toggleCategoryActive('cat-sub-1', false);

      expect(prisma.category.updateMany).not.toHaveBeenCalled();
      expect(result.active).toBe(false);
    });

    it('does NOT cascade update when activating a parent category (active: true)', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-root-1',
        parentId: null,
        slug: 'telephonie',
        labelFr: 'Téléphonie',
        active: false,
      });

      prisma.category.update.mockResolvedValue({
        id: 'cat-root-1',
        parentId: null,
        slug: 'telephonie',
        labelFr: 'Téléphonie',
        icon: null,
        description: null,
        active: true,
        sortOrder: 10,
        _count: { demandes: 0, repairers: 0 },
      });

      const result = await service.toggleCategoryActive('cat-root-1', true);

      expect(prisma.category.updateMany).not.toHaveBeenCalled();
      expect(result.active).toBe(true);
    });
  });

  describe('3. Reordering Categories', () => {
    it('updates sortOrder cleanly in multiples of 10 sequentially in a transaction', async () => {
      const categoryIds = ['cat-id-3', 'cat-id-1', 'cat-id-2'];
      prisma.category.findMany.mockResolvedValue(categoryIds.map((id) => ({ id, parentId: null })));
      prisma.category.count.mockResolvedValue(3);
      prisma.category.update.mockImplementation(({ where, data }: any) => ({
        id: where.id,
        sortOrder: data.sortOrder,
      }));

      await service.reorderCategories(categoryIds);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.category.update).toHaveBeenCalledTimes(3);

      expect(prisma.category.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'cat-id-3' },
        data: { sortOrder: 10 },
      });
      expect(prisma.category.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'cat-id-1' },
        data: { sortOrder: 20 },
      });
      expect(prisma.category.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'cat-id-2' },
        data: { sortOrder: 30 },
      });
    });

    it('refuses an id that does not exist (404), writing nothing', async () => {
      prisma.category.findMany.mockResolvedValue([{ id: 'cat-id-1', parentId: null }]);

      await expect(service.reorderCategories(['cat-id-1', 'ghost'])).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses ids that do not share one parent (422), writing nothing', async () => {
      prisma.category.findMany.mockResolvedValue([
        { id: 'root-1', parentId: null },
        { id: 'sub-1', parentId: 'root-1' },
      ]);
      prisma.category.count.mockResolvedValue(2); // the group size would pass: only the parents differ

      await expect(service.reorderCategories(['root-1', 'sub-1'])).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a PARTIAL list (422): renumbering a subset would bring duplicate orders back', async () => {
      prisma.category.findMany.mockResolvedValue([{ id: 'sub-1', parentId: 'root-1' }]);
      prisma.category.count.mockResolvedValue(3);

      await expect(service.reorderCategories(['sub-1'])).rejects.toMatchObject({ code: 'UNPROCESSABLE_ENTITY' });
      expect(prisma.category.count).toHaveBeenCalledWith({ where: { parentId: 'root-1' } });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('4. Brand Logo & Multi-Category Scoping', () => {
    it('creates brand with logoUrl and associates multiple categoryIds via BrandCategory', async () => {
      prisma.brand.findFirst.mockResolvedValue(null);
      prisma.brand.create.mockResolvedValue({
        id: 'brand-apple',
        name: 'Apple',
        slug: 'apple',
        logoUrl: 'https://cdn.example.com/logos/apple.svg',
        active: true,
        sortOrder: 0,
        createdAt: new Date('2026-10-15T00:00:00.000Z'),
        categories: [
          { category: { id: 'cat-1', labelFr: 'Smartphones' } },
          { category: { id: 'cat-2', labelFr: 'Tablettes' } },
          { category: { id: 'cat-3', labelFr: 'Ordinateurs' } },
        ],
        _count: { models: 12 },
      });

      const result = await service.createBrand({
        name: 'Apple',
        logoUrl: 'https://cdn.example.com/logos/apple.svg',
        categoryIds: ['cat-1', 'cat-2', 'cat-3'],
      });

      expect(prisma.brand.create).toHaveBeenCalledWith({
        data: {
          name: 'Apple',
          slug: 'apple',
          logoUrl: 'https://cdn.example.com/logos/apple.svg',
          sortOrder: 0,
          categories: {
            create: [
              { categoryId: 'cat-1' },
              { categoryId: 'cat-2' },
              { categoryId: 'cat-3' },
            ],
          },
        },
        include: expect.any(Object),
      });

      expect(result.logoUrl).toBe('https://cdn.example.com/logos/apple.svg');
      expect(result.categories).toHaveLength(3);
    });

    it('updates brand with new logoUrl and syncs category relations', async () => {
      prisma.brand.findUnique.mockResolvedValue({
        id: 'brand-apple',
        name: 'Apple',
        slug: 'apple',
        logoUrl: 'https://cdn.example.com/logos/old-apple.svg',
        active: true,
        sortOrder: 0,
      });
      prisma.brand.findFirst.mockResolvedValue(null);
      prisma.brand.update.mockResolvedValue({
        id: 'brand-apple',
        name: 'Apple Inc',
        slug: 'apple-inc',
        logoUrl: 'https://cdn.example.com/logos/new-apple.svg',
        active: true,
        sortOrder: 5,
        createdAt: new Date('2026-10-15T00:00:00.000Z'),
        categories: [
          { category: { id: 'cat-1', labelFr: 'Smartphones' } },
          { category: { id: 'cat-4', labelFr: 'Montres' } },
        ],
        _count: { models: 15 },
      });

      const result = await service.updateBrand('brand-apple', {
        name: 'Apple Inc',
        logoUrl: 'https://cdn.example.com/logos/new-apple.svg',
        categoryIds: ['cat-1', 'cat-4'],
      });

      expect(prisma.brand.update).toHaveBeenCalledWith({
        where: { id: 'brand-apple' },
        data: expect.objectContaining({
          name: 'Apple Inc',
          logoUrl: 'https://cdn.example.com/logos/new-apple.svg',
          categories: {
            deleteMany: {},
            create: [
              { categoryId: 'cat-1' },
              { categoryId: 'cat-4' },
            ],
          },
        }),
        include: expect.any(Object),
      });

      expect(result.logoUrl).toBe('https://cdn.example.com/logos/new-apple.svg');
      expect(result.categories).toHaveLength(2);
    });
  });

  describe('5. Category Icon and Description Persistence', () => {
    it('creates category with icon and description', async () => {
      prisma.category.findUnique.mockResolvedValue(null);
      prisma.category.create.mockResolvedValue({
        id: 'cat-new-1',
        labelFr: 'Smartphones',
        slug: 'smartphones',
        parentId: null,
        icon: '📱',
        description: 'Téléphones intelligents',
        sortOrder: 10,
        active: true,
        _count: { demandes: 0, repairers: 0 },
      });

      const result = await service.createCategory({
        labelFr: 'Smartphones',
        icon: '📱',
        description: 'Téléphones intelligents',
        sortOrder: 10,
      });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: {
          labelFr: 'Smartphones',
          slug: 'smartphones',
          parentId: null,
          icon: '📱',
          description: 'Téléphones intelligents',
          sortOrder: 10,
        },
      });

      expect(result.icon).toBe('📱');
      expect(result.description).toBe('Téléphones intelligents');
    });

    it('updates category icon and description', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'cat-new-1',
        labelFr: 'Smartphones',
        slug: 'smartphones',
        parentId: null,
        icon: '📱',
        description: 'Téléphones intelligents',
        sortOrder: 10,
        active: true,
      });
      prisma.category.update.mockResolvedValue({
        id: 'cat-new-1',
        labelFr: 'Smartphones',
        slug: 'smartphones',
        parentId: null,
        icon: '📲',
        description: 'Téléphones et accessoires mobiles',
        sortOrder: 10,
        active: true,
        _count: { demandes: 0, repairers: 0 },
      });

      const result = await service.updateCategory('cat-new-1', {
        icon: '📲',
        description: 'Téléphones et accessoires mobiles',
      });

      expect(prisma.category.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cat-new-1' },
          data: expect.objectContaining({
            icon: '📲',
            description: 'Téléphones et accessoires mobiles',
          }),
        }),
      );

      expect(result.icon).toBe('📲');
      expect(result.description).toBe('Téléphones et accessoires mobiles');
    });
  });
});
