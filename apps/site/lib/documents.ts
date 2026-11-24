/**
 * The legal documents revime.fr publishes, read from the app's own texts.
 *
 * 🛑 There is ONE copy of these texts: `apps/mobile/src/lib/legal/`, generated from the client's
 * PDFs by `scripts/extract-legal-docs.py`. The site imports them across the workspace instead of
 * keeping a second copy, so the public page and the in-app page cannot drift. Never paste a text
 * here; regenerate the app's file and both surfaces follow.
 *
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-28 (public privacy policy and CGU URLs).
 */
import { LEGAL_DOCUMENTS, type LegalDocument } from '../../mobile/src/lib/legal';

export type { LegalDocument, LegalSection } from '../../mobile/src/lib/legal';

export interface PublicDocument {
  /** The URL path segment, the same slug the app's `/legal/[slug]` route uses. */
  slug: string;
  /** The label the app's Paramètres list shows. */
  label: string;
  document: LegalDocument;
}

export const PUBLIC_DOCUMENTS: PublicDocument[] = LEGAL_DOCUMENTS.map((entry) => ({
  slug: entry.slug,
  label: entry.label,
  document: entry.getDocument(),
}));

export function findDocument(slug: string): PublicDocument | undefined {
  return PUBLIC_DOCUMENTS.find((d) => d.slug === slug);
}

/** The one support address the app shows (`apps/mobile/src/lib/support.ts`). */
export const SUPPORT_EMAIL = 'support@revime.fr';
