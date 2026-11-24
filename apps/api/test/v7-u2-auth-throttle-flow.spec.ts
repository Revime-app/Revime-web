import { beforeEach, describe, expect, it } from 'vitest';
import { APIError } from 'better-auth/api';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { AuthThrottle } from '../src/auth/throttle/auth-throttle.js';
import { throttleBefore, type LockEffects } from '../src/auth/throttle/hooks.js';
import { IP, PASSWORD, setupAuthHarness } from './helpers/auth-harness.js';

/**
 * V7 A11 / D3 (U2), driven through a REAL Better Auth instance (memory adapter) running the same
 * hook functions `auth.ts` installs (`helpers/auth-harness.ts`). V6 lesson: a spec that mocks the
 * auth library proves nothing about it; the old limiter's after-hook was only ever exercised
 * against a hand-built context.
 */
const MIN = 60 * 1000;
const setup = setupAuthHarness;

let t: ReturnType<typeof setup>;
beforeEach(() => {
  t = setup();
});

describe('password login, per account', () => {
  it('lets the right password in after 4 failures, and that success resets the count', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 4; i++) expect((await t.signIn('ana@example.com', 'wrong-pass')).code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect((await t.signIn('ana@example.com', PASSWORD)).ok).toBe(true);
    for (let i = 0; i < 4; i++) expect((await t.signIn('ana@example.com', 'wrong-pass')).code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect((await t.signIn('ana@example.com', PASSWORD)).ok).toBe(true);
  });

  it('locks on the 5th failure, refuses the right password, and reports the lock once', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 4; i++) await t.signIn('ana@example.com', 'wrong-pass');
    const fifth = await t.signIn('ana@example.com', 'wrong-pass');
    expect(fifth.code).toBe('TOO_MANY_REQUESTS');
    expect((fifth as { err: APIError }).err.statusCode).toBe(429);

    const right = await t.signIn('ana@example.com', PASSWORD);
    expect(right.code).toBe('TOO_MANY_REQUESTS');
    expect(((right as { err: APIError }).err.body as { lockedUntil?: string }).lockedUntil).toBe(
      new Date(t.now().getTime() + 15 * MIN).toISOString(),
    );

    expect(t.recorded.locked).toHaveLength(1);
    expect(t.recorded.locked[0]).toMatchObject({ scope: 'LOGIN_ACCOUNT', level: 1, user: { email: 'ana@example.com' } });
  });

  it('opens again once the 15 minutes are over', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 5; i++) await t.signIn('ana@example.com', 'wrong-pass');
    t.advance(15 * MIN);
    expect((await t.signIn('ana@example.com', PASSWORD)).ok).toBe(true);
  });

  it('treats an unknown e-mail exactly like a real one, and reports nothing', async () => {
    for (let i = 0; i < 4; i++) expect((await t.signIn('ghost@example.com', 'wrong-pass')).code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect((await t.signIn('ghost@example.com', 'wrong-pass')).code).toBe('TOO_MANY_REQUESTS');
    expect(t.recorded.locked).toHaveLength(0);
  });

  it('keys the account on the normalised e-mail', async () => {
    await t.signUp('ana@example.com');
    // Better Auth refuses an address with spaces before checking anything, so case is what varies.
    for (let i = 0; i < 5; i++) await t.signIn(i % 2 ? 'ANA@EXAMPLE.COM' : 'Ana@Example.com', 'wrong-pass');
    expect((await t.signIn('ana@example.com', PASSWORD)).code).toBe('TOO_MANY_REQUESTS');
  });

  it('does not touch Google or Apple sign-in', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 5; i++) await t.signIn('ana@example.com', 'wrong-pass');
    // The hook only guards /sign-in/email: a social callback path passes straight through.
    await expect(
      throttleBefore({ path: '/sign-in/social', body: { provider: 'google' }, headers: t.headers() } as never, {
        throttle: new AuthThrottle(t.store, t.now),
        effects: {} as LockEffects,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('D3: staff accounts', () => {
  it('locks a staff account after 3 failures', async () => {
    await t.signUp('ops@example.com', 'support');
    for (let i = 0; i < 2; i++) expect((await t.signIn('ops@example.com', 'wrong-pass')).code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect((await t.signIn('ops@example.com', 'wrong-pass')).code).toBe('TOO_MANY_REQUESTS');
    expect(t.recorded.locked[0]).toMatchObject({ scope: 'LOGIN_ACCOUNT', user: { email: 'ops@example.com', role: 'support' } });
  });

  it('counts wrong two-factor codes toward the same 3', async () => {
    await t.signUp('boss@example.com', 'super_admin');
    const signedIn = await t.signIn('boss@example.com', PASSWORD);
    const cookie = (signedIn as { res: { headers: Headers } }).res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    const enabled = await t.auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: new Headers({ cookie }) });
    // The URI carries the secret base32-encoded; the plugin computes codes from the raw string.
    const secret = new TextDecoder().decode(base32.decode(new URL(enabled.totpURI).searchParams.get('secret')!));
    await t.auth.api.verifyTOTP({ body: { code: await createOTP(secret).totp() }, headers: new Headers({ cookie }) });

    // The password is right, so this answers with the 2FA challenge and its cookie, not a session.
    const challenge = await t.signIn('boss@example.com', PASSWORD);
    const twoFactorCookie = (challenge as { res: { headers: Headers } }).res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    const verify = async () => {
      try {
        await t.auth.api.verifyTOTP({ body: { code: '000000' }, headers: t.headers(IP, { cookie: twoFactorCookie }) });
        return 'ok';
      } catch (err) {
        return ((err as APIError).body as { code?: string }).code;
      }
    };
    expect(await verify()).toBe('INVALID_CODE');
    expect(await verify()).toBe('INVALID_CODE');
    expect(await verify()).toBe('TOO_MANY_REQUESTS');
    expect((await t.signIn('boss@example.com', PASSWORD)).code).toBe('TOO_MANY_REQUESTS');
    expect(t.recorded.locked).toHaveLength(1);
  });
});

describe('the ladder through Better Auth', () => {
  it('doubles the second lock to 30 minutes', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 5; i++) await t.signIn('ana@example.com', 'wrong-pass');
    t.advance(15 * MIN);
    for (let i = 0; i < 5; i++) await t.signIn('ana@example.com', 'wrong-pass');
    expect(t.recorded.locked.map((e) => e.level)).toEqual([1, 2]);
    expect(t.recorded.locked[1]!.lockedUntil).toEqual(new Date(t.now().getTime() + 30 * MIN));
  });
});

describe('a password reset lifts the lock (Q3)', () => {
  it('sends a working reset link with the lock, and using it opens the account at once', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 5; i++) await t.signIn('ana@example.com', 'wrong-pass');
    const { resetUrl } = t.recorded.locked[0]!;
    expect(resetUrl).toMatch(/^http:\/\/localhost:3000\/api\/auth\/reset-password\/[A-Za-z0-9_-]{24,}\?callbackURL=revime%3A%2F%2Freset-password$/);

    const token = new URL(resetUrl!).pathname.split('/').pop()!;
    await t.auth.api.resetPassword({ body: { token, newPassword: 'brand-new-pass-2' } });

    expect((await t.signIn('ana@example.com', 'brand-new-pass-2')).ok).toBe(true);
    expect(t.recorded.resets).toHaveLength(1);
    // and the ladder went with it: the next series locks for 15 minutes again
    for (let i = 0; i < 5; i++) await t.signIn('ana@example.com', 'wrong-pass');
    expect(t.recorded.locked[1]!.level).toBe(1);
  });
});

