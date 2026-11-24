import { z } from 'zod';

/**
 * Stripe Identity's session lifecycle, in our vocabulary. Distinct from
 * `verificationLevelSchema`, which is the CONCLUSION: this is the evidence's own
 * state, and a VERIFIED session is what lets the level become IDENTITY.
 */
export const identityStatusSchema = z.enum([
  'REQUIRES_INPUT',
  'PROCESSING',
  'VERIFIED',
  'CANCELED',
]);
export type IdentityStatus = z.infer<typeof identityStatusSchema>;

export const IDENTITY_STATUS_LABEL: Record<IdentityStatus, string> = {
  REQUIRES_INPUT: 'En attente de documents',
  PROCESSING: 'En cours de vérification',
  VERIFIED: 'Vérifié',
  CANCELED: 'Annulé',
};

/** `POST /identity/session`. Native credentials plus hosted fallback URL. */
export const identitySessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  ephemeralKeySecret: z.string(),
  url: z.string().url(),
});
export type IdentitySessionResponse = z.infer<typeof identitySessionResponseSchema>;

/**
 * Which Stripe Identity check a session runs.
 *
 * `DOCUMENT_ONLY` is the non-biometric alternative that `render.yaml`'s CONNECT_ENABLED
 * condition (c) requires. Mechanically it is `require_matching_selfie` omitted; see
 * `apps/api/src/identity/gateway.ts`.
 *
 * 🛑 BOTH VARIANTS GRANT THE SAME `IDENTITY` LEVEL AND THE SAME BADGE. That is the owner's
 * decision of 2026-09-02, on the ground that a non-biometric path granting less is a detriment
 * for refusing, and a detriment is what makes consent unfree. The variant is recorded for audit
 * and is never rendered to the USER - it may be shown to an operator for audit purposes.
 */
export const identityVariantSchema = z.enum(['DOCUMENT_AND_SELFIE', 'DOCUMENT_ONLY']);
export type IdentityVariant = z.infer<typeof identityVariantSchema>;

export const IDENTITY_VARIANT_LABEL: Record<IdentityVariant, string> = {
  DOCUMENT_AND_SELFIE: 'Document et selfie',
  DOCUMENT_ONLY: 'Document seul',
};

/**
 * Stripe's `redaction.status`, in our vocabulary.
 *
 * 🛑 THREE VALUES, NOT THE TWO STRIPE'S PROSE DOCS MENTION. Read out of the installed SDK's
 * `Redaction.Status` union, which is `'processing' | 'redacted' | 'validated' | (string & {})`.
 * `PROCESSING` and `VALIDATED` both mean « in flight » to every consumer, so nothing depends on
 * knowing which comes first - which is as well, because the docs do not say.
 */
export const redactionStatusSchema = z.enum(['PROCESSING', 'VALIDATED', 'REDACTED']);
export type RedactionStatus = z.infer<typeof redactionStatusSchema>;

export const REDACTION_STATUS_LABEL: Record<RedactionStatus, string> = {
  PROCESSING: 'En cours de traitement',
  VALIDATED: 'Validé',
  REDACTED: 'Supprimé (effacé)',
};

/**
 * `POST /identity/session`'s body.
 *
 * 🛑 THE OBJECT-LEVEL DEFAULT MUST BE A COMPLETE VALUE, NOT `{}`. Verified empirically against
 * zod 4.4.3 on 2026-09-02: `.default({})` returns the literal `{}` WITHOUT re-parsing it through
 * the shape, so `variant` arrives `undefined` at runtime while TypeScript types it as
 * non-optional. That passes `tsc` and hands `undefined` to Stripe. Spelling the default out in
 * full makes `{}`, `undefined` and an explicit variant all resolve correctly, and junk still
 * fails validation.
 *
 * The default also keeps build 6 working: `apps/mobile/src/lib/queries.ts` ships
 * `api.post('/identity/session', {})` in the binary on the client's phone.
 */
export const identitySessionRequestSchema = z
  .object({ variant: identityVariantSchema.default('DOCUMENT_AND_SELFIE') })
  .default({ variant: 'DOCUMENT_AND_SELFIE' });
export type IdentitySessionInput = z.infer<typeof identitySessionRequestSchema>;

/** `GET /identity/status`, and the response of `DELETE /identity/verification`. */
export type IdentityStatusResponse = {
  /** null when the réparateur has never started. The app renders the first-run card. */
  status: IdentityStatus | null;
  /** ISO 8601, or null. Stamped once and never cleared. */
  verifiedAt: string | null;
  /** Stripe's `last_error.code`, so the app can explain a failed check. */
  lastErrorCode: string | null;
  /** Stripe's own redaction progress. null when nothing has been redacted. */
  redactionStatus: RedactionStatus | null;
  /** ISO 8601. Non-null means the user asked us to erase; OURS, not Stripe's. */
  erasureRequestedAt: string | null;
  /**
   * 🛑 THE SERVER'S ANSWER, NOT A HINT. May this account start a document-only session?
   *
   * The app must NOT re-derive this. It is false exactly when a selfie fraud signal has been
   * recorded, and that column is in no DTO - an app reasoning from `lastErrorCode` would offer a
   * control the server then refuses with 403, which is `CF-10`'s Critical defect again (the app
   * answering a server question with data that does not contain the answer). It would also invert
   * silently after a redaction, because redaction may replace `last_error` with a placeholder.
   */
  documentOnlyAvailable: boolean;
  /**
   * Should the alternative be PROMINENT rather than quiet? True only for the codes where
   * document-only is genuinely the remedy. **This decides prominence, never availability.**
   */
  documentOnlyRecommended: boolean;
  /**
   * CF4-39. REVIME's decision on the CURRENT session, when it withdrew the validation. ACCEPTED is
   * reported as null: the réparateur just sees « validée ». A stale API omits it; read with `?? null`.
   */
  decision: 'REFUSED' | 'DOCUMENTS_REQUESTED' | null;
  /** `identityDecisionReasonFr(motif, note)` of that decision, or null. */
  decisionReason: string | null;
};
