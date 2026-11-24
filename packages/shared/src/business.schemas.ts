import { z } from 'zod';

/**
 * A SIREN or SIRET as the réparateur typed it, reduced to digits.
 *
 * France writes a SIRET as « 980 491 005 00016 » and registries print it with dots,
 * so stripping is normalising rather than being lenient - the length check below is
 * what refuses garbage.
 */
export function normaliseCompanyIdentifier(input: string): string {
  return input.replace(/\D/g, '');
}

/**
 * The SIREN checksum, which is Luhn over the nine digits.
 *
 * Verified on 2026-08-19 against four SIREN values read back from the registry -
 * 356000000 (La Poste, the documented edge case), 120027016, 980491005 and
 * 401304589, all valid - and against the bogus 123456789, which is not. That bogus
 * value is exactly what the registry's fuzzy search answers a row for, so this is
 * the check that keeps garbage off the network.
 */
export function isLuhnValid(digits: string): boolean {
  let total = 0;
  for (let i = 0; i < digits.length; i += 1) {
    // Position counted from the RIGHT: every second digit doubles.
    const fromRight = digits.length - 1 - i;
    let value = digits.charCodeAt(i) - 48;
    if (fromRight % 2 === 1) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    total += value;
  }
  return total % 10 === 0;
}

export const COMPANY_IDENTIFIER_INVALID_FR = 'Indiquez un numéro SIREN ou SIRET valide.';

/**
 * Accepts a SIREN (9 digits) or a SIRET (14), and Luhn-checks the LEADING NINE only.
 *
 * Not all fourteen, deliberately: La Poste's SIRETs are documented as following a
 * different rule, that documentation was never verified here, and refusing a real
 * company on an unverified rule is worse than letting the registry answer. Whether
 * an établissement exists is the registry's job.
 */
export const companyIdentifierSchema = z
  .string()
  .transform(normaliseCompanyIdentifier)
  .refine((v) => v.length === 9 || v.length === 14, { message: COMPANY_IDENTIFIER_INVALID_FR })
  .refine((v) => isLuhnValid(v.slice(0, 9)), { message: COMPANY_IDENTIFIER_INVALID_FR });

/**
 * A SIREN specifically (9 digits), extracted for the operator registry lookup route.
 * The réparateur-facing route uses `companyIdentifierSchema`, which accepts both SIREN
 * and SIRET. This validates the same rules against a SIREN alone, so both routes share
 * the validation rather than stating it twice with drift.
 */
export const sirenSchema = z
  .string()
  .transform(normaliseCompanyIdentifier)
  .refine((v) => v.length === 9, { message: COMPANY_IDENTIFIER_INVALID_FR })
  .refine((v) => isLuhnValid(v), { message: COMPANY_IDENTIFIER_INVALID_FR });

/** `POST /business/verify`. */
export const verifyBusinessSchema = z.object({ identifier: companyIdentifierSchema });
export type VerifyBusinessInput = z.infer<typeof verifyBusinessSchema>;

/**
 * CF5-07 Professional Business Verification status lifecycle.
 */
export const businessVerificationStatusSchema = z.enum([
  'PENDING',
  'APPROVED',
  'REJECTED',
  'DOCUMENTS_REQUIRED',
]);
export type BusinessVerificationStatus = z.infer<typeof businessVerificationStatusSchema>;

/**
 * CF5-07 Operator decision motifs for refusing or requesting new documents.
 */
export const businessDecisionMotifSchema = z.enum([
  'DIRIGEANT_MISMATCH',
  'DOCUMENT_EXPIRED',
  'DOCUMENT_ILLEGIBLE',
  'INVALID_SIRET',
  'INCORRECT_ADDRESS',
  'OTHER',
]);
export type BusinessDecisionMotif = z.infer<typeof businessDecisionMotifSchema>;

export const BUSINESS_DECISION_MOTIF_LABEL: Record<BusinessDecisionMotif, string> = {
  DIRIGEANT_MISMATCH: "Le nom du dirigeant ne correspond pas à l'identité vérifiée",
  DOCUMENT_EXPIRED: 'Justificatif de plus de 3 mois',
  DOCUMENT_ILLEGIBLE: 'Justificatif illisible ou incomplet',
  INVALID_SIRET: 'Numéro SIRET / SIREN invalide ou établissement fermé',
  INCORRECT_ADDRESS: 'Adresse non conforme au justificatif',
  OTHER: 'Autre motif',
};

