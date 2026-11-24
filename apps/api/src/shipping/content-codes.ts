/**
 * Category slug → Boxtal content id (`GET /shipping/v3.1/content-category`, read 2026-09-04 from
 * the live referential). Child slug first, then the root slug, then the generic appliance code.
 * v1's `code_contenu` is the numeric tail of the same id.
 *
 * `content:v1:60110` (électroménager) is accepted by the API - the sandbox probe ordered one
 * (spec « Amendment, 2026-09-04 », item (f)); the CGV clause is a Terms line, not a code line.
 */
const CONTENT_BY_SLUG: Record<string, string> = {
  smartphone: 'content:v1:50113', // Téléphonie mobile et accessoires
  ordinateur: 'content:v1:50110', // Informatique, High tech
  tablette: 'content:v1:50110',
  console: 'content:v1:50110',
  televisions: 'content:v1:80200', // Appareils électroniques, Image et son
  'audio-enceintes': 'content:v1:80200',
  'casques-ecouteurs': 'content:v1:80200',
  'photo-video': 'content:v1:80200',
  electromenager: 'content:v1:60110', // Électroménager
  'petit-electromenager': 'content:v1:60110',
};

export const DEFAULT_CONTENT_ID = 'content:v1:50120'; // Autres appareils et matériels

export function contentIdFor(slug: string, parentSlug: string | null): string {
  return CONTENT_BY_SLUG[slug] ?? (parentSlug ? CONTENT_BY_SLUG[parentSlug] : undefined) ?? DEFAULT_CONTENT_ID;
}

export function v1ContentCode(contentId: string): string {
  const m = /^content:v1:(\d+)$/.exec(contentId);
  if (!m) throw new Error(`Not a Boxtal content id: ${contentId}`);
  return m[1]!;
}
