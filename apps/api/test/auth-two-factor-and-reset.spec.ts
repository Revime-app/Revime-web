import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { authErrorMessageFr, needsTwoFactor } from '@revime/shared';

/**
 * CF4-43. A staff account with 2FA enabled (CF4-41) signs in with email + password and Better Auth
 * answers 200 `{ twoFactorRedirect: true }` with NO session (two-factor/index.mjs deletes the one
 * the credential sign-in created). The mobile login treated « no error » as success, refreshed,
 * found no session, and the (tabs) gate sent the user back to an empty login screen - every time.
 * These pin the pure rules the new code step uses; apps/mobile has no test harness.
 */
describe('needsTwoFactor (CF4-43)', () => {
  it('is true only for Better Auth’s two-factor challenge', () => {
    expect(needsTwoFactor({ twoFactorRedirect: true, twoFactorMethods: ['totp'] })).toBe(true);
  });

  it.each([
    ['a normal sign-in answer', { token: 't', user: { id: 'u' } }],
    ['twoFactorRedirect false', { twoFactorRedirect: false }],
    ['a truthy non-boolean', { twoFactorRedirect: 'yes' }],
    ['null', null],
    ['undefined', undefined],
  ])('is false for %s', (_label, data) => {
    expect(needsTwoFactor(data)).toBe(false);
  });
});

/**
 * CF4-52. 2FA is for the admin dashboard only (CF4-51), so the app's code step is removed. Pinned
 * at the source because apps/mobile has no test runner: the component is gone, the login no longer
 * renders it, the client no longer carries the plugin, and the no-session guard is still there.
 */
describe('mobile app has no 2FA code step (CF4-52)', () => {
  const mobile = (p: string) => fileURLToPath(new URL(`../../mobile/${p}`, import.meta.url));
  const login = readFileSync(mobile('app/(auth)/login.tsx'), 'utf8');
  const client = readFileSync(mobile('src/lib/auth-client.ts'), 'utf8');

  it('TwoFactorStep is deleted and not rendered by the login', () => {
    expect(existsSync(mobile('src/components/TwoFactorStep.tsx'))).toBe(false);
    expect(login).not.toMatch(/TwoFactorStep/);
  });

  it('the auth client no longer installs twoFactorClient()', () => {
    expect(client).not.toMatch(/twoFactorClient\(\)/);
  });

  it('the login still refuses a session-less 2FA answer instead of looping', () => {
    expect(login).toMatch(/needsTwoFactor\(signInResult\.data\)/);
  });
});

describe('two-factor error codes in French (CF4-43)', () => {
  it.each([
    ['INVALID_CODE', 'Code incorrect.'],
    ['INVALID_BACKUP_CODE', 'Code de secours incorrect.'],
    ['INVALID_TWO_FACTOR_COOKIE', 'La vérification a expiré. Reconnectez-vous.'],
    ['TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE', 'Trop de tentatives. Reconnectez-vous.'],
    [
      'ACCOUNT_TEMPORARILY_LOCKED',
      'Trop de tentatives. Votre compte est bloqué temporairement. Réessayez plus tard.',
    ],
  ])('maps %s', (code, fr) => {
    expect(authErrorMessageFr(code)).toBe(fr);
  });
});

/**
 * CF4-44. Better Auth 1.6 has no `/forget-password` route (it is `/request-password-reset`, see
 * better-auth/dist/api/routes/password.mjs). The mobile screen called `authClient.forgetPassword`,
 * whose failure Better Auth's client returns instead of throwing, and the screen always shows
 * « Vérifiez votre boîte mail » - so no reset e-mail was ever sent, silently. apps/mobile has no
 * test runner, so this pins the call at the source.
 */
describe('mobile password reset request (CF4-44)', () => {
  const screen = readFileSync(
    fileURLToPath(new URL('../../mobile/app/(auth)/forgot-password.tsx', import.meta.url)),
    'utf8',
  );

  it('calls requestPasswordReset, the route Better Auth 1.6 serves', () => {
    expect(screen).toMatch(/authClient\.requestPasswordReset\(/);
  });

  it('no longer calls the removed forgetPassword route', () => {
    expect(screen).not.toMatch(/authClient\.forgetPassword\(/);
  });
});
