import { describe, expect, it } from 'vitest';
import {
  platformSettingsDtoSchema,
  updatePlatformSettingsSchema,
  DEFAULT_PLATFORM_SETTINGS,
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
  type PlatformSettingsDto,
  type UpdatePlatformSettingsDto,
} from '../src/index.js';

describe('Platform Settings Schemas & Contracts (@revime/shared)', () => {
  const validFullSettings: PlatformSettingsDto = {
    ...DEFAULT_PLATFORM_SETTINGS,
    updatedAt: '2026-10-16T12:00:00.000Z',
    updatedByUserId: 'usr_admin_123',
  };

  describe('DEFAULT_PLATFORM_SETTINGS', () => {
    it('has correct default values conforming to design spec', () => {
      expect(DEFAULT_PLATFORM_SETTINGS).toEqual({
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
      });
    });
  });

  describe('platformSettingsDtoSchema', () => {
    it('successfully parses full settings with updatedAt and updatedByUserId', () => {
      const parsed = platformSettingsDtoSchema.parse(validFullSettings);
      expect(parsed).toEqual(validFullSettings);
    });

    it('successfully parses full settings with null or omitted updatedByUserId', () => {
      const parsedNull = platformSettingsDtoSchema.parse({
        ...validFullSettings,
        updatedByUserId: null,
      });
      expect(parsedNull.updatedByUserId).toBeNull();

      const { updatedByUserId, ...withoutUser } = validFullSettings;
      const parsedOmitted = platformSettingsDtoSchema.parse(withoutUser);
      expect(parsedOmitted.updatedByUserId).toBeUndefined();
    });

    it('rejects an invalid singleton id', () => {
      const res = platformSettingsDtoSchema.safeParse({
        ...validFullSettings,
        id: 'other_id',
      });
      expect(res.success).toBe(false);
    });

    it('enforces bounds on tarification & commissions', () => {
      // Negative fixed cents
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, protectionFixedCents: -1 }).success).toBe(false);
      // Fixed cents exceeding 100 EUR
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, protectionFixedCents: 10001 }).success).toBe(false);
      // Non-integer cents
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, protectionFixedCents: 290.5 }).success).toBe(false);

      // Protection rate basis points (0 to 3000 bp = 0% to 30%)
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, protectionRateBp: -1 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, protectionRateBp: 3001 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, protectionRateBp: 1500 }).success).toBe(true);

      // Commission rate basis points (0 to 3000 bp = 0% to 30%)
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, commissionRateBp: -1 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, commissionRateBp: 3001 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, commissionRateBp: 1000 }).success).toBe(true);
    });

    it('enforces bounds on délais & expirations', () => {
      // payoutHoldHours: 1h to 720h (30 days)
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, payoutHoldHours: 0 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, payoutHoldHours: 721 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, payoutHoldHours: 24 }).success).toBe(true);

      // offerValidityHours: 1h to 720h (30 days)
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, offerValidityHours: 0 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, offerValidityHours: 721 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, offerValidityHours: 168 }).success).toBe(true);

      // paymentHoldHours: 1h to 48h
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, paymentHoldHours: 0 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, paymentHoldHours: 49 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, paymentHoldHours: 2 }).success).toBe(true);
    });

    it('enforces bounds on delivery & insurance', () => {
      // maxInsurableValueCents: 1000 (10 €) to 500000 (5000 €)
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, maxInsurableValueCents: 999 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, maxInsurableValueCents: 500001 }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, maxInsurableValueCents: 150000 }).success).toBe(true);
    });

    it('enforces strings trimming and length on CGU, legal notice and maintenance message', () => {
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, cguCurrentVersion: '' }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, cguCurrentVersion: '   ' }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, legalNoticeVersion: '' }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, maintenanceMessage: '' }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, maintenanceMessage: 'x'.repeat(501) }).success).toBe(false);
      expect(platformSettingsDtoSchema.safeParse({ ...validFullSettings, maintenanceMessage: 'x'.repeat(500) }).success).toBe(true);
    });
  });

  describe('updatePlatformSettingsSchema', () => {
    it('accepts valid partial updates', () => {
      const partial: UpdatePlatformSettingsDto = {
        protectionFixedCents: 350,
        maintenanceEnabled: true,
      };
      const parsed = updatePlatformSettingsSchema.parse(partial);
      expect(parsed).toEqual(partial);
    });

    it('accepts empty update object', () => {
      const parsed = updatePlatformSettingsSchema.parse({});
      expect(parsed).toEqual({});
    });

    it('enforces bounds on updated fields', () => {
      expect(updatePlatformSettingsSchema.safeParse({ protectionFixedCents: -50 }).success).toBe(false);
      expect(updatePlatformSettingsSchema.safeParse({ commissionRateBp: 3500 }).success).toBe(false);
      expect(updatePlatformSettingsSchema.safeParse({ payoutHoldHours: 0 }).success).toBe(false);
      expect(updatePlatformSettingsSchema.safeParse({ maintenanceMessage: '   ' }).success).toBe(false);
    });
  });

  describe('adminAuditActionSchema and labels', () => {
    it('includes settings.update in adminAuditActionSchema', () => {
      expect(adminAuditActionSchema.safeParse('settings.update').success).toBe(true);
    });

    it('maps settings.update to correct human-readable French label in ADMIN_AUDIT_ACTION_LABEL', () => {
      expect(ADMIN_AUDIT_ACTION_LABEL['settings.update']).toBe('Mise à jour des réglages plateforme');
    });
  });
});