describe('per IP', () => {
  it('blocks an IP after 20 failures across accounts, whatever account it tries next', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 19; i++) expect((await t.signIn(`guess${i}@example.com`, 'wrong-pass')).code).toBe('INVALID_EMAIL_OR_PASSWORD');
    expect((await t.signIn('guess19@example.com', 'wrong-pass')).code).toBe('TOO_MANY_REQUESTS');
    expect((await t.signIn('ana@example.com', PASSWORD)).code).toBe('TOO_MANY_REQUESTS');
    expect(t.recorded.ip).toEqual([{ ip: IP, lockedUntil: new Date(t.now().getTime() + 15 * MIN), accountsTried: 20 }]);

    // another IP is not affected
    expect((await t.signIn('ana@example.com', PASSWORD, '198.51.100.9')).ok).toBe(true);
  });
});

describe('« Mot de passe oublié » (Q5)', () => {
  const request = () =>
    t.auth.api.requestPasswordReset({ body: { email: 'ana@example.com', redirectTo: 'revime://reset-password' }, headers: t.headers() });

  it('sends 3 reset e-mails an hour and silently drops the 4th', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 3; i++) await request();
    const fourth = await request();
    expect(fourth).toMatchObject({ status: true });
    expect(t.resetMails).toHaveLength(3);

    t.advance(60 * MIN);
    await request();
    expect(t.resetMails).toHaveLength(4);
  });
});

describe('e-mail codes (Q5)', () => {
  it('locks code checks after 5 wrong codes, on their own ladder', async () => {
    await t.signUp('ana@example.com');
    const send = () =>
      t.auth.api.sendVerificationOTP({ body: { email: 'ana@example.com', type: 'email-verification' }, headers: t.headers() });
    const verify = async (otp: string) => {
      try {
        await t.auth.api.verifyEmailOTP({ body: { email: 'ana@example.com', otp }, headers: t.headers() });
        return 'ok';
      } catch (err) {
        return ((err as APIError).body as { code?: string }).code;
      }
    };
    await send();
    for (let i = 0; i < 3; i++) expect(await verify('000000')).toBe('INVALID_OTP');
    // A resend ADDS a verification row and Better Auth reads the newest by createdAt; in the same
    // millisecond the memory adapter may hand back the spent one (seen flaking 1 run in 3).
    await new Promise((resolve) => setTimeout(resolve, 5));
    await send();
    expect(await verify('000000')).toBe('INVALID_OTP');
    expect(await verify('000000')).toBe('TOO_MANY_REQUESTS');
    expect(await verify(t.otps.at(-1)!)).toBe('TOO_MANY_REQUESTS');
    expect(t.recorded.locked[0]).toMatchObject({ scope: 'CODE_ACCOUNT', resetUrl: null });

    // the password login is a different ladder
    expect((await t.signIn('ana@example.com', PASSWORD)).ok).toBe(true);
  });
});
