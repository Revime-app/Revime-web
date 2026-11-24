import {
  identityAcceptInputSchema,
  identityDecisionReasonFr,
  identityRefuseInputSchema,
  VERIFICATION_ROW_STATUS_LABEL,
  type AdminVerificationListItem,
  type IdentityDecision,
  type IdentityDecisionMotif,
  type IdentityRefuseInput,
} from '@revime/shared';

/** CF4-39 (sub-project M, spec §4.4 / §4.6). Pure helpers of the identity decision panel - no React. */

type PanelIdentity = AdminVerificationListItem['identity'];

export type AllowedActions = { accept: boolean; refuse: boolean; request: boolean };

/**
 * The buttons spec §4.4 allows. Mirrors the API's refusals so the panel never offers a button
 * the server answers with CONFLICT or 422: accept is refused on an ACCEPTED row and on a
 * Stripe-verified row nobody decided on.
 */
export function allowedActions(identity: PanelIdentity): AllowedActions {
  if (identity === null) return { accept: false, refuse: false, request: false };
  const { decision, stripeStatus } = identity;
  const withdrawn = decision === 'REFUSED' || decision === 'DOCUMENTS_REQUESTED';
  return {
    accept: decision !== 'ACCEPTED' && (stripeStatus !== 'VERIFIED' || withdrawn),
    refuse: decision !== 'REFUSED',
    request: decision !== 'DOCUMENTS_REQUESTED',
  };
}

const DECISION_LABEL: Record<IdentityDecision, string> = {
  REFUSED: VERIFICATION_ROW_STATUS_LABEL.ADMIN_REFUSED,
  DOCUMENTS_REQUESTED: VERIFICATION_ROW_STATUS_LABEL.ADMIN_DOCUMENTS_REQUESTED,
  ACCEPTED: VERIFICATION_ROW_STATUS_LABEL.ADMIN_ACCEPTED,
};

const dayFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Paris',
});

/**
 * « Refusée par REVIME · Document expiré · 30/09/2026 par @ops ». Shared by the panel (with
 * the author) and the user fiche (without). null when nobody decided.
 */
export function decisionLine(
  d: {
    decision: IdentityDecision | null;
    motif: IdentityDecisionMotif | null;
    note: string | null;
    decidedAt: string | null;
    decidedBy?: string | null;
  } | null,
): string | null {
  if (d === null || d.decision === null) return null;
  // ACCEPTED has no motif; its optional note is the only detail it carries.
  const detail = d.decision === 'ACCEPTED' ? d.note : identityDecisionReasonFr(d.motif, d.note);
  const when = d.decidedAt ? dayFormatter.format(new Date(d.decidedAt)) : null;
  const dated = when && d.decidedBy ? `${when} par @${d.decidedBy}` : when;
  return [DECISION_LABEL[d.decision], detail, dated].filter((p): p is string => !!p).join(' · ');
}

export type DecisionFormErrors = { motif?: string; note?: string };

/** Validates the refuse / request-documents form with the API's own schema, so the operator reads its messages. */
export function parseDecisionForm(
  motif: string,
  note: string,
): { ok: true; data: IdentityRefuseInput } | { ok: false; errors: DecisionFormErrors } {
  const parsed = identityRefuseInputSchema.safeParse({ motif: motif || undefined, note });
  if (parsed.success) return { ok: true, data: parsed.data };
  const errors: DecisionFormErrors = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] === 'note' ? 'note' : 'motif';
    errors[key] ??= issue.message;
  }
  return { ok: false, errors };
}

/** Validates manual acceptance justification note with the shared schema. */
export function validateIdentityAccept(
  note: string,
): { ok: true; note: string } | { ok: false; error: string } {
  const parsed = identityAcceptInputSchema.safeParse({ note });
  if (parsed.success) return { ok: true, note: parsed.data.note };
  const err =
    parsed.error.issues.find((i) => i.path[0] === 'note')?.message ||
    "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).";
  return { ok: false, error: err };
}

/** Direct link to the Stripe Identity VerificationSession, or general identity dashboard if absent. */
export function stripeIdentitySessionUrl(sessionId: string | null | undefined): string {
  if (!sessionId) return 'https://dashboard.stripe.com/identity/verification-sessions';
  return `https://dashboard.stripe.com/identity/verification-sessions/${encodeURIComponent(sessionId)}`;
}
