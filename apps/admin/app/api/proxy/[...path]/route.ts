import { proxy } from '../../../../lib/proxy';

/**
 * Catch-all proxy for API routes.
 *
 * Forwards `/api/proxy/*` to `${API_URL}/api/v1/*` so the browser can call API
 * endpoints (e.g., `/api/v1/admin/ping` for the role gate) without cross-origin
 * cookie issues.
 */
async function handler(req: Request): Promise<Response> {
  return proxy(req, '/api/proxy', '/api/v1');
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };
