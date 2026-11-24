import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminSettingsService } from '../src/admin/admin-settings.service.js';
import { AdminSettingsController } from '../src/admin/admin-settings.controller.js';
import { AUDIT_KEY } from '../src/admin/admin-audit.decorator.js';
import { AppException } from '../src/common/app-exception.js';
import { ZodValidationPipe } from '../src/common/zod-validation.pipe.js';
import {
  DEFAULT_PLATFORM_SETTINGS,
  platformSettingsDtoSchema,
  updatePlatformSettingsSchema,
} from '@revime/shared';

describe('AdminSettingsService', () => {
  let mockPrisma: any;
  let service: AdminSettingsService;

  const mockDate = new Date('2026-10-16T12:00:00.000Z');

  const baseDbRow = {
    ...DEFAULT_PLATFORM_SETTINGS,
    id: 'singleton',
    updatedAt: mockDate,
    updatedByUserId: null,
  };

  beforeEach(() => {
    mockPrisma = {
      platformSettings: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
      },
    };
    service = new AdminSettingsService(mockPrisma);
  });

  describe('getSettings', () => {
    it('creates singleton with defaults via upsert if database row does not exist', async () => {
      mockPrisma.platformSettings.findUnique.mockResolvedValue(null);
      mockPrisma.platformSettings.upsert.mockResolvedValue({
        ...baseDbRow,
      });

      const result = await service.getSettings();

      expect(mockPrisma.platformSettings.findUnique).toHaveBeenCalledWith({
        where: { id: 'singleton' },
      });
      expect(mockPrisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        create: {
          ...DEFAULT_PLATFORM_SETTINGS,
          id: 'singleton',
        },
        update: {},
      });
      expect(result).toMatchObject({
        id: 'singleton',
        protectionFixedCents: 290,
        protectionRateBp: 450,
        commissionRateBp: 0,
        payoutHoldHours: 48,
        offerValidityHours: 168,
        paymentHoldHours: 2,
        deliveryHomeEnabled: true,
        deliveryWorkshopEnabled: true,
        deliveryParcelEnabled: true,
        carrierMondialRelay: true,
        carrierChronopost: true,
        carrierColissimo: true,
        carrierRelaisColis: true,
        maxInsurableValueCents: 100000,
        cguCurrentVersion: '2026-10-10',
        cguForceReaccept: false,
        legalNoticeVersion: '2026-10-10',
        maintenanceEnabled: false,
        maintenanceMessage: 'Plateforme en cours de maintenance. De retour très prochainement.',
        updatedAt: mockDate.toISOString(),
        updatedByUserId: null,
      });
      expect(() => platformSettingsDtoSchema.parse(result)).not.toThrow();
    });

    it('returns persisted row when present without calling upsert', async () => {
      const persistedRow = {
        ...baseDbRow,
        protectionFixedCents: 350,
        carrierMondialRelay: false,
        updatedByUserId: 'usr-admin-1',
      };
      mockPrisma.platformSettings.findUnique.mockResolvedValue(persistedRow);

      const result = await service.getSettings();

      expect(mockPrisma.platformSettings.findUnique).toHaveBeenCalledWith({
        where: { id: 'singleton' },
      });
      expect(mockPrisma.platformSettings.upsert).not.toHaveBeenCalled();
      expect(result.protectionFixedCents).toBe(350);
      expect(result.carrierMondialRelay).toBe(false);
      expect(result.updatedByUserId).toBe('usr-admin-1');
      expect(result.updatedAt).toBe(mockDate.toISOString());
    });
  });

  describe('updateSettings', () => {
    it('applies partial updates and stamps updatedByUserId', async () => {
      const prevRow = {
        ...baseDbRow,
        protectionFixedCents: 290,
        commissionRateBp: 0,
        payoutHoldHours: 48,
      };
      const updatedRow = {
        ...prevRow,
        protectionFixedCents: 390,
        commissionRateBp: 500,
        updatedByUserId: 'usr-admin-42',
        updatedAt: new Date('2026-10-16T13:00:00.000Z'),
      };

      mockPrisma.platformSettings.findUnique.mockResolvedValue(prevRow);
      mockPrisma.platformSettings.upsert.mockResolvedValue(updatedRow);

      const result = await service.updateSettings(
        {
          protectionFixedCents: 390,
          commissionRateBp: 500,
        },
        'usr-admin-42',
      );

      expect(mockPrisma.platformSettings.upsert).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        create: {
          ...DEFAULT_PLATFORM_SETTINGS,
          protectionFixedCents: 390,
          commissionRateBp: 500,
          id: 'singleton',
          updatedByUserId: 'usr-admin-42',
        },
        update: {
          protectionFixedCents: 390,
          commissionRateBp: 500,
          updatedByUserId: 'usr-admin-42',
        },
      });

      expect(result.protectionFixedCents).toBe(390);
      expect(result.commissionRateBp).toBe(500);
      expect(result.updatedByUserId).toBe('usr-admin-42');
      expect(result.updatedAt).toBe('2026-10-16T13:00:00.000Z');
    });

    it('validates dto and throws on invalid values', async () => {
      await expect(
        service.updateSettings(
          {
            protectionFixedCents: -50 as any, // invalid negative cents
          },
          'usr-admin-1',
        ),
      ).rejects.toThrow();

      expect(mockPrisma.platformSettings.upsert).not.toHaveBeenCalled();
    });
  });

  describe('isMaintenanceActive', () => {
    it('returns current maintenance status and message when row exists', async () => {
      mockPrisma.platformSettings.findUnique.mockResolvedValue({
        maintenanceEnabled: true,
        maintenanceMessage: 'Maintenance planifiée ce soir.',
      });

      const res = await service.isMaintenanceActive();

      expect(res).toEqual({
        active: true,
        message: 'Maintenance planifiée ce soir.',
      });
      expect(mockPrisma.platformSettings.findUnique).toHaveBeenCalledWith({
        where: { id: 'singleton' },
        select: { maintenanceEnabled: true, maintenanceMessage: true },
      });
    });

    it('falls back to default false and default message when row is not found or null', async () => {
      mockPrisma.platformSettings.findUnique.mockResolvedValue(null);

      const res = await service.isMaintenanceActive();

      expect(res).toEqual({
        active: false,
        message: 'Plateforme en cours de maintenance. De retour très prochainement.',
      });
    });

    it('falls back gracefully to default values if database throws an exception', async () => {
      mockPrisma.platformSettings.findUnique.mockRejectedValue(new Error('DB unreachable'));

      const res = await service.isMaintenanceActive();

      expect(res).toEqual({
        active: false,
        message: 'Plateforme en cours de maintenance. De retour très prochainement.',
      });
    });
  });
});

