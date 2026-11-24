import { z } from 'zod';

/**
 * A CLOSED set rather than free text, and this is the decision worth reading before
 * widening it. `Message.body` is already this project's first free-text channel and
 * needed a rate limiter for it (spec §6.3). A free-text report reason would be the
 * SECOND one, arriving in an operator's queue instead of another user's inbox, with
 * no cap of its own and nothing moderating the moderation input. A closed set also
 * makes the queue scannable and gives a user in distress one tap instead of a
 * paragraph.
 *
 * Stored as this code string in `ConversationReport.reason`, which stays an
 * unconstrained `String` column, so widening or narrowing this list needs NO DDL.
 *
 * `OTHER` carries no detail, and that is the accepted cost: the operator reads the
 * conversation itself through `GET /admin/conversations/:id`, so the reason narrows
 * the queue rather than being the whole evidence.
 */
export const reportReasonSchema = z.enum(
  ['SPAM', 'HARASSMENT', 'SCAM', 'OFF_PLATFORM', 'OTHER'],
  { message: 'Motif invalide.' },
);

export type ReportReason = z.infer<typeof reportReasonSchema>;

/**
 * The order the mobile sheet lists them in. Derived from the schema's own `options`
 * rather than re-declared, so the picker and the validator cannot drift.
 */
export const REPORT_REASONS: readonly ReportReason[] = reportReasonSchema.options;

/**
 * Read by BOTH the mobile sheet and the admin queue, here rather than in either, for
 * the reason `ATTENTION_REASON_LABEL` was moved: with the map living next to one
 * consumer the other rendered the raw enum, so the same row read `RELEASE_FAILING`
 * on screen and « Déblocage en échec » in the email.
 */
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  SPAM: 'Message indésirable',
  HARASSMENT: 'Propos agressifs ou harcèlement',
  SCAM: "Tentative d'arnaque",
  OFF_PLATFORM: 'Demande de paiement hors Revime',
  OTHER: 'Autre',
};

export type ReportGravity = 'HIGH' | 'MEDIUM' | 'LOW';

export const REPORT_GRAVITY_BY_REASON: Record<ReportReason, ReportGravity> = {
  SCAM: 'HIGH',
  HARASSMENT: 'HIGH',
  OFF_PLATFORM: 'MEDIUM',
  SPAM: 'MEDIUM',
  OTHER: 'LOW',
};

export const REPORT_GRAVITY_LABEL: Record<ReportGravity, string> = {
  HIGH: 'Élevée',
  MEDIUM: 'Moyenne',
  LOW: 'Faible',
};

export const REPORT_RESOLUTION_VERDICTS = [
  'SANCTION_APPLIED',
  'DISMISSED_UNFOUNDED',
  'RESOLVED_WARNED',
  'RESOLVED_OTHER',
] as const;

export type ReportResolutionVerdict = (typeof REPORT_RESOLUTION_VERDICTS)[number];

export const REPORT_RESOLUTION_VERDICT_LABEL: Record<ReportResolutionVerdict, string> = {
  SANCTION_APPLIED: 'Sanction appliquée',
  DISMISSED_UNFOUNDED: 'Classé sans suite (non fondé)',
  RESOLVED_WARNED: 'Avertissement envoyé',
  RESOLVED_OTHER: 'Résolu (autre motif)',
};

export const resolveReportBodySchema = z.object({
  verdict: z.enum(REPORT_RESOLUTION_VERDICTS),
  note: z.string().trim().max(1000).optional(),
});

export type ResolveReportBody = z.infer<typeof resolveReportBodySchema>;

export const reportConversationSchema = z.object({
  reason: reportReasonSchema,
});

export type ReportConversationInput = z.infer<typeof reportConversationSchema>;

/**
 * The target is in the body and never inferred from the session, matching
 * `createConversationSchema`'s own reasoning: the server asserts ONE rule about who
 * the caller may block. Zod strips unknown keys, so a hostile `blockerUserId` never
 * reaches the service - pinned in this schema's own test, because the protection is
 * Zod's rather than ours.
 */
export const createBlockSchema = z.object({
  userId: z
    .string({ message: 'Utilisateur invalide.' })
    .min(1, { message: 'Utilisateur invalide.' }),
});

export type CreateBlockInput = z.infer<typeof createBlockSchema>;

