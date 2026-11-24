import { describe, expect, it } from 'vitest';
import {
  BUSINESS_DECISION_MOTIF_LABEL,
  BUSINESS_LEGAL_FORMS,
  businessDecisionMotifSchema,
  businessDecisionSchema,
  businessDocumentAttachmentSchema,
  businessVerificationStatusSchema,
  submitBusinessVerificationSchema,
} from '../src/index.js';

describe('business.schemas', () => {
  describe('businessVerificationStatusSchema', () => {
    it('accepts valid statuses', () => {
      expect(businessVerificationStatusSchema.parse('PENDING')).toBe('PENDING');
      expect(businessVerificationStatusSchema.parse('APPROVED')).toBe('APPROVED');
      expect(businessVerificationStatusSchema.parse('REJECTED')).toBe('REJECTED');
      expect(businessVerificationStatusSchema.parse('DOCUMENTS_REQUIRED')).toBe('DOCUMENTS_REQUIRED');
    });

    it('rejects unknown statuses', () => {
      expect(() => businessVerificationStatusSchema.parse('UNKNOWN')).toThrow();
      expect(() => businessVerificationStatusSchema.parse('VERIFIED')).toThrow();
    });
  });

  describe('businessDecisionMotifSchema & labels', () => {
    it('contains all required motifs with exact French labels', () => {
      expect(businessDecisionMotifSchema.options).toEqual([
        'DIRIGEANT_MISMATCH',
        'DOCUMENT_EXPIRED',
        'DOCUMENT_ILLEGIBLE',
        'INVALID_SIRET',
        'INCORRECT_ADDRESS',
        'OTHER',
      ]);

      expect(BUSINESS_DECISION_MOTIF_LABEL.DIRIGEANT_MISMATCH).toBe(
        "Le nom du dirigeant ne correspond pas à l'identité vérifiée",
      );
      expect(BUSINESS_DECISION_MOTIF_LABEL.DOCUMENT_EXPIRED).toBe('Justificatif de plus de 3 mois');
      expect(BUSINESS_DECISION_MOTIF_LABEL.DOCUMENT_ILLEGIBLE).toBe('Justificatif illisible ou incomplet');
      expect(BUSINESS_DECISION_MOTIF_LABEL.INVALID_SIRET).toBe(
        'Numéro SIRET / SIREN invalide ou établissement fermé',
      );
      expect(BUSINESS_DECISION_MOTIF_LABEL.INCORRECT_ADDRESS).toBe('Adresse non conforme au justificatif');
      expect(BUSINESS_DECISION_MOTIF_LABEL.OTHER).toBe('Autre motif');
    });
  });

  describe('BUSINESS_LEGAL_FORMS', () => {
    it('includes standard French legal forms', () => {
      expect(BUSINESS_LEGAL_FORMS).toContain('Micro-entreprise / Auto-entrepreneur');
      expect(BUSINESS_LEGAL_FORMS).toContain('SAS');
      expect(BUSINESS_LEGAL_FORMS).toContain('SASU');
      expect(BUSINESS_LEGAL_FORMS).toContain('SARL');
      expect(BUSINESS_LEGAL_FORMS).toContain('EURL');
      expect(BUSINESS_LEGAL_FORMS).toContain('EI');
      expect(BUSINESS_LEGAL_FORMS).toContain('SA');
      expect(BUSINESS_LEGAL_FORMS).toContain('Autre');
    });
  });

  describe('businessDocumentAttachmentSchema', () => {
    it('accepts valid document attachment', () => {
      const valid = businessDocumentAttachmentSchema.safeParse({
        path: 'business-documents/u1/kbis.pdf',
        name: 'kbis-2026.pdf',
        sizeBytes: 102400,
      });
      expect(valid.success).toBe(true);
    });

    it('rejects files exceeding 10MB', () => {
      const invalid = businessDocumentAttachmentSchema.safeParse({
        path: 'business-documents/u1/kbis.pdf',
        name: 'kbis-2026.pdf',
        sizeBytes: 11 * 1024 * 1024,
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects empty path or name or non-positive size', () => {
      expect(
        businessDocumentAttachmentSchema.safeParse({
          path: '',
          name: 'kbis.pdf',
          sizeBytes: 100,
        }).success,
      ).toBe(false);

      expect(
        businessDocumentAttachmentSchema.safeParse({
          path: 'kbis.pdf',
          name: '',
          sizeBytes: 100,
        }).success,
      ).toBe(false);

      expect(
        businessDocumentAttachmentSchema.safeParse({
          path: 'kbis.pdf',
          name: 'kbis.pdf',
          sizeBytes: 0,
        }).success,
      ).toBe(false);
    });
  });

  describe('submitBusinessVerificationSchema', () => {
    it('validates a complete business verification submission', () => {
      const valid = submitBusinessVerificationSchema.safeParse({
        identifier: '98049100500016',
        denomination: 'REVIME REPAIR SAS',
        legalForm: 'SAS',
        establishmentAddress: '10 Rue de la Paix 75002 Paris',
        vatNumber: 'FR12980491005',
        registrationProof: {
          path: 'business-documents/u1/kbis.pdf',
          name: 'kbis-2026.pdf',
          sizeBytes: 102400,
        },
        insuranceProof: {
          path: 'business-documents/u1/rcpro.pdf',
          name: 'rc-pro.pdf',
          sizeBytes: 204800,
        },
      });
      expect(valid.success).toBe(true);
    });

    it('validates submission without optional vatNumber and insuranceProof', () => {
      const valid = submitBusinessVerificationSchema.safeParse({
        identifier: '98049100500016',
        denomination: 'REVIME REPAIR SAS',
        legalForm: 'SAS',
        establishmentAddress: '10 Rue de la Paix 75002 Paris',
        registrationProof: {
          path: 'business-documents/u1/kbis.pdf',
          name: 'kbis-2026.pdf',
          sizeBytes: 102400,
        },
      });
      expect(valid.success).toBe(true);
    });

    it('rejects empty denomination, legal form, or too short address', () => {
      const invalid = submitBusinessVerificationSchema.safeParse({
        identifier: '98049100500016',
        denomination: '  ',
        legalForm: '',
        establishmentAddress: 'Rue',
        registrationProof: {
          path: 'business-documents/u1/kbis.pdf',
          name: 'kbis-2026.pdf',
          sizeBytes: 102400,
        },
      });
      expect(invalid.success).toBe(false);
    });

    it('rejects invalid SIRET / SIREN identifier', () => {
      const invalid = submitBusinessVerificationSchema.safeParse({
        identifier: '123456789', // Invalid Luhn
        denomination: 'REVIME REPAIR SAS',
        legalForm: 'SAS',
        establishmentAddress: '10 Rue de la Paix 75002 Paris',
        registrationProof: {
          path: 'business-documents/u1/kbis.pdf',
          name: 'kbis-2026.pdf',
          sizeBytes: 102400,
        },
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe('businessDecisionSchema', () => {
    it('accepts motif without note when motif is not OTHER', () => {
      const valid = businessDecisionSchema.safeParse({
        motif: 'DIRIGEANT_MISMATCH',
      });
      expect(valid.success).toBe(true);
    });

    it('accepts motif with optional note when motif is not OTHER', () => {
      const valid = businessDecisionSchema.safeParse({
        motif: 'DIRIGEANT_MISMATCH',
        note: 'Le dirigeant indiqué est Jean Dupont',
      });
      expect(valid.success).toBe(true);
    });

    it('requires non-empty note when decision motif is OTHER', () => {
      const withoutNote = businessDecisionSchema.safeParse({
        motif: 'OTHER',
      });
      expect(withoutNote.success).toBe(false);

      const withWhitespaceNote = businessDecisionSchema.safeParse({
        motif: 'OTHER',
        note: '   ',
      });
      expect(withWhitespaceNote.success).toBe(false);

      const withNote = businessDecisionSchema.safeParse({
        motif: 'OTHER',
        note: 'Documents flous et non lisibles',
      });
      expect(withNote.success).toBe(true);
    });
  });
});