describe('AdminSettingsController', () => {
  let controller: AdminSettingsController;
  let service: any;

  beforeEach(() => {
    service = {
      getSettings: vi.fn(),
      updateSettings: vi.fn(),
    };
    controller = new AdminSettingsController(service);
  });

  describe('getSettings', () => {
    it('delegates to AdminSettingsService.getSettings', async () => {
      const mockSettings = { id: 'singleton', protectionFixedCents: 290 };
      service.getSettings.mockResolvedValue(mockSettings);

      const result = await controller.getSettings();

      expect(service.getSettings).toHaveBeenCalledOnce();
      expect(result).toBe(mockSettings);
    });
  });

  describe('updateSettings', () => {
    it('passes the body and the signed-in staff id to the service', async () => {
      service.updateSettings.mockResolvedValue({ id: 'singleton', commissionRateBp: 200 });

      const result = await controller.updateSettings(
        { commissionRateBp: 200 },
        { user: { id: 'usr-admin-123' } } as any,
      );

      expect(service.updateSettings).toHaveBeenCalledWith(
        { commissionRateBp: 200 },
        'usr-admin-123',
      );
      expect(result).toEqual({ id: 'singleton', commissionRateBp: 200 });
    });

    it('answers an out-of-range value with VALIDATION_FAILED (400), not an unhandled 500', () => {
      const pipe = new ZodValidationPipe(updatePlatformSettingsSchema);

      expect(() => pipe.transform({ commissionRateBp: 'not-a-number' })).toThrow(AppException);
      expect(() => pipe.transform({ protectionFixedCents: -50 })).toThrow(AppException);
    });

    it('wires that pipe on the body and audits the call with the session actor', () => {
      const params = Reflect.getMetadata(
        '__routeArguments__',
        AdminSettingsController,
        'updateSettings',
      ) as Record<string, { index: number; pipes?: unknown[] }>;
      const body = Object.values(params).find((p) => p.index === 0);
      expect(body?.pipes?.[0]).toBeInstanceOf(ZodValidationPipe);

      const meta = Reflect.getMetadata(
        AUDIT_KEY,
        AdminSettingsController.prototype.updateSettings,
      ) as { action: string; detailFields: string[] };
      expect(meta.action).toBe('settings.update');
      expect(meta.detailFields).toContain('maintenanceEnabled');
      expect(meta.detailFields).toContain('commissionRateBp');
    });
  });
});
