/**
 * CF6-09. Hosts that must keep working for sign-in although they are no longer the brand host.
 *
 * `BETTER_AUTH_URL` moved to https://api.revime.fr so Google's consent screen stops showing
 * « repareme-api.onrender.com ». But every installed build (the client's #37 included) has
 * `EXPO_PUBLIC_API_URL` inlined at build time and still calls the Render host. Better Auth sets
 * its OAuth state cookie on the host the app called and builds the Google `redirect_uri` from its
 * configured base URL; with one static base URL those two differ, the callback arrives on a host
 * that has no cookie, and Better Auth throws `state_mismatch`, which the app reads as « cancelled ».
 * Serving both hosts makes each request build its own base URL from the host it was called on.
 *
 * Remove an entry here only once no installed build still calls it. The Render hostname itself can
 * never be retired: it derives from the service slug, which is immutable.
 */
export const LEGACY_API_HOSTS = ['repareme-api.onrender.com'];

type DynamicBaseURL = {
  allowedHosts: string[];
  protocol: 'https';
  fallback: string;
};

/**
 * The `baseURL` option for Better Auth, from `BETTER_AUTH_URL`.
 *
 * - unset: unset, exactly as before.
 * - http (local development): the plain string, nothing to serve besides localhost.
 * - https (production): the configured host plus the legacy ones, falling back to the configured
 *   URL for any other host.
 * - not a URL: passed through unchanged, so Better Auth reports the misconfiguration itself.
 */
export function resolveAuthBaseURL(primary: string | undefined): string | DynamicBaseURL | undefined {
  if (!primary) return undefined;

  let url: URL;
  try {
    url = new URL(primary);
  } catch {
    return primary;
  }
  if (url.protocol !== 'https:') return primary;

  const allowedHosts = [url.hostname, ...LEGACY_API_HOSTS.filter((host) => host !== url.hostname)];
  return { allowedHosts, protocol: 'https', fallback: primary };
}
