import { DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL, absoluteUrl } from './site';
import { SUPPORT_EMAIL } from './documents';

/**
 * JSON-LD helpers. Rules (checked 24/11/2026):
 * - markup describes only what is visible on the page;
 * - NO `aggregateRating` on REVIME's own Organization: reviews of a business on its own site are
 *   "self-serving" and Google does not show them. Ratings belong on repairer pages only;
 * - no FAQPage / HowTo: Google removed those rich results (FAQ on 7 May 2026);
 * - there is no special markup for AI features.
 */

type Json = Record<string, unknown>;

export function JsonLd({ data }: { data: Json | Json[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here once "<" is escaped, so a string can never close the tag.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  );
}

export function organizationJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${SITE_URL}/#organization`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    logo: absoluteUrl('/brand/revime-emblem.png'),
    description: DEFAULT_DESCRIPTION,
    email: SUPPORT_EMAIL,
    areaServed: { '@type': 'Country', name: 'France' },
  };
}

export function websiteJsonLd(): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${SITE_URL}/#website`,
    name: SITE_NAME,
    url: absoluteUrl('/'),
    inLanguage: 'fr-FR',
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
}

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(crumbs: Crumb[]): Json {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}
