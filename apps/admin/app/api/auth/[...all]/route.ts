import { proxy } from '../../../../lib/proxy';

/**
 * Catch-all proxy for Better Auth routes.
 *
 * Forwards `/api/auth/*` to `${API_URL}/api/auth/*` so the browser only talks to its
 * own origin. This makes the session cookie first-party and avoids Safari's third-party
 * cookie blocking.
 */
async function handler(req: Request): Promise<Response> {
  return proxy(req, '/api/auth', '/api/auth');
}

export { handler as GET, handler as POST };
