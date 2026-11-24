import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AppException } from '../common/app-exception.js';
import type {
  AdminBrandListItem,
  AdminBrandListQuery,
  AdminBrandListResponse,
  AdminCatalogOverviewDto,
  AdminCategoryTreeItem,
  AdminDeviceModelListItem,
  AdminDeviceModelListResponse,
  AdminModelListQuery,
  CreateBrandInput,
  CreateCategoryInput,
  CreateDeviceModelInput,
  CreateFaultTypeInput,
  FaultTypeDto,
  ReorderFaultTypesInput,
  ToggleCategoryActiveInput,
  UpdateBrandInput,
  UpdateCategoryInput,
  UpdateDeviceModelInput,
  UpdateFaultTypeInput,
} from '@revime/shared';

/**
 * Normalizes text to an SEO-friendly kebab-case slug:
 * lowercase, accents stripped (normalize NFD), non-alphanumeric replaced with hyphens, trimmed.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

@Injectable()
export class AdminCatalogService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * §8.9 Overview: counts for roots, subcategories, brands, device models, and fault types.
   */
  async getCatalogOverview(): Promise<AdminCatalogOverviewDto> {
    const [totalRootCategories, totalSubCategories, totalBrands, totalModels, totalFaultTypes] = await Promise.all([
      this.prisma.category.count({ where: { parentId: null } }),
      this.prisma.category.count({ where: { parentId: { not: null } } }),
      this.prisma.brand.count(),
      this.prisma.deviceModel.count(),
      this.prisma.faultType.count(),
    ]);

    return {
      totalRootCategories,
      totalSubCategories,
      totalBrands,
      totalModels,
      totalFaultTypes,
    };
  }

  /**
   * Builds the 2-level taxonomy tree with roots and subcategories,
   * sorted by sortOrder ascending, and decorated with demand and repairer counts.
   */
  async listCategoriesTree(): Promise<AdminCategoryTreeItem[]> {
    // Ties (production still holds equal sortOrder values) fall back to the label, so the order is stable.
    const rows = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { labelFr: 'asc' }],
      include: {
        _count: {
          select: {
            demandes: true,
            repairers: true,
          },
        },
      },
    });
    const repairerLinks = await this.prisma.repairerCategory.findMany({
      select: { categoryId: true, repairerUserId: true },
    });

    const roots: AdminCategoryTreeItem[] = [];
    const map = new Map<string, AdminCategoryTreeItem>();

    for (const row of rows) {
      const item: AdminCategoryTreeItem = {
        id: row.id,
        parentId: row.parentId,
        slug: row.slug,
        labelFr: row.labelFr,
        icon: row.icon ?? null,
        description: row.description ?? null,
        active: row.active,
        sortOrder: row.sortOrder,
        demandesCount: row._count?.demandes ?? 0,
        repairersCount: row._count?.repairers ?? 0,
        children: [],
      };
      map.set(row.id, item);
      if (!row.parentId) {
        roots.push(item);
      }
    }

    for (const row of rows) {
      if (row.parentId) {
        const parent = map.get(row.parentId);
        if (parent) {
          const item = map.get(row.id)!;
          parent.children.push(item);
        }
      }
    }

    const byOrder = (a: AdminCategoryTreeItem, b: AdminCategoryTreeItem) =>
      a.sortOrder - b.sortOrder || a.labelFr.localeCompare(b.labelFr, 'fr');
    roots.sort(byOrder);
    for (const root of roots) {
      root.children.sort(byOrder);
    }

    // P22 (« compteurs des parents qui additionnent les enfants »): demandes are added up; réparateurs are
    // counted as DISTINCT people, because one registered in three subcategories is still one réparateur.
    const repairersOf = new Map<string, Set<string>>();
    for (const link of repairerLinks) {
      const set = repairersOf.get(link.categoryId) ?? new Set<string>();
      set.add(link.repairerUserId);
      repairersOf.set(link.categoryId, set);
    }
    const rollUp = (node: AdminCategoryTreeItem): Set<string> => {
      const people = new Set(repairersOf.get(node.id));
      for (const child of node.children) {
        for (const id of rollUp(child)) people.add(id);
        node.demandesCount += child.demandesCount;
      }
      node.repairersCount = people.size;
      return people;
    };
    for (const root of roots) {
      rollUp(root);
    }

    return roots;
  }

  /**
   * Creates a root category or a subcategory under an existing parent.
   */
  async createCategory(input: CreateCategoryInput, _adminUserId?: string): Promise<AdminCategoryTreeItem> {
    const slug = input.slug?.trim() || slugify(input.labelFr);

    const existingSlug = await this.prisma.category.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      throw new ConflictException(`Une catégorie avec le slug « ${slug} » existe déjà.`);
    }

    if (input.parentId) {
      const parent = await this.prisma.category.findUnique({
        where: { id: input.parentId },
      });
      if (!parent) {
        throw new NotFoundException(`La catégorie parente « ${input.parentId} » n'existe pas.`);
      }
    }

    const created = await this.prisma.category.create({
      data: {
        labelFr: input.labelFr.trim(),
        slug,
        parentId: input.parentId ?? null,
        icon: input.icon ?? null,
        description: input.description ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    return {
      id: created.id,
      parentId: created.parentId,
      slug: created.slug,
      labelFr: created.labelFr,
      icon: created.icon ?? null,
      description: created.description ?? null,
      active: created.active,
      sortOrder: created.sortOrder,
      demandesCount: (created as any)._count?.demandes ?? 0,
      repairersCount: (created as any)._count?.repairers ?? 0,
      children: [],
    };
  }

  /**
   * Updates category label, slug, sortOrder, active status, icon, or description.
   */
  async updateCategory(id: string, input: UpdateCategoryInput, _adminUserId?: string): Promise<AdminCategoryTreeItem> {
    const existing = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Catégorie introuvable (ID: ${id}).`);
    }

    if (input.slug !== undefined) {
      const slug = input.slug.trim();
      if (slug !== existing.slug) {
        const slugConflict = await this.prisma.category.findUnique({
          where: { slug },
        });
        if (slugConflict && slugConflict.id !== id) {
          throw new ConflictException(`Une catégorie avec le slug « ${slug} » existe déjà.`);
        }
      }
    }

    const data: Record<string, unknown> = {};
    if (input.labelFr !== undefined) data.labelFr = input.labelFr.trim();
    if (input.slug !== undefined) data.slug = input.slug.trim();
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;
    if (input.active !== undefined) data.active = input.active;
    if (input.icon !== undefined) data.icon = input.icon;
    if (input.description !== undefined) data.description = input.description;

    const updated = await this.saveCategory(id, data, input.active === false && existing.parentId === null);

    return {
      id: updated.id,
      parentId: updated.parentId ?? null,
      slug: updated.slug,
      labelFr: updated.labelFr,
      icon: updated.icon ?? null,
      description: updated.description ?? null,
      active: updated.active,
      sortOrder: updated.sortOrder,
      demandesCount: (updated as any)._count?.demandes ?? 0,
      repairersCount: (updated as any)._count?.repairers ?? 0,
      children: [],
    };
  }

  /**
   * The single write path of a category row. Deactivating a root deactivates its subcategories IN THE
   * SAME TRANSACTION (P22), whichever endpoint asked (`toggle` or `update` with `active: false`):
   * a half-applied cascade would leave live subcategories under a hidden parent.
   */
  private async saveCategory(id: string, data: Record<string, unknown>, deactivateChildren: boolean) {
    const update = this.prisma.category.update({
      where: { id },
      data,
      include: {
        _count: {
          select: { demandes: true, repairers: true },
        },
      },
    });
    if (!deactivateChildren) return update;
    const [, updated] = await this.prisma.$transaction([
      this.prisma.category.updateMany({ where: { parentId: id }, data: { active: false } }),
      update,
    ]);
    return updated;
  }

  /**
   * Toggles active state of a category.
   * If deactivating a root category, cascades deactivation to all its subcategories.
   */
  async toggleCategoryActive(
    id: string,
    input: boolean | ToggleCategoryActiveInput,
    _adminUserId?: string,
  ): Promise<AdminCategoryTreeItem> {
    const active = typeof input === 'boolean' ? input : input.active;

    const existing = await this.prisma.category.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Catégorie introuvable (ID: ${id}).`);
    }

    const updated = await this.saveCategory(id, { active }, !active && existing.parentId === null);

    return {
      id: updated.id,
      parentId: updated.parentId ?? null,
      slug: updated.slug,
      labelFr: updated.labelFr,
      icon: updated.icon ?? null,
      description: updated.description ?? null,
      active: updated.active,
      sortOrder: updated.sortOrder,
      demandesCount: (updated as any)._count?.demandes ?? 0,
      repairersCount: (updated as any)._count?.repairers ?? 0,
      children: [],
    };
  }

  /**
   * Reorders ONE sibling group sequentially with sortOrder = (index + 1) * 10 in a transaction. The list
   * must be the complete group (same parent, none missing): renumbering a subset would leave its siblings
   * on their old values, and that is exactly how duplicate orders come back.
   */
  async reorderCategories(categoryIds: string[], _adminUserId?: string): Promise<{ success: true }> {
    const rows = await this.prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, parentId: true },
    });
    if (rows.length !== categoryIds.length) {
      throw new AppException('NOT_FOUND', 'Une des catégories à ordonner est introuvable.');
    }
    const parentId = rows[0]!.parentId;
    if (rows.some((r) => r.parentId !== parentId)) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Les catégories à ordonner doivent avoir le même parent.');
    }
    const groupSize = await this.prisma.category.count({ where: { parentId } });
    if (groupSize !== categoryIds.length) {
      throw new AppException(
        'UNPROCESSABLE_ENTITY',
        'La liste doit contenir toutes les catégories du même niveau.',
      );
    }
    await this.prisma.$transaction(
      categoryIds.map((id, index) =>
        this.prisma.category.update({
          where: { id },
          data: { sortOrder: (index + 1) * 10 },
        }),
      ),
    );
    return { success: true };
  }

  /**
   * Lists brands with filtering by search query q, categoryId, active status, and pagination.
   */
  async listBrands(query: AdminBrandListQuery): Promise<AdminBrandListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Number(query.pageSize) || 25);
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};

    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    if (query.categoryId) {
      where.categories = {
        some: {
          categoryId: query.categoryId,
        },
      };
    }

    if (query.active === 'true') {
      where.active = true;
    } else if (query.active === 'false') {
      where.active = false;
    }

    const [rows, total] = await Promise.all([
      this.prisma.brand.findMany({
        where,
        skip,
        take,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          categories: {
            select: {
              category: {
                select: {
                  id: true,
                  labelFr: true,
                },
              },
            },
          },
          _count: {
            select: {
              models: true,
            },
          },
        },
      }),
      this.prisma.brand.count({ where }),
    ]);

    const items: AdminBrandListItem[] = rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      logoUrl: row.logoUrl ?? null,
      active: row.active,
      sortOrder: row.sortOrder,
      categories: (row.categories ?? []).map((bc: any) => ({
        id: bc.category.id,
        labelFr: bc.category.labelFr,
      })),
      modelsCount: row._count?.models ?? 0,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Creates a new brand, optional slug generation, and associates categories.
   */
  async createBrand(input: CreateBrandInput, _adminUserId?: string): Promise<AdminBrandListItem> {
    const name = input.name.trim();
    const slug = input.slug?.trim() || slugify(name);

    const existingConflict = await this.prisma.brand.findFirst({
      where: {
        OR: [
          { name: { equals: name, mode: 'insensitive' } },
          { slug },
        ],
      },
    });
    if (existingConflict) {
      throw new ConflictException(`Une marque avec le même nom ou slug existe déjà.`);
    }

    const created = await this.prisma.brand.create({
      data: {
        name,
        slug,
        logoUrl: input.logoUrl !== undefined ? (input.logoUrl?.trim() || null) : null,
        sortOrder: input.sortOrder ?? 0,
        categories: input.categoryIds && input.categoryIds.length > 0 ? {
          create: input.categoryIds.map((categoryId) => ({ categoryId })),
        } : undefined,
      },
      include: {
        categories: {
          select: {
            category: {
              select: {
                id: true,
                labelFr: true,
              },
            },
          },
        },
        _count: {
          select: {
            models: true,
          },
        },
      },
    });

    return {
      id: created.id,
      name: created.name,
      slug: created.slug,
      logoUrl: created.logoUrl ?? null,
      active: created.active,
      sortOrder: created.sortOrder,
      categories: (created.categories ?? []).map((bc: any) => ({
        id: bc.category.id,
        labelFr: bc.category.labelFr,
      })),
      modelsCount: (created as any)._count?.models ?? 0,
      createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : (created.createdAt ? String(created.createdAt) : new Date().toISOString()),
    };
  }

  /**
   * Updates an existing brand and synchronizes category relations.
   */
  async updateBrand(id: string, input: UpdateBrandInput, _adminUserId?: string): Promise<AdminBrandListItem> {
    const existing = await this.prisma.brand.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Marque introuvable (ID: ${id}).`);
    }

    const newName = input.name?.trim();
    const newSlug = input.slug?.trim();

    if ((newName && newName !== existing.name) || (newSlug && newSlug !== existing.slug)) {
      const orConditions: any[] = [];
      if (newName && newName !== existing.name) {
        orConditions.push({ name: { equals: newName, mode: 'insensitive' } });
      }
      if (newSlug && newSlug !== existing.slug) {
        orConditions.push({ slug: newSlug });
      }
      const conflict = await this.prisma.brand.findFirst({
        where: {
          id: { not: id },
          OR: orConditions,
        },
      });
      if (conflict) {
        throw new ConflictException(`Une marque avec le même nom ou slug existe déjà.`);
      }
    }

    const data: any = {};
    if (newName !== undefined) data.name = newName;
    if (newSlug !== undefined) data.slug = newSlug;
    if (input.logoUrl !== undefined) data.logoUrl = input.logoUrl?.trim() || null;
    if (input.active !== undefined) data.active = input.active;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    if (input.categoryIds !== undefined) {
      data.categories = {
        deleteMany: {},
        create: input.categoryIds.map((categoryId) => ({ categoryId })),
      };
    }

    const updated = await this.prisma.brand.update({
      where: { id },
      data,
      include: {
        categories: {
          select: {
            category: {
              select: {
                id: true,
                labelFr: true,
              },
            },
          },
        },
        _count: {
          select: {
            models: true,
          },
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      logoUrl: updated.logoUrl ?? null,
      active: updated.active,
      sortOrder: updated.sortOrder,
      categories: (updated.categories ?? []).map((bc: any) => ({
        id: bc.category.id,
        labelFr: bc.category.labelFr,
      })),
      modelsCount: (updated as any)._count?.models ?? 0,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : (updated.createdAt ? String(updated.createdAt) : new Date().toISOString()),
    };
  }

  /**
   * Deletes a brand by ID.
   */
  async deleteBrand(id: string, _adminUserId?: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.brand.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Marque introuvable (ID: ${id}).`);
    }

    await this.prisma.brand.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Lists device models with brandId, categoryId, active, q filters and pagination.
   */
  async listModels(query: AdminModelListQuery): Promise<AdminDeviceModelListResponse> {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.max(1, Number(query.pageSize) || 25);
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const where: any = {};
    if (query.brandId) {
      where.brandId = query.brandId;
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.active === 'true') {
      where.active = true;
    } else if (query.active === 'false') {
      where.active = false;
    }
    if (query.q) {
      const q = query.q.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { slug: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await Promise.all([
      this.prisma.deviceModel.findMany({
        where,
        skip,
        take,
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          brand: {
            select: {
              name: true,
            },
          },
          category: {
            select: {
              labelFr: true,
            },
          },
        },
      }),
      this.prisma.deviceModel.count({ where }),
    ]);

    const items: AdminDeviceModelListItem[] = rows.map((row: any) => ({
      id: row.id,
      brandId: row.brandId,
      brandName: row.brand?.name ?? '',
      name: row.name,
      slug: row.slug,
      categoryId: row.categoryId ?? null,
      categoryLabelFr: row.category?.labelFr ?? null,
      active: row.active,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Creates a device model under a brand.
   */
  async createModel(input: CreateDeviceModelInput, _adminUserId?: string): Promise<AdminDeviceModelListItem> {
    const brand = await this.prisma.brand.findUnique({
      where: { id: input.brandId },
    });
    if (!brand) {
      throw new NotFoundException(`Marque introuvable (ID: ${input.brandId}).`);
    }

    const name = input.name.trim();
    const slug = input.slug?.trim() || slugify(name);

    const existingModel = await this.prisma.deviceModel.findFirst({
      where: {
        brandId: input.brandId,
        slug,
      },
    });
    if (existingModel) {
      throw new ConflictException(`Un modèle avec le slug « ${slug} » existe déjà pour cette marque.`);
    }

    const created = await this.prisma.deviceModel.create({
      data: {
        brandId: input.brandId,
        name,
        slug,
        categoryId: input.categoryId ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    return {
      id: created.id,
      brandId: created.brandId,
      brandName: (created as any).brand?.name ?? brand.name,
      name: created.name,
      slug: created.slug,
      categoryId: created.categoryId,
      categoryLabelFr: (created as any).category?.labelFr ?? null,
      active: created.active,
      sortOrder: created.sortOrder,
      createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : (created.createdAt ? String(created.createdAt) : new Date().toISOString()),
    };
  }

  /**
   * Updates an existing device model.
   */
  async updateModel(id: string, input: UpdateDeviceModelInput, _adminUserId?: string): Promise<AdminDeviceModelListItem> {
    const existing = await this.prisma.deviceModel.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Modèle introuvable (ID: ${id}).`);
    }

    if (input.slug !== undefined) {
      const newSlug = input.slug.trim();
      if (newSlug !== existing.slug) {
        const conflict = await this.prisma.deviceModel.findFirst({
          where: {
            brandId: existing.brandId,
            slug: newSlug,
            id: { not: id },
          },
        });
        if (conflict) {
          throw new ConflictException(`Un modèle avec le slug « ${newSlug} » existe déjà pour cette marque.`);
        }
      }
    }

    const data: any = {};
    if (input.name !== undefined) data.name = input.name.trim();
    if (input.slug !== undefined) data.slug = input.slug.trim();
    if (input.categoryId !== undefined) data.categoryId = input.categoryId;
    if (input.active !== undefined) data.active = input.active;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder;

    const updated = await this.prisma.deviceModel.update({
      where: { id },
      data,
    });

    return {
      id: updated.id,
      brandId: updated.brandId,
      brandName: (updated as any).brand?.name ?? (existing as any).brand?.name ?? '',
      name: updated.name,
      slug: updated.slug,
      categoryId: updated.categoryId,
      categoryLabelFr: (updated as any).category?.labelFr ?? (existing as any).category?.labelFr ?? null,
      active: updated.active,
      sortOrder: updated.sortOrder,
      createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : (updated.createdAt ? String(updated.createdAt) : new Date().toISOString()),
    };
  }

  /**
   * Deletes a device model by ID.
   */
  async deleteModel(id: string, _adminUserId?: string): Promise<{ success: boolean }> {
    const existing = await this.prisma.deviceModel.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Modèle introuvable (ID: ${id}).`);
    }

    await this.prisma.deviceModel.delete({
      where: { id },
    });

    return { success: true };
  }

  // =========================================================================
  // Feature F12: Types de panne (Fault Types)
  // =========================================================================

  private mapToFaultTypeDto(row: any): FaultTypeDto {
    return {
      id: row.id,
      categoryId: row.categoryId,
      categoryLabelFr: row.category?.labelFr ?? undefined,
      categorySlug: row.category?.slug ?? undefined,
      slug: row.slug,
      labelFr: row.labelFr,
      description: row.description ?? null,
      icon: row.icon ?? null,
      sortOrder: row.sortOrder,
      active: row.active,
      ...(row._count?.demandes !== undefined ? { demandesCount: row._count.demandes } : {}),
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : (row.createdAt ? String(row.createdAt) : new Date().toISOString()),
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : (row.updatedAt ? String(row.updatedAt) : new Date().toISOString()),
    };
  }

  /**
   * Lists fault types, optionally filtered by categoryId, active status, or search query `q`.
   * Ordered by categoryId asc, sortOrder asc, labelFr asc.
   */
  async listFaultTypes(query?: { categoryId?: string; active?: boolean | string; q?: string }): Promise<FaultTypeDto[]> {
    const where: any = {};
    if (query?.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query?.active !== undefined) {
      where.active = typeof query.active === 'string' ? query.active === 'true' : Boolean(query.active);
    }
    if (query?.q?.trim()) {
      const term = query.q.trim();
      where.OR = [
        { labelFr: { contains: term, mode: 'insensitive' } },
        { slug: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const rows = await this.prisma.faultType.findMany({
      where,
      orderBy: [{ categoryId: 'asc' }, { sortOrder: 'asc' }, { labelFr: 'asc' }],
      include: {
        category: {
          select: { id: true, labelFr: true, slug: true },
        },
        _count: {
          select: { demandes: true },
        },
      },
    });

    return rows.map((row: any) => this.mapToFaultTypeDto(row));
  }

  /**
   * Creates a fault type under a category.
   * Auto-generates slug if omitted, checks for collision in same category,
   * and computes sortOrder if not provided.
   */
  async createFaultType(dto: CreateFaultTypeInput, _actorUserId?: string): Promise<FaultTypeDto> {
    const category = await this.prisma.category.findUnique({
      where: { id: dto.categoryId },
    });
    if (!category) {
      throw new NotFoundException(`Catégorie introuvable (ID: ${dto.categoryId}).`);
    }

    const labelFr = dto.labelFr.trim();
    const slug = dto.slug?.trim() ? slugify(dto.slug) : slugify(labelFr);

    const conflict =
      (await this.prisma.faultType.findFirst({
        where: {
          categoryId: dto.categoryId,
          slug,
        },
      })) ??
      (await this.prisma.faultType.findUnique({
        where: {
          categoryId_slug: {
            categoryId: dto.categoryId,
            slug,
          },
        },
      }));

    if (conflict) {
      throw new ConflictException('Un type de panne avec ce slug existe déjà pour cette catégorie.');
    }

    let sortOrder = dto.sortOrder ?? 0;
    if (sortOrder <= 0) {
      const maxRow = await this.prisma.faultType.findFirst({
        where: { categoryId: dto.categoryId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = maxRow ? maxRow.sortOrder + 1 : 1;
    }

    const created = await this.prisma.faultType.create({
      data: {
        categoryId: dto.categoryId,
        slug,
        labelFr,
        description: dto.description?.trim() ?? null,
        icon: dto.icon?.trim() ?? null,
        sortOrder,
        active: dto.active ?? true,
      },
      include: {
        category: {
          select: { id: true, labelFr: true, slug: true },
        },
      },
    });

    return this.mapToFaultTypeDto(created);
  }

  /**
   * Updates an existing fault type. Checks slug uniqueness when slug is modified.
   */
  async updateFaultType(id: string, dto: UpdateFaultTypeInput, _actorUserId?: string): Promise<FaultTypeDto> {
    const existing = await this.prisma.faultType.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Type de panne introuvable (ID: ${id}).`);
    }

    const data: any = {};
    if (dto.labelFr !== undefined) data.labelFr = dto.labelFr.trim();
    if (dto.description !== undefined) data.description = dto.description ? dto.description.trim() : null;
    if (dto.icon !== undefined) data.icon = dto.icon ? dto.icon.trim() : null;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (dto.active !== undefined) data.active = dto.active;

    if (dto.slug !== undefined) {
      const newSlug = slugify(dto.slug);
      if (newSlug !== existing.slug) {
        const conflict =
          (await this.prisma.faultType.findFirst({
            where: {
              categoryId: existing.categoryId,
              slug: newSlug,
              id: { not: id },
            },
          })) ??
          (await this.prisma.faultType.findUnique({
            where: {
              categoryId_slug: {
                categoryId: existing.categoryId,
                slug: newSlug,
              },
            },
          }));

        if (conflict && (conflict as any).id !== id) {
          throw new ConflictException('Un type de panne avec ce slug existe déjà pour cette catégorie.');
        }
      }
      data.slug = newSlug;
    }

    const updated = await this.prisma.faultType.update({
      where: { id },
      data,
      include: {
        category: {
          select: { id: true, labelFr: true, slug: true },
        },
      },
    });

    return this.mapToFaultTypeDto(updated);
  }

  /**
   * Deletes a fault type by ID.
   */
  async deleteFaultType(id: string, _actorUserId?: string): Promise<{ ok: true; deleted: boolean }> {
    const existing = await this.prisma.faultType.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException(`Type de panne introuvable (ID: ${id}).`);
    }

    await this.prisma.faultType.delete({
      where: { id },
    });

    return { ok: true, deleted: true };
  }

  /**
   * Reorders the fault types of ONE category. Every id must belong to `dto.categoryId`: an id of
   * another category would be renumbered into this one's sequence, and an unknown id would fail the
   * whole transaction with an unhandled P2025 (a 500). A repeated id is caught by the same count
   * (the query returns it once).
   */
  async reorderFaultTypes(dto: ReorderFaultTypesInput, _actorUserId?: string): Promise<{ ok: true }> {
    const owned = await this.prisma.faultType.findMany({
      where: { categoryId: dto.categoryId, id: { in: dto.orderedIds } },
      select: { id: true },
    });
    if (owned.length !== dto.orderedIds.length) {
      throw new AppException(
        'VALIDATION_FAILED',
        "Ces types de panne ne correspondent pas à la catégorie indiquée.",
        { orderedIds: 'Liste invalide pour cette catégorie.' },
      );
    }

    await this.prisma.$transaction(
      dto.orderedIds.map((id, index) =>
        this.prisma.faultType.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    return { ok: true };
  }
}
