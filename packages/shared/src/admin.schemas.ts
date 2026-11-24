import { z } from 'zod';
import { usernameSchema } from './username.schemas.js';
import type { IdentityStatus, IdentityVariant, RedactionStatus } from './identity.schemas.js';
import type { IdentityDecision, IdentityDecisionMotif } from './identity-decision.js';
import type { ConnectStatus } from './connect.schemas.js';
import type { VerifiedBadge } from './offer.schemas.js';
import { cents, refundMotifSchema } from './refund.schemas.js';
import type { CancellationReason, CancellationRequestStatus } from './cancellation.js';
import type { CategoryDto } from './catalog.schemas.js';
import type { AdminRole } from './admin-permissions.js';
import type { PayoutStatus } from './payout.schemas.js';
import {
  disputeAttachmentInputSchema,
  type DisputeMotif,
  type DisputeStatusType,
  type DocumentDto,
} from './dispute.js';
import { MESSAGE_BODY_MAX } from './conversation.schemas.js';

export type { DisputeStatusType } from './dispute.js';

/**
 * Every audited admin action. Pieces B-F extend this list.
 *
 * The database column is a plain String on purpose: a Postgres enum would need a
 * migration for every action added, and Ch.8 has 48 of them across ten sub-sections.
 * This schema is the single source of truth, so a typo is a compile error rather than
 * a silently-written row. See the design spec §3.
 */
export const adminAuditActionSchema = z.enum([
  'commande.parcel.issue_labels',
  // Livraison Boxtal (spec §7.8): re-ordering a leg Boxtal refused, from /colis.
  'commande.shipment.retry',
  'commande.refund',
  // CF4-D task 5 (spec §3, §7). The operator's retry paying a réparateur an owed
  // partial-refund share once the client's refund has settled.
  'commande.refund_pay_share',
  'review.delete',
  // Piece B1, Ch.8 §8.2. Written by AdminController handlers, so
  // admin-audit-coverage.spec.ts enforces that each has its @Audit.
  'user.suspend',
  'user.reactivate',
  // V7 A11 (U2): lifting a login / code lock-out from the user sheet.
  'user.unlock_login',
  'user.delete',
  'user.moderate',
  'user.note_add',
  'user.email_send',
  'user.password_reset',
  'user.fiscal_remind',
  // 🛑 Piece B1's BRIDGE actions, written from Better Auth's hooks.after rather than
  // from AdminController - so the coverage gate structurally cannot see them, and
  // admin-auth-lockdown.spec.ts is what guards this half. `other` exists so a Better
  // Auth upgrade that adds an /admin/* endpoint still produces a CONSTRAINED row with
  // the path recoverable from `detail`, rather than a refused write. Design §3.2.
  'auth.admin.impersonate',
  'auth.admin.stop_impersonating',
  'auth.admin.other',
  // Piece B2, Ch.8 §8.3. Written by AdminController handlers, so
  // admin-audit-coverage.spec.ts enforces that each has its @Audit.
  //
  // `repairer.` rather than `user.`, even though the target is a User row: these act on the
  // réparateur SIDE of a two-mode account, and an operator reading the log needs to see at a
  // glance that a suspension left the person's client side alone.
  'repairer.verification_revoke',
  'repairer.verification_restore',
  'repairer.suspend',
  'repairer.reactivate',
  // Piece C1, Ch.8 §8.4. Written by AdminController handlers, so
  // admin-audit-coverage.spec.ts enforces that each has its @Audit.
  //
  // `demande.` and not `content.`: these act on one row of one model, and an operator
  // reading the log needs the target type without opening the row.
  //
  // 🛑 `hide` and `delete` are SEPARATE actions and not one action with a flag, because
  // they are separately reversible: unhide exists and undelete deliberately does not.
  // A single `demande.moderate` would make the log unable to answer « was this recoverable ».
  'demande.category_change',
  'demande.hide',
  'demande.unhide',
  'demande.delete',
  // Piece C2, Ch.8 §8.8 (Gestion des signalements).
  'report.assign',
  'report.unassign',
  'report.resolve',
  'conversation.close',
  'conversation.reopen',
  'conversation.read',
  'message.delete',
  // Piece C3, Ch.8 §8.5 (Gestion des offres).
  'offer.moderate_delete',
  // Piece D, Ch.8 §8.7 (Gestion des litiges).
  'dispute.open',
  'dispute.assign',
  'dispute.unassign',
  'dispute.note',
  'dispute.resolve_release',
  'dispute.resolve_refund',
  'dispute.resolve_dismiss',
  'dispute.message',
  // Stage 6 Piece E, Ch.8 §8.9 (Gestion des catégories, marques, modèles).
  'category.create',
  'category.create_sub',
  'category.update',
  'category.toggle_active',
  'category.reorder',
  'brand.create',
  'brand.update',
  'brand.delete',
  'model.create',
  'model.update',
  'model.delete',
  // Feature F12 (Types de panne)
  'fault_type.create',
  'fault_type.update',
  'fault_type.delete',
  'fault_type.reorder',
  // CF4-38 (sub-project L), « Conseils du jour ». Written by AdminController handlers.
  'tip.create',
  'tip.update',
  'tip.delete',
  // CF4-37 (sub-project L), « Avis ». `review.delete` above STAYS: historical audit rows carry
  // it, though its route is removed (a hide now requires a motif and is reversible).
  'review.hide',
  'review.restore',
  // CF4-39 (sub-project M), « Vérification d'identité ». Written by AdminController handlers.
  'identity.accept',
  'identity.refuse',
  'identity.request_documents',
  // CF4-40 / CF4-41 (sub-project N), « Administration - droits et sécurité ».
  'admin.role_change',
  'admin.2fa_reset',
  // CF5-09 (Staff accounts & invitation flow)
  'admin.staff_invite',
  'admin.staff_invite_revoke',
  'admin.staff_invite_resend',
  'admin.staff_invite_accept',
  'admin.staff_remove',
  // CF4-27 (sub-project I), client cancellation. Written by AdminController handlers.
  'cancellation.refuse',
  'cancellation.approve',
  // CF5-07 Professional business verification operator decisions.
  'admin.business_verify_approve',
  'admin.business_verify_refuse',
  'admin.business_verify_request_documents',
  // CF6-19 Compliance proof verification
  'compliance.proof_verify',
  // CF6-19 Reading the proofs list: it exposes e-mail, IP address and user agent.
  'compliance.proofs_view',
  // Bug B3: Cancel commande without Stripe charge
  'commande.cancel',
  // P11: Abandon stale pending payment orders
  'commande.abandon_stale',
  // P15: Dismiss attention item
  'attention.dismiss',
  // P16: Shipment operations
  'shipment.remind',
  'shipment.create',
  // F5: Versements réparateurs
  'payout.transfer_retry',
  'payout.fiscal_remind',
  'connect.sync',
  'connect.remind',
  // F6: Exports comptables
  'export.generate',
  'export.dac7_send_recaps',
  // F7: Alertes admin
  'alert.mark_read',
  'alert.mark_all_read',
  'alert.update_preferences',
  // F10: Réglages plateforme
  'settings.update',
  // V7 D5 (U9b): a CGU or mentions légales version published from Réglages.
  'legal_document.publish',
  // F2 (notifications hub) and F3 (codes promo). RU-24: both were written by hand into the
  // audit table with strings this enum did not know, so the journal could not filter them.
  'promo.create',
  'promo.update_status',
  'broadcast.send',
]);
export type AdminAuditAction = z.infer<typeof adminAuditActionSchema>;
export const ADMIN_AUDIT_ACTIONS = adminAuditActionSchema.options;

/**
 * A KPI is either a measured number or DELIBERATELY unavailable, with a reason.
 *
 * 🛑 Deliberately NOT `number | null`. A bug producing `null` would render as
 * "deliberately unavailable", which is a false claim about the platform - the same
 * shape as slice 19's `boolean | null`, where a stray `?? false` could restore the
 * defect. The discriminant makes unavailability unforgeable: you cannot arrive at
 * `{ kind: 'unavailable' }` by dropping a value.
 */
export type KpiValue =
  | { kind: 'value'; value: number; mom?: number | null }
  | { kind: 'unavailable'; reason: string };

export const kpi = (value: number, mom?: number | null): KpiValue => ({
  kind: 'value',
  value,
  ...(mom !== undefined ? { mom } : {}),
});
export const kpiUnavailable = (reason: string): KpiValue => ({ kind: 'unavailable', reason });

const NOT_APPLICABLE = 'Non applicable';

const countFormatter = new Intl.NumberFormat('fr-FR');
const centsFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

export function formatKpiCount(v: KpiValue): string {
  return v.kind === 'value' ? countFormatter.format(v.value) : NOT_APPLICABLE;
}

export function formatKpiCents(v: KpiValue): string {
  return v.kind === 'value' ? centsFormatter.format(v.value / 100) : NOT_APPLICABLE;
}

/** Derived, never stored: two stored fields can disagree where one derived value cannot. */
export const auditOk = (statusCode: number): boolean => statusCode < 400;

/** §8.1's six groups, in the client's own order. */
export type AdminOverview = {
  pendingActions: AdminPendingActions;
  users: { total: KpiValue; recent: KpiValue; active: KpiValue; suspended: KpiValue };
  repairers: {
    total: KpiValue;
    verified: KpiValue;
    pendingVerification: KpiValue;
    suspended: KpiValue;
    /**
     * V8 E1 (criterion 8). Repairers whose setup journey is complete, and the rest of « total ». Optional: an API
     * older than the dashboard omits them, and the tiles then read unavailable.
     */
    setupComplete?: KpiValue;
    setupIncomplete?: KpiValue;
  };
  demandes: { published: KpiValue; inProgress: KpiValue; done: KpiValue };
  offers: {
    sent: KpiValue;
    accepted: KpiValue;
    rejected: KpiValue;
    withdrawn: KpiValue;
  };
  payments: { volumeCents: KpiValue; commissionCents: KpiValue; pending: KpiValue; refunded: KpiValue };
  disputes: { open: KpiValue; inReview: KpiValue; closed: KpiValue };
  trends30d: AdminOverviewTrends;
  /**
   * The demo/test banner's inputs, MEASURED rather than hardcoded, so the banner
   * disappears on its own when the cast is purged or a live key is installed.
   */
  context: {
    demoAccounts: number;
    /**
     * Accounts created by the INTEGRATION test suite, which writes to the live
     * database. Distinct from demoAccounts on purpose: the demo cast is
     * deliberate, whereas fixtures in production are an anomaly, and a non-zero
     * value here is the signal that the int suite ran against live data.
     */
    testFixtureAccounts: number;
    stripeTestMode: boolean;
    recentWindowDays: number;
  };
};

export type AdminAuditEntry = {
  id: string;
  actorEmail: string;
  action: AdminAuditAction;
  targetType: string | null;
  targetId: string | null;
  statusCode: number;
  createdAt: string;
};

/** P1: Pending action counts for high-priority operational queues. */
export const adminPendingActionsSchema = z.object({
  litiges: z.number().int().nonnegative(),
  verifications: z.number().int().nonnegative(),
  signalements: z.number().int().nonnegative(),
  annulations: z.number().int().nonnegative(),
  attention: z.number().int().nonnegative(),
  stalePayments: z.number().int().nonnegative(),
});

export type AdminPendingActions = z.infer<typeof adminPendingActionsSchema>;

/** P4: Daily time-series point for 30-day analytics trends. */
export const adminDailyPointSchema = z.object({
  date: z.string(), // ISO string YYYY-MM-DD
  value: z.number().nonnegative(),
});
export type AdminDailyPoint = z.infer<typeof adminDailyPointSchema>;

