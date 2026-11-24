import { z } from 'zod';
import type { CommandeStatus, CommandeStep } from './commande.schemas.js';

/**
 * CF4 sub-project I (`CF4-27`), spec `2026-09-30-cf4-i-client-cancellation-design.md`.
 * Client cancellation: pre-payment (no approval) and post-payment (REVIME-approved
 * request). This module holds the request/response shapes, the pure policy that
 * decides which button either party sees, and the French message constants shared
 * by the API routes that enforce them.
 */

export const cancellationReasonSchema = z.enum([
  'NO_LONGER_NEEDED',
  'TOO_SLOW',
  'REPAIRER_UNRESPONSIVE',
  'OTHER_SOLUTION',
  'OTHER',
]);
export type CancellationReason = z.infer<typeof cancellationReasonSchema>;

/** Spec §3. The client-facing wording for each reason - shown to the client picking one and,
 * for the non-comment reasons, to the réparateur as `actorName` (I6: he never sees the comment). */
export const CANCELLATION_REASON_LABEL: Record<CancellationReason, string> = {
  NO_LONGER_NEEDED: "Je n'ai plus besoin de la réparation",
  TOO_SLOW: 'Délai trop long',
  REPAIRER_UNRESPONSIVE: 'Le réparateur ne répond pas',
  OTHER_SOLUTION: "J'ai trouvé une autre solution",
  OTHER: 'Autre',
};

export const cancellationRequestStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REFUSED',
  'WITHDRAWN',
  'SUPERSEDED',
]);
export type CancellationRequestStatus = z.infer<typeof cancellationRequestStatusSchema>;

/**
 * `POST commandes/:id/cancellation` body. `comment` is required, non-empty (after trim), only
 * for `OTHER` (I5) - refined rather than a plain `.min(1)` on the field so every other reason
 * keeps an optional comment.
 */
export const createCancellationRequestSchema = z
  .object({
    reason: cancellationReasonSchema,
    comment: z.string().trim().max(500, 'Commentaire trop long.').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.reason === 'OTHER' && (!value.comment || value.comment.trim().length === 0)) {
      ctx.addIssue({ code: 'custom', message: 'Précisez la raison.', path: ['comment'] });
    }
  });
export type CreateCancellationRequestInput = z.infer<typeof createCancellationRequestSchema>;

/** `POST admin/cancellations/:id/refuse` body (I8: the note is shown to the client verbatim). */
export const refuseCancellationSchema = z.object({
  note: z
    .string()
    .trim()
    .min(1, 'Indiquez la raison du refus.')
    .max(300, 'Raison trop longue.'),
});
export type RefuseCancellationInput = z.infer<typeof refuseCancellationSchema>;

/** The latest cancellation request for a commande, as either party's `CommandeDto` carries it. */
export type CancellationRequestInfo = {
  id: string;
  status: CancellationRequestStatus;
  reason: CancellationReason;
  /** Null for the réparateur (I6) and for a request with no comment. */
  comment: string | null;
  refusalNote: string | null;
  createdAt: string;
};

/** The commande facts `cancellationPolicy` needs, and nothing else - see `ProgressCommande`'s own comment for why a raw-facts type like this stays free of labels. */
export type CancellationPolicyFacts = {
  status: CommandeStatus;
  step: CommandeStep | null;
  /** True once a transfer has succeeded - `stripeTransferId !== null`. */
  transferred: boolean;
  disputeOpen: boolean;
  paymentUnderReview: boolean;
  request: CancellationRequestInfo | null;
};

export type CancellationPolicy = {
  /** May this viewer open the request/cancel form now. */
  canRequest: boolean;
  /** May this viewer withdraw the pending request now. */
  canWithdraw: boolean;
  /** Is the order currently frozen by a PENDING request (either party). */
  frozen: boolean;
  /** Show the "refused" card - latest request is REFUSED and nothing has superseded it. */
  showRefused: boolean;
};

/**
 * Pure decision of which cancellation affordance each party sees, so the button and the
 * server's guard (Task 4/5) cannot disagree (same reasoning as `canAdvance`).
 *
 * `canRequest` is CLIENT-only, per I1: the réparateur never requests a cancellation.
 * `canWithdraw` is CLIENT-only and only for the request the client himself opened; a client is
 * always the requester of any PENDING row against his commande (I7), so no requester id is
 * needed here.
 */
export function cancellationPolicy(
  facts: CancellationPolicyFacts,
  role: 'CLIENT' | 'REPAIRER',
): CancellationPolicy {
  const pending = facts.request?.status === 'PENDING';
  const frozen = pending;

  if (role === 'REPAIRER') {
    return { canRequest: false, canWithdraw: false, frozen, showRefused: false };
  }

  const showRefused = facts.request?.status === 'REFUSED';

  if (pending) {
    return { canRequest: false, canWithdraw: true, frozen, showRefused: false };
  }

  const canRequest =
    facts.status === 'PAID' &&
    facts.step !== 'RELEASED' &&
    !facts.transferred &&
    !facts.disputeOpen &&
    !facts.paymentUnderReview;

  return { canRequest, canWithdraw: false, frozen, showRefused };
}

/**
 * Messages shared by every route that enforces the freeze or a cancellation transition
 * (Tasks 3-6). One definition, so the French wording cannot drift between call sites - the
 * same reasoning `STEP_LABEL` and the refund messages already follow.
 */
export const CANCELLATION_PENDING = "Une demande d'annulation est en cours.";
export const CANCELLATION_NOT_PENDING = "Cette demande d'annulation n'est plus en attente.";
export const CANCELLATION_ALREADY_PENDING = "Une demande d'annulation est déjà en cours.";
export const CANCELLATION_RELEASED = 'Les fonds ont déjà été versés : ouvrez un litige.';
export const CANCELLATION_DISPUTED = 'Un litige est en cours sur cette commande.';
export const CANCEL_PAYMENT_IN_FLIGHT =
  'Un paiement est en cours sur cette demande. Réessayez dans quelques minutes.';
export const CANCEL_USE_DELETE = 'Utilisez « Supprimer ».';
