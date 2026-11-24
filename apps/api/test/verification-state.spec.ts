import { describe, expect, it } from 'vitest';
import {
  IDENTITY_REFUSAL_FALLBACK_FR,
  REPAIRER_VERIFICATION_LABELS,
  identityRefusalReasonFr,
  repairerVerificationState,
} from '@revime/shared';

/**
 * CF4-01, requirement 2.2: the verification state the réparateur sees. `apps/mobile` has no test harness, so the
 * pure derivation is pinned here. Exhaustive over the finite domain (no fast-check in this workspace).
 */
const LEVELS = ['NONE', 'BASIC', 'IDENTITY', 'BUSINESS'] as const;
const KINDS = ['PRO', 'INDIVIDUAL', null, undefined] as const;
const STATUSES = ['REQUIRES_INPUT', 'PROCESSING', 'VERIFIED', 'CANCELED', null, undefined] as const;
const CODES = [null, undefined, 'document_expired', 'unknown_future_code'] as const;

const cases = LEVELS.flatMap((level) =>
  KINDS.flatMap((kind) =>
    STATUSES.flatMap((status) => CODES.map((code) => ({ level, kind, status, code }))),
  ),
);

describe('repairerVerificationState — exhaustive invariants', () => {
  it.each(cases)('$level / $kind / $status / $code', ({ level, kind, status, code }) => {
    const r = repairerVerificationState(level, kind, status, code);
    const floorMet = kind === 'PRO' ? level === 'BUSINESS' : level === 'IDENTITY' || level === 'BUSINESS';

    // Result is one of the four states, with its French label.
    expect(['REQUIRED', 'PENDING', 'VERIFIED', 'REFUSED']).toContain(r.state);
    expect(r.label).toBe(REPAIRER_VERIFICATION_LABELS[r.state]);

    // VERIFIED iff the offer-gate floor is met (PRO ⇒ BUSINESS only).
    expect(r.state === 'VERIFIED').toBe(floorMet);
    if (kind === 'PRO') expect(r.state === 'VERIFIED').toBe(level === 'BUSINESS');

    if (!floorMet) {
      // PROCESSING ⇒ PENDING.
      expect(r.state === 'PENDING').toBe(status === 'PROCESSING');
      // REQUIRES_INPUT with a code ⇒ REFUSED; nothing else is REFUSED.
      expect(r.state === 'REFUSED').toBe(status === 'REQUIRES_INPUT' && code != null);
    }
  });

  it('uses the exact French labels', () => {
    expect(REPAIRER_VERIFICATION_LABELS).toEqual({
      REQUIRED: 'Vérification requise',
      PENDING: 'Vérification en cours',
      VERIFIED: 'Vérification validée',
      REFUSED: 'Vérification refusée – documents à refaire',
      // CF4-39 (sub-project M).
      DOCUMENTS_REQUESTED: 'Nouveaux documents demandés',
    });
  });

  it('keeps a PRO at IDENTITY in REQUIRED: the business step is still owed', () => {
    expect(repairerVerificationState('IDENTITY', 'PRO', 'VERIFIED', null).state).toBe('REQUIRED');
  });

  it('a verified level wins over a stale failed session', () => {
    expect(repairerVerificationState('IDENTITY', 'INDIVIDUAL', 'REQUIRES_INPUT', 'document_expired').state).toBe(
      'VERIFIED',
    );
  });
});

describe('identityRefusalReasonFr', () => {
  it.each([
    ['document_expired', 'Votre document est expiré.'],
    ['selfie_face_mismatch', 'Votre selfie ne correspond pas à la photo du document.'],
    ['consent_declined', 'Vous avez refusé le consentement à la vérification.'],
    ['document_type_not_supported', "Ce type de document n'est pas accepté."],
    ['document_unverified_other', "Votre document n'a pas pu être vérifié."],
    ['selfie_unverified_other', "Votre selfie n'a pas pu être vérifié."],
  ])('%s', (code, reason) => {
    expect(identityRefusalReasonFr(code)).toBe(reason);
  });

  it.each([null, undefined, '', 'unknown_future_code', 'toString', '__proto__'])('falls back for %s', (code) => {
    expect(identityRefusalReasonFr(code)).toBe(IDENTITY_REFUSAL_FALLBACK_FR);
    expect(IDENTITY_REFUSAL_FALLBACK_FR).toBe('Documents non conformes. Veuillez recommencer.');
  });
});


/**
 * CF4-39 (sub-project M, spec §4.5). The operator's decision, precedence first match wins:
 * floor met → VERIFIED; REFUSED → REFUSED; DOCUMENTS_REQUESTED → DOCUMENTS_REQUESTED; then
 * today's rules. The exhaustive table above passes no decision and stays unchanged.
 */
describe('repairerVerificationState — operator decision', () => {
  it('a met floor wins over a refusal', () => {
    expect(repairerVerificationState('IDENTITY', 'INDIVIDUAL', 'VERIFIED', null, 'REFUSED').state).toBe('VERIFIED');
    expect(repairerVerificationState('BUSINESS', 'PRO', 'VERIFIED', null, 'DOCUMENTS_REQUESTED').state).toBe(
      'VERIFIED',
    );
  });

  it('a refused BASIC réparateur on a Stripe-verified session reads REFUSED', () => {
    const r = repairerVerificationState('BASIC', 'INDIVIDUAL', 'VERIFIED', null, 'REFUSED');
    expect(r).toEqual({ state: 'REFUSED', label: 'Vérification refusée – documents à refaire' });
  });

  it('a documents request reads DOCUMENTS_REQUESTED « Nouveaux documents demandés »', () => {
    const r = repairerVerificationState('BASIC', 'PRO', 'VERIFIED', null, 'DOCUMENTS_REQUESTED');
    expect(r).toEqual({ state: 'DOCUMENTS_REQUESTED', label: 'Nouveaux documents demandés' });
    expect(REPAIRER_VERIFICATION_LABELS.DOCUMENTS_REQUESTED).toBe('Nouveaux documents demandés');
  });

  it('the decision beats a Stripe code and a PROCESSING session', () => {
    expect(repairerVerificationState('BASIC', 'INDIVIDUAL', 'REQUIRES_INPUT', 'document_expired', 'DOCUMENTS_REQUESTED').state).toBe(
      'DOCUMENTS_REQUESTED',
    );
    expect(repairerVerificationState('BASIC', 'INDIVIDUAL', 'PROCESSING', null, 'REFUSED').state).toBe('REFUSED');
  });

  it.each([null, undefined])('no decision (%s) keeps today’s results', (decision) => {
    expect(repairerVerificationState('BASIC', 'INDIVIDUAL', 'VERIFIED', null, decision).state).toBe('REQUIRED');
    expect(repairerVerificationState('BASIC', 'INDIVIDUAL', 'PROCESSING', null, decision).state).toBe('PENDING');
    expect(repairerVerificationState('BASIC', 'INDIVIDUAL', 'REQUIRES_INPUT', 'x', decision).state).toBe('REFUSED');
  });
});
