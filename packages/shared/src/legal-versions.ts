import { z } from 'zod';

/**
 * V7 D5 (U9b, `DEC7-24` / `DEC7-25`). Published versions of the CGU and the mentions légales: one PDF
 * each (the client writes his legal texts as PDFs), a date for a version, never deleted or replaced
 * because consent proofs point at them. Which version is active lives on `PlatformSettings`
 * (`cguCurrentVersion`, `legalNoticeVersion`), which the dashboard's dropdowns set.
 */
export const LEGAL_DOCUMENT_KINDS = ['CGU', 'MENTIONS_LEGALES'] as const;
export const legalDocumentKindSchema = z.enum(LEGAL_DOCUMENT_KINDS);
export type LegalDocumentKind = z.infer<typeof legalDocumentKindSchema>;

/** A version is its date, `YYYY-MM-DD`, unique per document (Q14). */
export const legalVersionSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La version est une date (AAAA-MM-JJ).');

export const LEGAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

export function legalDocumentSlug(kind: LegalDocumentKind): 'cgu' | 'mentions-legales' {
  return kind === 'CGU' ? 'cgu' : 'mentions-legales';
}

export function legalDocumentKindFromSlug(slug: string): LegalDocumentKind | null {
  return slug === 'cgu' ? 'CGU' : slug === 'mentions-legales' ? 'MENTIONS_LEGALES' : null;
}

/** Where the PDF sits in the `legal-documents` bucket. */
export function legalDocumentStoragePath(kind: LegalDocumentKind, version: string): string {
  return `${legalDocumentSlug(kind)}/${version}.pdf`;
}

/** The public read route under `/api/v1`, which redirects to a short-lived signed URL. */
export function legalDocumentPath(kind: LegalDocumentKind, version: string): string {
  return `/legal-documents/${legalDocumentSlug(kind)}/${version}`;
}

/** `2026-10-10` → `10/10/2026`, with no time zone involved: the version is a calendar date. */
export function formatLegalVersionDate(version: string): string {
  const [y, m, d] = version.split('-');
  return `${d}/${m}/${y}`;
}

export const legalDocumentVersionDtoSchema = z.object({
  id: z.string(),
  kind: legalDocumentKindSchema,
  version: z.string(),
  fileName: z.string(),
  sizeBytes: z.number().int(),
  sha256: z.string(),
  summary: z.string().nullable(),
  publishedAt: z.string(),
  publishedByUserId: z.string().nullable(),
});
export type LegalDocumentVersionDto = z.infer<typeof legalDocumentVersionDtoSchema>;

/** Newest first per document. */
export type AdminLegalVersionsResponse = { cgu: LegalDocumentVersionDto[]; mentionsLegales: LegalDocumentVersionDto[] };

export const signLegalUploadSchema = z.object({ kind: legalDocumentKindSchema, version: legalVersionSchema });
export type SignLegalUploadInput = z.infer<typeof signLegalUploadSchema>;
export type SignLegalUploadResponse = { path: string; uploadUrl: string };

export const publishLegalVersionSchema = z
  .object({
    kind: legalDocumentKindSchema,
    version: legalVersionSchema,
    path: z.string().min(1),
    summary: z.string().trim().max(500).nullable().optional(),
    activate: z.boolean(),
  })
  .refine((v) => v.path === legalDocumentStoragePath(v.kind, v.version), {
    message: 'Le fichier ne correspond pas à ce document et cette version.',
    path: ['path'],
  })
  .refine((v) => v.kind === 'CGU' || !v.summary, {
    message: 'Seules les CGU ont un résumé des changements.',
    path: ['summary'],
  });
export type PublishLegalVersionInput = z.infer<typeof publishLegalVersionSchema>;

export const acceptCguSchema = z.object({ version: legalVersionSchema });
export type AcceptCguInput = z.infer<typeof acceptCguSchema>;

/** V9 B1: the terms screen's « Continuer »; the privacy version is the server's active one. */
export const acceptSignupTermsSchema = z.object({ cguVersion: legalVersionSchema });
export type AcceptSignupTermsInput = z.infer<typeof acceptSignupTermsSchema>;

export const REACCEPT_TITLE = "Nos conditions d'utilisation évoluent";
export const REACCEPT_CHECKBOX_LABEL = "J'ai lu et j'accepte les Conditions Générales d'Utilisation";
export const CGU_REACCEPT_REQUIRED_TEXT = "Acceptez les nouvelles Conditions Générales d'Utilisation pour continuer.";