export const adminOverviewTrendsSchema = z.object({
  revenue: z.array(adminDailyPointSchema).length(30),
  demandes: z.array(adminDailyPointSchema).length(30),
});
export type AdminOverviewTrends = z.infer<typeof adminOverviewTrendsSchema>;

export const kpiValueSchema = z.union([
  z.object({
    kind: z.literal('value'),
    value: z.number(),
    mom: z.number().nullable().optional(),
  }),
  z.object({ kind: z.literal('unavailable'), reason: z.string() }),
]);

export const kpiSchema = kpiValueSchema;

export const adminOverviewSchema = z.object({
  pendingActions: adminPendingActionsSchema,
  users: z.object({ total: kpiValueSchema, recent: kpiValueSchema, active: kpiValueSchema, suspended: kpiValueSchema }),
  repairers: z.object({
    total: kpiValueSchema,
    verified: kpiValueSchema,
    pendingVerification: kpiValueSchema,
    suspended: kpiValueSchema,
    setupComplete: kpiValueSchema.optional(),
    setupIncomplete: kpiValueSchema.optional(),
  }),
  demandes: z.object({ published: kpiValueSchema, inProgress: kpiValueSchema, done: kpiValueSchema }),
  offers: z.object({
    sent: kpiValueSchema,
    accepted: kpiValueSchema,
    rejected: kpiValueSchema,
    withdrawn: kpiValueSchema,
  }),
  payments: z.object({ volumeCents: kpiValueSchema, commissionCents: kpiValueSchema, pending: kpiValueSchema, refunded: kpiValueSchema }),
  disputes: z.object({ open: kpiValueSchema, inReview: kpiValueSchema, closed: kpiValueSchema }),
  trends30d: adminOverviewTrendsSchema,
  context: z.object({
    demoAccounts: z.number().int().nonnegative(),
    testFixtureAccounts: z.number().int().nonnegative(),
    stripeTestMode: z.boolean(),
    recentWindowDays: z.number().int().positive(),
  }),
});

/** UI3: Notification badges for action-required queues in the admin sidebar. */
export const adminBadgeCountsSchema = z.object({
  litiges: z.number().int().nonnegative(),
  annulations: z.number().int().nonnegative(),
  attention: z.number().int().nonnegative(),
  signalements: z.number().int().nonnegative(),
  verifications: z.number().int().nonnegative(),
  /** Pending staff invitations: information only, drawn grey in the sidebar. */
  equipe: z.number().int().nonnegative(),
});

export type AdminBadgeCounts = z.infer<typeof adminBadgeCountsSchema>;

/** UI4: Global search results across orders, users, and disputes. */
export const adminSearchResultItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  badge: z.string().optional(),
  href: z.string(),
});

export const adminSearchResultSchema = z.object({
  commandes: z.array(adminSearchResultItemSchema),
  users: z.array(adminSearchResultItemSchema),
  demandes: z.array(adminSearchResultItemSchema),
  disputes: z.array(adminSearchResultItemSchema),
});

export type AdminSearchResultItem = z.infer<typeof adminSearchResultItemSchema>;
export type AdminSearchResult = z.infer<typeof adminSearchResultSchema>;

export const adminSearchCategorySchema = z.enum([
  'all',
  'commandes',
  'users',
  'demandes',
  'disputes',
]);
export type AdminSearchCategory = z.infer<typeof adminSearchCategorySchema>;

export const ADMIN_SEARCH_CATEGORY_LABELS: Record<
  AdminSearchCategory,
  { label: string; icon: string }
> = {
  all: { label: 'Tous les résultats', icon: '🔍' },
  commandes: { label: 'Commandes', icon: '📦' },
  users: { label: 'Utilisateurs', icon: '👤' },
  demandes: { label: 'Demandes', icon: '🛠️' },
  disputes: { label: 'Litiges', icon: '⚖️' },
};

