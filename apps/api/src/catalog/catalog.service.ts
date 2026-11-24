import { Injectable } from '@nestjs/common';
import type * as Prisma from '../generated/prisma/internal/prismaNamespace.js';
import type {
  CategoryDto,
  CatalogBrandsQuery,
  CatalogModelsQuery,
  PublicBrandDto,
  PublicDeviceModelDto,
} from '@revime/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { USABLE_CATEGORY } from './usable-category.js';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async listCategories(): Promise<CategoryDto[]> {
    const rows = await this.prisma.category.findMany({
      where: { ...USABLE_CATEGORY },
      // Parents first as a block, then each parent's children together.
      // sortOrder is per level, so this is display order within each group.
      orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }, { labelFr: 'asc' }],
      select: { id: true, parentId: true, slug: true, labelFr: true },
    });
    return rows;
  }

  /**
   * CF5-05: Lists active catalog brands, optionally filtered by category.
   * If a categoryId is specified, returns brands linked to that category or its parent,
   * as well as global brands (unassigned to any specific category).
   */
  async listBrands(query: CatalogBrandsQuery): Promise<PublicBrandDto[]> {
    const where: Prisma.BrandWhereInput = { active: true };

    if (query.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: query.categoryId },
        select: { id: true, parentId: true },
      });
      const categoryIds = [query.categoryId];
      if (category?.parentId) {
        categoryIds.push(category.parentId);
      }
      where.OR = [
        { categories: { none: {} } },
        { categories: { some: { categoryId: { in: categoryIds } } } },
      ];
    }

    const rows = await this.prisma.brand.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, slug: true },
    });

    return rows;
  }

  /**
   * CF5-05: Lists active catalog device models for a brand, optionally filtered by category.
   */
  async listModels(query: CatalogModelsQuery): Promise<PublicDeviceModelDto[]> {
    const where: Prisma.DeviceModelWhereInput = {
      brandId: query.brandId,
      active: true,
    };

    if (query.categoryId) {
      const category = await this.prisma.category.findUnique({
        where: { id: query.categoryId },
        select: { id: true, parentId: true },
      });
      const categoryIds = [query.categoryId];
      if (category?.parentId) {
        categoryIds.push(category.parentId);
      }
      where.OR = [
        { categoryId: null },
        { categoryId: { in: categoryIds } },
      ];
    }

    const rows = await this.prisma.deviceModel.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, brandId: true, name: true, slug: true, categoryId: true },
    });

    return rows;
  }
}

