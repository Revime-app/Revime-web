import { z } from 'zod';

export const adminAlertTypeSchema = z.enum([
  'DISPUTE_NEW',       // Nouveau litige ouvert
  'REPORT_SEVERE',     // Signalement sévère (harcèlement, arnaque, etc.)
  'PAYMENT_FAILED',    // Échec de paiement ou de virement Stripe
  'PARCEL_INCIDENT',   // Incident colis / avarie / transporteur
  'ACCOUNT_LOCKED',    // V7 A11: compte bloqué (mots de passe ou codes erronés)
  'IP_BLOCKED',        // V7 A11: adresse IP bloquée (échecs sur plusieurs comptes)
  'ACCOUNT_SECURED',   // V7 A11 (U2b): « Ce n'est pas moi » utilisé
  'PROVIDER_REVOKE_FAILED', // V9 U3: révocation Apple / Google échouée à la suppression
]);
export type AdminAlertType = z.infer<typeof adminAlertTypeSchema>;
export const ADMIN_ALERT_TYPES = adminAlertTypeSchema.options;

export const adminAlertSeveritySchema = z.enum([
  'CRITICAL', // Litiges et signalements graves (SLA < 1h)
  'HIGH',     // Échecs financiers et blocages de fonds (SLA < 4h)
  'MEDIUM',   // Incidents logistiques et retards transporteur (SLA < 24h)
]);
export type AdminAlertSeverity = z.infer<typeof adminAlertSeveritySchema>;
export const ADMIN_ALERT_SEVERITIES = adminAlertSeveritySchema.options;

export const adminAlertTargetTypeSchema = z.enum([
  'Dispute',
  'ConversationReport',
  'Commande',
  'Shipment',
  'User',
  'IpAddress',
]);
export type AdminAlertTargetType = z.infer<typeof adminAlertTargetTypeSchema>;
export const ADMIN_ALERT_TARGET_TYPES = adminAlertTargetTypeSchema.options;

export const ADMIN_ALERT_TYPE_LABELS: Record<
  AdminAlertType,
  { label: string; icon: string; defaultSeverity: AdminAlertSeverity }
> = {
  DISPUTE_NEW: { label: 'Nouveau litige', icon: '⚖️', defaultSeverity: 'CRITICAL' },
  REPORT_SEVERE: { label: 'Signalement sévère', icon: '🚨', defaultSeverity: 'CRITICAL' },
  PAYMENT_FAILED: { label: 'Échec de paiement / virement', icon: '💳', defaultSeverity: 'HIGH' },
  PARCEL_INCIDENT: { label: 'Incident transporteur', icon: '📦', defaultSeverity: 'MEDIUM' },
  ACCOUNT_LOCKED: { label: 'Compte bloqué', icon: '🔒', defaultSeverity: 'HIGH' },
  IP_BLOCKED: { label: 'Adresse IP bloquée', icon: '🛡️', defaultSeverity: 'MEDIUM' },
  ACCOUNT_SECURED: { label: 'Compte sécurisé par l’utilisateur', icon: '🧯', defaultSeverity: 'HIGH' },
  PROVIDER_REVOKE_FAILED: { label: 'Révocation Apple / Google échouée', icon: '🔓', defaultSeverity: 'MEDIUM' },
};

export const adminAlertListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  type: adminAlertTypeSchema.optional(),
  severity: adminAlertSeveritySchema.optional(),
  isRead: z.enum(['true', 'false', 'all']).default('all'),
  q: z.string().trim().optional(),
});
export type AdminAlertListQuery = z.infer<typeof adminAlertListQuerySchema>;

export const adminAlertItemSchema = z.object({
  id: z.string().uuid(),
  type: adminAlertTypeSchema,
  severity: adminAlertSeveritySchema,
  title: z.string(),
  message: z.string(),
  targetType: adminAlertTargetTypeSchema,
  targetId: z.string(),
  link: z.string(),
  isRead: z.boolean(),
  readAt: z.string().datetime().nullable(),
  readByUserId: z.string().nullable(),
  readByUserName: z.string().nullable().optional(),
  emailSent: z.boolean(),
  emailSentAt: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
});
export type AdminAlertItem = z.infer<typeof adminAlertItemSchema>;

export const adminAlertListResponseSchema = z.object({
  items: z.array(adminAlertItemSchema),
  total: z.number().int().nonnegative(),
  unreadCount: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type AdminAlertListResponse = z.infer<typeof adminAlertListResponseSchema>;

export const adminAlertKpisSchema = z.object({
  unreadTotal: z.number().int().nonnegative(),
  criticalCount: z.number().int().nonnegative(),
  disputesCount: z.number().int().nonnegative(),
  paymentsCount: z.number().int().nonnegative(),
});
export type AdminAlertKpis = z.infer<typeof adminAlertKpisSchema>;

const adminAlertPreferencesBaseShape = {
  emailDisputes: z.boolean(),
  emailReports: z.boolean(),
  emailPayments: z.boolean(),
  emailParcels: z.boolean(),
  bellDisputes: z.boolean(),
  bellReports: z.boolean(),
  bellPayments: z.boolean(),
  bellParcels: z.boolean(),
};

export const adminAlertPreferencesSchema = z.object({
  emailDisputes: adminAlertPreferencesBaseShape.emailDisputes.default(true),
  emailReports: adminAlertPreferencesBaseShape.emailReports.default(true),
  emailPayments: adminAlertPreferencesBaseShape.emailPayments.default(true),
  emailParcels: adminAlertPreferencesBaseShape.emailParcels.default(true),
  bellDisputes: adminAlertPreferencesBaseShape.bellDisputes.default(true),
  bellReports: adminAlertPreferencesBaseShape.bellReports.default(true),
  bellPayments: adminAlertPreferencesBaseShape.bellPayments.default(true),
  bellParcels: adminAlertPreferencesBaseShape.bellParcels.default(true),
});
export type AdminAlertPreferences = z.infer<typeof adminAlertPreferencesSchema>;

export const adminAlertPreferencesPatchSchema = z.object(adminAlertPreferencesBaseShape).partial();
export type AdminAlertPreferencesPatch = z.infer<typeof adminAlertPreferencesPatchSchema>;
