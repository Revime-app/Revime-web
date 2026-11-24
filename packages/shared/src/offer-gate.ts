import type { z } from 'zod';
import type { BusinessVerificationStatus } from './business.schemas.js';
import type { IdentityStatus } from './identity.schemas.js';
import type { repairerKindSchema, verificationLevelSchema } from './user.schemas.js';
import {
  identityFloorMet,
  repairerVerificationState,
  type WithdrawingIdentityDecision,
} from './verification-state.js';

type VerificationLevel = z.infer<typeof verificationLevelSchema>;
type RepairerKind = z.infer<typeof repairerKindSchema>;

/**
 * V8 E1, `DEC8-08` (6): why the server would refuse an offer, so the app can say so at « Faire une offre »
 * instead of after the whole form. One case per refusal the offer route makes, in its order
 * (`OffersService.create`: `assertBasicVerified`, then `assertIdentityVerified`, which wants BUSINESS for a PRO).
 * The private-individual cap and the warranty rule are not here: the first keeps its own message, the second is
 * a field of the form. The server stays the final check; `apps/api/test/v8-e1-offer-gate-parity.spec.ts` proves
 * the identity half agrees with it row for row.
 */
export type OfferBlock =
  | 'BASIC'
  | 'IDENTITY'
  | 'IDENTITY_PENDING'
  | 'BUSINESS'
  | 'BUSINESS_PENDING'
  | 'BUSINESS_REDO';

export type OfferBlockInput = {
  level: VerificationLevel;
  kind: RepairerKind | null | undefined;
  identityStatus: IdentityStatus | null;
  lastErrorCode: string | null;
  identityDecision: WithdrawingIdentityDecision | null;
  businessStatus: BusinessVerificationStatus | null;
  /** `MeResponse.verificationRequired`: the e-mail/phone gate is on. */
  basicRequired: boolean;
  /**
   * `MeResponse.identityRequired && connectEnabled` (CF-10): the identity gate is on AND a grant path exists. With
   * Connect off there is no way to verify, so the app must not lock a button it cannot unlock.
   */
  identityRequired: boolean;
};

export function offerBlock(input: OfferBlockInput): OfferBlock | null {
  if (input.level === 'NONE' && input.basicRequired) return 'BASIC';
  if (identityFloorMet(input.level, input.kind)) return null;
  if (!input.identityRequired) return null;

  // V7 A3: a PRO whose identity is verified is missing the business step, not the identity one.
  if (input.kind === 'PRO' && input.level === 'IDENTITY') {
    if (input.businessStatus === 'PENDING') return 'BUSINESS_PENDING';
    if (input.businessStatus === 'REJECTED' || input.businessStatus === 'DOCUMENTS_REQUIRED') return 'BUSINESS_REDO';
    return 'BUSINESS';
  }

  const state = repairerVerificationState(
    input.level,
    input.kind,
    input.identityStatus,
    input.lastErrorCode,
    input.identityDecision,
  ).state;
  // A session Stripe VERIFIED whose level has not caught up yet (the webhook lags) is waiting too: sending him to
  // verify again would start a second, billed session for nothing.
  const lagging = input.identityStatus === 'VERIFIED' && input.identityDecision === null;
  if (state === 'PENDING' || lagging) return 'IDENTITY_PENDING';
  return 'IDENTITY';
}

/**
 * The server's sentence for a business verification under way or to redo, null when there is none. The offer gate
 * (`apps/api/src/verification/gate.ts`) refuses with it, the CGU art. 53 cap (V7 A10) says the same, and since V8 E1
 * the app's offer sheet shows it, so all three read identical words.
 */
export function businessStepRefusal(status: string | null | undefined): string | null {
  if (status === 'PENDING') {
    // The client's own « Vérification en cours » message, V2 §2.
    return 'Vérification en cours. Vous pourrez envoyer des offres dès que votre vérification sera validée.';
  }
  if (status === 'REJECTED' || status === 'DOCUMENTS_REQUIRED') {
    return "Votre vérification d'entreprise est à refaire : ouvrez « Mon entreprise » pour en voir le motif.";
  }
  return null;
}
