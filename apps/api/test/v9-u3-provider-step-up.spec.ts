import { afterEach, describe, expect, it, vi } from 'vitest';
import { STEP_UP_COPY } from '@revime/shared';
import { SecurityService, type SecurityDeps } from '../src/security/security.service.js';
import { AuthThrottle } from '../src/auth/throttle/auth-throttle.js';
import type { LockEffects } from '../src/auth/throttle/hooks.js';
import { AppException } from '../src/common/app-exception.js';
import { buildAppleIdTokenVerifier } from '../src/auth/social-providers.js';
import { MemoryThrottleStore } from './helpers/memory-throttle-store.js';

/**
 * V9 U3 (`CLIENT_FEEDBACK_V9.md` B2 (1), `DEC9-09`, `DEC9-10` (1)). Confirming with Apple or Google, what
 * a deletion needs, and the e-mailed code turned off for linked accounts by `STEP_UP_PROVIDER_ENFORCED`.
 */
const NOW = new Date('2026-11-20T10:00:00.000Z');
const APPLE_SUB = '001234.abcdef.0001';

type AccountRow = { providerId: string; accountId: string; password: string | null; updatedAt: Date };
type VerificationRow = { id: string; identifier: string; value: string; expiresAt: Date };

/** A JWT-shaped token; the verifier is faked, so only the payload is read. */
const idToken = (sub: string) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`;

function setup(accounts: AccountRow[], opts: { verifier?: SecurityDeps['appleVerifier']; clock?: () => Date } = {}) {
  const verifications: VerificationRow[] = [];
  const sessions: Record<string, { stepUpAt: Date | null }> = { s1: { stepUpAt: null }, s2: { stepUpAt: null } };
  let now = NOW;
  const where = (w: { userId?: string; providerId?: string | { in: string[] } }) => (a: AccountRow) =>
    w.providerId === undefined || (typeof w.providerId === 'string' ? a.providerId === w.providerId : w.providerId.in.includes(a.providerId));
  const prisma = {
    verification: {
      findFirst: vi.fn(async ({ where: w }: { where: { identifier: string } }) => verifications.find((v) => v.identifier === w.identifier) ?? null),
      deleteMany: vi.fn(async ({ where: w }: { where: { identifier: string } }) => {
        const before = verifications.length;
        for (let i = verifications.length - 1; i >= 0; i--) if (verifications[i]!.identifier === w.identifier) verifications.splice(i, 1);
        return { count: before - verifications.length };
      }),
      create: vi.fn(async ({ data }: { data: VerificationRow }) => void verifications.push(data)),
    },
    account: {
      findFirst: vi.fn(async ({ where: w }: { where: { providerId: string } }) => accounts.find(where(w)) ?? null),
      findMany: vi.fn(async ({ where: w }: { where: { providerId?: { in: string[] } } }) => accounts.filter(where(w))),
    },
    user: { findUnique: vi.fn(async () => ({ id: 'u1', email: 'ana@example.com', name: 'Ana', role: 'user' })) },
    session: {
      findUnique: vi.fn(async ({ where: w }: { where: { id: string } }) => sessions[w.id] ?? null),
      update: vi.fn(async ({ where: w, data }: { where: { id: string }; data: { stepUpAt: Date } }) => {
        sessions[w.id] = { stepUpAt: data.stepUpAt };
      }),
    },
  };
  const mailer = { send: vi.fn(async () => undefined) };
  const effects: LockEffects = { accountLocked: vi.fn(async () => undefined), ipBlocked: vi.fn(async () => undefined) } as never;
  const deps: SecurityDeps = {
    throttle: { throttle: new AuthThrottle(new MemoryThrottleStore(), () => now), effects } as never,
    alerts: { raise: vi.fn(async () => undefined) },
    mailer: () => mailer,
    requestPasswordReset: vi.fn(async () => undefined),
    clock: opts.clock ?? (() => now),
    apiOrigin: 'https://api.test',
    authBaseURL: 'https://api.test/api/auth',
    appleVerifier: opts.verifier === undefined ? vi.fn(async () => true) : opts.verifier,
  };
  const service = new SecurityService(prisma as never, deps);
  return { service, sessions, verifications, mailer, accounts, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}

const S1 = { userId: 'u1', sessionId: 's1', email: 'ana@example.com' };
const S2 = { userId: 'u1', sessionId: 's2', email: 'ana@example.com' };
const google = (updatedAt = new Date(NOW.getTime() - 86_400_000)): AccountRow => ({ providerId: 'google', accountId: 'g-1', password: null, updatedAt });
const apple: AccountRow = { providerId: 'apple', accountId: APPLE_SUB, password: null, updatedAt: NOW };
const credential: AccountRow = { providerId: 'credential', accountId: 'u1', password: 'hash', updatedAt: NOW };

async function rejection(p: Promise<unknown>): Promise<AppException> {
  const err = await p.catch((e: unknown) => e);
  expect(err).toBeInstanceOf(AppException);
  return err as AppException;
}

afterEach(() => vi.unstubAllEnvs());

describe('V9 U3 methodResponse', () => {
  it('keeps the old method for installed builds and adds the providers', async () => {
    const { service } = setup([google()]);
    await expect(service.methodResponse('u1')).resolves.toEqual({ method: 'EMAIL_CODE', providers: ['GOOGLE'], hasPassword: false });
  });

  it('a password account linked to Apple', async () => {
    const { service } = setup([credential, apple]);
    await expect(service.methodResponse('u1')).resolves.toEqual({ method: 'PASSWORD', providers: ['APPLE'], hasPassword: true });
  });
});

describe('V9 U3 withApple', () => {
  it('a token for this account stamps the session and keeps the code for the deletion', async () => {
    const { service, sessions, verifications } = setup([apple]);
    await service.withApple(S1, { identityToken: idToken(APPLE_SUB), authorizationCode: 'code-1' });
    expect(sessions.s1!.stepUpAt).toEqual(NOW);
    expect(verifications).toHaveLength(1);
    expect(verifications[0]!.identifier).toBe('step-up-provider:s1');
    expect(JSON.parse(verifications[0]!.value)).toEqual({ provider: 'APPLE', appleAuthorizationCode: 'code-1' });
  });

  it('another Apple account is refused with the agreed sentence', async () => {
    const { service, sessions, verifications } = setup([apple]);
    const err = await rejection(service.withApple(S1, { identityToken: idToken('999.other.9') }));
    expect(err.message).toBe(STEP_UP_COPY.appleMismatch);
    expect(sessions.s1!.stepUpAt).toBeNull();
    expect(verifications).toHaveLength(0);
  });

  it('a token Apple did not sign is refused before anything is read from it', async () => {
    const { service, sessions } = setup([apple], { verifier: vi.fn(async () => false) });
    const err = await rejection(service.withApple(S1, { identityToken: idToken(APPLE_SUB) }));
    expect(err.message).toBe('La confirmation avec Apple a échoué.');
    expect(sessions.s1!.stepUpAt).toBeNull();
  });

  it('without an Apple configuration it says so', async () => {
    const { service } = setup([apple], { verifier: null });
    expect((await rejection(service.withApple(S1, { identityToken: idToken(APPLE_SUB) }))).message).toBe(
      'La connexion avec Apple n’est pas disponible.',
    );
  });
});

/**
 * Amended 2026-11-20 (V9 U3 final review, Important 1): a Google confirmation is bound to the session that
 * started it. A refreshed Google row is no longer enough (any Google sign-in anywhere refreshes it); the
 * link must carry this session's nonce, recorded by the account update hook (`google-step-up-link.ts`).
 */
describe('V9 U3 Google confirmation', () => {
  /** What the hook writes when Better Auth's link refreshed this user's Google row with this nonce. */
  const linked = (ctx: ReturnType<typeof setup>, nonce: string, userId = 'u1') =>
    ctx.verifications.push({ id: `l-${nonce}`, identifier: `step-up-google-linked:${nonce}`, value: userId, expiresAt: new Date(NOW.getTime() + 600_000) });

  it('needs a start first', async () => {
    const { service, sessions } = setup([google()]);
    expect((await rejection(service.confirmGoogle(S1))).message).toBe(STEP_UP_COPY.googleNotConfirmed);
    expect(sessions.s1!.stepUpAt).toBeNull();
  });

  it('a start returns a fresh random nonce, kept with the start', async () => {
    const ctx = setup([google()]);
    const { nonce } = await ctx.service.startGoogle(S1);
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(JSON.parse(ctx.verifications.find((v) => v.identifier === 'step-up-google-start:s1')!.value)).toMatchObject({ nonce });
    expect((await ctx.service.startGoogle(S1)).nonce).not.toBe(nonce);
  });

  it('refuses without the link record (another account, or a closed page)', async () => {
    const { service, sessions } = setup([google()]);
    await service.startGoogle(S1);
    expect((await rejection(service.confirmGoogle(S1))).message).toBe(STEP_UP_COPY.googleNotConfirmed);
    expect(sessions.s1!.stepUpAt).toBeNull();
  });

  it('a Google row refreshed by a sign-in elsewhere does not confirm this session', async () => {
    const ctx = setup([google()]);
    await ctx.service.startGoogle(S1);
    ctx.accounts[0]!.updatedAt = new Date(NOW.getTime() + 5_000);
    ctx.advance(6_000);
    await rejection(ctx.service.confirmGoogle(S1));
    expect(ctx.sessions.s1!.stepUpAt).toBeNull();
  });

  it('a stolen session cannot ride on the real user\'s confirmation on their own session', async () => {
    const ctx = setup([google()]);
    const mine = await ctx.service.startGoogle(S1);
    await ctx.service.startGoogle(S2);
    linked(ctx, mine.nonce);
    await rejection(ctx.service.confirmGoogle(S2));
    expect(ctx.sessions.s2!.stepUpAt).toBeNull();
    await ctx.service.confirmGoogle(S1);
    expect(ctx.sessions.s1!.stepUpAt).toEqual(NOW);
  });

  it('confirms when the link carried this session\'s nonce, and consumes it', async () => {
    const ctx = setup([google()]);
    const { nonce } = await ctx.service.startGoogle(S1);
    linked(ctx, nonce);
    ctx.advance(6_000);
    await ctx.service.confirmGoogle(S1);
    expect(ctx.sessions.s1!.stepUpAt).toEqual(new Date(NOW.getTime() + 6_000));
    expect(ctx.verifications.map((v) => v.identifier)).toEqual(['step-up-provider:s1']);
    expect(JSON.parse(ctx.verifications[0]!.value)).toEqual({ provider: 'GOOGLE' });
  });

  it('a link record for another user does not count', async () => {
    const ctx = setup([google()]);
    const { nonce } = await ctx.service.startGoogle(S1);
    linked(ctx, nonce, 'someone-else');
    await rejection(ctx.service.confirmGoogle(S1));
  });

  it('a start expires after ten minutes', async () => {
    const ctx = setup([google()]);
    const { nonce } = await ctx.service.startGoogle(S1);
    linked(ctx, nonce);
    ctx.advance(11 * 60_000);
    await rejection(ctx.service.confirmGoogle(S1));
  });

  it('an account with no Google link cannot start', async () => {
    const { service } = setup([credential]);
    expect((await rejection(service.startGoogle(S1))).message).toBe(STEP_UP_COPY.googleNotConfirmed);
  });
});

describe('V9 U3 assertDeletionConfirmed', () => {
  it('switch off: installed builds keep the code path (the step-up stamp alone)', async () => {
    vi.stubEnv('STEP_UP_ENFORCED', 'true');
    const { service, sessions } = setup([google()]);
    sessions.s1!.stepUpAt = NOW;
    await expect(service.assertDeletionConfirmed(S1)).resolves.toBeNull();
  });

  it('switch on: a Google-linked account confirmed by password only must confirm with Google', async () => {
    vi.stubEnv('STEP_UP_ENFORCED', 'true');
    vi.stubEnv('STEP_UP_PROVIDER_ENFORCED', 'true');
    const { service, sessions } = setup([credential, google()]);
    sessions.s1!.stepUpAt = NOW;
    expect((await rejection(service.assertDeletionConfirmed(S1))).code).toBe('STEP_UP_REQUIRED');
  });

  it('switch on: an Apple-only link with a password may use the password (Android)', async () => {
    vi.stubEnv('STEP_UP_ENFORCED', 'true');
    vi.stubEnv('STEP_UP_PROVIDER_ENFORCED', 'true');
    const { service, sessions } = setup([credential, apple]);
    sessions.s1!.stepUpAt = NOW;
    await expect(service.assertDeletionConfirmed(S1)).resolves.toBeNull();
  });

  it('switch on: an Apple confirmation is returned once, then consumed', async () => {
    vi.stubEnv('STEP_UP_PROVIDER_ENFORCED', 'true');
    const { service } = setup([apple]);
    await service.withApple(S1, { identityToken: idToken(APPLE_SUB), authorizationCode: 'code-1' });
    await expect(service.assertDeletionConfirmed(S1)).resolves.toEqual({ provider: 'APPLE', appleAuthorizationCode: 'code-1' });
    expect((await rejection(service.assertDeletionConfirmed(S1))).code).toBe('STEP_UP_REQUIRED');
  });

  it('a confirmation on one session does not open a deletion on another', async () => {
    vi.stubEnv('STEP_UP_PROVIDER_ENFORCED', 'true');
    const { service } = setup([apple]);
    await service.withApple(S1, { identityToken: idToken(APPLE_SUB), authorizationCode: 'code-1' });
    expect((await rejection(service.assertDeletionConfirmed(S2))).code).toBe('STEP_UP_REQUIRED');
  });

  it('an expired confirmation does not count', async () => {
    vi.stubEnv('STEP_UP_PROVIDER_ENFORCED', 'true');
    const ctx = setup([apple]);
    await ctx.service.withApple(S1, { identityToken: idToken(APPLE_SUB), authorizationCode: 'code-1' });
    ctx.advance(11 * 60_000);
    expect((await rejection(ctx.service.assertDeletionConfirmed(S1))).code).toBe('STEP_UP_REQUIRED');
  });
});

describe('V9 U3 the e-mailed code for linked accounts', () => {
  it('switch on: refused before any counter or e-mail', async () => {
    vi.stubEnv('STEP_UP_PROVIDER_ENFORCED', 'true');
    const { service, mailer, verifications } = setup([google()]);
    expect((await rejection(service.sendCode(S1))).message).toBe(STEP_UP_COPY.codeRefused);
    expect((await rejection(service.withCode(S1, '123456'))).message).toBe(STEP_UP_COPY.codeRefused);
    expect(mailer.send).not.toHaveBeenCalled();
    expect(verifications).toHaveLength(0);
  });

  it('switch off: still sent (installed builds)', async () => {
    const { service, mailer } = setup([google()]);
    await service.sendCode(S1);
    expect(mailer.send).toHaveBeenCalledTimes(1);
  });
});

describe('V9 U3 buildAppleIdTokenVerifier', () => {
  it('is null without an Apple client id, a function with one', () => {
    expect(buildAppleIdTokenVerifier({ APPLE_CLIENT_ID: ' ' })).toBeNull();
    expect(typeof buildAppleIdTokenVerifier({ APPLE_CLIENT_ID: 'fr.revime.demo' })).toBe('function');
  });

  it('refuses a token that is not Apple-signed', async () => {
    await expect(buildAppleIdTokenVerifier({ APPLE_CLIENT_ID: 'fr.revime.demo' })!(idToken(APPLE_SUB))).resolves.toBe(false);
  });
});
