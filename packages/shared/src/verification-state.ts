import type { z } from 'zod';
import type { IdentityStatus } from './identity.schemas.js';
import type { repairerKindSchema, verificationLevelSchema } from './user.schemas.js';

/**
 * CF4-01: the réparateur's verification state, as shown on « Statut de vérification », Profil's MON IDENTITÉ
 * card and the « Vérification en cours » banner. Pure: no I/O, no runtime dependency, so mobile and the API's
 * unit tests derive exactly the same answer.
 *
 * Inputs are the DTO fields as the app receives them (`me.profile.verificationLevel`, `me.repairer?.kind`,
 * `GET /identity/status` `status` / `lastErrorCode`). Absent values are accepted as `null` / `undefined`.
 *
 * Precedence, first match wins:
 *   1. Identity floor met ⇒ VERIFIED. The floor is the one `assertIdentityVerified(…, 'offer')` enforces:
 *      IDENTITY or BUSINESS, but BUSINESS only for a PRO réparateur. The level is the conclusion, so a stale
 *      session status (e.g. an old REQUIRES_INPUT row) never downgrades a verified account.
 *   2. identityStatus PROCESSING ⇒ PENDING (documents sent, Stripe still checking).
 *   3. identityStatus REQUIRES_INPUT with a non-null lastErrorCode ⇒ REFUSED (a check failed; documents to redo).
 *      REQUIRES_INPUT without a code is a session opened but never submitted, which is still REQUIRED.
 *   4. Otherwise ⇒ REQUIRED. This includes a PRO at IDENTITY (identity done, the business step is still owed,
 *      so offers stay refused) and a CANCELED or never-started session.
 *
 * CF4-39 (sub-project M, spec §4.5): an operator's `decision` on the current session slots in after rule 1 -
 * REFUSED ⇒ REFUSED, DOCUMENTS_REQUESTED ⇒ DOCUMENTS_REQUESTED - and beats the Stripe rules. It is optional and
 * read with `?? null`, so a caller (or a stale API) that sends none gets exactly the four rules above.
 */
type VerificationLevel = z.infer<typeof verificationLevelSchema>;
type RepairerKind = z.infer<typeof repairerKindSchema>;

export type RepairerVerificationStateKind = 'REQUIRED' | 'PENDING' | 'VERIFIED' | 'REFUSED' | 'DOCUMENTS_REQUESTED';

/** The decisions that withdraw a validation; ACCEPTED is reported to the app as none. */
export type WithdrawingIdentityDecision = 'REFUSED' | 'DOCUMENTS_REQUESTED';

export type RepairerVerificationState = {
  state: RepairerVerificationStateKind;
  /** French label, ready to render. */
  label: string;
};

export const REPAIRER_VERIFICATION_LABELS: Readonly<Record<RepairerVerificationStateKind, string>> = {
  REQUIRED: 'Vérification requise',
  PENDING: 'Vérification en cours',
  VERIFIED: 'Vérification validée',
  REFUSED: 'Vérification refusée – documents à refaire',
  DOCUMENTS_REQUESTED: 'Nouveaux documents demandés',
};

/** Same floor as the API's offer gate (`apps/api/src/verification/gate.ts`). */
export function identityFloorMet(level: VerificationLevel, kind: RepairerKind | null | undefined): boolean {
  if (kind === 'PRO') return level === 'BUSINESS';
  return level === 'IDENTITY' || level === 'BUSINESS';
}

export function repairerVerificationState(
  level: VerificationLevel,
  kind: RepairerKind | null | undefined,
  identityStatus: IdentityStatus | null | undefined,
  lastErrorCode: string | null | undefined,
  decision?: WithdrawingIdentityDecision | null,
): RepairerVerificationState {
  let state: RepairerVerificationStateKind;
  if (identityFloorMet(level, kind)) state = 'VERIFIED';
  else if (decision === 'REFUSED') state = 'REFUSED';
  else if (decision === 'DOCUMENTS_REQUESTED') state = 'DOCUMENTS_REQUESTED';
  else if (identityStatus === 'PROCESSING') state = 'PENDING';
  else if (identityStatus === 'REQUIRES_INPUT' && lastErrorCode != null && lastErrorCode !== '') state = 'REFUSED';
  else state = 'REQUIRED';
  return { state, label: REPAIRER_VERIFICATION_LABELS[state] };
}

export const IDENTITY_REFUSAL_FALLBACK_FR = 'Documents non conformes. Veuillez recommencer.';

/**
 * Stripe Identity `last_error.code` values (the ones `apps/api/src/identity/error-codes.ts` reasons about, plus
 * the rest of Stripe's documented set) mapped to a French reason. Unknown or absent codes get the fallback.
 */
const IDENTITY_REFUSAL_REASONS_FR: Readonly<Record<string, string>> = {
  consent_declined: 'Vous avez refusé le consentement à la vérification.',
  under_supported_age: "Vous n'avez pas l'âge minimum requis pour la vérification.",
  country_not_supported: "Le pays de votre document n'est pas pris en charge.",
  document_expired: 'Votre document est expiré.',
  document_type_not_supported: "Ce type de document n'est pas accepté.",
  document_unverified_other: "Votre document n'a pas pu être vérifié.",
  selfie_document_missing_photo: 'Votre document ne comporte pas de photo exploitable.',
  selfie_face_mismatch: 'Votre selfie ne correspond pas à la photo du document.',
  selfie_manipulated: 'Votre selfie semble avoir été modifié.',
  selfie_unverified_other: "Votre selfie n'a pas pu être vérifié.",
};

export function identityRefusalReasonFr(code: string | null | undefined): string {
  if (code == null) return IDENTITY_REFUSAL_FALLBACK_FR;
  return Object.prototype.hasOwnProperty.call(IDENTITY_REFUSAL_REASONS_FR, code)
    ? IDENTITY_REFUSAL_REASONS_FR[code]!
    : IDENTITY_REFUSAL_FALLBACK_FR;
}
