import { z } from 'zod';
import type { ShipmentLeg, ShipmentStatus } from './parcel.schemas.js';
import type { CommandeStatus } from './commande.schemas.js';
import type { DisputeStatusType } from './dispute.js';
import { refundMotifSchema, type RefundMotif } from './refund.schemas.js';
import type { IdentityStatus } from './identity.schemas.js';
import type { IdentityDecision, IdentityDecisionMotif } from './identity-decision.js';
import type { AdminAccountMarker, AdminRefundSummary } from './admin.schemas.js';

/**
 * CF4-F (spec §3). Empty-string filters are dropped instead of sent as `''`, so an
 * operator clearing an input box removes the filter rather than filtering on "".
 * Shared by every admin-lists query schema below.
 */
const optionalTrimmedString = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v));

/**
 * `from`/`to` are ISO date strings that reject garbage, per the controller notes.
 * `z.coerce.date()` accepts far more than an ISO string (e.g. plain numbers), so this
 * validates with `Date` parsing and re-emits the original string rather than a Date -
 * the query stays JSON-serialisable and the API layer decides its own Date boundary.
 */
const isoDateString = () =>
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v === '' || v === undefined ? undefined : v))
    .refine((v) => v === undefined || !Number.isNaN(new Date(v).getTime()), {
      message: 'Date invalide.',
    });

/**
 * CF4-20 (spec §3). Shipments admin list, 11 statuses. `shipmentDisplayStatus` derives
 * the status in memory (spec §2 F6) - only the SQL-reachable filters (period, carrier,
 * leg, client, réparateur, commande, tracking) hit the database `where`.
 */
export type ShipmentDisplayStatus =
  | 'TO_CREATE'
  | 'CREATED'
  | 'DOWNLOADED'
  | 'HANDED_OVER'
  | 'IN_TRANSIT'
  | 'AT_PICKUP_POINT'
  | 'DELIVERED'
  | 'RETURN_IN_TRANSIT'
  | 'RETURN_DELIVERED'
  | 'CANCELLED'
  | 'INCIDENT';

/** French labels, spec §3, same order as the table. */
export const SHIPMENT_DISPLAY_STATUS_LABEL: Record<ShipmentDisplayStatus, string> = {
  TO_CREATE: 'Étiquette à créer',
  CREATED: 'Étiquette créée',
  DOWNLOADED: 'Étiquette téléchargée',
  HANDED_OVER: 'Remise au transporteur',
  IN_TRANSIT: 'En transit',
  AT_PICKUP_POINT: 'Arrivée en point relais',
  DELIVERED: 'Livrée',
  RETURN_IN_TRANSIT: 'Retour en cours',
  RETURN_DELIVERED: 'Retour livré',
  CANCELLED: 'Annulée',
  INCIDENT: 'Incident',
};

const INCIDENT_EVENT_STATUSES = new Set(['EXCEPTION', 'RETURNED', 'FAILED_ATTEMPT']);

/**
 * Spec §3's table, first match wins. Only the NEWEST tracking event counts (a later
 * event clears an earlier "Incident", the same rule the /attention mailer already
 * applies) - the caller passes `newestEventStatus`, this function never looks at history.
 */
export function shipmentDisplayStatus(s: {
  status: ShipmentStatus;
  leg: ShipmentLeg;
  labelDownloadedAt: Date | string | null;
  newestEventStatus: string | null;
}): ShipmentDisplayStatus {
  if (s.status === 'CANCELLED') {
    return 'CANCELLED';
  }
  if (s.status === 'FAILED' || (s.newestEventStatus !== null && INCIDENT_EVENT_STATUSES.has(s.newestEventStatus))) {
    return 'INCIDENT';
  }
  if (s.status === 'DELIVERED') {
    return s.leg === 'RETURN' ? 'RETURN_DELIVERED' : 'DELIVERED';
  }
  if (s.status === 'IN_TRANSIT') {
    if (s.leg === 'RETURN') {
      return 'RETURN_IN_TRANSIT';
    }
    if (s.newestEventStatus === 'REACHED_DELIVERY_PICKUP_POINT') {
      return 'AT_PICKUP_POINT';
    }
    if (s.newestEventStatus === 'SHIPPED') {
      return 'HANDED_OVER';
    }
    return 'IN_TRANSIT';
  }
  if (s.status === 'LABEL_READY') {
    return s.labelDownloadedAt !== null ? 'DOWNLOADED' : 'CREATED';
  }
  // PENDING / ORDERED.
  return 'TO_CREATE';
}

