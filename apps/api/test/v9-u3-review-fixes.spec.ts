import { describe, expect, it, vi } from 'vitest';
import { googleStepUpLinkRecord, recordGoogleStepUpLink } from '../src/security/google-step-up-link.js';
import { exchangeAppleCode, revokeAppleToken, type AppleKeyConfig } from '../src/auth/provider-revocation/apple-client.js';
import { revokeGoogleToken } from '../src/auth/provider-revocation/google-client.js';
import { generateKeyPairSync } from 'node:crypto';

/**
 * V9 U3 final review (`CLIENT_FEEDBACK_V9.md` §11): Important 1, the Google link must carry the nonce of
 * the session that started the confirmation; Important 2, every provider call has a deadline.
 */
const NONCE = 'n0nce_'.padEnd(32, 'x');
const account = { providerId: 'google', userId: 'u1' };

describe('V9 U3 googleStepUpLinkRecord', () => {
  it('a link by this user that carried a nonce is recorded', () => {
    expect(googleStepUpLinkRecord(account, { stepUpNonce: NONCE, link: { userId: 'u1', email: 'a@b.c' } })).toEqual({
      identifier: `step-up-google-linked:${NONCE}`,
      userId: 'u1',
    });
  });

  it('nothing else is: a plain sign-in, another user, Apple, a bad nonce, no state', () => {
    expect(googleStepUpLinkRecord(account, { stepUpNonce: NONCE })).toBeNull();
    expect(googleStepUpLinkRecord(account, { stepUpNonce: NONCE, link: { userId: 'u2' } })).toBeNull();
    expect(googleStepUpLinkRecord({ providerId: 'apple', userId: 'u1' }, { stepUpNonce: NONCE, link: { userId: 'u1' } })).toBeNull();
    expect(googleStepUpLinkRecord(account, { stepUpNonce: 'short', link: { userId: 'u1' } })).toBeNull();
    expect(googleStepUpLinkRecord(account, { stepUpNonce: 42, link: { userId: 'u1' } })).toBeNull();
    expect(googleStepUpLinkRecord(account, null)).toBeNull();
  });

  it('writes one record, valid ten minutes', async () => {
    const prisma = { verification: { deleteMany: vi.fn(async () => ({ count: 0 })), create: vi.fn(async () => ({})) } };
    const now = new Date('2026-11-20T10:00:00.000Z');
    await recordGoogleStepUpLink(prisma as never, account, { stepUpNonce: NONCE, link: { userId: 'u1' } }, now);
    expect(prisma.verification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ identifier: `step-up-google-linked:${NONCE}`, value: 'u1', expiresAt: new Date(now.getTime() + 600_000) }),
    });
    prisma.verification.create.mockClear();
    await recordGoogleStepUpLink(prisma as never, account, { link: { userId: 'u1' } }, now);
    expect(prisma.verification.create).not.toHaveBeenCalled();
  });
});

describe('V9 U3 provider calls have a deadline', () => {
  const PEM = generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const key: AppleKeyConfig = { teamId: 'T', keyId: 'K', privateKeyPem: PEM, clientId: 'fr.revime.demo' };
  const now = new Date();

  it('each of the three calls passes an AbortSignal', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ refresh_token: 'rt' }), { status: 200 }));
    await exchangeAppleCode({ fetch, key, now }, 'c');
    await revokeAppleToken({ fetch, key, now }, 'rt');
    await revokeGoogleToken({ fetch }, 'at');
    expect(fetch).toHaveBeenCalledTimes(3);
    for (const call of fetch.mock.calls) expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
