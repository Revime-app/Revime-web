import {
  CURRENT_CGU_VERSION,
  formatLegalVersionDate,
  legalDocumentPath,
  type LegalDocumentKind,
  type PlatformStatus,
} from '@revime/shared';

/**
 * The versions of the texts compiled into this build (`src/lib/legal/`, the client's PDFs of
 * 10 October 2026). `CURRENT_CGU_VERSION` now only labels that compiled text (`DEC7-24`, one source:
 * the active version is the dashboard's); the mentions légales had no constant until U9b.
 */
export const COMPILED_LEGAL_VERSIONS: Record<LegalDocumentKind, string> = {
  CGU: CURRENT_CGU_VERSION,
  MENTIONS_LEGALES: '2026-10-10',
};

export type LegalVersionNotice = { text: string; linkLabel: string; path: string };

/**
 * V7 D5 (U9b, `DEC7-24` Q9). The in-app reader shows the text this build ships; when the dashboard has
 * made a NEWER version active, the reader says so and links to its PDF. Versions are ISO dates, so a
 * string comparison orders them. Only the CGU and the mentions légales have published versions.
 */
export function newerLegalVersionNotice(slug: string, status: PlatformStatus | null): LegalVersionNotice | null {
  const kind: LegalDocumentKind | null = slug === 'cgu' ? 'CGU' : slug === 'mentions-legales' ? 'MENTIONS_LEGALES' : null;
  if (!kind || !status) return null;
  const active = kind === 'CGU' ? status.cgu?.version : status.legalNotice?.version;
  if (!active || active <= COMPILED_LEGAL_VERSIONS[kind]) return null;
  return {
    text: `Une version plus récente, du ${formatLegalVersionDate(active)}, est en vigueur.`,
    linkLabel: 'Lire la version en vigueur',
    path: legalDocumentPath(kind, active),
  };
}
