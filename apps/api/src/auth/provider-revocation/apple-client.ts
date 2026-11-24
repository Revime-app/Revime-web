import { createPrivateKey, sign } from 'node:crypto';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (5), `FND9-023`, `FND9-024`). Apple's two server calls at account
 * deletion: exchange the native sign-in's authorization code for a refresh token, then revoke it.
 * Both need a client secret: a short JWT signed ES256 with the client's Sign in with Apple key (`.p8`).
 *
 * 🛑 Nothing here logs. An error carries Apple's status and `error` field only, never the code, a token
 * or the secret.
 */
export type AppleKeyConfig = { teamId: string; keyId: string; privateKeyPem: string; clientId: string };
export type AppleDeps = { fetch: typeof fetch; key: AppleKeyConfig; now: Date };

const APPLE_AUDIENCE = 'https://appleid.apple.com';
const TOKEN_URL = 'https://appleid.apple.com/auth/token';
const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
/** Apple allows up to six months; the secret is minted per call, so five minutes is plenty. */
/** V9 U3 final review (Important 2): a hung provider must not hold the user's deletion request open. */
export const PROVIDER_TIMEOUT_MS = 8_000;
const SECRET_LIFETIME_S = 300;

export class ProviderHttpError extends Error {
  constructor(
    readonly provider: 'APPLE' | 'GOOGLE',
    readonly status: number,
    providerError: string | null,
  ) {
    super(`${provider} answered ${status}${providerError ? ` (${providerError})` : ''}`);
    this.name = 'ProviderHttpError';
  }
}

const blank = (v: string | undefined) => (v ?? '').trim().length === 0;

/** Null unless all four are set: the key is the client's and may arrive after the code ships (`DEC9-09` (6)). */
export function appleKeyFromEnv(env: NodeJS.ProcessEnv): AppleKeyConfig | null {
  const { APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CLIENT_ID } = env;
  if ([APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY, APPLE_CLIENT_ID].some(blank)) return null;
  return {
    teamId: APPLE_TEAM_ID!.trim(),
    keyId: APPLE_KEY_ID!.trim(),
    // Render keeps a one-line value: the PEM's newlines arrive as `\n`.
    privateKeyPem: APPLE_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    clientId: APPLE_CLIENT_ID!.trim(),
  };
}

const b64url = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function appleClientSecret(key: AppleKeyConfig, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000);
  const signingInput = `${b64url({ alg: 'ES256', kid: key.keyId })}.${b64url({
    iss: key.teamId,
    iat,
    exp: iat + SECRET_LIFETIME_S,
    aud: APPLE_AUDIENCE,
    sub: key.clientId,
  })}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(key.privateKeyPem),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

async function postForm(deps: AppleDeps, url: string, fields: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams({
    client_id: deps.key.clientId,
    client_secret: appleClientSecret(deps.key, deps.now),
    ...fields,
  });
  return deps.fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
}

/** The `error` field of a provider's JSON error body, or null. */
export async function providerError(res: Response): Promise<string | null> {
  try {
    const json = (await res.json()) as { error?: unknown };
    return typeof json.error === 'string' ? json.error : null;
  } catch {
    return null;
  }
}

/** The native flow sends no `redirect_uri`, so none is sent here (Apple « Token validation »). */
export async function exchangeAppleCode(deps: AppleDeps, code: string): Promise<{ refreshToken: string }> {
  const res = await postForm(deps, TOKEN_URL, { code, grant_type: 'authorization_code' });
  if (!res.ok) throw new ProviderHttpError('APPLE', res.status, await providerError(res));
  const json = (await res.json().catch(() => ({}))) as { refresh_token?: unknown };
  if (typeof json.refresh_token !== 'string' || json.refresh_token.length === 0) {
    throw new ProviderHttpError('APPLE', res.status, 'no_refresh_token');
  }
  return { refreshToken: json.refresh_token };
}

/** 200 with no body is success, also for a token already revoked (Apple « Token revocation »). */
export async function revokeAppleToken(deps: AppleDeps, refreshToken: string): Promise<void> {
  const res = await postForm(deps, REVOKE_URL, { token: refreshToken, token_type_hint: 'refresh_token' });
  if (!res.ok) throw new ProviderHttpError('APPLE', res.status, await providerError(res));
}
