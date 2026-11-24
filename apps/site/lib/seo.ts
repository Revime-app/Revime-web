import type { Metadata } from 'next';
import { DEFAULT_DESCRIPTION, SITE_NAME, absoluteUrl } from './site';

/**
 * The single place page metadata is built. Every page calls `buildMetadata` (from `metadata`
 * or `generateMetadata`) so canonical, Open Graph and robots can never drift apart.
 *
 * Rules (skill `seo-technique-site-applicatif`, checked 24/11/2026):
 * - title under 60 characters, consistent with the page's H1 (Google rewrites mismatched titles);
 * - description under 155 characters; Google often replaces it with page text, so the first
 *   paragraph of the page must summarise it too;
 * - absolute canonical on every page;
 * - `noindex` pages stay `follow`, so their links still pass to the indexable pages.
 */
export const TITLE_MAX = 60;
export const DESCRIPTION_MAX = 155;

export type PageSeo = {
  /** Page title without the brand suffix; the root layout's template adds « | REVIME ». */
  title: string;
  description?: string;
  /** Site path, starting with `/`. Becomes the canonical. */
  path: string;
  /** Keep the page out of Google (private pages, pages under the data threshold). */
  noindex?: boolean;
  /** Absolute or site-relative Open Graph image; the default card is used otherwise. */
  image?: string;
  /** Use the title as-is, without the « | REVIME » suffix (home page). */
  absoluteTitle?: boolean;
};

export function buildMetadata({ title, description, path, noindex, image, absoluteTitle }: PageSeo): Metadata {
  const desc = description ?? DEFAULT_DESCRIPTION;
  const canonical = absoluteUrl(path);
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description: desc,
    alternates: { canonical },
    robots: noindex ? { index: false, follow: true } : { index: true, follow: true },
    openGraph: {
      type: 'website',
      locale: 'fr_FR',
      siteName: SITE_NAME,
      url: canonical,
      title,
      description: desc,
      ...(image ? { images: [{ url: image }] } : {}),
    },
    twitter: { card: 'summary_large_image', title, description: desc },
  };
}

/** Metadata for a page that must never be indexed (account, payment, messages...). */
export function privatePageMetadata(title: string, path: string): Metadata {
  return buildMetadata({ title, path, noindex: true });
}
