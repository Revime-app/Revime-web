import { describe, expect, it } from 'vitest';
import {
  ADMIN_AUDIT_ACTION_LABEL,
  ADMIN_AUDIT_ACTIONS,
  IDENTITY_DECISION_MOTIF_LABEL,
  identityAcceptInputSchema,
  identityDecisionMotifSchema,
  identityDecisionReasonFr,
  identityDecisionSchema,
  identityRefuseInputSchema,
} from '@revime/shared';

/**
 * CF4-39 (sub-project M, spec §4.5). The shared contract an operator's identity decision is
 * written and read through: the motif labels the app shows, the admin form's validation, and
 * the three audit actions.
 */

const issue = (r: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }, path: string) =>
  r.error?.issues.find((i) => i.path.join('.') === path)?.message;

describe('identity decision enums', () => {
  it('lists the three decisions and five motifs in order', () => {
    expect(identityDecisionSchema.options).toEqual(['ACCEPTED', 'REFUSED', 'DOCUMENTS_REQUESTED']);
    expect(identityDecisionMotifSchema.options).toEqual([
      'ILLEGIBLE',
      'EXPIRED',
      'INCONSISTENT',
      'WRONG_DOCUMENT',
      'OTHER',
    ]);
  });

  it('labels each motif exactly as the spec says', () => {
    expect(IDENTITY_DECISION_MOTIF_LABEL).toEqual({
      ILLEGIBLE: 'Document illisible',
      EXPIRED: 'Document expiré',
      INCONSISTENT: 'Document incohérent',
      WRONG_DOCUMENT: 'Mauvais document',
      OTHER: 'Autre',
    });
  });
});

describe('identityDecisionReasonFr', () => {
  it('is the motif label', () => {
    expect(identityDecisionReasonFr('ILLEGIBLE', null)).toBe('Document illisible');
    expect(identityDecisionReasonFr('EXPIRED', 'ignored')).toBe('Document expiré');
  });

  it('carries the note for Autre', () => {
    expect(identityDecisionReasonFr('OTHER', 'Photo coupée')).toBe('Autre : Photo coupée');
    expect(identityDecisionReasonFr('OTHER', null)).toBe('Autre');
  });

  it('is null without a motif', () => {
    expect(identityDecisionReasonFr(null, null)).toBeNull();
  });
});

describe('identityRefuseInputSchema', () => {
  it('requires a known motif', () => {
    expect(issue(identityRefuseInputSchema.safeParse({}), 'motif')).toBe('Choisissez un motif.');
    expect(issue(identityRefuseInputSchema.safeParse({ motif: 'NOPE' }), 'motif')).toBe('Choisissez un motif.');
  });

  it('requires a note for Autre, blank counting as none', () => {
    expect(issue(identityRefuseInputSchema.safeParse({ motif: 'OTHER' }), 'note')).toBe('Précisez le motif.');
    expect(issue(identityRefuseInputSchema.safeParse({ motif: 'OTHER', note: '   ' }), 'note')).toBe(
      'Précisez le motif.',
    );
    expect(identityRefuseInputSchema.parse({ motif: 'OTHER', note: 'Photo coupée' })).toEqual({
      motif: 'OTHER',
      note: 'Photo coupée',
    });
  });

  it('caps the note at 500 characters', () => {
    const r = identityRefuseInputSchema.safeParse({ motif: 'EXPIRED', note: 'x'.repeat(501) });
    expect(issue(r, 'note')).toBe('500 caractères maximum.');
    expect(identityRefuseInputSchema.safeParse({ motif: 'EXPIRED', note: 'x'.repeat(500) }).success).toBe(true);
  });

  it('trims the note and drops a blank one', () => {
    expect(identityRefuseInputSchema.parse({ motif: 'EXPIRED', note: ' x ' })).toEqual({ motif: 'EXPIRED', note: 'x' });
    expect(identityRefuseInputSchema.parse({ motif: 'EXPIRED', note: '  ' })).toEqual({ motif: 'EXPIRED' });
  });
});

describe('identityAcceptInputSchema', () => {
  it('requires a justification note of at least 5 characters', () => {
    expect(issue(identityAcceptInputSchema.safeParse({}), 'note')).toBe(
      "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).",
    );
    expect(issue(identityAcceptInputSchema.safeParse({ note: '   ' }), 'note')).toBe(
      "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).",
    );
    expect(issue(identityAcceptInputSchema.safeParse({ note: 'vu' }), 'note')).toBe(
      "Le motif d'acceptation manuelle est obligatoire (au moins 5 caractères).",
    );
    expect(issue(identityAcceptInputSchema.safeParse({ note: 'x'.repeat(501) }), 'note')).toBe(
      '500 caractères maximum.',
    );
    expect(identityAcceptInputSchema.parse({ note: '  Vu dans Stripe  ' })).toEqual({
      note: 'Vu dans Stripe',
    });
  });
});

describe('identity decision audit actions', () => {
  it('adds the three actions with their labels', () => {
    expect(ADMIN_AUDIT_ACTIONS).toEqual(
      expect.arrayContaining(['identity.accept', 'identity.refuse', 'identity.request_documents']),
    );
    expect(ADMIN_AUDIT_ACTION_LABEL['identity.accept']).toBe("Acceptation manuelle d'identité");
    expect(ADMIN_AUDIT_ACTION_LABEL['identity.refuse']).toBe("Refus d'identité");
    expect(ADMIN_AUDIT_ACTION_LABEL['identity.request_documents']).toBe('Demande de nouveaux documents');
  });

  it('keeps the existing revoke action', () => {
    expect(ADMIN_AUDIT_ACTIONS).toContain('repairer.verification_revoke');
  });
});
