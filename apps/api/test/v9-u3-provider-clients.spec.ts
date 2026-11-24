import { generateKeyPairSync, verify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  appleClientSecret,
  appleKeyFromEnv,
  exchangeAppleCode,
  ProviderHttpError,
  revokeAppleToken,
  type AppleKeyConfig,
} from '../src/auth/provider-revocation/apple-client.js';
import { revokeGoogleToken } from '../src/auth/provider-revocation/google-client.js';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` `FND9-023`, `FND9-024`). The three provider calls a deletion makes, and
 * the ES256 client secret Apple wants, signed with `node:crypto` (no new dependency). No network: `fetch`
 * is injected.
 */
const NOW = new Date('2026-11-20T10:00:00.000Z');
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const KEY: AppleKeyConfig = { teamId: 'B53DSP22UV', keyId: 'KEY123ABCD', privateKeyPem: PEM, clientId: 'fr.revime.demo' };

const part = (jwt: string, i: number) => JSON.parse(Buffer.from(jwt.split('.')[i]!, 'base64url').toString('utf8'));

function fakeFetch(status: number, body: unknown = {}) {
  return vi.fn<typeof fetch>(async () =>
    new Response(status === 200 && body === null ? null : JSON.stringify(body), { status }),
  );
}
const form = (init: RequestInit | undefined) => new URLSearchParams(String(init?.body));

describe('V9 U3 appleClientSecret', () => {
  it('is an ES256 JWT with the claims Apple checks, valid five minutes', () => {
    const jwt = appleClientSecret(KEY, NOW);
    expect(part(jwt, 0)).toEqual({ alg: 'ES256', kid: 'KEY123ABCD' });
    const claims = part(jwt, 1);
    expect(claims).toMatchObject({ iss: 'B53DSP22UV', aud: 'https://appleid.apple.com', sub: 'fr.revime.demo' });
    expect(claims.iat).toBe(Math.floor(NOW.getTime() / 1000));
    expect(claims.exp - claims.iat).toBe(300);
    const [h, p, s] = jwt.split('.');
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s!, 'base64url'));
    expect(ok).toBe(true);
  });
});

describe('V9 U3 appleKeyFromEnv', () => {
  const env = { APPLE_TEAM_ID: 'B53DSP22UV', APPLE_KEY_ID: 'KEY123ABCD', APPLE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n'), APPLE_CLIENT_ID: 'fr.revime.demo' };

  it('reads the four values and turns escaped newlines back into newlines', () => {
    expect(appleKeyFromEnv(env)).toEqual(KEY);
  });

  it('is null when any of the four is blank', () => {
    for (const name of Object.keys(env)) expect(appleKeyFromEnv({ ...env, [name]: ' ' })).toBeNull();
  });
});

describe('V9 U3 exchangeAppleCode', () => {
  it('posts the native authorization code without a redirect_uri', async () => {
    const fetch = fakeFetch(200, { refresh_token: 'rt-1', access_token: 'at-1' });
    await expect(exchangeAppleCode({ fetch, key: KEY, now: NOW }, 'code-1')).resolves.toEqual({ refreshToken: 'rt-1' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://appleid.apple.com/auth/token');
    expect((init!.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    const body = form(init);
    expect(body.get('client_id')).toBe('fr.revime.demo');
    expect(body.get('code')).toBe('code-1');
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('client_secret')).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(body.has('redirect_uri')).toBe(false);
  });

  it('throws a ProviderHttpError naming Apple\'s error, never the code or the secret', async () => {
    const fetch = fakeFetch(400, { error: 'invalid_grant' });
    const err = await exchangeAppleCode({ fetch, key: KEY, now: NOW }, 'code-secret-1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect((err as ProviderHttpError).status).toBe(400);
    expect((err as Error).message).toContain('invalid_grant');
    expect((err as Error).message).not.toContain('code-secret-1');
    expect((err as Error).message).not.toMatch(/eyJ/);
  });

  it('throws when Apple answers 200 without a refresh token', async () => {
    const fetch = fakeFetch(200, { access_token: 'at-1' });
    await expect(exchangeAppleCode({ fetch, key: KEY, now: NOW }, 'code-1')).rejects.toBeInstanceOf(ProviderHttpError);
  });
});

describe('V9 U3 revokeAppleToken', () => {
  it('revokes the refresh token', async () => {
    const fetch = fakeFetch(200, null);
    await revokeAppleToken({ fetch, key: KEY, now: NOW }, 'rt-1');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://appleid.apple.com/auth/revoke');
    const body = form(init);
    expect(body.get('token')).toBe('rt-1');
    expect(body.get('token_type_hint')).toBe('refresh_token');
    expect(body.get('client_id')).toBe('fr.revime.demo');
  });

  it('throws on a refusal', async () => {
    await expect(revokeAppleToken({ fetch: fakeFetch(400, { error: 'invalid_client' }), key: KEY, now: NOW }, 'rt-1')).rejects.toBeInstanceOf(
      ProviderHttpError,
    );
  });
});

describe('V9 U3 revokeGoogleToken', () => {
  it('posts the access token to Google', async () => {
    const fetch = fakeFetch(200, {});
    await revokeGoogleToken({ fetch }, 'ya29.token');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://oauth2.googleapis.com/revoke');
    expect((init!.headers as Record<string, string>)['content-type']).toBe('application/x-www-form-urlencoded');
    expect(form(init).get('token')).toBe('ya29.token');
  });

  it('throws without the token in the message', async () => {
    const err = await revokeGoogleToken({ fetch: fakeFetch(400, { error: 'invalid_token' }) }, 'ya29.token').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProviderHttpError);
    expect((err as Error).message).toContain('invalid_token');
    expect((err as Error).message).not.toContain('ya29');
  });
});