export const adminSearchDetailedItemSchema = adminSearchResultItemSchema.extend({
  category: z.enum(['commande', 'user', 'demande', 'dispute']),
  snippet: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AdminSearchDetailedItem = z.infer<typeof adminSearchDetailedItemSchema>;

export const adminSearchQuerySchema = z.object({
  q: z
    .string()
    .default('')
    .transform((s) => s.trim().slice(0, 100)),
  category: adminSearchCategorySchema.default('all'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;

export const adminSearchDetailedResponseSchema = z.object({
  query: z.string(),
  category: adminSearchCategorySchema,
  total: z.number().int().nonnegative(),
  counts: z.object({
    all: z.number().int().nonnegative(),
    commandes: z.number().int().nonnegative(),
    users: z.number().int().nonnegative(),
    demandes: z.number().int().nonnegative(),
    disputes: z.number().int().nonnegative(),
  }),
  items: z.array(adminSearchDetailedItemSchema),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});
export type AdminSearchDetailedResponse = z.infer<typeof adminSearchDetailedResponseSchema>;

/** CF-47's scrub writes this exact banReason. §8.1's KPI #4 and #8 exclude it. */
export const DELETED_BAN_REASON = 'account_deleted';

/**
 * §8.2's « Statut du compte ».
 *
 * 🛑 Deliberately NOT a boolean or a nullable string, for the same reason `KpiValue`
 * is not `number | null`: three states with different meanings cannot be recovered
 * from one flag, and a bug must not be able to render « Actif » by dropping a value.
 */
export type AdminUserStatus =
  | { kind: 'active' }
  | { kind: 'suspended'; reason: string | null; until: string | null }
  | { kind: 'deleted'; at: string };

const statusDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * No `default` arm on purpose: adding a member to AdminUserStatus must be a COMPILE
 * error here rather than a silent fall-through to a wrong label.
 */
export function formatAdminUserStatus(s: AdminUserStatus): string {
  switch (s.kind) {
    case 'active':
      return 'Actif';
    case 'suspended': {
      // `until` is Better Auth's banExpires. It matters because an EXPIRED ban is only
      // cleared on the next sign-in attempt, so the row still reads banned meanwhile.
      if (s.until === null) {
        return 'Suspendu';
      }
      const untilDate = new Date(s.until);
      if (untilDate <= new Date()) {
        return `Suspension expirée le ${statusDateFormatter.format(untilDate)}`;
      }
      return `Suspendu jusqu'au ${statusDateFormatter.format(untilDate)}`;
    }
    case 'deleted':
      return `Supprimé le ${statusDateFormatter.format(new Date(s.at))}`;
  }
}

export const VERIFICATION_LEVEL_LABEL: Record<AdminVerificationLevel, string> = {
  NONE: 'Non vérifié',
  BASIC: 'Basique',
  IDENTITY: 'Identité vérifiée',
  BUSINESS: 'Professionnel',
};

export const ADMIN_AUDIT_ACTION_LABEL: Record<AdminAuditAction, string> = {
  'commande.parcel.issue_labels': 'Émission d\'étiquettes',
  'commande.shipment.retry': 'Relance d\'une expédition Boxtal',
  'commande.refund': 'Remboursement',
  'commande.refund_pay_share': 'Versement de la part réparateur',
  'commande.cancel': "Annulation de commande sans paiement",
  'commande.abandon_stale': 'Abandon de paiements périmés',
  'review.delete': 'Suppression d\'avis',
  'user.suspend': 'Suspension',
  'user.reactivate': 'Réactivation',
  'user.unlock_login': 'Déblocage de connexion',
  'user.delete': 'Suppression de compte',
  'user.moderate': 'Modération',
  'user.note_add': 'Ajout d\'une note interne',
  'user.email_send': 'Envoi d\'un e-mail',
  'user.password_reset': 'Réinitialisation du mot de passe',
  'user.fiscal_remind': 'Relance fiscale individuelle',
  'auth.admin.impersonate': 'Usurpation d\'identité',
  'auth.admin.stop_impersonating': 'Fin d\'usurpation',
  'auth.admin.other': 'Action administrative',
  'repairer.verification_revoke': 'Révocation de vérification',
  'repairer.verification_restore': 'Annulation de révocation',
  'repairer.suspend': 'Suspension du mode réparateur',
  'repairer.reactivate': 'Réactivation du mode réparateur',
  // Piece C1, Ch.8 §8.4. Rendered on both fiches' timelines and on the overview's
  // « Dernières actions », so each names the OBJECT: an operator scanning the log must
  // see at a glance that this acted on a listing, not on a person.
  'demande.category_change': 'Changement de catégorie',
  'demande.hide': 'Masquage de la demande',
  'demande.unhide': 'Réaffichage de la demande',
  'demande.delete': 'Suppression de la demande',
  // Piece C2, Ch.8 §8.8 (Gestion des signalements).
  'report.assign': 'Prise en charge d\'un signalement',
  'report.unassign': 'Libération d\'un signalement',
  'report.resolve': 'Clôture d\'un signalement',
  'conversation.close': 'Clôture modération conversation',
  'conversation.reopen': 'Réouverture conversation',
  'conversation.read': "Consultation d'une conversation",
  'message.delete': 'Suppression d\'un message',
  // Piece C3, Ch.8 §8.5 (Gestion des offres).
  'offer.moderate_delete': 'Retrait d\'une offre',
  // Piece D, Ch.8 §8.7 (Gestion des litiges).
  'dispute.open': 'Ouverture d\'un litige',
  'dispute.assign': 'Assignation d\'un litige',
  'dispute.unassign': 'Désassignation d\'un litige',
  'dispute.note': 'Ajout d\'une note interne de litige',
  'dispute.resolve_release': 'Arbitrage litige : paiement au réparateur',
  'dispute.resolve_refund': 'Arbitrage litige : remboursement client',
  'dispute.resolve_dismiss': 'Arbitrage litige : la réparation reprend',
  'dispute.message': 'Message dans un litige',
  // Stage 6 Piece E, Ch.8 §8.9 (Gestion des catégories, marques, modèles).
  'category.create': 'Création d\'une catégorie',
  'category.create_sub': 'Création d\'une sous-catégorie',
  'category.update': 'Modification d\'une catégorie',
  'category.toggle_active': 'Activation / Désactivation de catégorie',
  'category.reorder': 'Réorganisation des catégories',
  'brand.create': 'Création d\'une marque',
  'brand.update': 'Modification d\'une marque',
  'brand.delete': 'Suppression d\'une marque',
  'model.create': 'Création d\'un modèle',
  'model.update': 'Modification d\'un modèle',
  'model.delete': 'Suppression d\'un modèle',
  // Feature F12 (Types de panne)
  'fault_type.create': "Création d'un type de panne",
  'fault_type.update': "Modification d'un type de panne",
  'fault_type.delete': "Suppression d'un type de panne",
  'fault_type.reorder': "Réordonnancement des types de panne",
  // CF4-38 (sub-project L).
  'tip.create': 'Création de conseil',
  'tip.update': 'Modification de conseil',
  'tip.delete': 'Suppression de conseil',
  'review.hide': 'Masquage d\'avis',
  'review.restore': 'Rétablissement d\'avis',
  // CF4-39 (sub-project M).
  'identity.accept': 'Acceptation manuelle d\'identité',
  'identity.refuse': 'Refus d\'identité',
  'identity.request_documents': 'Demande de nouveaux documents',
  // CF4-40 / CF4-41 (sub-project N).
  'admin.role_change': 'Changement de rôle',
  'admin.2fa_reset': 'Réinitialisation de la double authentification',
  // CF5-09 (Staff accounts & invitation flow)
  'admin.staff_invite': "Invitation d'un collaborateur",
  'admin.staff_invite_revoke': "Révocation d'une invitation",
  'admin.staff_invite_resend': "Renvoi d'une invitation",
  'admin.staff_invite_accept': "Acceptation d'une invitation",
  'admin.staff_remove': "Révocation des droits d'équipe",
  'cancellation.refuse': "Refus d'annulation",
  'cancellation.approve': "Acceptation d'annulation",
  // CF5-07 Professional business verification operator decisions.
  'admin.business_verify_approve': "Validation d'entreprise",
  'admin.business_verify_refuse': "Refus d'entreprise",
  'admin.business_verify_request_documents': "Demande de justificatifs d'entreprise",
  'compliance.proof_verify': "Vérification d'intégrité de preuve de conformité",
  'compliance.proofs_view': 'Consultation des preuves de conformité',
  'attention.dismiss': 'Commande retirée de la surveillance',
  'shipment.remind': 'Relance dépôt de colis envoyée',
  'shipment.create': 'Étiquette de transport générée',
  'payout.transfer_retry': 'Tentative de versement réparateur',
  'payout.fiscal_remind': 'Campagne de relances fiscales (DAC7)',
  'connect.sync': 'Synchronisation compte Stripe Connect',
  'connect.remind': 'Relance configuration Stripe Connect',
  'export.generate': 'Export comptable généré',
  'export.dac7_send_recaps': 'Envoi des récapitulatifs fiscaux DAC7',
  'alert.mark_read': 'Alerte marquée comme lue',
  'alert.mark_all_read': 'Toutes les alertes marquées comme lues',
  'alert.update_preferences': "Préférences d'alerte mises à jour",
  'settings.update': 'Mise à jour des réglages plateforme',
  'legal_document.publish': "Publication d'une version des CGU ou des mentions légales",
  'promo.create': 'Création d\'un code promo',
  'promo.update_status': 'Pause ou réactivation d\'un code promo',
  'broadcast.send': 'Envoi d\'une diffusion (e-mail ou notification)',
};

/**
 * P16: Admin create shipment schema for manual or carrier-selected label generation.
 */
export const adminCreateShipmentSchema = z.object({
  leg: z.enum(['OUTBOUND', 'INBOUND', 'RETURN']).default('OUTBOUND'),
  carrier: z.enum(['mondial_relay', 'colissimo', 'chronopost']),
  weightGrams: z.number().int().positive().optional(),
});
export type AdminCreateShipmentInput = z.infer<typeof adminCreateShipmentSchema>;

/**
 * Demande status labels, operator-facing. Matches `OFFER_STATUS_LABEL`'s style.
 */
export const DEMANDE_STATUS_LABEL: Record<'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED', string> = {
  OPEN: 'Ouverte',
  IN_PROGRESS: 'En cours',
  DONE: 'Terminée',
  CANCELLED: 'Annulée',
};

/**
 * Commande status labels, operator-facing. Matches `OFFER_STATUS_LABEL`'s style.
 */
export const COMMANDE_STATUS_LABEL: Record<'PENDING_PAYMENT' | 'PAID' | 'ABANDONED' | 'REFUNDED', string> = {
  PENDING_PAYMENT: 'En attente de paiement',
  PAID: 'Payé',
  ABANDONED: 'Abandonnée',
  REFUNDED: 'Remboursée',
};

/**
 * Human-readable French labels for audited target entity types.
 */
export const TARGET_TYPE_LABEL: Record<string, string> = {
  user: 'Utilisateur',
  repairer: 'Réparateur',
  demande: 'Demande',
  dispute: 'Litige',
  commande: 'Commande',
  report: 'Signalement',
  review: 'Avis',
  category: 'Catégorie',
  brand: 'Marque',
  model: 'Modèle',
  tip: 'Conseil',
  staff: 'Collaborateur',
  compliance: 'Conformité',
  cancellation: 'Annulation',
  offer: 'Offre',
  alert: 'Alerte',
  settings: 'Réglages',
  PlatformSettings: 'Réglages plateforme',
};

export type AdminVerificationLevel = 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';

/** Computed from the email suffix, never stored. Case-sensitive, per §6's stated limit. */
export type AdminAccountMarker = 'demo' | 'fixture' | 'review' | null;

export const adminUserRepairerMetricsSchema = z.object({
  rating: z.number().nullable(),
  reviewCount: z.number(),
  repairsCount: z.number(),
  totalRevenueCents: z.number(),
});
export type AdminUserRepairerMetrics = z.infer<typeof adminUserRepairerMetricsSchema>;

export const adminUserDeletionMetaSchema = z.object({
  deletedAt: z.string(),
  deletedReason: z.string().nullable(),
  deletedBy: z.string().nullable(),
});
export type AdminUserDeletionMeta = z.infer<typeof adminUserDeletionMetaSchema>;

export const adminUserSummaryKpisSchema = z.object({
  demandesCount: z.number(),
  repairsCompletedCount: z.number(),
  totalSpentCents: z.number(),
  totalRevenueCents: z.number(),
  averageRating: z.number().nullable(),
  reviewCount: z.number(),
  disputesCount: z.number(),
  reportsCount: z.number(),
});
export type AdminUserSummaryKpis = z.infer<typeof adminUserSummaryKpisSchema>;

export const adminUserInternalNoteSchema = z.object({
  id: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  content: z.string(),
  createdAt: z.string(),
});
export type AdminUserInternalNote = z.infer<typeof adminUserInternalNoteSchema>;

export const adminInternalNoteInputSchema = z.object({
  content: z.string().trim().min(2, "La note ne peut pas être vide.").max(2000, "Note trop longue."),
});
export type AdminInternalNoteInput = z.infer<typeof adminInternalNoteInputSchema>;

export const adminUserFiscalAuditEntrySchema = z.object({
  id: z.string(),
  fieldName: z.string(),
  oldValue: z.string().nullable(),
  newValue: z.string().nullable(),
  changedAt: z.string(),
});
export type AdminUserFiscalAuditEntry = z.infer<typeof adminUserFiscalAuditEntrySchema>;

/**
 * `legalName` and `birthDate` are what REVIME holds on the account, DECLARED by the réparateur: nothing
 * reads Stripe Identity's verified name or date of birth back (RU-27 `ISS-052`, RU-29), so the block
 * says « déclaré » and carries no `✓ Stripe Identity` source.
 */
export const adminUserFiscalDataSchema = z.object({
  /** The golden rule's own answer (`isFiscalComplete`), not just « a declaration was submitted ». */
  isComplete: z.boolean(),
  legalName: z.string().nullable(),
  birthDate: z.string().nullable(),
  address: z.string().nullable(),
  nif: z.string().nullable(),
  hasNoNif: z.boolean(),
  birthCity: z.string().nullable(),
  birthCountry: z.string().nullable(),
  siret: z.string().nullable(),
  vatNumber: z.string().nullable(),
  /** `•••• 0412`: the last four characters Stripe holds for the payout account, null before a sync saw one. */
  maskedIban: z.string().nullable(),
  reminderCount: z.number(),
  lastReminderAt: z.string().nullable(),
  auditLogs: z.array(adminUserFiscalAuditEntrySchema),
});
export type AdminUserFiscalData = z.infer<typeof adminUserFiscalDataSchema>;

export const adminUserFiscalRemindResponseSchema = z.object({
  success: z.boolean(),
  reminderCount: z.number(),
  lastReminderAt: z.string(),
});
export type AdminUserFiscalRemindResponse = z.infer<typeof adminUserFiscalRemindResponseSchema>;

export const PARTICULAR_QUOTA_MAX_MISSIONS = 10 as const;
export const PARTICULAR_QUOTA_MAX_CENTS = 150000 as const; // 1 500 € (CGU art. 53)

export const adminParticularQuotaSchema = z.object({
  missionsCount: z.number().int().nonnegative(),
  missionsMax: z.number().int().positive(),
  amountCollectedCents: z.number().int().nonnegative(),
  amountMaxCents: z.number().int().positive(),
  nextMissionReleaseAt: z.string().nullable(),
  pendingPayoutCents: z.number().int().nonnegative(),
  isBlockedFiscal: z.boolean(),
});
export type AdminParticularQuota = z.infer<typeof adminParticularQuotaSchema>;

export const adminSendUserEmailSchema = z.object({
  subject: z.string().trim().min(3, "L'objet doit comporter au moins 3 caractères.").max(200, "Objet trop long."),
  message: z.string().trim().min(5, "Le message doit comporter au moins 5 caractères.").max(5000, "Message trop long."),
});
export type AdminSendUserEmailInput = z.infer<typeof adminSendUserEmailSchema>;

export type AdminUserListItem = {
  userId: string;
  name: string;
  username: string;
  email: string;
  phone: string | null;
  createdAt: string;
  status: AdminUserStatus;
  modes: { client: boolean; repairer: boolean };
  verificationLevel: AdminVerificationLevel;
  marker: AdminAccountMarker;
  /** CF4-40. The account's staff role, or null when it is not part of the team. */
  staffRole: AdminRole | null;
  /**
   * Réparateur-shaped columns for `?type=reparateur`. Optional so client-shaped rows are
   * unchanged. Piece B2, Task 11.
   */
  repairer?: {
    displayName: string;
    publicBadge: VerifiedBadge | null;
    suspended: boolean;
    postalCode: string | null;
  };
  repairerMetrics?: AdminUserRepairerMetrics;
  deletionMeta?: AdminUserDeletionMeta;
};

export const adminUserListItemSchema = z.object({
  userId: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  createdAt: z.string(),
  status: z.custom<AdminUserStatus>(),
  modes: z.object({ client: z.boolean(), repairer: z.boolean() }),
  verificationLevel: z.custom<AdminVerificationLevel>(),
  marker: z.custom<AdminAccountMarker>(),
  staffRole: z.custom<AdminRole | null>(),
  repairer: z
    .object({
      displayName: z.string(),
      publicBadge: z.custom<VerifiedBadge | null>(),
      suspended: z.boolean(),
      postalCode: z.string().nullable(),
    })
    .optional(),
  repairerMetrics: adminUserRepairerMetricsSchema.optional(),
  deletionMeta: adminUserDeletionMetaSchema.optional(),
});

export type AdminUserListResponse = {
  items: AdminUserListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** One row of §8.2's « historique d'activité ». `admin` rows come from AdminAuditLog. */
export type AdminUserActivityEntry = {
  kind: 'demande' | 'offre' | 'commande' | 'avis' | 'signalement' | 'admin';
  id: string;
  label: string;
  at: string;
  action?: AdminAuditAction;
  statusCode?: number;
  /**
   * 🛑 A FIELD, not a substring of `label`. B1's fiche recovered this with
   * `entry.label.split(' par ')[1]` against a label the API composed, coupling two sides
   * by an untested string format whose drift renders « Suspension par undefined ».
   * Roadmap follow-up #6 (B1's list). Present only on `admin` rows.
   */
  actorEmail?: string;
};

export type AdminUserDetail = {
  userId: string;
  identity: { name: string; firstName: string | null; lastName: string | null; username: string };
  contact: { email: string; emailVerified: boolean; phone: string | null; phoneVerified: boolean };
  account: {
    clientEnabled: boolean;
    repairerEnabled: boolean;
    activeMode: 'CLIENT' | 'REPAIRER';
    role: string | null;
  };
  createdAt: string;
  /**
   * 🛑 Three of Ch.8's nine fiche fields are TWO-SIDED here, because this product is
   * « un compte, deux modes » and 13 of 21 accounts have a RepairerProfile. One
   * « Nombre de réparations » would be wrong for anyone who is both. Design §5.
   */
  counts: {
    demandes: number;
    repairsPerformed: number;
    repairsReceived: number;
    reviewsReceived: number;
    reviewsWritten: number;
    reportsAgainst: number;
    reportsMade: number;
  };
  status: AdminUserStatus;
  verificationLevel: AdminVerificationLevel;
  marker: AdminAccountMarker;
  /**
   * §8.3's réparateur block. 🛑 Null when there is no `RepairerProfile` row, or when réparateur
   * mode is off AND no suspension is recorded - NOT « when the account has never enabled
   * réparateur mode », which is what this said and which the API never tested. The full
   * reasoning is on `AdminRepairerBlock` below.
   */
  repairer: AdminRepairerBlock | null;
  /**
   * CF4-39 (sub-project M, spec §4.6). The operator's decision on the CURRENT identity session,
   * shown beside revoke / restore. null when undecided or when there is no identity row.
   */
  identityDecision: {
    decision: IdentityDecision;
    motif: IdentityDecisionMotif | null;
    note: string | null;
    /** ISO 8601. */
    decidedAt: string;
  } | null;
  /** CF4-40. The account's staff role, or null when it is not part of the team. */
  staffRole: AdminRole | null;
  /** Newest first. Merged: this user's own activity and admin actions taken ON them. */
  history: AdminUserActivityEntry[];
  summaryKpis: AdminUserSummaryKpis;
  internalNotes: AdminUserInternalNote[];
  tabsData?: {
    orders: Array<{ id: string; role: 'CLIENT' | 'REPAIRER'; title: string; totalCents: number; status: string; createdAt: string }>;
    payments: Array<{ id: string; commandeId: string; amountCents: number; status: string; createdAt: string }>;
    disputes: Array<{ id: string; number: number; commandeId: string; status: string; reason: string; createdAt: string }>;
    reviews: Array<{ id: string; rating: number; comment: string | null; role: 'RECEIVED' | 'WRITTEN'; createdAt: string }>;
    reports: Array<{ id: string; conversationId: string; role: 'AGAINST' | 'MADE'; reason: string; createdAt: string; resolvedAt: string | null }>;
    sessions: Array<{ id: string; createdAt: string; ipAddress: string | null; userAgent: string | null }>;
  };
  /** Null for an account with no réparateur profile and no declaration, and for a staff role without `payments.manage`. */
  fiscal: AdminUserFiscalData | null;
  /** Null unless the account is an individual réparateur. */
  particularQuota: AdminParticularQuota | null;
  /** V7 A11 (U2). Absent from an older API; null for a deleted account. */
  loginLock?: AdminUserLoginLock | null;
};

export type AdminLockScope = 'LOGIN_ACCOUNT' | 'CODE_ACCOUNT';

/** V7 A11 (U2). The user sheet's « Blocage de connexion » block. */
export type AdminUserLoginLock = {
  /** Locks in force now: the password login, the code checks, or both. Empty when nothing is locked. */
  active: Array<{ scope: AdminLockScope; level: number; /** ISO 8601. */ lockedUntil: string }>;
  /** Newest first, at most 20. */
  history: Array<{
    id: string;
    /** V7 U2b: SECURED is a « Ce n'est pas moi ». Absent from an older API, meaning LOCK. */
    kind?: 'LOCK' | 'SECURED';
    scope: AdminLockScope;
    level: number;
    /** ISO 8601. */
    lockedUntil: string;
    /** ISO 8601. */
    createdAt: string;
    /** ISO 8601, when an admin or a password reset lifted it early. */
    unlockedAt: string | null;
    unlockReason: 'ADMIN' | 'PASSWORD_RESET' | null;
  }>;
};

export const adminSuspendUserSchema = z.object({
  reason: z
    .string({ message: 'Indiquez un motif de suspension.' })
    .trim()
    .min(3, 'Indiquez un motif de suspension.')
    .max(200, 'Motif trop long.')
    .refine((r) => r !== DELETED_BAN_REASON, {
      message: '« account_deleted » est réservé aux comptes supprimés et ne peut pas servir de motif.',
    }),
  /** Better Auth's banExpires. Absent means a permanent suspension. */
  until: z
    .iso
    .datetime({ message: 'Format de date invalide.' })
    .refine((d) => new Date(d) > new Date(), {
      message: 'La date de fin de suspension doit être dans le futur.',
    })
    .optional(),
});
export type AdminSuspendUserInput = z.infer<typeof adminSuspendUserSchema>;

export const adminModerateUserSchema = z
  .object({
    // usernameSchema already trims and lowercases before validating, so reusing it is
    // what makes the plain @unique on that column sufficient. Never re-implement it.
    username: usernameSchema.optional(),
    name: z.string().trim().min(1, 'Le nom affiché ne peut pas être vide.').max(80).optional(),
    removeAvatar: z.literal(true).optional(),
  })
  .refine((b) => b.username !== undefined || b.name !== undefined || b.removeAvatar === true, {
    message: 'Indiquez au moins un champ à modifier.',
  });
export type AdminModerateUserInput = z.infer<typeof adminModerateUserSchema>;

export const adminDeleteUserSchema = z.object({
  reason: z
    .string({ message: 'Indiquez un motif de suppression.' })
    .trim()
    .min(3, 'Indiquez un motif de suppression.')
    .max(200, 'Motif trop long.'),
});
export type AdminDeleteUserInput = z.infer<typeof adminDeleteUserSchema>;

/**
 * §8.3's « retirer un badge ». A reason is mandatory for the same reason it is on
 * `user.delete`: the audit row's `detail` is the only durable record of WHY a public claim
 * was withdrawn, and `verificationRevokedReason` carries the operator's words to the fiche.
 */
export const adminRevokeVerificationSchema = z.object({
  reason: z
    .string({ message: 'Indiquez un motif de révocation.' })
    .trim()
    .min(3, 'Indiquez un motif de révocation.')
    .max(200, 'Motif trop long.'),
});
export type AdminRevokeVerificationInput = z.infer<typeof adminRevokeVerificationSchema>;

/**
 * §8.3's « Suspendre temporairement un réparateur ».
 *
 * 🛑 `until` uses `z.iso.datetime()`, which REJECTS the naive value an
 * `<input type="datetime-local">` produces. That is not an oversight to work around in the
 * schema - it is B1's Critical, where the form sent the naive string and the feature had
 * never worked. The form converts with `new Date(v).toISOString()`;
 * `admin-b2-schemas.spec.ts` asserts both directions on the literal browser value.
 *
 * Deliberately NOT reusing adminSuspendUserSchema: that one refuses the reserved
 * `account_deleted` banReason because it writes Better Auth's ban columns, and this one
 * writes Profile.repairerSuspendedReason, which those KPIs never read. Sharing it would
 * carry a rule that does not apply and hide one that might later.
 */
export const adminSuspendRepairerSchema = z.object({
  reason: z
    .string({ message: 'Indiquez un motif de suspension.' })
    .trim()
    .min(3, 'Indiquez un motif de suspension.')
    .max(200, 'Motif trop long.'),
  /** Absent means an indefinite suspension, mirroring User.banExpires. */
  until: z.iso
    .datetime({ message: 'Format de date invalide.' })
    .refine((d) => new Date(d) > new Date(), {
      message: 'La date de fin de suspension doit être dans le futur.',
    })
    .optional(),
});
export type AdminSuspendRepairerInput = z.infer<typeof adminSuspendRepairerSchema>;

/**
 * §8.4 « Modifier une catégorie en cas d'erreur ». The target is validated against
 * USABLE_CATEGORY in the service, not here: activeness is a database fact and a schema
 * cannot check it. This only asserts a non-empty id arrived.
 */
export const adminChangeCategorySchema = z.object({
  categoryId: z
    .string({ message: 'Catégorie invalide.' })
    .min(1, { message: 'Catégorie invalide.' }),
});
export type AdminChangeCategoryInput = z.infer<typeof adminChangeCategorySchema>;

/**
 * §8.4 « Masquer une demande ». A reason is mandatory for the same reason it is on
 * `adminDeleteUserSchema`: the audit row's `detail` and `Demande.hiddenReason` are the only
 * durable records of why a client's listing was taken down, and a required field is also the
 * speed bump that stands in for reversibility on the delete route.
 */
export const adminHideDemandeSchema = z.object({
  reason: z
    .string({ message: 'Indiquez un motif de masquage.' })
    .trim()
    .min(3, 'Indiquez un motif de masquage.')
    .max(200, 'Motif trop long.'),
});
export type AdminHideDemandeInput = z.infer<typeof adminHideDemandeSchema>;

/**
 * §8.4 « Supprimer une demande non conforme ». A DIFFERENT message from the hide schema's,
 * deliberately: the two forms sit on the same fiche and an identical error under either
 * would not tell the operator which one refused him.
 */
export const adminDeleteDemandeSchema = z.object({
  reason: z
    .string({ message: 'Indiquez un motif de suppression.' })
    .trim()
    .min(3, 'Indiquez un motif de suppression.')
    .max(200, 'Motif trop long.'),
});
export type AdminDeleteDemandeInput = z.infer<typeof adminDeleteDemandeSchema>;

/**
 * Converts a datetime-local string to ISO 8601 format suitable for the API's
 * `z.iso.datetime()` schemas.
 *
 * 🛑 `<input type="datetime-local">` produces a naive string like "2026-09-04T14:30", which
 * `z.iso.datetime()` REJECTS. B1's form had this conversion inline; Task 10 extracted it here
 * so both the user suspend form and the réparateur suspend form can use it.
 *
 * Placed in `@revime/shared` rather than in a `.tsx` component so Task 12's API test workspace
 * can import it without pulling React into that graph.
 */
export function toApiDateTime(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

/**
 * §8.3's « file d'attente », reshaped. There is no pending-approval state anywhere in the
 * schema - identity is decided by a Stripe webhook and the registry synchronously - so this
 * queue is driven by evidence that already exists. Spec §2.2 and §3.2.
 */
export type AdminVerificationQueueKind =
  | 'level_unbacked'
  | 'identity_stuck'
  | 'registry_refused'
  | 'fraud_signal';

export const VERIFICATION_QUEUE_KIND_LABEL: Record<AdminVerificationQueueKind, string> = {
  level_unbacked: 'Niveau non étayé',
  identity_stuck: 'Vérification bloquée',
  registry_refused: 'Contrôle registre refusé',
  fraud_signal: 'Signal de fraude',
};

/**
 * The réparateur half of §8.2's fiche, added by §8.3.
 *
 * 🛑 NULL IN THREE CASES, NOT ONE. This said « null on an account that has never enabled
 * réparateur mode », which was never what the API tested: it reads `repairerEnabled`, the
 * CURRENT state. Null means no `RepairerProfile` row, **or** réparateur mode off **with no
 * suspension recorded**. A suspension outranks the mode flag deliberately - a suspended
 * réparateur may turn the mode off, and if the block vanished with it the operator would lose
 * the only « Réactiver » control there is. See `admin-repairers.service.ts`'s `repairerBlock`.
 */
export type AdminRepairerBlock = {
  displayName: string;
  kind: 'PRO' | 'INDIVIDUAL';
  bio: string | null;
  postalCode: string | null;
  serviceAreaLabel: string | null;
  serviceRadiusKm: number | null;
  /**
   * `Profile.repairerEnabled`, the CURRENT state. False with a suspension set is a real and
   * reachable pair: the réparateur turned the mode off while suspended. Rendered on the fiche,
   * because clearing the suspension does NOT re-enable the mode - only he can do that - so an
   * operator who is not told this reactivates and still cannot find him in the directory.
   */
  repairerEnabled: boolean;
  /** Derived through verifiedBadgeFor, so the operator sees exactly what a client sees. */
  publicBadge: VerifiedBadge | null;
  suspension: { at: string; until: string | null; reason: string | null } | null;
  revocation: { at: string; reason: string | null } | null;
  /**
   * Stripe's OUTCOME, never the document - we deliberately never store it. Null when the
   * account has never started a session.
   */
  identity: {
    status: IdentityStatus;
    verifiedAt: string | null;
    lastErrorCode: string | null;
    variant: IdentityVariant;
    redactionStatus: RedactionStatus | null;
    erasureRequestedAt: string | null;
    selfieFraudSignalAt: string | null;
  } | null;
  /** The stored registry snapshot. Null for everybody today: zero rows exist. */
  business: {
    siren: string;
    siret: string | null;
    denomination: string | null;
    establishmentAddress: string | null;
    etatAdministratif: string;
    verifiedAt: string;
  } | null;
  /**
   * READ-ONLY here. A PENDING or RESTRICTED Connect account means he cannot be paid, which
   * the operator must see - but acting on it is §8.6's, i.e. piece D's.
   */
  connectStatus: ConnectStatus | null;
  counts: { liveOffers: number; hiddenLiveOffers: number };
};

/**
 * The operator's registry lookup. Writes nothing and promotes nobody, so it carries no
 * userId: it answers « what does the registry say about this SIREN », not « is this
 * réparateur verified ». Spec §4.3.
 */
export type AdminRegistryLookupResult =
  | { found: false }
  | {
      found: true;
      siren: string;
      siret: string | null;
      denomination: string | null;
      establishmentAddress: string | null;
      etatAdministratif: string;
      diffusible: boolean;
      officers: { nom: string | null; prenoms: string | null; qualite: string | null }[];
    };

/**
 * The operator's three display states. `deletedAt` wins over `hiddenAt` when both are set,
 * which is reachable and intended - hide is triage, delete is the verdict.
 */
export type AdminDemandeState = 'visible' | 'masquee' | 'supprimee';

/**
 * 🛑 `removedByAdmin` is the whole reason `Demande.deletedByUserId` exists as a column.
 * CF-16 lets a client delete his own demande and writes the SAME `deletedAt`, so without
 * this the list cannot tell « supprimée par le client » from « supprimée par l'équipe ».
 * Derived from the column and never from AdminAuditLog, which the interceptor writes after
 * the handler and can therefore be missing.
 */
export type AdminDemandeListItem = {
  demandeId: string;
  title: string;
  categoryLabelFr: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  state: AdminDemandeState;
  removedByAdmin: boolean;
  authorUserId: string;
  authorName: string;
  locationLabel: string;
  /** Counted under ACCEPTABLE_OFFER_WHERE, so it agrees with what the client is shown. */
  offerCount: number;
  /**
   * CF4-25. The réparateur a PRIVATE quote request is addressed to, or null on a public
   * demande. `displayName` is his account name, as `authorName` is the author's.
   */
  quoteTarget: { userId: string; displayName: string } | null;
  /** CF4-25. Why a private request closed; null while open and on public rows. */
  quoteClosedReason: 'DECLINED' | 'EXPIRED' | 'QUOTE_REFUSED' | 'CANCELLED_BY_CLIENT' | null;
  /** ISO string. */
  createdAt: string;
};

export type AdminDemandeListResponse = {
  items: AdminDemandeListItem[];
  total: number;
  page: number;
  pageSize: number;
};

/** One row of §8.4's « historique ». `admin` rows come from AdminAuditLog. */
export type AdminDemandeActivityEntry = {
  kind: 'offre' | 'commande' | 'conversation' | 'signalement' | 'avis' | 'admin';
  id: string;
  label: string;
  at: string;
  action?: AdminAuditAction;
  /**
   * 🛑 A FIELD, not a substring of `label`. B1's fiche recovered this with
   * `entry.label.split(' par ')[1]` against a label the API composed, coupling two sides
   * by an untested string format whose drift renders « Suspension par undefined ».
   * Roadmap follow-up #6 (B1's list). Present only on `admin` rows.
   */
  actorEmail?: string;
};

/** P10. Age after which a SENT offer is flagged « sans réponse » on /offres. Not a product rule. */
export const OFFER_UNANSWERED_AFTER_DAYS = 15;

export const adminDemandeConversationMessageSchema = z.object({
  id: z.string(),
  /** SYSTEM is the automatic line with no author (« Paiement effectué »): it is neither party's. */
  senderRole: z.enum(['CLIENT', 'REPAIRER', 'SYSTEM']),
  content: z.string(),
  createdAt: z.string(),
  /** Moderation soft delete: the row is kept as evidence, so the admin sees it, marked. */
  deleted: z.boolean(),
});
export type AdminDemandeConversationMessage = z.infer<typeof adminDemandeConversationMessageSchema>;

export const adminDemandeConversationThreadSchema = z.object({
  id: z.string(),
  repairerId: z.string(),
  repairerName: z.string(),
  messages: z.array(adminDemandeConversationMessageSchema),
});
export type AdminDemandeConversationThread = z.infer<typeof adminDemandeConversationThreadSchema>;

export type AdminDemandeDetail = {
  demandeId: string;
  title: string;
  description: string;
  brand: string | null;
  model: string | null;
  parts: 'UNKNOWN' | 'ORIGINAL' | 'COMPATIBLE' | 'CLIENT_SUPPLIED';
  mode: 'OFFERS' | 'BUDGET';
  budgetCents: number | null;
  locationLabel: string;
  postalCode: string;
  status: AdminDemandeListItem['status'];
  categoryId: string;
  categoryLabelFr: string;
  state: AdminDemandeState;
  /** The operator's own words, from hiddenReason or deletedReason. Never sent to a user. */
  removalReason: string | null;
  removedByAdmin: boolean;
  author: { userId: string; name: string; email: string };
  /**
   * 🛑 SIGNED URLs, not storage paths, and this was a real gap caught in the plan's own
   * self-review. The bucket is PRIVATE and `apps/admin` has no storage client - it carries
   * exactly one env var, `API_URL` - so a path would render a broken image. For a
   * non-compliant demande the photo is very often the non-compliant part, so the
   * read-before-act rule §3 rests on this field actually resolving.
   *
   * The API signs them with `StorageGateway.createSignedReadUrls(paths, ttl)`, the same call
   * `demandes.service.ts` uses for the client's own view.
   */
  photoUrls: string[];
  /**
   * 🛑 `true` only while a commande is PENDING_PAYMENT. It is what the fiche uses to
   * explain, BEFORE the operator presses anything, why hide and delete will refuse. The
   * guard is server-side regardless; this exists so the refusal is not a surprise.
   */
  paymentInFlight: boolean;
  offers: {
    offerId: string;
    repairerId?: string;
    repairerName: string;
    priceCents: number;
    status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  }[];
  commandes: {
    commandeId: string;
    status: 'PENDING_PAYMENT' | 'PAID' | 'ABANDONED' | 'REFUNDED';
    totalCents: number;
  }[];
  activity: AdminDemandeActivityEntry[];
  conversations: AdminDemandeConversationThread[];
  /** CF4-25. See `AdminDemandeListItem`. */
  quoteTarget: AdminDemandeListItem['quoteTarget'];
  quoteClosedReason: AdminDemandeListItem['quoteClosedReason'];
  createdAt: string;
  faultType?: {
    id: string;
    labelFr: string;
    slug: string;
  } | null;
};

export const adminDemandeDetailFaultTypeSchema = z.object({
  id: z.string().uuid(),
  labelFr: z.string(),
  slug: z.string(),
});
export type AdminDemandeDetailFaultType = z.infer<typeof adminDemandeDetailFaultTypeSchema>;

export const adminDemandeDetailDtoSchema = z
  .object({
    demandeId: z.string(),
    faultType: adminDemandeDetailFaultTypeSchema.nullable().optional(),
  })
  .passthrough();
export type AdminDemandeDetailDto = AdminDemandeDetail;

/**
 * §8.5 « Modération / suppression d'une offre ».
 */
export const moderateOfferBodySchema = z.object({
  reason: z.string().trim().min(3, 'Le motif doit contenir au moins 3 caractères.'),
});
export type ModerateOfferBody = z.infer<typeof moderateOfferBodySchema>;

export const adminOffreListItemSchema = z.object({
  offerId: z.string(),
  demandeId: z.string(),
  demandeTitle: z.string(),
  repairerUserId: z.string(),
  repairerName: z.string(),
  repairerKind: z.enum(['PARTICULIER', 'PROFESSIONNEL']),
  repairerRating: z.number().nullable(),
  repairerReviewCount: z.number(),
  priceCents: z.number(),
  delayHours: z.number(),
  warrantyLabel: z.string(),
  partsLabel: z.string(),
  travel: z.enum(['WORKSHOP', 'HOME']),
  acceptsParcel: z.boolean(),
  comment: z.string().nullable(),
  status: z.enum(['SENT', 'ACCEPTED', 'REJECTED', 'WITHDRAWN']),
  withdrawn: z.boolean(),
  deletedReason: z.string().nullable().optional(),
  deletedByUserId: z.string().nullable().optional(),
  revision: z.object({ position: z.number(), total: z.number() }),
  conversationReportCount: z.number(),
  createdAt: z.string(),
  demandeBudgetCents: z.number().nullable(),
  isOverBudget: z.boolean(),
  overBudgetCents: z.number().nullable(),
  isUnanswered: z.boolean(),
  hasPendingPaymentOrder: z.boolean(),
});

/**
 * §8.5's offers list item. The two facts §8.5 cannot express honestly any other way are
 * the revision chain and the conversation-level report count.
 */
export interface AdminOffreListItem {
  offerId: string;
  demandeId: string;
  demandeTitle: string;
  repairerUserId: string;
  repairerName: string;
  repairerKind: 'PARTICULIER' | 'PROFESSIONNEL';
  repairerRating: number | null;
  repairerReviewCount: number;
  priceCents: number;
  delayHours: number;
  warrantyLabel: string;
  partsLabel: string;
  travel: 'WORKSHOP' | 'HOME';
  acceptsParcel: boolean;
  comment: string | null;
  status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
  withdrawn: boolean;
  deletedReason?: string | null;
  deletedByUserId?: string | null;
  /**
   * « Historique ». This offer's position in the réparateur's revision chain on this
   * demande, and the chain's length. Real rather than invented: the partial unique index is
   * narrowed to `status: SENT, deletedAt: null`, so a réparateur re-quotes by withdrawing
   * and re-offering, and his offers on one demande are an ordered sequence.
   */
  revision: { position: number; total: number };
  /**
   * 🛑 « Signalements associés », and the name is deliberately about the CONVERSATION.
   * NOTHING in this product reports an offer - `ConversationReport` is created in one place
   * (`conversations/moderation.service.ts`) from one screen. A `Conversation` keys on
   * `(demandeId, repairerUserId)`, which is exactly this offer's pair, so the mapping is
   * EXACT rather than approximate - but because offers per demande are deliberately
   * unbounded, one conversation covers EVERY revision of this réparateur's quote. Render it
   * as « signalements sur la conversation liée » and never as « cette offre a été signalée »,
   * which would be a false claim about the row. Spec §7.
   */
  conversationReportCount: number;
  createdAt: string;
  /** The client's budget on the demande, null when none was given. */
  demandeBudgetCents: number | null;
  isOverBudget: boolean;
  /** How far above the budget, null unless `isOverBudget`. */
  overBudgetCents: number | null;
  /**
   * A SENT offer nobody has answered for `OFFER_UNANSWERED_AFTER_DAYS`. A display flag: nothing in
   * the product expires an offer, so the label says « sans réponse », never « expirée ».
   */
  isUnanswered: boolean;
  /** ACCEPTED, and the order it created is still waiting for the client's payment. */
  hasPendingPaymentOrder: boolean;
}

export type AdminOffreListResponse = {
  items: AdminOffreListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export interface AdminOfferContextDto {
  offer: AdminOffreListItem;
  demande: {
    id: string;
    title: string;
    categoryName: string;
    categorySlug: string;
    budgetCents: number | null;
    mode: 'OFFERS' | 'BUDGET';
    status: string;
    authorName: string;
    authorUserId: string;
    locationLabel: string;
    createdAt: string;
  };
  competingOffers: Array<{
    id: string;
    repairerUserId: string;
    repairerName: string;
    repairerKind: 'PARTICULIER' | 'PROFESSIONNEL';
    repairerRating: number | null;
    priceCents: number;
    delayHours: number;
    warrantyLabel: string;
    travel: 'WORKSHOP' | 'HOME';
    acceptsParcel: boolean;
    status: 'SENT' | 'ACCEPTED' | 'REJECTED' | 'WITHDRAWN';
    createdAt: string;
    isCurrent: boolean;
  }>;
  stats: {
    totalOffers: number;
    lowestPriceCents: number | null;
    averagePriceCents: number | null;
    highestPriceCents: number | null;
  };
}

/**
 * §8.6 Gestion des paiements & §8.7 Gestion des litiges (Piece D).
 */
export const openDisputeSchema = z.object({
  reason: z.string().min(3, 'Le motif doit comporter au moins 3 caractères.'),
  description: z.string().optional(),
  initiator: z.enum(['CLIENT', 'REPAIRER', 'ADMIN', 'STRIPE']).optional().default('ADMIN'),
  evidencePhotos: z.array(z.string()).optional(),
});
export type OpenDisputeInput = z.infer<typeof openDisputeSchema>;

export const assignDisputeSchema = z.object({
  assigneeUserId: z.string().optional(),
});
export type AssignDisputeInput = z.infer<typeof assignDisputeSchema>;

export const addDisputeNoteSchema = z.object({
  note: z.string().min(2, 'La note doit comporter au moins 2 caractères.'),
});
export type AddDisputeNoteInput = z.infer<typeof addDisputeNoteSchema>;

export const resolveDisputeSchema = z.object({
  resolutionNote: z.string().min(3, 'La justification de décision doit comporter au moins 3 caractères.'),
});
export type ResolveDisputeInput = z.infer<typeof resolveDisputeSchema>;

/**
 * CF4-D (spec §6). Resolving a dispute with a refund now takes the same flexible
 * breakdown as the plain refund route, defaulted to `DISPUTE_DECISION` since the
 * admin is not picking a motif here - the dispute resolution itself is the motif.
 */
export const resolveDisputeRefundSchema = resolveDisputeSchema.extend({
  motif: refundMotifSchema.default('DISPUTE_DECISION'),
  repairCents: cents,
  shippingCents: cents,
  protectionCents: cents,
});
export type ResolveDisputeRefundInput = z.infer<typeof resolveDisputeRefundSchema>;

/**
 * The columns a list can be ordered by SERVER-side (UI8). Derived columns (a payment's payout status,
 * « en litige », a dispute's effective status or assignee) have no SQL form and are not here: sorting
 * them would only reorder the page already loaded.
 */
export const ADMIN_PAYMENT_SORT_KEYS = ['createdAt', 'clientName', 'repairerName', 'totalCents', 'delivery', 'step', 'status'] as const;
export const ADMIN_DISPUTE_SORT_KEYS = ['disputeNumber', 'createdAt', 'initiator', 'clientName', 'repairerName', 'totalCents'] as const;
export const sortDirectionSchema = z.enum(['asc', 'desc']);

export const adminPaymentListQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['ALL', 'PENDING_PAYMENT', 'PAID', 'ABANDONED', 'REFUNDED']).optional(),
  step: z.enum(['ALL', 'PAID', 'PARCEL_SENT', 'PARCEL_RECEIVED', 'REPAIR_STARTED', 'REPAIR_DONE', 'RETURN_SENT', 'RETURN_RECEIVED', 'AWAITING_VALIDATION', 'RELEASED']).optional(),
  delivery: z.enum(['ALL', 'HOME', 'WORKSHOP', 'PARCEL']).optional(),
  disputed: z.enum(['ALL', 'true', 'false']).optional(),
  period: z.enum(['7d', '30d', 'month', 'all']).optional(),
  sort: z.enum(ADMIN_PAYMENT_SORT_KEYS).optional(),
  dir: sortDirectionSchema.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(25),
});
export type AdminPaymentListQuery = z.infer<typeof adminPaymentListQuerySchema>;

export const adminDisputeListQuerySchema = z.object({
  q: z.string().optional(),
  // 'RESOLVED' is the dashboard's « Résolus » tab: any of the three terminal states.
  status: z
    .enum(['ALL', 'OPEN', 'IN_REVIEW', 'RESOLVED', 'RESOLVED_REFUNDED', 'RESOLVED_RELEASED', 'RESOLVED_DISMISSED'])
    .optional(),
  assigned: z.string().optional(),
  assignedTo: z.string().optional(),
  onlyMine: z.preprocess((val) => val === 'true' || val === true, z.boolean()).optional(),
  sort: z.enum(ADMIN_DISPUTE_SORT_KEYS).optional(),
  dir: sortDirectionSchema.optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(25),
});
export type AdminDisputeListQuery = z.infer<typeof adminDisputeListQuerySchema>;

export const disputeAssigneeItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
});
export type DisputeAssigneeItem = z.infer<typeof disputeAssigneeItemSchema>;

export type DisputeInitiatorType = 'CLIENT' | 'REPAIRER' | 'ADMIN' | 'STRIPE';

export interface AdminDisputeListItem {
  id: string;
  commandeId: string;
  number: number;
  motif: DisputeMotif | null;
  status: DisputeStatusType;
  initiator: DisputeInitiatorType;
  reason: string;
  clientName: string;
  clientEmail: string;
  repairerName: string;
  repairerEmail: string;
  totalCents: number;
  repairCents: number;
  assignedToUserId: string | null;
  /** The operator's name (or e-mail when unnamed); null when unassigned or the account is gone. Additive. */
  assignedToName?: string | null;
  createdAt: string;
  resolvedAt: string | null;
  verdict: string | null;
  /** Status of the underlying commande (e.g. 'REFUNDED'), so the queue can say the order is refunded (B11). */
  commandeStatus: string | null;
}

export interface AdminDisputeListResponse {
  items: AdminDisputeListItem[];
  total: number;
  page: number;
  pageSize: number;
  openCount: number;
  inReviewCount: number;
  resolvedCount: number;
}

export interface AdminDisputeNoteItem {
  id: string;
  adminUserId: string;
  adminName: string;
  note: string;
  createdAt: string;
}

export interface AdminDisputeDossierDto {
  dispute: {
    id: string;
    commandeId: string;
    number: number;
    motif: DisputeMotif | null;
    status: DisputeStatusType;
    initiator: DisputeInitiatorType;
    reason: string;
    description: string | null;
    evidencePhotos: string[] | null;
    assignedToUserId: string | null;
    /** The operator's name (or e-mail when unnamed); null when unassigned or the account is gone. Additive for B16. */
    assignedToName?: string | null;
    assignedAt: string | null;
    resolvedByUserId: string | null;
    /** The resolver's name (or e-mail when unnamed); null when unknown or the account is gone. Additive for FND-632. */
    resolvedByName?: string | null;
    resolvedAt: string | null;
    verdict: string | null;
    resolutionNote: string | null;
    adminNotes: AdminDisputeNoteItem[];
    createdAt: string;
    updatedAt: string;
  };
  commande: {
    id: string;
    status: string;
    step: string | null;
    delivery: string;
    repairCents: number;
    shippingCents: number;
    protectionCents: number;
    insuranceCents: number;
    totalCents: number;
    paidAt: string | null;
    stripeSessionId: string | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    stripeTransferId: string | null;
    stripeRefundId: string | null;
  };
  client: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    city: string | null;
  };
  repairer: {
    id: string;
    name: string;
    email: string;
    phone: string | null;
    kind: string;
    city: string | null;
    verificationLevel: string;
  };
  shipments: Array<{
    leg: string;
    status: string;
    carrierLabel: string;
    boxtalOrderId: string | null;
    failureReason: string | null;
  }>;
  conversation: {
    id: string | null;
    messages: Array<{
      id: string;
      senderUserId: string | null;
      kind: 'USER' | 'SYSTEM' | 'SUPPORT' | string;
      body: string;
      photoPath: string | null;
      documentPath?: string | null;
      documentName?: string | null;
      documentSizeBytes?: number | null;
      createdAt: string;
      senderName?: string | null;
      senderRole?: 'CLIENT' | 'REPAIRER' | 'ADMIN' | 'SYSTEM' | null;
    }>;
  } | null;
  demande: {
    id: string;
    title: string;
    description: string;
    photos: string[];
  };
  timeline: DisputeTimelineEvent[];
  processingTimeDays: number;
}

export type DisputeTimelineEventType =
  | 'DISPUTE_OPENED'
  | 'ASSIGNED'
  | 'UNASSIGNED'
  | 'NOTE_ADDED'
  | 'MESSAGE_EXCHANGED'
  | 'ARBITRATION_SUBMITTED'
  | 'DISPUTE_RESOLVED';

export interface DisputeTimelineEvent {
  id: string;
  type: DisputeTimelineEventType;
  timestamp: string;
  actorName?: string | null;
  actorRole?: 'ADMIN' | 'CLIENT' | 'REPAIRER' | 'SYSTEM';
  summary: string;
  details?: Record<string, unknown> | null;
}

export interface DisputeResponseTemplate {
  id: string;
  title: string;
  category: 'INFO_REQUEST' | 'DEADLINE_REMINDER' | 'MEDIATION_PROPOSAL' | 'ARBITRATION_NOTICE';
  body: string;
}

export const DISPUTE_RESPONSE_TEMPLATES: DisputeResponseTemplate[] = [
  {
    id: 'template-info-request',
    title: 'Demande de justificatifs',
    category: 'INFO_REQUEST',
    body: `Bonjour,

Afin de permettre à l'équipe Revime d'examiner votre dossier de litige dans les meilleures conditions, nous vous invitons à nous transmettre les éléments suivants sous 48 heures :
- Des photographies nettes illustrant l'état actuel de l'appareil ou le défaut constaté ;
- La facture d'achat ou le devis détaillé de la réparation initiale ;
- Toute précision écrite utile sur le déroulement de la prestation.

Ces éléments peuvent être déposés directement dans cet espace d'échange sécurisé.

Restant à votre entière disposition,
L'équipe Médiation Revime`,
  },
  {
    id: 'template-deadline-reminder',
    title: 'Rappel de délai de réponse',
    category: 'DEADLINE_REMINDER',
    body: `Bonjour,

Nous constatons que notre dernière demande d'informations ou de proposition est restée sans réponse de votre part.

Nous vous rappelons qu'un délai de 48 heures vous est accordé pour répondre. Sans retour sous ce délai, la plateforme Revime sera dans l'obligation de poursuivre la procédure d'arbitrage sur la base exclusive des éléments d'ores et déjà versés au dossier.

Nous vous remercions de votre réactivité afin de trouver une issue favorable.

Bien cordialement,
L'équipe Médiation Revime`,
  },
  {
    id: 'template-mediation-proposal',
    title: 'Proposition de médiation amiable',
    category: 'MEDIATION_PROPOSAL',
    body: `Bonjour,

Après analyse attentive de la situation et des échanges entre les parties, l'équipe Revime vous propose une solution amiable d'apaisement :
- Une prise en charge partielle sous forme d'un remboursement partiel ou d'un geste commercial convenu entre vous ;
- Ou une réintervention prioritaire du réparateur pour corriger l'anomalie signalée, sans surcoût.

Merci de bien vouloir nous indiquer si cette modalité de résolution vous convient afin que nous puissions formaliser l'accord et clôturer le litige.

Bien cordialement,
L'équipe Médiation Revime`,
  },
  {
    id: 'template-arbitration-notice',
    title: "Notification d'arbitrage imminent",
    category: 'ARBITRATION_NOTICE',
    body: `Bonjour,

Faute d'accord amiable entre les parties ou à défaut d'éléments complémentaires transmis dans les délais impartis, nous vous informons que le dossier est désormais soumis à l'arbitrage de l'équipe Revime.

Une décision sera rendue dès que possible. Elle déterminera l'attribution des fonds actuellement séquestrés (déblocage au réparateur ou remboursement au client).

Nous vous tiendrons informés dès l'application de cette décision.

L'équipe Arbitrage Revime`,
  },
];


export type AdminDisputeSpaceMessage = {
  id: string;
  author: 'PARTY' | 'REVIME';
  senderUserId: string | null;
  body: string;
  photoUrl: string | null;
  document: DocumentDto | null;
  createdAt: string;
};

export type AdminDisputeSpacesDto = {
  client: AdminDisputeSpaceMessage[];
  repairer: AdminDisputeSpaceMessage[];
};

export const adminDisputeMessageSchema = z.object({
  space: z.enum(['MAIN', 'CLIENT', 'REPAIRER']),
  body: z
    .string({ message: 'Message invalide.' })
    .trim()
    .min(1, { message: 'Message invalide.' })
    .max(MESSAGE_BODY_MAX, { message: 'Message trop long.' }),
  attachment: disputeAttachmentInputSchema.optional(),
});
export type AdminDisputeMessageInput = z.infer<typeof adminDisputeMessageSchema>;

/**
 * CF4-I (spec §4.4, §4.5). `GET admin/cancellations`. `status` narrows to the two
 * dashboard tabs - PENDING (oldest first) or HISTORY (every decided request, newest
 * first) - rather than exposing all five `CancellationRequestStatus` values, since the
 * dashboard has exactly two tabs and no third view.
 */
export const adminCancellationListQuerySchema = z.object({
  status: z.enum(['PENDING', 'HISTORY']).optional().default('PENDING'),
  page: z.coerce.number().int().positive().optional().default(1),
});
export type AdminCancellationListQuery = z.infer<typeof adminCancellationListQuerySchema>;

export type CancellationRequesterRole = 'CLIENT' | 'REPAIRER' | 'ADMIN';

/** One row of `GET admin/cancellations`. */
export interface AdminCancellationListItem {
  id: string;
  commandeId: string;
  demandeTitle: string;
  clientName: string;
  repairerName: string;
  totalCents: number;
  step: string | null;
  /** True once a transfer has succeeded - the drawer's « fonds déjà versés » warning. */
  transferred: boolean;
  reason: CancellationReason;
  createdAt: string;
  status: CancellationRequestStatus;
  // P14 additions:
  requestedByName: string;
  requestedByRole: CancellationRequesterRole;
  decidedByName?: string | null;
  decidedAt?: string | null;
}

/** `GET admin/cancellations/:id` - the list item plus what the drawer needs beyond it. */
export interface AdminCancellationDetail extends AdminCancellationListItem {
  comment: string | null;
  refusalNote: string | null;
  delivery: string;
  conversationId: string | null;
  /** The refund breakdown `RefundForm` needs to default its amounts (spec §4.5). */
  refund: {
    repairCents: number;
    shippingCents: number;
    protectionCents: number;
    insuranceCents: number;
  };
  /** The dispute linked to the commande, with the status that prevails over a refunded order (B11). */
  disputeNumber: number | null;
  disputeStatus: DisputeStatusType | null;
}

export interface AdminPaymentListItem {
  id: string;
  createdAt: string;
  paidAt: string | null;
  status: string;
  step: string | null;
  delivery: string;
  totalCents: number;
  repairCents: number;
  shippingCents: number;
  protectionCents: number;
  clientName: string;
  clientEmail: string;
  repairerName: string;
  repairerEmail: string;
  isDisputed: boolean;
  disputeId: string | null;
  disputeStatus: DisputeStatusType | null;
  stripeChargeId: string | null;
  stripeTransferId: string | null;
  stripeRefundId: string | null;
  /**
   * CF4-D final review, Important #1 (spec §5): "Admin lists that show a refunded
   * order's money show the refunded amount, not the total." `row.refundedCents` is
   * what the CAS in `RefundService.refund()` actually writes - the amount refunded,
   * not `totalCents` (the order's original total), which would overstate a partial
   * (flexible) refund. Null for a non-REFUNDED row. For a legacy REFUNDED row written
   * before flexible refunds existed, this already holds the total (the old code path
   * refunded in full), so the table needs no special case for it.
   */
  refundedCents: number | null;
  /** CF4-I. True while a PENDING cancellation request freezes this order - the payments list tag. */
  cancellationPending: boolean;
  /** P11: where the réparateur's money stands; NOT_APPLICABLE for an order that was never paid or was refunded. */
  payoutStatus: PayoutStatus | 'NOT_APPLICABLE';
  /** P11: what was transferred (`transferredCents`) or is owed (`repairCents`); null when NOT_APPLICABLE. */
  payoutAmountCents: number | null;
}

export interface AdminPaymentMetricsDto {
  totalVolumeCents: number;
  commissionCents: number;
  escrowCents: number;
  refundedCents: number;
  disputedCount: number;
}

export interface AdminPaymentListResponse {
  items: AdminPaymentListItem[];
  metrics: AdminPaymentMetricsDto;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * Stage 6 Piece E (§8.9 Catégories, marques, modèles).
 */
const catalogSlugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const createCategorySchema = z.object({
  labelFr: z
    .string({ message: 'Le libellé doit comporter au moins 2 caractères.' })
    .trim()
    .min(2, 'Le libellé doit comporter au moins 2 caractères.')
    .max(100, 'Le libellé ne peut pas dépasser 100 caractères.'),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(catalogSlugRegex, {
      message: 'Format de slug invalide (lettres minuscules, chiffres et tirets uniquement).',
    })
    .optional(),
  parentId: z
    .string()
    .uuid({ message: 'Identifiant parent invalide.' })
    .nullable()
    .optional(),
  icon: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional().default(0),
});
export type CreateCategoryInput = z.input<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  labelFr: z
    .string()
    .trim()
    .min(2, 'Le libellé doit comporter au moins 2 caractères.')
    .max(100, 'Le libellé ne peut pas dépasser 100 caractères.')
    .optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(catalogSlugRegex, {
      message: 'Format de slug invalide (lettres minuscules, chiffres et tirets uniquement).',
    })
    .optional(),
  icon: z.string().trim().nullable().optional(),
  description: z.string().trim().nullable().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const toggleCategoryActiveSchema = z.object({
  active: z.boolean({ message: 'Le statut actif/inactif est requis.' }),
});
export type ToggleCategoryActiveInput = z.infer<typeof toggleCategoryActiveSchema>;

/** P22. The COMPLETE, ordered list of one sibling group (the service checks the group is whole). */
export const adminReorderCategoriesSchema = z.object({
  categoryIds: z
    .array(z.string().uuid({ message: 'Identifiant de catégorie invalide.' }))
    .min(1, { message: 'Aucune catégorie à ordonner.' })
    .max(200, { message: 'Trop de catégories à ordonner.' })
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Une catégorie apparaît deux fois.' }),
});
export type AdminReorderCategoriesInput = z.infer<typeof adminReorderCategoriesSchema>;

export const createBrandSchema = z.object({
  name: z
    .string({ message: 'Le nom de la marque doit comporter au moins 2 caractères.' })
    .trim()
    .min(2, 'Le nom de la marque doit comporter au moins 2 caractères.')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères.'),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(catalogSlugRegex, {
      message: 'Format de slug invalide (lettres minuscules, chiffres et tirets uniquement).',
    })
    .optional(),
  logoUrl: z.string().trim().nullable().optional(),
  categoryIds: z
    .array(z.string().uuid({ message: 'Identifiant de catégorie invalide.' }))
    .optional()
    .default([]),
  sortOrder: z.number().int().optional().default(0),
});
export type CreateBrandInput = z.input<typeof createBrandSchema>;

export const updateBrandSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom de la marque doit comporter au moins 2 caractères.')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères.')
    .optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(catalogSlugRegex, {
      message: 'Format de slug invalide (lettres minuscules, chiffres et tirets uniquement).',
    })
    .optional(),
  logoUrl: z.string().trim().nullable().optional(),
  categoryIds: z
    .array(z.string().uuid({ message: 'Identifiant de catégorie invalide.' }))
    .optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