const shipmentDisplayStatusSchema = z.enum([
  'TO_CREATE',
  'CREATED',
  'DOWNLOADED',
  'HANDED_OVER',
  'IN_TRANSIT',
  'AT_PICKUP_POINT',
  'DELIVERED',
  'RETURN_IN_TRANSIT',
  'RETURN_DELIVERED',
  'CANCELLED',
  'INCIDENT',
]);

const shipmentLegSchema = z.enum(['OUTBOUND', 'RETURN']);

/**
 * `GET admin/shipments` query (spec §3). `page`/`pageSize` follow
 * `adminPaymentListQuerySchema`'s style: coerced, defaulted 1 / 25.
 */
export const adminShipmentListQuerySchema = z.object({
  from: isoDateString(),
  to: isoDateString(),
  carrier: optionalTrimmedString(),
  status: shipmentDisplayStatusSchema.optional(),
  leg: shipmentLegSchema.optional(),
  client: optionalTrimmedString(),
  repairer: optionalTrimmedString(),
  commande: optionalTrimmedString(),
  tracking: optionalTrimmedString(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(25),
});
export type AdminShipmentListQuery = z.infer<typeof adminShipmentListQuerySchema>;

export type AdminShipmentListItem = {
  shipmentId: string;
  commandeId: string;
  orderNumber: string;
  createdAt: string;
  clientName: string;
  repairerName: string;
  carrierLabel: string;
  leg: ShipmentLeg;
  status: ShipmentDisplayStatus;
  displayStatus?: string;
  trackingNumber: string | null;
  isBlocked?: boolean;
  blockedReason?: string | null;
  labelReady?: boolean;
  hasLabelPdf?: boolean;
};

export type AdminShipmentListResponse = {
  items: AdminShipmentListItem[];
  total: number;
  page: number;
  pageSize: number;
  carriers: string[];
};

/**
 * CF4-19 (spec §4). Refund list status, first match wins: an incomplete refund
 * (still `PAID`, carrying a Stripe refund/reversal reference) outranks everything,
 * then an owed réparateur share, then partial vs full.
 */
export type RefundListStatus = 'INCOMPLETE' | 'SHARE_OWED' | 'PARTIAL' | 'FULL';

export const REFUND_LIST_STATUS_LABEL: Record<RefundListStatus, string> = {
  INCOMPLETE: 'Incomplet',
  SHARE_OWED: 'Part réparateur due',
  PARTIAL: 'Remboursé partiellement',
  FULL: 'Remboursé',
};

export function refundListStatus(r: {
  status: CommandeStatus;
  shareOwedCents: number;
  partialRefund: boolean;
}): RefundListStatus {
  if (r.status === 'PAID') {
    return 'INCOMPLETE';
  }
  if (r.shareOwedCents > 0) {
    return 'SHARE_OWED';
  }
  if (r.partialRefund) {
    return 'PARTIAL';
  }
  return 'FULL';
}

const refundListStatusSchema = z.enum(['INCOMPLETE', 'SHARE_OWED', 'PARTIAL', 'FULL']);

/** Non-negative integer cents, coerced from a query string. Spec §4's amount bounds. */
const nonNegativeCentsQueryParam = z.coerce.number().int().min(0, { message: 'Montant invalide.' }).optional();

/** Refund list columns the server orders by (UI8). The list is cut in memory after the derived status, so every column sorts. */
export const ADMIN_REFUND_SORT_KEYS = ['date', 'orderNumber', 'clientName', 'repairerName', 'refundedCents', 'motif', 'status'] as const;

/** `GET admin/refunds` query (spec §4). */
export const adminRefundListQuerySchema = z.object({
  from: isoDateString(),
  to: isoDateString(),
  status: refundListStatusSchema.optional(),
  minCents: nonNegativeCentsQueryParam,
  maxCents: nonNegativeCentsQueryParam,
  motif: refundMotifSchema.optional(),
  client: optionalTrimmedString(),
  repairer: optionalTrimmedString(),
  q: optionalTrimmedString(),
  sort: z.enum(ADMIN_REFUND_SORT_KEYS).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(25),
});
export type AdminRefundListQuery = z.infer<typeof adminRefundListQuerySchema>;

export type AdminRefundListItem = {
  commandeId: string;
  orderNumber: string;
  date: string;
  clientName: string;
  repairerName: string;
  refundedCents: number | null;
  motif: RefundMotif | null;
  status: RefundListStatus;
  stripeRefundId: string | null;
};

export type AdminRefundListResponse = {
  items: AdminRefundListItem[];
  total: number;
  page: number;
  pageSize: number;
  summary: AdminRefundSummary;
};

export {
  adminRefundSummarySchema,
  adminRefundListItemSchema,
  adminRefundListResponseSchema,
  type AdminRefundSummary,
} from './admin.schemas.js';

export type AdminRefundDetail = {
  commandeId: string;
  orderNumber: string;
  demandeTitle: string;
  clientName: string;
  repairerName: string;
  totalCents: number;
  lines: {
    repair: { paid: number; refunded: number };
    shipping: { paid: number; refunded: number; insuranceCents: number };
    protection: { paid: number; refunded: number };
  };
  refundableCents: number;
  refundedCents: number;
  shareCents: number;
  shareOwedCents: number;
  motif: RefundMotif | null;
  note: string | null;
  adminName: string | null;
  refundedAt: string | null;
  stripe: {
    refundStatus: string | null;
    cardBrand: string | null;
    cardLast4: string | null;
    available: boolean;
  };
  history: { at: string; action: string; actorEmail: string; statusCode: number }[];
  /** The dispute linked to the commande, with the status that prevails over a refunded order (B11). */
  disputeNumber: number | null;
  disputeStatus: DisputeStatusType | null;
};

/**
 * CF4-21 (spec §5). One row per verification (identity or business).
 */
export type VerificationRowType = 'IDENTITY' | 'BUSINESS';

export type VerificationRowStatus =
  | 'VERIFIED'
  | 'DOCUMENTS_REQUIRED'
  | 'PROCESSING'
  | 'NOT_STARTED'
  | 'CANCELED'
  | 'REJECTED'
  | 'FAILED'
  // CF4-39 (sub-project M): an operator's decision on the identity row, read FIRST.
  | 'ADMIN_REFUSED'
  | 'ADMIN_DOCUMENTS_REQUESTED'
  | 'ADMIN_ACCEPTED';

export const VERIFICATION_ROW_STATUS_LABEL: Record<VerificationRowStatus, string> = {
  VERIFIED: 'Vérifiée',
  DOCUMENTS_REQUIRED: 'Documents à refaire',
  PROCESSING: 'En cours',
  NOT_STARTED: 'Non commencée',
  CANCELED: 'Annulée',
  REJECTED: 'Refusée',
  FAILED: 'Échec technique',
  ADMIN_REFUSED: 'Refusée par REVIME',
  ADMIN_DOCUMENTS_REQUESTED: 'Nouveaux documents demandés',
  ADMIN_ACCEPTED: 'Acceptée manuellement',
};

/**
 * Spec §5's identity rule, first match wins: `verifiedAt` set outranks a stale
 * `REQUIRES_INPUT`, since Stripe does not clear the status column once a session has
 * verified - only `verifiedAt` is stamped once and never cleared (identity.schemas.ts).
 *
 * CF4-39: an operator's `decision` outranks all of it - a refused row still has
 * `verifiedAt` set, and reading VERIFIED there would hide the refusal from the operator.
 *
 * CF4-F final review, Important #2: exhaustive over `IdentityStatus` via a `switch`
 * with a `never` check, rather than a comment-only `// CANCELED.` fallback that would
 * silently read "Annulée" for any status this function does not yet know about. A
 * future `IdentityStatus` member now fails typecheck here instead of being mapped to
 * the wrong French label at runtime.
 */
export function identityRowStatus(v: {
  status: IdentityStatus;
  verifiedAt: Date | string | null;
  lastErrorCode: string | null;
  decision?: IdentityDecision | null;
}): VerificationRowStatus {
  if (v.decision === 'REFUSED') return 'ADMIN_REFUSED';
  if (v.decision === 'DOCUMENTS_REQUESTED') return 'ADMIN_DOCUMENTS_REQUESTED';
  if (v.decision === 'ACCEPTED') return 'ADMIN_ACCEPTED';
  if (v.verifiedAt !== null) {
    return 'VERIFIED';
  }
  switch (v.status) {
    case 'REQUIRES_INPUT':
      return v.lastErrorCode !== null ? 'DOCUMENTS_REQUIRED' : 'NOT_STARTED';
    case 'PROCESSING':
      return 'PROCESSING';
    case 'CANCELED':
      return 'CANCELED';
    case 'VERIFIED':
      // Ruling R7: `verifiedAt` is null here (handled above), but Stripe already
      // reports the session verified, and identity.service.ts stamps `verifiedAt`
      // in the same sync that sets this status - a missing stamp is a timing gap
      // between those two writes, not a cancellation, so this reads VERIFIED too.
      return 'VERIFIED';
    default: {
      const _exhaustive: never = v.status;
      return _exhaustive;
    }
  }
}

/** Spec §5's business rule: the registry/business outcome maps 1:1 onto the row vocabulary. */
export function businessRowStatus(outcome: 'VERIFIED' | 'REJECTED' | 'FAILED'): VerificationRowStatus {
  return outcome;
}

const verificationRowStatusSchema = z.enum([
  'VERIFIED',
  'DOCUMENTS_REQUIRED',
  'PROCESSING',
  'NOT_STARTED',
  'CANCELED',
  'REJECTED',
  'FAILED',
  'ADMIN_REFUSED',
  'ADMIN_DOCUMENTS_REQUESTED',
  'ADMIN_ACCEPTED',
]);

const verificationRowTypeSchema = z.enum(['IDENTITY', 'BUSINESS']);

/**
 * `RepairerKind` (apps/api/prisma/schema.prisma, `enum RepairerKind { PRO INDIVIDUAL }`) -
 * these are its real member names, reused verbatim rather than re-declared, so the query
 * schema can never drift from the database enum it filters on.
 */
const accountKindSchema = z.enum(['INDIVIDUAL', 'PRO']);
export type AccountKind = z.infer<typeof accountKindSchema>;

const booleanStringSchema = z.enum(['true', 'false']);

/**
 * `GET admin/verifications` query (spec §5).
 * `needsAction` defaults ON ('true'), filtering to actionable rows where an admin decision is needed.
 * When set to 'false' (filter unchecked = "Tous"), returns all rows without filtering by needsAction (Bug B6).
 */
export const adminVerificationListQuerySchema = z.object({
  status: verificationRowStatusSchema.optional(),
  needsAction: booleanStringSchema.optional().default('true'),
  accountKind: accountKindSchema.optional(),
  type: verificationRowTypeSchema.optional(),
  from: isoDateString(),
  to: isoDateString(),
  user: optionalTrimmedString(),
  siren: optionalTrimmedString(),
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().optional().default(25),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});
export type AdminVerificationListQuery = z.infer<typeof adminVerificationListQuerySchema>;

export type AdminVerificationListItem = {
  id: string;
  userId: string;
  date: string;
  displayName: string;
  username: string;
  email: string;
  accountKind: AccountKind;
  type: VerificationRowType;
  status: VerificationRowStatus;
  needsAction: boolean;
  detail: string | null;
  siren: string | null;
  siret: string | null;
  /**
   * Ruling R5 (fix round 1, CF4-21): the old `AdminVerificationQueueRow` carried this so
   * an operator could tell a demo cast member from an `@repareme.test` integration
   * fixture at a glance - production holds hundreds of the latter. Task 5's rewrite
   * dropped it; this restores it on the new one-row-per-verification list. Computed via
   * `markerOf(email)`, never stored.
   */
  marker: AdminAccountMarker;
  /**
   * CF4-39 (spec §4.5). The decision panel's inputs, on IDENTITY rows backed by an
   * IdentityVerification row; null on BUSINESS rows and on placed NOT_STARTED rows.
   */
  identity: {
    stripeStatus: IdentityStatus;
    /** Stripe Identity VerificationSession ID (vs_...) for direct dashboard link. */
    stripeSessionId: string | null;
    lastErrorCode: string | null;
    fraudSignal: boolean;
    decision: IdentityDecision | null;
    motif: IdentityDecisionMotif | null;
    note: string | null;
    /** ISO 8601. */
    decidedAt: string | null;
    /** The deciding operator's username, or null when unknown or the account is gone. */
    decidedBy: string | null;
  } | null;
};

export type AdminVerificationListResponse = {
  items: AdminVerificationListItem[];
  total: number;
  page: number;
  pageSize: number;
};
