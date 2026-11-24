/**
 * Site-wide constants for revime.fr.
 *
 * `SITE_URL` is the canonical origin every absolute URL (canonical links, sitemap, JSON-LD,
 * Open Graph) is built from. It is read from `NEXT_PUBLIC_SITE_URL` so a Vercel preview can
 * point its canonicals at itself, and falls back to production.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://revime.fr').replace(/\/+$/, '');

export const SITE_NAME = 'REVIME';

/** The one-line promise, reused by the home page, the default description and the JSON-LD. */
export const SITE_TAGLINE = 'On répare tout : publiez votre demande, des réparateurs vérifiés vous font des offres.';

export const DEFAULT_DESCRIPTION =
  'REVIME met en relation particuliers et réparateurs vérifiés partout en France. Publiez votre demande gratuitement, comparez les offres, payez en toute sécurité.';

/**
 * The API the site talks to. Server-side only: the browser always calls the site's own
 * `/api/...` paths, which `next.config.ts` rewrites to this origin, so session cookies stay
 * first-party on revime.fr.
 */
export const API_URL = (process.env.API_URL ?? 'https://api.revime.fr').replace(/\/+$/, '');

/** Absolute URL for a site path. `path` must start with `/`. */
export function absoluteUrl(path: string): string {
  if (!path.startsWith('/')) throw new Error(`absoluteUrl expects a path starting with "/": ${path}`);
  // The home is written without a trailing slash, as Next.js prints it in the canonical tag,
  // so the sitemap and the canonical agree byte for byte.
  return path === '/' ? SITE_URL : `${SITE_URL}${path}`;
}
