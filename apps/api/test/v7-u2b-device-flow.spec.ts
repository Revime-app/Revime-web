import { beforeEach, describe, expect, it } from 'vitest';
import { createOTP } from '@better-auth/utils/otp';
import { base32 } from '@better-auth/utils/base32';
import { PASSWORD, setupAuthHarness } from './helpers/auth-harness.js';

/**
 * V7 A11 (U2b), on a real Better Auth instance: which password logins earn a « Nouvelle
 * connexion » e-mail, and that the e-mail and the lock e-mail carry a working « Ce n'est pas moi »
 * token.
 */
const APP_A = { origin: 'revime://', 'x-revime-device': 'A'.repeat(32), 'x-revime-device-label': 'iPhone · application Revime' };
const APP_B = { origin: 'revime://', 'x-revime-device': 'B'.repeat(32), 'x-revime-device-label': 'Android · application Revime' };
const APP_OLD_BUILD = { origin: 'revime://' };
const BROWSER = {
  origin: 'http://localhost:3001',
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};
const NOT_ME = /^http:\/\/localhost:3000\/api\/v1\/security\/not-me\?token=([A-Za-z0-9_-]{32,})$/;

let t: ReturnType<typeof setupAuthHarness>;
beforeEach(() => {
  t = setupAuthHarness();
});

const deviceCookie = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((c) => c.split(';')[0]!)
    .find((c) => c.startsWith('revime_device='));

describe('the app', () => {
  it('records the sign-up device silently, stays silent on it, and mails for another one', async () => {
    await t.signUp('ana@example.com', undefined, APP_A);
    expect((await t.signIn('ana@example.com', PASSWORD, undefined, APP_A)).ok).toBe(true);
    expect(t.recorded.devices).toHaveLength(0);

    expect((await t.signIn('ana@example.com', PASSWORD, undefined, APP_B)).ok).toBe(true);
    expect(t.recorded.devices).toHaveLength(1);
    expect(t.recorded.devices[0]).toMatchObject({ user: { email: 'ana@example.com' }, label: 'Android · application Revime' });
    expect(t.recorded.devices[0]!.notMeUrl).toMatch(NOT_ME);
  });

  it('stores a working « Ce n’est pas moi » token for the account', async () => {
    await t.signUp('ana@example.com', undefined, APP_A);
    await t.signIn('ana@example.com', PASSWORD, undefined, APP_B);
    const token = NOT_ME.exec(t.recorded.devices[0]!.notMeUrl!)![1];
    const user = (t.db.user as Array<{ id: string; email: string }>).find((u) => u.email === 'ana@example.com')!;
    const row = (t.db.verification as Array<{ identifier: string; value: string; expiresAt: Date }>).find(
      (v) => v.identifier === `not-me:${token}`,
    );
    expect(row?.value).toBe(user.id);
    // valid for 7 days
    expect(row!.expiresAt.getTime() - Date.now()).toBeGreaterThan(6.9 * 24 * 3600 * 1000);
  });

  it('mails nothing for a build that sends no device id (today’s builds, Q1)', async () => {
    await t.signUp('ana@example.com', undefined, APP_OLD_BUILD);
    await t.signIn('ana@example.com', PASSWORD, undefined, APP_OLD_BUILD);
    await t.signIn('ana@example.com', PASSWORD, undefined, APP_OLD_BUILD);
    expect(t.recorded.devices).toHaveLength(0);
    expect(t.devices.rows).toHaveLength(0);
  });

  it('records nothing for a failed login', async () => {
    await t.signUp('ana@example.com', undefined, APP_A);
    await t.signIn('ana@example.com', 'wrong-pass', undefined, APP_B);
    expect(t.devices.rows).toHaveLength(1);
    expect(t.recorded.devices).toHaveLength(0);
  });
});

describe('the dashboard (a browser)', () => {
  it('names a new browser with a long-lived cookie, mails once, then recognises it', async () => {
    await t.signUp('ana@example.com', undefined, APP_A);
    const first = await t.signIn('ana@example.com', PASSWORD, undefined, BROWSER);
    const cookie = deviceCookie((first as { res: { headers: Headers } }).res.headers);
    expect(cookie).toMatch(/^revime_device=[A-Za-z0-9_-]{32}$/);
    expect(t.recorded.devices).toHaveLength(1);
    expect(t.recorded.devices[0]!.label).toBe('Chrome sur Windows · tableau de bord');

    await t.signIn('ana@example.com', PASSWORD, undefined, { ...BROWSER, cookie: cookie! });
    expect(t.recorded.devices).toHaveLength(1);
  });

  it('checks a 2FA login when the code is accepted, not at the password step', async () => {
    await t.signUp('boss@example.com', 'super_admin', APP_A);
    const signedIn = await t.signIn('boss@example.com', PASSWORD, undefined, APP_A);
    const cookie = (signedIn as { res: { headers: Headers } }).res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
    // Turning 2FA on rotates the session, so do it from the device already known (APP_A).
    const known = new Headers({ ...APP_A, cookie });
    const enabled = await t.auth.api.enableTwoFactor({ body: { password: PASSWORD }, headers: known });
    const secret = new TextDecoder().decode(base32.decode(new URL(enabled.totpURI).searchParams.get('secret')!));
    await t.auth.api.verifyTOTP({ body: { code: await createOTP(secret).totp() }, headers: known });
    expect(t.recorded.devices).toHaveLength(0);

    const challenge = await t.signIn('boss@example.com', PASSWORD, undefined, BROWSER);
    expect(t.recorded.devices).toHaveLength(0);
    const twoFactorCookie = (challenge as { res: { headers: Headers } }).res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ');
    await t.auth.api.verifyTOTP({
      body: { code: await createOTP(secret).totp() },
      headers: t.headers(undefined, { ...BROWSER, cookie: twoFactorCookie }),
    });
    expect(t.recorded.devices).toHaveLength(1);
    expect(t.recorded.devices[0]).toMatchObject({ user: { email: 'boss@example.com' } });
  });
});

describe('the lock e-mail (Q5)', () => {
  it('carries a « Ce n’est pas moi » link too', async () => {
    await t.signUp('ana@example.com');
    for (let i = 0; i < 5; i++) await t.signIn('ana@example.com', 'wrong-pass');
    expect(t.recorded.locked[0]!.notMeUrl).toMatch(NOT_ME);
  });
});
