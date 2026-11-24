import { describe, expect, it, vi } from 'vitest';
import { CatalogService } from '../src/catalog/catalog.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

describe('CatalogService Public Brands & Models (CF5-05)', () => {
  it('listBrands without categoryId queries active brands with proper ordering', async () => {
    const mockBrands = [
      { id: 'b1', name: 'Apple', slug: 'apple' },
      { id: 'b2', name: 'Samsung', slug: 'samsung' },
    ];
    const findMany = vi.fn().mockResolvedValue(mockBrands);
    const prisma = {
      brand: { findMany },
      category: { findUnique: vi.fn() },
    } as unknown as PrismaService;

    const service = new CatalogService(prisma);
    const result = await service.listBrands({});

    expect(findMany).toHaveBeenCalledWith({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true },
    });
    expect(result).toEqual([
      { id: 'b1', name: 'Apple', slug: 'apple' },
      { id: 'b2', name: 'Samsung', slug: 'samsung' },
    ]);
  });

  it('listBrands with categoryId includes parent category and unassigned brands', async () => {
    const categoryId = '11111111-1111-4111-8111-111111111111';
    const parentId = '22222222-2222-4222-8222-222222222222';

    const findUnique = vi.fn().mockResolvedValue({ id: categoryId, parentId });
    const findMany = vi.fn().mockResolvedValue([
      { id: 'b1', name: 'Apple', slug: 'apple' },
      { id: 'b3', name: 'Universal Brand', slug: 'universal-brand' },
    ]);
    const prisma = {
      category: { findUnique },
      brand: { findMany },
    } as unknown as PrismaService;

    const service = new CatalogService(prisma);
    const result = await service.listBrands({ categoryId });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        active: true,
        OR: [
          { categories: { none: {} } },
          { categories: { some: { categoryId: { in: [categoryId, parentId] } } } },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true },
    });
    expect(result).toHaveLength(2);
  });

  it('listModels queries models by brandId and filters by category if provided', async () => {
    const brandId = '33333333-3333-4333-8333-333333333333';
    const categoryId = '11111111-1111-4111-8111-111111111111';
    const parentId = '22222222-2222-4222-8222-222222222222';

    const mockModels = [
      { id: 'm1', brandId, name: 'iPhone 13', slug: 'iphone-13', categoryId },
      { id: 'm2', brandId, name: 'MacBook Pro', slug: 'macbook-pro', categoryId: null },
    ];

    const findUnique = vi.fn().mockResolvedValue({ id: categoryId, parentId });
    const findMany = vi.fn().mockResolvedValue(mockModels);
    const prisma = {
      category: { findUnique },
      deviceModel: { findMany },
    } as unknown as PrismaService;

    const service = new CatalogService(prisma);
    const result = await service.listModels({ brandId, categoryId });

    expect(findUnique).toHaveBeenCalledWith({
      where: { id: categoryId },
      select: { id: true, parentId: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        brandId,
        active: true,
        OR: [
          { categoryId: null },
          { categoryId: { in: [categoryId, parentId] } },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, brandId: true, name: true, slug: true, categoryId: true },
    });
    expect(result).toEqual(mockModels);
  });
});