export const createDeviceModelSchema = z.object({
  brandId: z.string().uuid({ message: 'Identifiant de marque invalide.' }),
  name: z
    .string({ message: 'Le nom du modèle doit comporter au moins 2 caractères.' })
    .trim()
    .min(2, 'Le nom du modèle doit comporter au moins 2 caractères.')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères.'),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(catalogSlugRegex, {
      message: 'Format de slug invalide (lettres minuscules, chiffres et tirets uniquement).',
    })
    .optional(),
  categoryId: z
    .string()
    .uuid({ message: 'Identifiant de catégorie invalide.' })
    .nullable()
    .optional(),
  sortOrder: z.number().int().optional().default(0),
});
export type CreateDeviceModelInput = z.input<typeof createDeviceModelSchema>;

export const updateDeviceModelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'Le nom du modèle doit comporter au moins 2 caractères.')
    .max(100, 'Le nom ne peut pas dépasser 100 caractères.')
    .optional(),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(catalogSlugRegex, {
      message: 'Format de slug invalide (lettres minuscules, chiffres et tirets uniquement).',
    })
    .optional(),
  categoryId: z
    .string()
    .uuid({ message: 'Identifiant de catégorie invalide.' })
    .nullable()
    .optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateDeviceModelInput = z.infer<typeof updateDeviceModelSchema>;

