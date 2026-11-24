/**
 * The public site's origins, from `SITE_ORIGIN` (comma-separated), defaulting to revime.fr.
 *
 * The site (apps/site) proxies `/api/*` to this API so the session cookie is first-party on
 * revime.fr. The proxy keeps the browser's `Origin`, so Better Auth's origin check must accept the
 * site's hosts, as it does the admin's (admin-origins.ts). CORS needs no entry: the browser only
 * ever calls the site's own origin.
 *
 * A Vercel preview host can be added to SITE_ORIGIN while testing.
 */
const DEFAULT_SITE_ORIGINS = ['https://revime.fr', 'https://www.revime.fr'];

export function siteOrigins(raw: string | undefined = process.env.SITE_ORIGIN): string[] {
  const list = (raw ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin !== '');
  return list.length > 0 ? [...new Set(list)] : DEFAULT_SITE_ORIGINS;
}
