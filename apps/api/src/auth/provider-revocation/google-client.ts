import { PROVIDER_TIMEOUT_MS, ProviderHttpError, providerError } from './apple-client.js';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (5), `FND9-024`). Revoking a Google access token also revokes its
 * refresh token and the app's grant; an expired one cannot be revoked, so the caller sends only a fresh
 * one (the confirmation's). 🛑 The error never carries the token.
 */
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

export async function revokeGoogleToken(deps: { fetch: typeof fetch }, accessToken: string): Promise<void> {
  const res = await deps.fetch(REVOKE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: accessToken }).toString(),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) throw new ProviderHttpError('GOOGLE', res.status, await providerError(res));
}
