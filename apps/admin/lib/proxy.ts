/**
 * Same-origin proxy to avoid third-party cookie blocking.
 *
 * The API lives on `*.onrender.com` and the admin on `*.vercel.app` - no shared
 * registrable domain, so cookies set directly by the API would be third-party and
 * blocked by Safari. This proxy ensures the browser only talks to its own origin,
 * making the session cookie first-party.
 *
 * ## Forwarding strategy
 *
 * - **`Origin`**: Forwarded from the browser request. Better Auth performs origin
 *   checks on state-changing requests against `trustedOrigins`. A server-to-server
 *   `fetch` sends no `Origin` header by default, so we explicitly forward the
 *   browser's origin to ensure Better Auth sees the correct source.
 *
 * - **`Set-Cookie`**: Relayed verbatim without modification. The API issues cookies
 *   with `Secure; HttpOnly; SameSite=Lax`, and we pass them through as-is. No
 *   `Domain` attribute is set by the API, so the browser will scope the cookie to
 *   the admin's own origin (first-party).
 *
 * - **Hop-by-hop headers**: Not forwarded (e.g., `connection`, `transfer-encoding`).
 *   Only `content-type`, `cookie`, `set-cookie`, `location`, and `origin` are relayed.
 *
 * ## Local development caveat
 *
 * Because `BETTER_AUTH_URL` is HTTPS on the production API, it issues `Secure`
 * cookies. A browser will refuse to store `Secure` cookies over plain HTTP, so
 * login at `http://localhost:3000` will fail - the cookie is issued but not stored.
 *
 * This is NOT a bug in the proxy. Verify login on the HTTPS deployment instead.
 */

/**
 * Constructs the upstream target URL for a proxied request.
 *
 * @param incomingPath - The full path from the browser request (e.g., `/api/proxy/admin/ping`)
 * @param localRoutePrefix - The admin's route prefix to strip (e.g., `/api/proxy`)
 * @param upstreamApiPrefix - The API prefix to prepend (e.g., `/api/v1`)
 * @param searchParams - Query string from the browser request (e.g., `?a=1&b=2`)
 * @returns The full upstream URL (e.g., `https://...onrender.com/api/v1/admin/ping?a=1&b=2`)
 *
 * @example
 * buildUpstreamUrl('/api/proxy/admin/ping', '/api/proxy', '/api/v1', '?limit=10')
 * // => 'https://repareme-api.onrender.com/api/v1/admin/ping?limit=10'
 *
 * buildUpstreamUrl('/api/auth/sign-in/email', '/api/auth', '/api/auth', '')
 * // => 'https://repareme-api.onrender.com/api/auth/sign-in/email'
 */
export function buildUpstreamUrl(
  incomingPath: string,
  localRoutePrefix: string,
  upstreamApiPrefix: string,
  searchParams: string
): string {
  const API_URL = process.env.API_URL;
  if (!API_URL) {
    throw new Error('API_URL not configured');
  }

  const pathAfterLocalPrefix = incomingPath.replace(new RegExp(`^${localRoutePrefix}`), '');
  return `${API_URL}${upstreamApiPrefix}${pathAfterLocalPrefix}${searchParams}`;
}

export async function proxy(
  req: Request,
  localRoutePrefix: string,
  upstreamApiPrefix: string
): Promise<Response> {
  const API_URL = process.env.API_URL;

  if (!API_URL) {
    return new Response(JSON.stringify({ error: 'API_URL not configured' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const target = buildUpstreamUrl(url.pathname, localRoutePrefix, upstreamApiPrefix, url.search);

  const headers = new Headers();

  // Forward content-type and cookie from the browser
  const contentType = req.headers.get('content-type');
  if (contentType) {
    headers.set('content-type', contentType);
  }

  const cookie = req.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }

  // Forward the browser's Origin header so Better Auth sees the correct source
  const origin = req.headers.get('origin');
  if (origin) {
    headers.set('origin', origin);
  }

  const upstream = await fetch(target, {
    method: req.method,
    headers,
    body: req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.text(),
    redirect: 'manual',
  });

  // Relay only essential response headers
  const responseHeaders = new Headers();

  // Relay all Set-Cookie headers (there may be multiple)
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      responseHeaders.append('set-cookie', value);
    }
  });

  // Relay content-type and location
  const upstreamContentType = upstream.headers.get('content-type');
  if (upstreamContentType) {
    responseHeaders.set('content-type', upstreamContentType);
  }

  const location = upstream.headers.get('location');
  if (location) {
    responseHeaders.set('location', location);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
