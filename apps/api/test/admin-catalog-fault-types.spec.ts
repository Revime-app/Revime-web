import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants.js';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminController } from '../src/admin/admin.controller.js';
import { PERMISSION_KEY } from '../src/admin/require-permission.decorator.js';
import { AUDIT_KEY } from '../src/admin/admin-audit.decorator.js';
import { AdminCatalogService } from '../src/admin/admin-catalog.service.js';
import type {
  CreateFaultTypeInput,
  UpdateFaultTypeInput,
  ReorderFaultTypesInput,
  FaultTypeDto,
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
    faultType: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
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

describe('AdminCatalogService - Fault Types (Feature F12)', () => {
  let prisma: ReturnType<typeof makePrismaMock>;
  let service: AdminCatalogService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminCatalogService(prisma);
  });

  describe('getCatalogOverview', () => {
    it('includes totalFaultTypes count in overview', async () => {
      prisma.category.count
        .mockImplementation(async (args?: any) => {
          if (args?.where?.parentId === null) return 8;
          if (args?.where?.parentId) return 36;
          return 44;
        });
      prisma.brand.count.mockResolvedValue(25);
      prisma.deviceModel.count.mockResolvedValue(150);
      prisma.faultType.count.mockResolvedValue(42);

      const overview = await service.getCatalogOverview();

      expect(overview).toEqual({
        totalRootCategories: 8,
        totalSubCategories: 36,
        totalBrands: 25,
        totalModels: 150,
        totalFaultTypes: 42,
      });
      expect(prisma.faultType.count).toHaveBeenCalled();
    });
  });

  describe('listFaultTypes', () => {
    it('returns formatted fault type DTOs including category and demandesCount', async () => {
      const now = new Date();
      prisma.faultType.findMany.mockResolvedValue([
        {
          id: '11111111-1111-1111-1111-111111111111',
          categoryId: '22222222-2222-2222-2222-222222222222',
          slug: 'ecran-casse',
          labelFr: 'Écran cassé',
          description: 'Vitre ou dalle fissurée',
          icon: 'screen',
          sortOrder: 1,
          active: true,
          createdAt: now,
          updatedAt: now,
          category: {
            id: '22222222-2222-2222-2222-222222222222',
            labelFr: 'Smartphones',
            slug: 'smartphone',
          },
          _count: {
            demandes: 15,
          },
        },
      ]);

      const result = await service.listFaultTypes({
        categoryId: '22222222-2222-2222-2222-222222222222',
        active: true,
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: '11111111-1111-1111-1111-111111111111',
        categoryId: '22222222-2222-2222-2222-222222222222',
        categoryLabelFr: 'Smartphones',
        categorySlug: 'smartphone',
        slug: 'ecran-casse',
        labelFr: 'Écran cassé',
        description: 'Vitre ou dalle fissurée',
        icon: 'screen',
        sortOrder: 1,
        active: true,
        demandesCount: 15,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });

      expect(prisma.faultType.findMany).toHaveBeenCalledWith({
        where: {
          categoryId: '22222222-2222-2222-2222-222222222222',
          active: true,
        },
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
    });

    it('filters by search term q case-insensitively', async () => {
      prisma.faultType.findMany.mockResolvedValue([]);

      await service.listFaultTypes({ q: 'batterie' });

      expect(prisma.faultType.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { labelFr: { contains: 'batterie', mode: 'insensitive' } },
            { slug: { contains: 'batterie', mode: 'insensitive' } },
            { description: { contains: 'batterie', mode: 'insensitive' } },
          ],
        },
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
    });
  });

  describe('createFaultType', () => {
    const categoryId = '22222222-2222-2222-2222-222222222222';

    it('creates a fault type with auto-generated slug and next sortOrder', async () => {
      const now = new Date();
      prisma.category.findUnique.mockResolvedValue({
        id: categoryId,
        labelFr: 'Smartphones',
        slug: 'smartphone',
      });
      prisma.faultType.findUnique.mockResolvedValue(null);
      prisma.faultType.findFirst.mockImplementation(async ({ orderBy }: any) => {
        if (orderBy?.sortOrder === 'desc') {
          return { sortOrder: 3 };
        }
        return null;
      });
      prisma.faultType.create.mockResolvedValue({
        id: '11111111-1111-1111-1111-111111111111',
        categoryId,
        slug: 'batterie-gonflee',
        labelFr: 'Batterie gonflée',
        description: null,
        icon: null,
        sortOrder: 4,
        active: true,
        createdAt: now,
        updatedAt: now,
        category: {
          id: categoryId,
          labelFr: 'Smartphones',
          slug: 'smartphone',
        },
      });

      const input: CreateFaultTypeInput = {
        categoryId,
        labelFr: 'Batterie gonflée',
        active: true,
        sortOrder: 0,
      };

      const result = await service.createFaultType(input);

      expect(result.slug).toBe('batterie-gonflee');
      expect(result.sortOrder).toBe(4);
      expect(prisma.faultType.create).toHaveBeenCalledWith({
        data: {
          categoryId,
          slug: 'batterie-gonflee',
          labelFr: 'Batterie gonflée',
          description: null,
          icon: null,
          sortOrder: 4,
          active: true,
        },
        include: {
          category: {
            select: { id: true, labelFr: true, slug: true },
          },
        },
      });
    });

    it('throws NotFoundException when category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(
        service.createFaultType({
          categoryId,
          labelFr: 'Test',
          active: true,
          sortOrder: 0,
        }),
      ).rejects.toThrowError(/introuvable/i);
    });

    it('throws ConflictException when slug already exists in same category', async () => {
      prisma.category.findUnique.mockResolvedValue({
        id: categoryId,
        labelFr: 'Smartphones',
        slug: 'smartphone',
      });
      prisma.faultType.findUnique.mockResolvedValue({
        id: 'existing-id',
        categoryId,
        slug: 'ecran-casse',
      });
      prisma.faultType.findFirst.mockResolvedValue({
        id: 'existing-id',
        categoryId,
        slug: 'ecran-casse',
      });

      await expect(
        service.createFaultType({
          categoryId,
          slug: 'ecran-casse',
          labelFr: 'Écran cassé',
          active: true,
          sortOrder: 1,
        }),
      ).rejects.toThrowError(/existe déjà/i);
    });
  });

  describe('updateFaultType', () => {
    const id = '11111111-1111-1111-1111-111111111111';
    const categoryId = '22222222-2222-2222-2222-222222222222';
    const now = new Date();

    it('updates fields successfully', async () => {
      prisma.faultType.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.id === id) {
          return {
            id,
            categoryId,
            slug: 'old-slug',
            labelFr: 'Old Label',
            description: null,
            icon: null,
            sortOrder: 1,
            active: true,
            createdAt: now,
            updatedAt: now,
          };
        }
        return null;
      });

      prisma.faultType.update.mockResolvedValue({
        id,
        categoryId,
        slug: 'new-slug',
        labelFr: 'New Label',
        description: 'New desc',
        icon: 'tool',
        sortOrder: 2,
        active: false,
        createdAt: now,
        updatedAt: now,
        category: {
          id: categoryId,
          labelFr: 'Smartphones',
          slug: 'smartphone',
        },
      });

      const input: UpdateFaultTypeInput = {
        labelFr: 'New Label',
        slug: 'new-slug',
        description: 'New desc',
        icon: 'tool',
        sortOrder: 2,
        active: false,
      };

      const result = await service.updateFaultType(id, input);

      expect(result.labelFr).toBe('New Label');
      expect(result.slug).toBe('new-slug');
      expect(result.active).toBe(false);
      expect(prisma.faultType.update).toHaveBeenCalledWith({
        where: { id },
        data: {
          labelFr: 'New Label',
          slug: 'new-slug',
          description: 'New desc',
          icon: 'tool',
          sortOrder: 2,
          active: false,
        },
        include: {
          category: {
            select: { id: true, labelFr: true, slug: true },
          },
        },
      });
    });

    it('throws ConflictException if new slug conflicts with another fault type in the same category', async () => {
      prisma.faultType.findUnique.mockImplementation(async ({ where }: any) => {
        if (where?.id === id) {
          return {
            id,
            categoryId,
            slug: 'old-slug',
            labelFr: 'Old Label',
          };
        }
        if (where?.categoryId_slug) {
          return {
            id: 'other-id',
            categoryId,
            slug: 'existing-slug',
          };
        }
        return null;
      });

      prisma.faultType.findFirst.mockImplementation(async ({ where }: any) => {
        if (where?.categoryId === categoryId && where?.slug === 'existing-slug') {
          return {
            id: 'other-id',
            categoryId,
            slug: 'existing-slug',
          };
        }
        return null;
      });

      await expect(
        service.updateFaultType(id, { slug: 'existing-slug' }),
      ).rejects.toThrowError(/existe déjà/i);
    });

    it('throws NotFoundException when fault type to update does not exist', async () => {
      prisma.faultType.findUnique.mockResolvedValue(null);

      await expect(
        service.updateFaultType('missing-id', { labelFr: 'Test' }),
      ).rejects.toThrowError(/introuvable/i);
    });
  });

  describe('deleteFaultType', () => {
    const id = '11111111-1111-1111-1111-111111111111';

    it('deletes fault type and returns { ok: true, deleted: true }', async () => {
      prisma.faultType.findUnique.mockResolvedValue({ id });
      prisma.faultType.delete.mockResolvedValue({ id });

      const result = await service.deleteFaultType(id);

      expect(result).toEqual({ ok: true, deleted: true });
      expect(prisma.faultType.delete).toHaveBeenCalledWith({ where: { id } });
    });

    it('throws NotFoundException if fault type does not exist', async () => {
      prisma.faultType.findUnique.mockResolvedValue(null);

      await expect(service.deleteFaultType('missing-id')).rejects.toThrowError(/introuvable/i);
    });
  });

  describe('reorderFaultTypes', () => {
    const categoryId = '22222222-2222-2222-2222-222222222222';
    const orderedIds = [
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      '44444444-4444-4444-4444-444444444444',
    ];

    it('numbers the ids of that category from 0 in a transaction', async () => {
      prisma.faultType.findMany.mockResolvedValue(orderedIds.map((id) => ({ id })));

      const result = await service.reorderFaultTypes({ categoryId, orderedIds });

      expect(result).toEqual({ ok: true });
      expect(prisma.faultType.findMany).toHaveBeenCalledWith({
        where: { categoryId, id: { in: orderedIds } },
        select: { id: true },
      });
      expect(prisma.faultType.update).toHaveBeenCalledTimes(3);
      expect(prisma.faultType.update).toHaveBeenNthCalledWith(2, {
        where: { id: orderedIds[1] },
        data: { sortOrder: 1 },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('refuses an id that is not in the category, and renumbers nothing', async () => {
      prisma.faultType.findMany.mockResolvedValue([{ id: orderedIds[0] }, { id: orderedIds[1] }]);

      await expect(service.reorderFaultTypes({ categoryId, orderedIds })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses the same id twice', async () => {
      const twice = [orderedIds[0]!, orderedIds[0]!];
      prisma.faultType.findMany.mockResolvedValue([{ id: orderedIds[0] }]);

      await expect(service.reorderFaultTypes({ categoryId, orderedIds: twice })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED',
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });
});

describe('AdminController - Fault Types endpoints (Feature F12)', () => {
  let catalogAdminMock: {
    listFaultTypes: ReturnType<typeof vi.fn>;
    createFaultType: ReturnType<typeof vi.fn>;
    updateFaultType: ReturnType<typeof vi.fn>;
    deleteFaultType: ReturnType<typeof vi.fn>;
    reorderFaultTypes: ReturnType<typeof vi.fn>;
  };
  let controller: AdminController;

  beforeEach(() => {
    catalogAdminMock = {
      listFaultTypes: vi.fn(),
      createFaultType: vi.fn(),
      updateFaultType: vi.fn(),
      deleteFaultType: vi.fn(),
      reorderFaultTypes: vi.fn(),
    };
    controller = Object.assign(Object.create(AdminController.prototype), {
      catalogAdmin: catalogAdminMock,
    });
  });

  describe('GET catalog/fault-types (listFaultTypes)', () => {
    it('declares @RequirePermission("dashboard.read")', () => {
      expect(Reflect.getMetadata(PERMISSION_KEY, AdminController.prototype.listFaultTypes)).toBe('dashboard.read');
    });

    it('declares route path and GET method', () => {
      expect(Reflect.getMetadata(PATH_METADATA, AdminController.prototype.listFaultTypes)).toBe('catalog/fault-types');
      expect(Reflect.getMetadata(METHOD_METADATA, AdminController.prototype.listFaultTypes)).toBe(RequestMethod.GET);
    });

    it('parses active query string and delegates to catalogAdmin.listFaultTypes', async () => {
      const mockResult: FaultTypeDto[] = [
        {
          id: '11111111-1111-1111-1111-111111111111',
          categoryId: '22222222-2222-2222-2222-222222222222',
          slug: 'ecran-casse',
          labelFr: 'Écran cassé',
          sortOrder: 1,
          active: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      catalogAdminMock.listFaultTypes.mockResolvedValue(mockResult);

      const res1 = await controller.listFaultTypes({ categoryId: 'cat-1', active: 'true', q: 'ecran' });
      expect(catalogAdminMock.listFaultTypes).toHaveBeenCalledWith({
        categoryId: 'cat-1',
        active: true,
        q: 'ecran',
      });
      expect(res1).toBe(mockResult);

      await controller.listFaultTypes({ active: 'false' });
      expect(catalogAdminMock.listFaultTypes).toHaveBeenCalledWith({
        categoryId: undefined,
        active: false,
        q: undefined,
      });

      await controller.listFaultTypes({ active: 'all' });
      expect(catalogAdminMock.listFaultTypes).toHaveBeenCalledWith({
        categoryId: undefined,
        active: undefined,
        q: undefined,
      });
    });
  });

  describe('POST catalog/fault-types (createFaultType)', () => {
    it('declares @RequirePermission("catalog.manage")', () => {
      expect(Reflect.getMetadata(PERMISSION_KEY, AdminController.prototype.createFaultType)).toBe('catalog.manage');
    });

    it('declares @Audit("fault_type.create", { targetType: "FaultType" })', () => {
      expect(Reflect.getMetadata(AUDIT_KEY, AdminController.prototype.createFaultType)).toEqual({
        action: 'fault_type.create',
        targetType: 'FaultType',
      });
    });

    it('declares @HttpCode(201), route path and POST method', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AdminController.prototype.createFaultType)).toBe(201);
      expect(Reflect.getMetadata(PATH_METADATA, AdminController.prototype.createFaultType)).toBe('catalog/fault-types');
      expect(Reflect.getMetadata(METHOD_METADATA, AdminController.prototype.createFaultType)).toBe(RequestMethod.POST);
    });

    it('delegates to catalogAdmin.createFaultType with session user id', async () => {
      const mockResult = { id: 'new-id' } as FaultTypeDto;
      catalogAdminMock.createFaultType.mockResolvedValue(mockResult);

      const session = { user: { id: 'admin-user-1' } } as any;
      const body: CreateFaultTypeInput = {
        categoryId: '22222222-2222-2222-2222-222222222222',
        labelFr: 'Batterie gonflée',
        sortOrder: 1,
        active: true,
      };

      const result = await controller.createFaultType(session, body);

      expect(catalogAdminMock.createFaultType).toHaveBeenCalledWith(body, 'admin-user-1');
      expect(result).toBe(mockResult);
    });
  });

  describe('PATCH catalog/fault-types/:id (updateFaultType)', () => {
    it('declares @RequirePermission("catalog.manage")', () => {
      expect(Reflect.getMetadata(PERMISSION_KEY, AdminController.prototype.updateFaultType)).toBe('catalog.manage');
    });

    it('declares @Audit("fault_type.update", { targetType: "FaultType", targetParam: "id" })', () => {
      expect(Reflect.getMetadata(AUDIT_KEY, AdminController.prototype.updateFaultType)).toEqual({
        action: 'fault_type.update',
        targetType: 'FaultType',
        targetParam: 'id',
      });
    });

    it('declares @HttpCode(200), route path and PATCH method', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AdminController.prototype.updateFaultType)).toBe(200);
      expect(Reflect.getMetadata(PATH_METADATA, AdminController.prototype.updateFaultType)).toBe('catalog/fault-types/:id');
      expect(Reflect.getMetadata(METHOD_METADATA, AdminController.prototype.updateFaultType)).toBe(RequestMethod.PATCH);
    });

    it('delegates to catalogAdmin.updateFaultType with id, body, session user id', async () => {
      const mockResult = { id: 'fault-1' } as FaultTypeDto;
      catalogAdminMock.updateFaultType.mockResolvedValue(mockResult);

      const session = { user: { id: 'admin-user-1' } } as any;
      const body: UpdateFaultTypeInput = { labelFr: 'Écran brisé' };

      const result = await controller.updateFaultType(session, 'fault-1', body);

      expect(catalogAdminMock.updateFaultType).toHaveBeenCalledWith('fault-1', body, 'admin-user-1');
      expect(result).toBe(mockResult);
    });
  });

  describe('DELETE catalog/fault-types/:id (deleteFaultType)', () => {
    it('declares @RequirePermission("catalog.manage")', () => {
      expect(Reflect.getMetadata(PERMISSION_KEY, AdminController.prototype.deleteFaultType)).toBe('catalog.manage');
    });

    it('declares @Audit("fault_type.delete", { targetType: "FaultType", targetParam: "id" })', () => {
      expect(Reflect.getMetadata(AUDIT_KEY, AdminController.prototype.deleteFaultType)).toEqual({
        action: 'fault_type.delete',
        targetType: 'FaultType',
        targetParam: 'id',
      });
    });

    it('declares @HttpCode(200), route path and DELETE method', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AdminController.prototype.deleteFaultType)).toBe(200);
      expect(Reflect.getMetadata(PATH_METADATA, AdminController.prototype.deleteFaultType)).toBe('catalog/fault-types/:id');
      expect(Reflect.getMetadata(METHOD_METADATA, AdminController.prototype.deleteFaultType)).toBe(RequestMethod.DELETE);
    });

    it('delegates to catalogAdmin.deleteFaultType with id and session user id', async () => {
      catalogAdminMock.deleteFaultType.mockResolvedValue({ ok: true, deleted: true });

      const session = { user: { id: 'admin-user-1' } } as any;
      const result = await controller.deleteFaultType(session, 'fault-1');

      expect(catalogAdminMock.deleteFaultType).toHaveBeenCalledWith('fault-1', 'admin-user-1');
      expect(result).toEqual({ ok: true, deleted: true });
    });
  });

  describe('POST catalog/fault-types/reorder (reorderFaultTypes)', () => {
    it('declares @RequirePermission("catalog.manage")', () => {
      expect(Reflect.getMetadata(PERMISSION_KEY, AdminController.prototype.reorderFaultTypes)).toBe('catalog.manage');
    });

    it('declares @Audit("fault_type.reorder") with the category and the order in the detail (the id is in the body, not the URL)', () => {
      expect(Reflect.getMetadata(AUDIT_KEY, AdminController.prototype.reorderFaultTypes)).toEqual({
        action: 'fault_type.reorder',
        targetType: 'Category',
        detailFields: ['categoryId', 'orderedIds'],
      });
    });

    it('declares @HttpCode(200), route path and POST method', () => {
      expect(Reflect.getMetadata(HTTP_CODE_METADATA, AdminController.prototype.reorderFaultTypes)).toBe(200);
      expect(Reflect.getMetadata(PATH_METADATA, AdminController.prototype.reorderFaultTypes)).toBe('catalog/fault-types/reorder');
      expect(Reflect.getMetadata(METHOD_METADATA, AdminController.prototype.reorderFaultTypes)).toBe(RequestMethod.POST);
    });

    it('delegates to catalogAdmin.reorderFaultTypes with body and session user id', async () => {
      catalogAdminMock.reorderFaultTypes.mockResolvedValue({ ok: true });

      const session = { user: { id: 'admin-user-1' } } as any;
      const body: ReorderFaultTypesInput = {
        categoryId: '22222222-2222-2222-2222-222222222222',
        orderedIds: ['11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'],
      };

      const result = await controller.reorderFaultTypes(session, body);

      expect(catalogAdminMock.reorderFaultTypes).toHaveBeenCalledWith(body, 'admin-user-1');
      expect(result).toEqual({ ok: true });
    });
  });
});