export const BUSINESS_LEGAL_FORMS = [
  'Micro-entreprise / Auto-entrepreneur',
  'SAS',
  'SASU',
  'SARL',
  'EURL',
  'EI',
  'SA',
  'Autre',
] as const;
export type BusinessLegalForm = (typeof BUSINESS_LEGAL_FORMS)[number];

export const businessDocumentAttachmentSchema = z.object({
  path: z.string().min(1),
  name: z.string().min(1),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024),
});
export type BusinessDocumentAttachment = z.infer<typeof businessDocumentAttachmentSchema>;

export const submitBusinessVerificationSchema = z.object({
  identifier: companyIdentifierSchema,
  denomination: z.string().trim().min(1, 'Indiquez la raison sociale.').max(255),
  legalForm: z.string().trim().min(1, 'Sélectionnez la forme juridique.').max(100),
  establishmentAddress: z
    .string()
    .trim()
    .min(5, "Indiquez l'adresse complète de l'établissement.")
    .max(500),
  vatNumber: z.string().trim().max(50).nullable().optional(),
  registrationProof: businessDocumentAttachmentSchema,
  insuranceProof: businessDocumentAttachmentSchema.nullable().optional(),
});
export type SubmitBusinessVerificationInput = z.infer<typeof submitBusinessVerificationSchema>;

export const signDocumentUploadSchema = z.object({
  filename: z.string().trim().min(1, 'Nom de fichier requis.').max(255),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png'], {
    message: 'Format de fichier non supporté (PDF, JPEG, PNG uniquement).',
  }),
  sizeBytes: z.number().int().positive().max(10 * 1024 * 1024, 'Le fichier ne doit pas dépasser 10 Mo.'),
});
export type SignDocumentUploadInput = z.infer<typeof signDocumentUploadSchema>;

export const lookupCompanySchema = z.object({
  identifier: companyIdentifierSchema,
});
export type LookupCompanyInput = z.infer<typeof lookupCompanySchema>;

export type LookupCompanyResponse =
  | { found: false }
  | {
      found: true;
      company: {
        siren: string;
        siret: string | null;
        denomination: string | null;
        legalForm: string | null;
        address: string | null;
      };
    };

export const businessDecisionSchema = z
  .object({
    motif: businessDecisionMotifSchema,
    note: z.string().trim().max(500).optional(),
  })
  .refine(
    (val) => val.motif !== 'OTHER' || (Boolean(val.note) && val.note!.trim().length > 0),
    { message: 'Précisez le motif pour la valeur Autre.', path: ['note'] },
  );
export type BusinessDecisionInput = z.infer<typeof businessDecisionSchema>;

/**
 * The verified company, as the REGISTRY gave it and never as the réparateur typed
 * it. A client-supplied denomination must never reach a screen that calls it
 * verified.
 */
export type VerifiedCompany = {
  siren: string;
  /** Present only when he named an établissement rather than the legal unit. */
  siret: string | null;
  /** null when INSEE hides the unit's identity. The app then names no company. */
  denomination: string | null;
  establishmentAddress: string | null;
  /** ISO 8601. Re-stamped on a correction, because a corrected claim is a new one. */
  verifiedAt: string;
};

/**
 * `GET /business/status` response.
 */
export type BusinessStatusResponse = {
  verified: boolean;
  status: BusinessVerificationStatus | null;
  canEdit: boolean;
  company: {
    siren: string;
    siret: string | null;
    denomination: string;
    legalForm: string;
    establishmentAddress: string;
    vatNumber: string | null;
    dirigeantName: string;
    registrationProofName: string;
    insuranceProofName: string | null;
    submittedAt: string;
    verifiedAt: string | null;
  } | null;
  decision: {
    motif: BusinessDecisionMotif;
    note: string | null;
    decidedAt: string;
  } | null;
};

/**
 * Admin view of professional business verification details.
 */
export type AdminBusinessDetailsResponse = {
  userId: string;
  user: {
    name: string;
    email: string;
    avatarUrl: string | null;
    verifiedIdentityName: string | null;
  };
  business: {
    siren: string;
    siret: string | null;
    denomination: string;
    legalForm: string;
    establishmentAddress: string;
    vatNumber: string | null;
    dirigeantName: string;
    registrationProof: {
      name: string;
      sizeBytes: number;
      url: string;
    };
    insuranceProof: {
      name: string;
      sizeBytes: number;
      url: string;
    } | null;
    status: BusinessVerificationStatus;
    submittedAt: string;
    verifiedAt: string | null;
  } | null;
  decision: {
    motif: BusinessDecisionMotif;
    note: string | null;
    decidedAt: string;
    decidedByEmail?: string | null;
  } | null;
};