export const adminBrandListQuerySchema = z.object({
  q: z.string().optional(),
  categoryId: z.string().optional(),
  active: z.enum(['ALL', 'true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(25),
});
export type AdminBrandListQuery = z.input<typeof adminBrandListQuerySchema>;

export const adminModelListQuerySchema = z.object({
  q: z.string().optional(),
  brandId: z.string().optional(),
  categoryId: z.string().optional(),
  active: z.enum(['ALL', 'true', 'false']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(25),
});
export type AdminModelListQuery = z.input<typeof adminModelListQuerySchema>;

export interface AdminCategoryTreeItem extends CategoryDto {
  icon?: string | null;
  description?: string | null;
  active: boolean;
  sortOrder: number;
  demandesCount: number;
  repairersCount: number;
  children: AdminCategoryTreeItem[];
}

export interface AdminBrandListItem {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  active: boolean;
  sortOrder: number;
  categories: Array<{ id: string; labelFr: string }>;
  modelsCount: number;
  createdAt: string;
}

export interface AdminBrandListResponse {
  items: AdminBrandListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminDeviceModelListItem {
  id: string;
  brandId: string;
  brandName: string;
  name: string;
  slug: string;
  categoryId: string | null;
  categoryLabelFr: string | null;
  active: boolean;
  sortOrder: number;
  createdAt: string;
}

export interface AdminDeviceModelListResponse {
  items: AdminDeviceModelListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const adminCatalogOverviewDtoSchema = z.object({
  totalRootCategories: z.number().int(),
  totalSubCategories: z.number().int(),
  totalBrands: z.number().int(),
  totalModels: z.number().int(),
  totalFaultTypes: z.number().int(),
});
export type AdminCatalogOverviewDto = z.infer<typeof adminCatalogOverviewDtoSchema>;

/**
 * Feature F12: Types de panne (Fault types catalog subsystem)
 */
export const faultTypeDtoSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryLabelFr: z.string().optional(),
  categorySlug: z.string().optional(),
  slug: z.string().min(1),
  labelFr: z.string().min(1),
  description: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  sortOrder: z.number().int(),
  active: z.boolean(),
  demandesCount: z.number().int().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FaultTypeDto = z.infer<typeof faultTypeDtoSchema>;

export const createFaultTypeSchema = z.object({
  categoryId: z.string().uuid(),
  labelFr: z.string().min(2, 'Le libellé doit comporter au moins 2 caractères').max(100),
  slug: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
});
export type CreateFaultTypeInput = z.infer<typeof createFaultTypeSchema>;

export const updateFaultTypeSchema = z.object({
  labelFr: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  active: z.boolean().optional(),
});
export type UpdateFaultTypeInput = z.infer<typeof updateFaultTypeSchema>;

export const reorderFaultTypesSchema = z.object({
  categoryId: z.string().uuid(),
  orderedIds: z.array(z.string().uuid()).min(1),
});
export type ReorderFaultTypesInput = z.infer<typeof reorderFaultTypesSchema>;

/**
 * Stage 6 Piece F (§8.10 Statistiques).
 */
export const adminStatsPeriodSchema = z.enum(['7d', '30d', '90d', '12m', 'all', 'custom']);
export type AdminStatsPeriod = z.infer<typeof adminStatsPeriodSchema>;

/** P24. A custom period spans at most three years: it bounds the number of buckets the API builds. */
export const ADMIN_STATS_CUSTOM_MAX_DAYS = 1096;
const STATS_DAY_INVALID = 'Date invalide (AAAA-MM-JJ).';
/** A real calendar day written exactly `YYYY-MM-DD`: it must survive the round trip through a Date. */
const isRealDay = (v: string): boolean => {
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
};
const statsDaySchema = z.string().refine(isRealDay, { message: STATS_DAY_INVALID });
const STATS_DAY_MS = 86_400_000;

export const adminStatsQuerySchema = z
  .object({
    period: adminStatsPeriodSchema.optional().default('30d'),
    categoryId: z.string().optional(),
    department: z.string().optional(),
    from: statsDaySchema.optional(),
    to: statsDaySchema.optional(),
  })
  .superRefine((q, ctx) => {
    if (q.period !== 'custom') return;
    if (!q.from || !q.to) {
      ctx.addIssue({ code: 'custom', path: ['from'], message: 'Une période personnalisée demande une date de début et une date de fin.' });
      return;
    }
    if (q.from > q.to) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'La date de fin doit être après la date de début.' });
      return;
    }
    const days = (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / STATS_DAY_MS + 1;
    if (days > ADMIN_STATS_CUSTOM_MAX_DAYS) {
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'La période ne peut pas dépasser trois ans.' });
    }
  });
export type AdminStatsQuery = z.input<typeof adminStatsQuerySchema>;
export const adminStatsOverviewQuerySchema = adminStatsQuerySchema;
export type AdminStatsOverviewQuery = AdminStatsQuery;

export interface ConversionFunnelStage {
  id: 'demandes' | 'with_offer' | 'accepted' | 'paid' | 'completed';
  label: string;
  count: number;
  percentageOfTotal: number;       // % relative to total published demandes (0 to 100)
  stepConversionRate: number;      // % conversion from immediately preceding stage (0 to 100)
  dropOffRate: number;             // % drop-off relative to preceding stage (0 to 100)
}

export interface AdminConversionFunnelDto {
  stages: ConversionFunnelStage[];
  overallConversionRate: number;    // % from demandes to completed repair
}

export interface AdminStatsOverviewDto {
  period: AdminStatsPeriod;
  startDate: string;
  endDate: string;
  comparisonPeriod: {
    startDate: string;
    endDate: string;
  } | null;
  kpis: {
    totalDemandes: { value: number; changePct: number | null };
    acceptanceRate: { value: number; changePct: number | null };
    averageResponseTimeMinutes: { value: number; changePct: number | null };
    totalGmvCents: { value: number; changePct: number | null };
    totalCommissionsCents: { value: number; changePct: number | null };
    totalRegistrations: { value: number; changePct: number | null };
    averageBasketCents: { value: number; changePct: number | null };
    actualCommissionRate: { value: number; changePct: number | null };
    disputeRate: { value: number; changePct: number | null };
    refundRate: { value: number; changePct: number | null };
  };
  conversionFunnel: AdminConversionFunnelDto;
  repairsByCategory: Array<{
    categoryId: string;
    categoryName: string;
    count: number;
    percentage: number;
    volumeCents: number;
  }>;
  popularCategories: Array<{
    categoryId: string;
    categoryName: string;
    demandesCount: number;
    offersCount: number;
    conversionRate: number;
  }>;
  geoDistribution: Array<{
    departmentCode: string;
    departmentName: string;
    demandesCount: number;
    activeRepairersCount: number;
    percentage: number;
  }>;
  responseTime: {
    averageMinutes: number;
    medianMinutes: number;
    within1HourCount: number;
    within24HoursCount: number;
    over24HoursCount: number;
    noOfferCount: number;
  };
  offerAcceptance: {
    totalOffers: number;
    acceptedOffers: number;
    rejectedOffers: number;
    pendingOffers: number;
    acceptanceRate: number;
  };
  topRepairers: Array<{
    repairerId: string;
    name: string;
    businessName: string | null;
    avatarUrl: string | null;
    city: string | null;
    offersSent: number;
    offersAccepted: number;
    acceptanceRate: number;
    totalRevenueCents: number;
    rating: number | null;
    reviewsCount: number;
  }>;
  timeseries: {
    registrations: Array<{ date: string; label: string; clients: number; repairers: number; total: number }>;
    financials: Array<{ date: string; label: string; gmvCents: number; commissionCents: number; ordersCount: number }>;
    activity: Array<{ date: string; label: string; demandes: number; offers: number }>;
  };
}

/**
 * P13: Remboursements summary KPI schema and list response schemas.
 */
export const adminRefundSummarySchema = z.object({
  totalRefundedCents: z.number(),
  count: z.number(),
  averageRefundCents: z.number(),
});
export type AdminRefundSummary = z.infer<typeof adminRefundSummarySchema>;

export const adminRefundListItemSchema = z.object({
  commandeId: z.string(),
  orderNumber: z.string(),
  date: z.string(),
  clientName: z.string(),
  repairerName: z.string(),
  refundedCents: z.number().nullable(),
  motif: refundMotifSchema.nullable(),
  status: z.enum(['INCOMPLETE', 'SHARE_OWED', 'PARTIAL', 'FULL']),
  stripeRefundId: z.string().nullable(),
});

export const adminRefundListResponseSchema = z.object({
  items: z.array(adminRefundListItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  summary: adminRefundSummarySchema.optional(),
});

/**
 * P15: Commandes à surveiller (/attention) reason types and items.
 */
export type AttentionReason =
  | 'CANCELLATION_REQUESTED'
  | 'STALLED'
  | 'DISPUTED'
  | 'DISPUTE_REPLY'
  | 'REVERSAL_FAILED'
  | 'SHARE_OWED'
  | 'CHARGE_MISSING'
  | 'REFUND_INCOMPLETE'
  | 'RELEASE_FAILING'
  | 'PARCEL_BLOCKED'
  | 'PARCEL_INCIDENT'
  | 'PAYMENT_PENDING_STALE';

export interface AdminAttentionItem {
  commandeId: string;
  demandeTitle: string;
  clientName?: string;
  repairerName?: string;
  reasons?: AttentionReason[];
  status: string;
  step: string | null;
  totalCents: number;
  since: string;
  details?: Record<string, unknown>;
  stripePaymentIntentId?: string | null;
  stripeSessionId?: string | null;
  /** Backward-compatible single reason alias */
  reason?: AttentionReason | string;
}

export const adminAttentionDismissSchema = z.object({
  reason: z.string().trim().min(1, 'Le motif de classement est requis'),
});
export type AdminAttentionDismissInput = z.infer<typeof adminAttentionDismissSchema>;

/**
 * P21: Admin reviews rating summary & distribution.
 */
export const adminReviewsSummarySchema = z.object({
  averageRating: z.number(),
  totalReviews: z.number().int().nonnegative(),
  distribution: z.object({
    1: z.number().int().nonnegative(),
    2: z.number().int().nonnegative(),
    3: z.number().int().nonnegative(),
    4: z.number().int().nonnegative(),
    5: z.number().int().nonnegative(),
  }),
});
export type AdminReviewsSummary = z.infer<typeof adminReviewsSummarySchema>;

export const adminReviewsPageSchema = z.object({
  items: z.array(z.any()),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  summary: adminReviewsSummarySchema.optional(),
});
export type AdminReviewsPageSchema = z.infer<typeof adminReviewsPageSchema>;

export type { AdminTipItem, AdminTipInput, AdminTipUpdate, AdminTipsResponse, AdminTipListQuery } from './tips.js';
export { adminTipInputSchema, adminTipUpdateSchema, adminTipListQuerySchema } from './tips.js';

// ============================================================================
// A-3: Admin Verification Alerts (Fraud & Discrepancies)
// ============================================================================

export const adminVerificationAlertTypeSchema = z.enum([
  'MALFORMED_NIF',
  'DUPLICATE_IBAN',
  'DUPLICATE_NIF',
  'NO_NIF_OVER_25',
  'PARTICULAR_QUOTA_80_PERCENT',
  'SIRET_MISMATCH',
]);
export type AdminVerificationAlertType = z.infer<typeof adminVerificationAlertTypeSchema>;

export const adminVerificationAlertSeveritySchema = z.enum(['CRITICAL', 'WARNING']);
export type AdminVerificationAlertSeverity = z.infer<typeof adminVerificationAlertSeveritySchema>;

export const adminVerificationAlertSchema = z.object({
  id: z.string(),
  type: adminVerificationAlertTypeSchema,
  severity: adminVerificationAlertSeveritySchema,
  title: z.string(),
  detail: z.string(),
  userId: z.string(),
  userName: z.string(),
  userHref: z.string(),
});
export type AdminVerificationAlert = z.infer<typeof adminVerificationAlertSchema>;

export const adminVerificationAlertsResponseSchema = z.object({
  alerts: z.array(adminVerificationAlertSchema),
  totalCount: z.number().int().nonnegative(),
});
export type AdminVerificationAlertsResponse = z.infer<typeof adminVerificationAlertsResponseSchema>;