/**
 * What the thread screen needs to render a disabled composer WITH an explanation
 * rather than letting a send fail (spec §8).
 *
 * `byMe` exists so the two cases can say different things, and the asymmetry is
 * deliberate: the blocker is told plainly and offered « Débloquer », while the
 * blocked party gets a neutral sentence that does not disclose that he was blocked.
 * Telling someone he has been blocked escalates, and the composer only needs to be
 * honest about the OUTCOME, which « Vous ne pouvez plus échanger avec cette
 * personne. » is in both directions.
 */
export type BlockStateDto = {
  /** True when EITHER party has blocked the other. The composer disables on this. */
  active: boolean;
  /** True only when the caller is the blocker, which is the only case that can unblock. */
  byMe: boolean;
};

/** One row of the operator's queue. */
export type AdminReportItem = {
  reportId: string;
  conversationId: string;
  reason: ReportReason;
  /** Account names, so the operator recognises the pair without a second request. */
  reporterName: string;
  reportedName: string;
  demandeTitle: string;
  /** ISO string. */
  createdAt: string;
  /** True when an operator has already closed this channel. */
  conversationClosed: boolean;
};

export type AdminConversationMessage = {
  id: string;
  body: string;
  senderName: string;
  /** ISO string. */
  createdAt: string;
  /** True when an operator has soft-deleted this message. It still renders here. */
  deleted: boolean;
};

/**
 * Read before act. The operator is about to close a private channel between two
 * people, which is destructive; P4's `/colis` review established that a page offering
 * a destructive action while showing nothing to check against lets a mis-keyed id
 * through every guard.
 *
 * Soft-deleted messages ARE included, flagged. An operator reviewing a second report
 * on the same conversation must see what he already removed, or he re-reads a thread
 * with a hole in it and cannot tell whether he acted.
 */
export type AdminConversationView = {
  conversationId: string;
  demandeTitle: string;
  clientName: string;
  repairerName: string;
  closed: boolean;
  messages: AdminConversationMessage[];
};

export type ReportTargetType = 'MESSAGE' | 'USER' | 'REVIEW' | 'DEMANDE';

export const REPORT_TARGET_TYPE_LABEL: Record<ReportTargetType, string> = {
  MESSAGE: 'Message',
  USER: 'Profil',
  REVIEW: 'Avis',
  DEMANDE: 'Demande',
};

export interface ReportTargetEntitySummary {
  id: string;
  targetType: ReportTargetType;
  title?: string | null;
  description?: string | null;
  rating?: number | null;
  comment?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  authorName?: string | null;
  repairerName?: string | null;
  photoUrls?: string[];
}

export interface AdminReportListItemDto {
  id: string;
  conversationId: string;
  reason: ReportReason;
  gravity: ReportGravity;
  gravityLabel: string;
  reasonLabel: string;
  targetType?: ReportTargetType;
  createdAt: string;
  resolvedAt: string | null;
  resolutionVerdict: ReportResolutionVerdict | null;
  reporter: {
    id: string;
    name: string;
    email: string;
  };
  reported: {
    id: string;
    name: string;
    email: string;
  };
  demande: {
    id: string;
    title: string;
  } | null;
  assignedTo: {
    id: string;
    name: string;
    email: string;
  } | null;
  conversationClosed: boolean;
}

export interface AdminReportListResponse {
  items: AdminReportListItemDto[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: {
    open: number;
    resolved: number;
    total: number;
  };
}

export interface AdminReportDetailDto {
  id: string;
  conversationId: string;
  reason: ReportReason;
  reasonLabel: string;
  gravity: ReportGravity;
  gravityLabel: string;
  targetType: ReportTargetType;
  /** An estimate (see `getReportDetail`): a report stores no message id. */
  likelyReportedMessageId: string | null;
  targetEntitySummary: ReportTargetEntitySummary;
  createdAt: string;
  resolvedAt: string | null;
  resolutionVerdict: ReportResolutionVerdict | null;
  resolutionVerdictLabel: string | null;
  resolutionNote: string | null;
  assignedTo: {
    id: string;
    name: string;
    email: string;
    assignedAt: string;
  } | null;
  resolvedBy: {
    id: string;
    name: string;
    email: string;
  } | null;
  reporter: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    reportsCount: number;
  };
  reported: {
    id: string;
    name: string;
    email: string;
    createdAt: string;
    role: string;
    banned: boolean;
    repairerSuspended: boolean;
    reportsReceivedCount: number;
  };
  conversation: {
    id: string;
    closed: boolean;
    demande: {
      id: string;
      title: string;
    } | null;
    messages: Array<{
      id: string;
      body: string;
      createdAt: string;
      deleted: boolean;
      senderId: string | null;
      senderName: string;
    }>;
  };
}


