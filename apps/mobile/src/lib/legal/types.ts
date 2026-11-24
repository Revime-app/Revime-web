/**
 * Shared type for all legal documents rendered by the legal document viewer.
 *
 * Every legal document the client sent is generated into this shape and lives under
 * `apps/mobile/src/lib/legal/`; `LegalDocumentScreen` renders all of them, the privacy policy
 * included.
 */
export interface LegalDocument {
  /** The document's French title, e.g. "CONDITIONS GÉNÉRALES D'UTILISATION — REVIME" */
  title: string;
  /** Human-readable last-updated line, e.g. "Dernière mise à jour : 10 octobre 2026" */
  updated: string;
  /** Ordered sections with a heading and body paragraphs */
  sections: LegalSection[];
}

export interface LegalSection {
  /** Section heading, e.g. "1. OBJET" or "2. HÉBERGEUR" (as written in the client's document) */
  heading: string;
  /** Optional section hierarchy level: 1 = primary section/article, 2 = sub-clause */
  level?: 1 | 2;
  /**
   * Body paragraphs under this heading.
   * - Bullet items are prefixed with "• ".
   * - Multi-line blocks (e.g. addresses) contain explicit '\n'.
   */
  body: string[];
}
