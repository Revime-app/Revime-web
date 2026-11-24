import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  ProviderRevocationService,
  type ProviderRevocationDeps,
} from '../src/auth/provider-revocation/provider-revocation.service.js';
import type { AppleKeyConfig } from '../src/auth/provider-revocation/apple-client.js';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` `DEC9-09` (5), (6), `DEC9-10` (1) to (3)). What a deletion revokes, and
 * when the dashboard hears about a revocation that did not happen. Never throws.
 */
const NOW = new Date('2026-11-20T10:00:00.000Z');
const PEM = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const KEY: AppleKeyConfig = { teamId: 'B53DSP22UV', keyId: 'KEY123ABCD', privateKeyPem: PEM, clientId: 'fr.revime.demo' };
const GOOGLE_VALID = { providerId: 'google', accessToken: 'ya29.fresh', accessTokenExpiresAt: new Date(NOW.getTime() + 30 * 60_000) };
const GOOGLE_EXPIRED = { providerId: 'google', accessToken: 'ya29.old', accessTokenExpiresAt: new Date(NOW.getTime() - 60_000) };
const APPLE_ROW = { providerId: 'apple', accessToken: null, accessTokenExpiresAt: null };

type Row = { providerId: string; accessToken: string | null; accessTokenExpiresAt: Date | null };

function setup(rows: Row[], opts: { key?: AppleKeyConfig | null; responses?: Array<{ status: number; body?: unknown }>; raiseThrows?: boolean } = {}) {
  const responses = [...(opts.responses ?? [])];
  const fetch = vi.fn<typeof globalThis.fetch>(async () => {
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  });
  const raise = vi.fn(async (_input: unknown) => {
    if (opts.raiseThrows) throw new Error('db down');
  });
  const lines: string[] = [];
  const deps: ProviderRevocationDeps = {
    fetch,
    clock: () => NOW,
    appleKey: () => (opts.key === undefined ? KEY : opts.key),
    alerts: { raise },
    log: (line) => lines.push(line),
  };
  const prisma = { account: { findMany: vi.fn(async () => rows) } };
  const service = new ProviderRevocationService(prisma as never, deps);
  return { service, fetch, raise, lines, prisma };
}

const self = { userId: 'u1', source: 'SELF' as const, confirmation: null };

describe('V9 U3 ProviderRevocationService, Google', () => {
  it('revokes a still valid access token, no alert', async () => {
    const { service, fetch, raise } = setup([GOOGLE_VALID]);
    await expect(service.revokeAll(self)).resolves.toEqual([{ provider: 'GOOGLE', result: 'REVOKED' }]);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe('https://oauth2.googleapis.com/revoke');
    expect(raise).not.toHaveBeenCalled();
  });

  it('skips an expired token and alerts « aucun jeton valide »', async () => {
    const { service, fetch, raise } = setup([GOOGLE_EXPIRED]);
    await expect(service.revokeAll(self)).resolves.toEqual([{ provider: 'GOOGLE', result: 'SKIPPED_NO_TOKEN' }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(raise).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PROVIDER_REVOKE_FAILED',
        severity: 'MEDIUM',
        title: 'Révocation Apple / Google échouée',
        message: 'La connexion Google n’a pas pu être révoquée à la suppression de ce compte (aucun jeton valide). Le compte est bien supprimé.',
        targetType: 'User',
        targetId: 'u1',
        link: '/utilisateurs/u1',
        metadata: { provider: 'GOOGLE', result: 'SKIPPED_NO_TOKEN' },
      }),
    );
  });

  it('a refusal is FAILED and alerts « refus du fournisseur »', async () => {
    const { service, raise } = setup([GOOGLE_VALID], { responses: [{ status: 400, body: { error: 'invalid_token' } }] });
    await expect(service.revokeAll(self)).resolves.toEqual([{ provider: 'GOOGLE', result: 'FAILED' }]);
    expect(raise.mock.calls[0]![0]).toMatchObject({ message: expect.stringContaining('(refus du fournisseur)') });
  });
});

describe('V9 U3 ProviderRevocationService, Apple', () => {
  const withCode = { userId: 'u1', source: 'SELF' as const, confirmation: { provider: 'APPLE' as const, appleAuthorizationCode: 'code-1' } };

  it('without the client key: skipped, logged, no alert, no call', async () => {
    const { service, fetch, raise, lines } = setup([APPLE_ROW], { key: null });
    await expect(service.revokeAll(withCode)).resolves.toEqual([{ provider: 'APPLE', result: 'SKIPPED_NO_KEY' }]);
    expect(fetch).not.toHaveBeenCalled();
    expect(raise).not.toHaveBeenCalled();
    expect(lines).toEqual(['[revocation] APPLE SKIPPED_NO_KEY source=SELF']);
  });

  it('with the key and a code: exchanges, then revokes', async () => {
    const { service, fetch, raise } = setup([APPLE_ROW], { responses: [{ status: 200, body: { refresh_token: 'rt-1' } }, { status: 200 }] });
    await expect(service.revokeAll(withCode)).resolves.toEqual([{ provider: 'APPLE', result: 'REVOKED' }]);
    expect(fetch.mock.calls.map((c) => c[0])).toEqual(['https://appleid.apple.com/auth/token', 'https://appleid.apple.com/auth/revoke']);
    expect(raise).not.toHaveBeenCalled();
  });

  it('with the key and no code (confirmed by password): skipped and alerted', async () => {
    const { service, raise } = setup([APPLE_ROW]);
    await expect(service.revokeAll(self)).resolves.toEqual([{ provider: 'APPLE', result: 'SKIPPED_NO_TOKEN' }]);
    expect(raise.mock.calls[0]![0]).toMatchObject({ message: expect.stringContaining('La connexion Apple') });
  });

  it('a refused exchange (an expired code) is FAILED and alerted', async () => {
    const { service, raise } = setup([APPLE_ROW], { responses: [{ status: 400, body: { error: 'invalid_grant' } }] });
    await expect(service.revokeAll(withCode)).resolves.toEqual([{ provider: 'APPLE', result: 'FAILED' }]);
    expect(raise).toHaveBeenCalledTimes(1);
  });
});

describe('V9 U3 ProviderRevocationService, the edges', () => {
  it('a dashboard deletion logs, never alerts', async () => {
    const { service, raise, lines } = setup([GOOGLE_EXPIRED]);
    await service.revokeAll({ userId: 'u1', source: 'ADMIN', confirmation: null });
    expect(raise).not.toHaveBeenCalled();
    expect(lines).toEqual(['[revocation] GOOGLE SKIPPED_NO_TOKEN source=ADMIN']);
  });

  it('an account with no provider row does nothing', async () => {
    const { service, fetch } = setup([]);
    await expect(service.revokeAll(self)).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('never rejects: not on a failing alert, not on a failing read', async () => {
    await expect(setup([GOOGLE_EXPIRED], { raiseThrows: true }).service.revokeAll(self)).resolves.toHaveLength(1);
    const broken = setup([]);
    broken.prisma.account.findMany.mockRejectedValueOnce(new Error('db down'));
    await expect(broken.service.revokeAll(self)).resolves.toEqual([]);
  });

  it('no log line or alert carries a token, a code or the key', async () => {
    const google = setup([GOOGLE_VALID], { responses: [{ status: 400, body: { error: 'invalid_token' } }] });
    await google.service.revokeAll(self);
    const apple = setup([APPLE_ROW], { responses: [{ status: 400, body: { error: 'invalid_grant' } }] });
    await apple.service.revokeAll({ userId: 'u1', source: 'SELF', confirmation: { provider: 'APPLE', appleAuthorizationCode: 'code-1' } });
    const everything = JSON.stringify([google.lines, google.raise.mock.calls, apple.lines, apple.raise.mock.calls]);
    for (const secret of ['ya29', 'code-1', 'BEGIN PRIVATE KEY', 'rt-1']) expect(everything).not.toContain(secret);
  });
});
