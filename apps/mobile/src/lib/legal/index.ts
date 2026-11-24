/**
 * Barrel file for all legal documents.
 *
 * Each document is the client's finalized legal text (10 October 2026), generated from
 * the official PDFs in `docs/client-feedback/v6/legal/` by `scripts/extract-legal-docs.py`.
 * Never edit a document file by hand: the next run of the generator overwrites it, and
 * `scripts/test_extract_legal_docs.py` fails when a file differs from the generator's output.
 */
import type { LegalDocument } from './types';
import { CGU } from './cgu';import { POLITIQUE_DE_CONFIDENTIALITE } from './confidentialite';
import { MENTIONS_LEGALES } from './mentions-legales';
import { FONCTIONNEMENT } from './fonctionnement';
import { CLASSEMENT } from './classement';
import { CLASSEMENT_RESUME } from './classement-resume';
import { LIVRAISON } from './livraison';
import { PROTECTION_REVIME } from './protection';
import { POLITIQUE_DES_AVIS } from './avis';
import { REGLES_PLATEFORME } from './regles';
import { PAIEMENT_INFO } from './paiement-info';

export type { LegalDocument, LegalSection } from './types';

export {
  CGU,
  POLITIQUE_DE_CONFIDENTIALITE,
  MENTIONS_LEGALES,
  FONCTIONNEMENT,
  CLASSEMENT,
  CLASSEMENT_RESUME,
  LIVRAISON,
  PROTECTION_REVIME,
  POLITIQUE_DES_AVIS,
  REGLES_PLATEFORME,
  PAIEMENT_INFO,
};

/**
 * Registry the `[slug]` route and the Paramètres list use to map a URL slug to its
 * document. The slug is the filename without extension under `src/lib/legal/`.
 */
export interface LegalDocumentEntry {
  slug: string;
  label: string;
  getDocument: () => LegalDocument;
}

/**
 * Order matches the client's email checklist (Item 1). The privacy policy is also opened
 * from Paramètres → Confidentialité (`parametres/confidentialite.tsx`), which adds its own
 * footer to the same document.
 */
export const LEGAL_DOCUMENTS: LegalDocumentEntry[] = [
  { slug: 'cgu', label: 'Conditions générales d\'utilisation', getDocument: () => CGU },
  { slug: 'confidentialite', label: 'Politique de confidentialité', getDocument: () => POLITIQUE_DE_CONFIDENTIALITE },
  { slug: 'mentions-legales', label: 'Mentions légales', getDocument: () => MENTIONS_LEGALES },
  { slug: 'fonctionnement', label: 'Fonctionnement de REVIME', getDocument: () => FONCTIONNEMENT },
  { slug: 'classement', label: 'Comment sont classés les réparateurs', getDocument: () => CLASSEMENT },
  { slug: 'classement-resume', label: 'Classement des réparateurs (résumé)', getDocument: () => CLASSEMENT_RESUME },
  { slug: 'livraison', label: 'Livraison', getDocument: () => LIVRAISON },
  { slug: 'protection', label: 'Protection REVIME', getDocument: () => PROTECTION_REVIME },
  { slug: 'avis', label: 'Politique des avis', getDocument: () => POLITIQUE_DES_AVIS },
  { slug: 'regles', label: 'Règles de la plateforme', getDocument: () => REGLES_PLATEFORME },
  { slug: 'paiement-info', label: 'Informations relatives au paiement', getDocument: () => PAIEMENT_INFO },
];
