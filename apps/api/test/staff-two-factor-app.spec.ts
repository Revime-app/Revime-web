import { describe, expect, it } from 'vitest';
import { APIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import {
  assertImpersonationHasSecondFactor,
  isMobileAppRequest,
  withoutAppSignInChallenge,
} from '../src/auth/staff-two-factor.js';
import { auth } from '../src/auth/auth.js';

/**
 * CF4-51 (owner decision 2026-10-01). 2FA is for the ADMIN DASHBOARD only: a staff account
 * signing into the mobile app is handled like any user, with no code. Dashboard access never
 * relied on the sign-in challenge - AdminRoleGuard requires `Session.twoFactorVerifiedAt`, which
 * only a code verification stamps - so skipping the challenge for the app cannot open the
 * dashboard. Impersonation is Better Auth's own endpoint, outside AdminRoleGuard, so it gets the
 * same proof requirement here.
 */
const ctx = (path: string, headers: Record<string, string>) => ({ path, headers: new Headers(headers) });
const APP = { 'expo-origin': 'revime://' };
const APP_ORIGIN = { origin: 'revime://' };
const DASHBOARD = { origin: 'https://repareme-admin.vercel.app' };

describe('isMobileAppRequest (CF4-51)', () => {
  it('recognises the app by its revime:// origin, from either header', () => {
    expect(isMobileAppRequest(new Headers(APP))).toBe(true);
    expect(isMobileAppRequest(new Headers(APP_ORIGIN))).toBe(true);
  });

  it('does not treat the dashboard, a bare request or a look-alike as the app', () => {
    expect(isMobileAppRequest(new Headers(DASHBOARD))).toBe(false);
    expect(isMobileAppRequest(new Headers())).toBe(false);
    expect(isMobileAppRequest(undefined)).toBe(false);
    expect(isMobileAppRequest(new Headers({ origin: 'https://revime.fr' }))).toBe(false);
  });
});

describe('withoutAppSignInChallenge (CF4-51)', () => {
  const hook = withoutAppSignInChallenge(twoFactor({ issuer: 'test' })).hooks.after[0]!;

  it('skips the 2FA challenge for an app e-mail sign-in', () => {
    expect(hook.matcher(ctx('/sign-in/email', APP) as never)).toBe(false);
  });

  it('keeps the challenge for the dashboard and for a request with no origin', () => {
    expect(hook.matcher(ctx('/sign-in/email', DASHBOARD) as never)).toBe(true);
    expect(hook.matcher(ctx('/sign-in/email', {}) as never)).toBe(true);
  });

  it('still ignores paths the plugin never challenged', () => {
    expect(hook.matcher(ctx('/get-session', DASHBOARD) as never)).toBe(false);
  });

  it('is what auth.ts actually installs', () => {
    const installed = (auth.options.plugins ?? []).find((p) => p.id === 'two-factor');
    const real = ((installed?.hooks?.after ?? []) as { matcher: (c: never) => boolean }[])[0]!;
    expect(real.matcher(ctx('/sign-in/email', APP) as never)).toBe(false);
    expect(real.matcher(ctx('/sign-in/email', DASHBOARD) as never)).toBe(true);
  });
});

describe('assertImpersonationHasSecondFactor (CF4-51)', () => {
  const call = (twoFactorVerifiedAt: Date | null | undefined, path = '/admin/impersonate-user') =>
    assertImpersonationHasSecondFactor({
      path,
      session:
        twoFactorVerifiedAt === undefined ? null : { session: { twoFactorVerifiedAt } },
    });

  it('refuses impersonation from a session without a verified code', async () => {
    await expect(call(null)).rejects.toBeInstanceOf(APIError);
    await expect(call(undefined)).rejects.toBeInstanceOf(APIError);
  });

  it('allows it from a code-verified session', async () => {
    await expect(call(new Date())).resolves.toBeUndefined();
  });

  it('never blocks stop-impersonating or any other path', async () => {
    await expect(call(null, '/admin/stop-impersonating')).resolves.toBeUndefined();
    await expect(call(null, '/sign-in/email')).resolves.toBeUndefined();
  });
});
