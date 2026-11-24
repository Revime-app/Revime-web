import {
  LEGAL_DOCUMENT_MAX_BYTES,
  formatLegalVersionDate,
  legalDocumentPath,
  legalVersionSchema,
  resolveApiErrorMessage,
  type LegalDocumentKind,
  type LegalDocumentVersionDto,
  type SignLegalUploadResponse,
} from '@revime/shared';

/**
 * V7 D5 (U9b, `DEC7-24` Q14). Réglages → CGU & Légal. Pure helpers and the publish sequence, so the
 * page stays a view and this can be tested without a browser.
 */
export const LEGAL_VERSIONS_ENDPOINT = '/api/proxy/admin/legal-documents';

/** « Lire »: the public route, through the same-origin proxy; it redirects to a signed PDF URL. */
export function legalReadHref(kind: LegalDocumentKind, version: string): string {
  return `/api/proxy${legalDocumentPath(kind, version)}`;
}

const publishedDay = (iso: string) =>
  new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Paris' }).format(new Date(iso));

/**
 * The dropdown's options, newest first as the API sends them. A stored value that names no published
 * version (only possible before U9b's migration) stays visible, marked, rather than silently changing.
 */
export function versionOptions(list: LegalDocumentVersionDto[], current: string): { value: string; label: string }[] {
  const options = list.map((v) => ({ value: v.version, label: `${formatLegalVersionDate(v.version)} · publiée le ${publishedDay(v.publishedAt)}` }));
  return options.some((o) => o.value === current) ? options : [{ value: current, label: `${current} (non publiée)` }, ...options];
}

export function publishFormError(input: { version: string; file: Blob | null }): string | null {
  const version = legalVersionSchema.safeParse(input.version);
  if (!version.success) return version.error.issues[0]?.message ?? 'Version invalide.';
  if (!input.file) return 'Choisissez le fichier PDF.';
  if (input.file.type !== 'application/pdf') return 'Le fichier doit être un PDF.';
  if (input.file.size > LEGAL_DOCUMENT_MAX_BYTES) return 'Le fichier dépasse 10 Mo.';
  return null;
}

async function reason(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  return resolveApiErrorMessage(body, res.status, fallback).message;
}

/**
 * « Publier »: sign an upload, PUT the PDF straight to storage, then publish, where the API reads the
 * bytes back, checks it is a PDF and records its size and SHA-256. The summary goes with the CGU only.
 */
export async function publishLegalVersion(
  input: { kind: LegalDocumentKind; version: string; file: Blob; summary: string | null; activate: boolean },
  fetchFn: typeof fetch = fetch,
): Promise<{ ok: true; version: LegalDocumentVersionDto } | { ok: false; error: string }> {
  try {
    const signed = await fetchFn(`${LEGAL_VERSIONS_ENDPOINT}/upload-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: input.kind, version: input.version }),
    });
    if (!signed.ok) return { ok: false, error: await reason(signed, "L'envoi n'a pas pu être préparé.") };
    const { path, uploadUrl } = (await signed.json()) as SignLegalUploadResponse;

    const put = await fetchFn(uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: input.file });
    if (!put.ok) return { ok: false, error: "Le fichier n'a pas pu être envoyé." };

    const summary = input.kind === 'CGU' ? input.summary?.trim() || null : null;
    const published = await fetchFn(LEGAL_VERSIONS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: input.kind, version: input.version, path, summary, activate: input.activate }),
    });
    if (!published.ok) return { ok: false, error: await reason(published, "La version n'a pas pu être publiée.") };
    return { ok: true, version: (await published.json()) as LegalDocumentVersionDto };
  } catch {
    return { ok: false, error: "Erreur réseau lors de la publication." };
  }
}
