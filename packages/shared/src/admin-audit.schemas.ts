import { z } from 'zod';
import {
  adminAuditActionSchema,
  type AdminAuditAction,
  ADMIN_AUDIT_ACTION_LABEL,
} from './admin.schemas.js';

export const adminAuditDomainSchema = z.enum([
  'COMMANDES',
  'USERS',
  'LITIGES_SIGNALEMENTS',
  'CATALOGUE_CONTENU',
  'MARKETING_PROMOS',
  'SECURITE_AUTH',
]);
export type AdminAuditDomain = z.infer<typeof adminAuditDomainSchema>;

/**
 * 🛑 TOTAL OVER `adminAuditActionSchema`, AND THE SPEC IS THE GATE. An action in no domain
 * falls back to SECURITE_AUTH in `getDomainForAction`: a payout retry or a cancellation
 * approval then read as a security event and never showed under their own tab. 37 of 91
 * actions were in that state (RU-24); `admin-audit-taxonomy.spec.ts` fails when an action
 * is in no domain, in two, or when a domain lists a string the enum does not know.
 */
export const ADMIN_AUDIT_DOMAINS: Record<
  AdminAuditDomain,
  { label: string; actions: AdminAuditAction[] }
> = {
  COMMANDES: {
    label: 'Commandes & Remboursements',
    actions: [
      'commande.parcel.issue_labels',
      'commande.shipment.retry',
      'commande.refund',
      'commande.refund_pay_share',
      'commande.cancel',
      'commande.abandon_stale',
      'cancellation.approve',
      'cancellation.refuse',
      'shipment.create',
      'shipment.remind',
      'payout.transfer_retry',
      'connect.sync',
      'connect.remind',
      'attention.dismiss',
      'export.generate',
    ],
  },
  USERS: {
    label: 'Utilisateurs & Réparateurs',
    actions: [
      'user.suspend',
      'user.reactivate',
      'user.unlock_login',
      'user.delete',
      'user.moderate',
      'user.note_add',
      'user.email_send',
      'user.password_reset',
      'repairer.verification_revoke',
      'repairer.verification_restore',
      'repairer.suspend',
      'repairer.reactivate',
      'payout.fiscal_remind',
      'user.fiscal_remind',
      'export.dac7_send_recaps',
      'identity.accept',
      'identity.refuse',
      'identity.request_documents',
      'admin.business_verify_approve',
      'admin.business_verify_refuse',
      'admin.business_verify_request_documents',
      'compliance.proof_verify',
      'compliance.proofs_view',
    ],
  },
  LITIGES_SIGNALEMENTS: {
    label: 'Litiges & Signalements',
    actions: [
      'report.assign',
      'report.unassign',
      'report.resolve',
      'conversation.close',
      'conversation.reopen',
      'conversation.read',
      'message.delete',
      'dispute.open',
      'dispute.assign',
      'dispute.unassign',
      'dispute.note',
      'dispute.resolve_release',
      'dispute.resolve_refund',
      'dispute.resolve_dismiss',
      'dispute.message',
    ],
  },
  CATALOGUE_CONTENU: {
    label: 'Catalogue & Contenu',
    actions: [
      'demande.category_change',
      'demande.hide',
      'demande.unhide',
      'demande.delete',
      'offer.moderate_delete',
      'review.delete',
      'review.hide',
      'review.restore',
      'category.reorder',
      'brand.delete',
      'model.delete',
      'fault_type.create',
      'fault_type.update',
      'fault_type.delete',
      'fault_type.reorder',
      'category.create',
      'category.create_sub',
      'category.update',
      'category.toggle_active',
      'brand.create',
      'brand.update',
      'model.create',
      'model.update',
      'tip.create',
      'tip.update',
      'tip.delete',
    ],
  },
  MARKETING_PROMOS: {
    label: 'Marketing & Promos',
    actions: [
      'promo.create',
      'promo.update_status',
      'broadcast.send',
    ],
  },
  SECURITE_AUTH: {
    label: 'Sécurité & Accès',
    actions: [
      'auth.admin.impersonate',
      'auth.admin.stop_impersonating',
      'auth.admin.other',
      'admin.role_change',
      'admin.2fa_reset',
      'admin.staff_invite',
      'admin.staff_invite_revoke',
      'admin.staff_invite_resend',
      'admin.staff_invite_accept',
      'admin.staff_remove',
      'settings.update',
      'legal_document.publish',
      'alert.mark_read',
      'alert.mark_all_read',
      'alert.update_preferences',
    ],
  },
};

export function getDomainForAction(action: string): AdminAuditDomain {
  for (const [domain, def] of Object.entries(ADMIN_AUDIT_DOMAINS)) {
    if ((def.actions as string[]).includes(action)) {
      return domain as AdminAuditDomain;
    }
  }
  return 'SECURITE_AUTH';
}

export function getActionLabel(action: string): string {
  return (ADMIN_AUDIT_ACTION_LABEL as Record<string, string>)[action] ?? action;
}

export const adminAuditListQuerySchema = z.object({
  q: z.string().trim().optional(),
  actorEmail: z.string().trim().optional(),
  domain: adminAuditDomainSchema.optional(),
  action: adminAuditActionSchema.optional(),
  targetType: z.string().trim().optional(),
  targetId: z.string().trim().optional(),
  statusCode: z.coerce.number().int().optional(),
  statusFamily: z.enum(['2xx', '4xx', '5xx']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(25),
});
export type AdminAuditListQuery = z.infer<typeof adminAuditListQuerySchema>;

export const adminAuditDetailedEntrySchema = z.object({
  id: z.string(),
  actorUserId: z.string().nullable(),
  actorEmail: z.string(),
  actorRole: z.string().nullable(),
  action: adminAuditActionSchema,
  actionLabel: z.string(),
  domain: adminAuditDomainSchema,
  targetType: z.string().nullable(),
  targetId: z.string().nullable(),
  statusCode: z.number().int(),
  detail: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.string(),
});
export type AdminAuditDetailedEntry = z.infer<typeof adminAuditDetailedEntrySchema>;

export const adminAuditListResponseSchema = z.object({
  items: z.array(adminAuditDetailedEntrySchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type AdminAuditListResponse = z.infer<typeof adminAuditListResponseSchema>;

export const adminAuditKpisSchema = z.object({
  actionsTodayCount: z.number().int().nonnegative(),
  uniqueActorsTodayCount: z.number().int().nonnegative(),
  topDomain: z.string(),
  totalActionsCount: z.number().int().nonnegative(),
});
export type AdminAuditKpis = z.infer<typeof adminAuditKpisSchema>;
