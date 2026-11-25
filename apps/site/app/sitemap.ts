import type { MetadataRoute } from 'next';
import { PUBLIC_DOCUMENTS } from '../lib/documents';
import { absoluteUrl } from '../lib/site';

/**
 * sitemap.xml. Only pages that exist, return 200 and are indexable are listed.
 *
 * - No `changeFrequency` / `priority`: Google ignores them.
 * - `lastModified` only where a real content date is known. Never `new Date()` at build time:
 *   Google stops trusting lastmod on sites that stamp every URL with "now".
 *
 * Category, city, repairer and guide pages are added here as each one ships (phase 2 onward),
 * each with the date of its last real data change.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: absoluteUrl('/') },
    ...['/comment-ca-marche', '/protection-revime', '/devenir-reparateur', '/qui-sommes-nous', '/aide', '/reparateurs', '/demandes'].map((p) => ({ url: absoluteUrl(p) })),
    ...PUBLIC_DOCUMENTS.map((d) => ({ url: absoluteUrl(`/${d.slug}`) })),
    { url: absoluteUrl('/suppression-compte') },
  ];
}
