import { z } from 'zod';

export const platformSettingsDtoSchema = z.object({
  id: z.literal('singleton'),
  // 1. Tarification & Commissions (in cents & basis points)
  protectionFixedCents: z.number().int().min(0).max(10000), // 0 to 100 €
  protectionRateBp: z.number().int().min(0).max(3000),     // 0% to 30%
  commissionRateBp: z.number().int().min(0).max(3000),     // 0% to 30%

  // 2. Délais & Expirations (in hours)
  payoutHoldHours: z.number().int().min(1).max(720),        // 1h to 30 days
  offerValidityHours: z.number().int().min(1).max(720),     // 1h to 30 days
  paymentHoldHours: z.number().int().min(1).max(48),        // 1h to 48 hours

  // 3. Livraison & Transporteurs
  deliveryHomeEnabled: z.boolean(),
  deliveryWorkshopEnabled: z.boolean(),
  deliveryParcelEnabled: z.boolean(),
  carrierMondialRelay: z.boolean(),
  carrierChronopost: z.boolean(),
  carrierColissimo: z.boolean(),
  carrierRelaisColis: z.boolean(),
  maxInsurableValueCents: z.number().int().min(1000).max(500000), // 10 € to 5 000 €

  // 4. CGU & Légal
  cguCurrentVersion: z.string().trim().min(1).max(50),
  cguForceReaccept: z.boolean(),
  legalNoticeVersion: z.string().trim().min(1).max(50),

  // 5. Mode Maintenance
  maintenanceEnabled: z.boolean(),
  maintenanceMessage: z.string().trim().min(1).max(500),

  updatedAt: z.string(),
  updatedByUserId: z.string().nullable().optional(),
});
export type PlatformSettingsDto = z.infer<typeof platformSettingsDtoSchema>;

export const updatePlatformSettingsSchema = platformSettingsDtoSchema
  .omit({ id: true, updatedAt: true, updatedByUserId: true })
  .partial();
export type UpdatePlatformSettingsDto = z.infer<typeof updatePlatformSettingsSchema>;

export const DEFAULT_PLATFORM_SETTINGS: Omit<PlatformSettingsDto, 'updatedAt' | 'updatedByUserId'> = {
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
};
