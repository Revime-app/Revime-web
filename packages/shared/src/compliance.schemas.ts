import { sha256Hex } from './sha256.js';
import { z } from 'zod';
import { signupMethodSchema } from './signup-completion.js';

export const CURRENT_CGU_VERSION = '2026-10-10';
export const CURRENT_WITHDRAWAL_WAIVER_VERSION = '2026-10-06';

export const CANONICAL_CGU_ACCEPTANCE_TEXT =
  "L'utilisateur reconnaît avoir pris connaissance des Conditions Générales d'Utilisation de REVIME et les accepter avant d'utiliser les fonctionnalités de la plateforme.";

/** V9 B1 (`DEC9-05` (1)): the privacy policy's first version; bumped with the compiled text. */
export const CURRENT_PRIVACY_VERSION = '2026-11-19';

/** V9 B1 (`DEC9-05` (4)), plan copy: the privacy counterpart of the CGU proof text. */
export const CANONICAL_PRIVACY_ACCEPTANCE_TEXT =
  "L'utilisateur reconnaît avoir pris connaissance de la Politique de confidentialité de REVIME et l'accepter.";

export const consentProofKindSchema = z.enum([
  'CGU_ACCEPTANCE',
  'PRIVACY_ACCEPTANCE',
  'WITHDRAWAL_WAIVER_IMMEDIATE',
  'WITHDRAWAL_WAIVER_WAIT_14_DAYS',
]);
export type ConsentProofKind = z.infer<typeof consentProofKindSchema>;

export const createConsentProofInputSchema = z.object({
  userId: z.string().min(1),
  kind: consentProofKindSchema,
  cguVersion: z.string().nullable().optional(),
  waiverTextVersion: z.string().nullable().optional(),
  /** V9 B1: set on `PRIVACY_ACCEPTANCE` proofs. */
  privacyVersion: z.string().nullable().optional(),
  legalTextSnapshot: z.string().min(1),
  actionProof: z.string().min(1),
  commandeId: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  timestamp: z.union([z.string().datetime(), z.date()]).optional(),
});
export type CreateConsentProofInput = z.infer<typeof createConsentProofInputSchema>;

export const consentProofSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  kind: consentProofKindSchema,
  cguVersion: z.string().nullable().optional(),
  waiverTextVersion: z.string().nullable().optional(),
  /** V9 B1: set on `PRIVACY_ACCEPTANCE` proofs. */
  privacyVersion: z.string().nullable().optional(),
  legalTextSnapshot: z.string().min(1),
  actionProof: z.string().min(1),
  commandeId: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  checksum: z.string().min(1),
  metadata: z.unknown().nullable().optional(),
  timestamp: z.date(),
});
export type ConsentProofDto = z.infer<typeof consentProofSchema>;

const sha256 = sha256Hex;

export function computeConsentChecksum(params: {
  userId: string;
  kind: ConsentProofKind;
  timestamp: string | Date;
  actionProof: string;
  legalTextSnapshot: string;
  commandeId?: string | null;
  cguVersion?: string | null;
  waiverTextVersion?: string | null;
  privacyVersion?: string | null;
}): string {
  const tsIso = params.timestamp instanceof Date ? params.timestamp.toISOString() : new Date(params.timestamp).toISOString();
  const textHash = sha256(params.legalTextSnapshot);
  const canonical = `${params.userId}|${params.kind}|${tsIso}|${params.actionProof}|${textHash}|${params.commandeId ?? ''}|${params.cguVersion ?? ''}|${params.waiverTextVersion ?? ''}`;
  // V9 B1: appended ONLY when present, so every proof written before V9 keeps its checksum.
  return sha256(params.privacyVersion ? `${canonical}|${params.privacyVersion}` : canonical);
}

/** `actionProof` of every row written by the `20261011040000_consent_proof_storage` backfill. */
export const HISTORICAL_IMPORT_ACTION_PREFIX = 'HISTORICAL_IMPORT_';

/**
 * The checksum that backfill stored. The migration's SQL could not reproduce the canonical string
 * above, so it sealed each imported row with `sha256(<id>)` instead: the user id for a CGU row,
 * the commande id for a waiver row. Those rows are reconstructions made on 2026-10-11, not
 * contemporaneous proof, and the migration is applied in production (its file cannot be edited),
 * so the verifier has to know the scheme rather than call every one of them « tampered ».
 */
export function legacyImportChecksum(proof: {
  kind: ConsentProofKind;
  userId: string;
  commandeId?: string | null;
}): string {
  return sha256(proof.kind === 'CGU_ACCEPTANCE' ? proof.userId : (proof.commandeId ?? ''));
}

export function verifyConsentProofChecksum(proof: {
  userId: string;
  kind: ConsentProofKind;
  timestamp: string | Date;
  actionProof: string;
  legalTextSnapshot: string;
  commandeId?: string | null;
  cguVersion?: string | null;
  waiverTextVersion?: string | null;
  privacyVersion?: string | null;
  checksum: string;
}): { valid: boolean; calculatedChecksum: string; historicalImport: boolean } {
  const calculatedChecksum = computeConsentChecksum(proof);
  // `valid` means « unchanged since it was sealed », in whichever scheme it was sealed. An
  // imported row is flagged separately so no screen presents it as a contemporaneous proof.
  const historicalImport =
    proof.actionProof.startsWith(HISTORICAL_IMPORT_ACTION_PREFIX) &&
    legacyImportChecksum(proof) === proof.checksum;
  return {
    valid: calculatedChecksum === proof.checksum || historicalImport,
    calculatedChecksum,
    historicalImport,
  };
}

export const adminComplianceListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  kind: consentProofKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
export type AdminComplianceListQuery = z.infer<typeof adminComplianceListQuerySchema>;

export const adminComplianceItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  userEmail: z.string().email().nullable().optional(),
  /** V9 B1 (`DEC9-06` (1)): how the account signed up. */
  signupMethod: signupMethodSchema.nullable().optional(),
  kind: consentProofKindSchema,
  cguVersion: z.string().nullable().optional(),
  waiverTextVersion: z.string().nullable().optional(),
  /** V9 B1: set on `PRIVACY_ACCEPTANCE` proofs. */
  privacyVersion: z.string().nullable().optional(),
  legalTextSnapshot: z.string(),
  actionProof: z.string(),
  commandeId: z.string().nullable().optional(),
  ipAddress: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  checksum: z.string(),
  timestamp: z.string().datetime(),
  valid: z.boolean(),
  /** A backfilled row (reconstructed on 2026-10-11), sealed with the legacy scheme. */
  historicalImport: z.boolean(),
});
export type AdminComplianceItem = z.infer<typeof adminComplianceItemSchema>;

export const adminComplianceListResponseSchema = z.object({
  items: z.array(adminComplianceItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
export type AdminComplianceListResponse = z.infer<typeof adminComplianceListResponseSchema>;

export const adminComplianceVerifyResponseSchema = z.object({
  id: z.string(),
  valid: z.boolean(),
  historicalImport: z.boolean(),
  calculatedChecksum: z.string(),
  storedChecksum: z.string(),
  verifiedAt: z.string().datetime(),
});
export type AdminComplianceVerifyResponse = z.infer<typeof adminComplianceVerifyResponseSchema>;

