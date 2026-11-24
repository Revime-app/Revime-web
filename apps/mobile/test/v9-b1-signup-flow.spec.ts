import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeResponse, PlatformStatus } from '@revime/shared';

const get = vi.fn();
const applyModes = vi.fn();
vi.mock('../src/lib/api', () => ({ api: { get: (...a: unknown[]) => get(...a) } }));
vi.mock('../src/lib/apply-modes', () => ({ applyModes: (...a: unknown[]) => applyModes(...a) }));
vi.mock('../src/lib/auth-client', () => ({ authClient: {} }));

import { routeForStep, tabGateTarget } from '../src/lib/signup-steps';
import { afterSocialSignIn } from '../src/lib/after-social-sign-in';
import { maintenanceView } from '../src/lib/maintenance';

/**
 * V9 B1 (`CLIENT_FEEDBACK_V9.md` `DEC9-04`, `DEC9-05` (2), `FND9-017`). The completion steps are read
 * from the account on every `/users/me` load, so a slow server after sign-in can never skip them, and
 * the role chosen before Google is applied instead of asked twice.
 */
type Me = Pick<MeResponse, 'signupMethod' | 'usernameConfirmedAt' | 'cguVersion' | 'profile' | 'emailVerified' | 'phoneVerified'>;
const me = (over: Partial<Me> = {}): Me => ({
  signupMethod: 'GOOGLE',
  usernameConfirmedAt: null,
  cguVersion: null,
  profile: { onboardingCompletedAt: null } as MeResponse['profile'],
  emailVerified: true,
  phoneVerified: false,
  ...over,
});
const done = me({
  usernameConfirmedAt: '2026-11-19T10:00:00.000Z',
  profile: { onboardingCompletedAt: '2026-11-19T10:01:00.000Z' } as MeResponse['profile'],
  cguVersion: '2026-10-10',
});

beforeEach(() => {
  get.mockReset();
  applyModes.mockReset();
});

describe('routeForStep', () => {
  it('maps each step to its screen', () => {
    expect(routeForStep('USERNAME')).toBe('/(auth)/nom-utilisateur');
    expect(routeForStep('ROLE')).toBe('/(auth)/roles?apply=1');
    expect(routeForStep('TERMS')).toBe('/(auth)/conditions');
  });
});

describe('tabGateTarget', () => {
  it('sends a signed-out visitor to sign-in', () => {
    expect(tabGateTarget({ session: null, me: null })).toBe('/(auth)/login');
  });

  it('waits while me has not loaded (no redirect on an unknown account)', () => {
    expect(tabGateTarget({ session: {}, me: null })).toBeNull();
  });

  it('sends an owed step before the phone check (Review Focus 1: the step is re-read once me loads)', () => {
    expect(tabGateTarget({ session: {}, me: me() })).toBe('/(auth)/nom-utilisateur');
    expect(tabGateTarget({ session: {}, me: { ...done, cguVersion: null } })).toBe('/(auth)/conditions');
  });

  it('then the existing phone check, then nothing', () => {
    expect(tabGateTarget({ session: {}, me: done })).toBe('/verification');
    expect(tabGateTarget({ session: {}, me: { ...done, phoneVerified: true } })).toBeNull();
  });
});

describe('afterSocialSignIn', () => {
  it('sends a fresh account to its first step', async () => {
    get.mockResolvedValue(me());
    expect(await afterSocialSignIn()).toBe('/(auth)/nom-utilisateur');
  });

  it('sends a finished account to the tabs', async () => {
    get.mockResolvedValue({ ...done, phoneVerified: true });
    expect(await afterSocialSignIn()).toBe('/(tabs)');
  });

  it('falls back to the tabs when /users/me fails; the tab gate catches up (Review Focus 1)', async () => {
    get.mockRejectedValue(new Error('cold start'));
    expect(await afterSocialSignIn()).toBe('/(tabs)');
  });

  it('applies the role chosen before Google once, and never sends to the role screen again (FND9-017 (b))', async () => {
    const confirmed = me({ usernameConfirmedAt: '2026-11-19T10:00:00.000Z' });
    get.mockResolvedValueOnce(confirmed).mockResolvedValueOnce({
      ...confirmed,
      profile: { onboardingCompletedAt: '2026-11-19T10:01:00.000Z' },
    });
    applyModes.mockResolvedValue(undefined);
    const next = await afterSocialSignIn({ client: true, repairer: false });
    expect(applyModes).toHaveBeenCalledTimes(1);
    expect(applyModes).toHaveBeenCalledWith({ client: true, repairer: false });
    expect(next).toBe('/(auth)/conditions');
  });

  it('applies nothing when the account already chose its role', async () => {
    get.mockResolvedValue({ ...done, phoneVerified: true });
    await afterSocialSignIn({ client: true, repairer: false });
    expect(applyModes).not.toHaveBeenCalled();
  });
});

describe('the « conditions évoluent » screen (Review Focus 2)', () => {
  const status: PlatformStatus = {
    maintenance: { enabled: false, message: 'm' },
    cgu: { version: '2026-10-10', forceReaccept: true, summary: null, publishedAt: null },
    legalNotice: { version: '2026-10-10' },
  };
  const view = (cguVersion: string | null) =>
    maintenanceView({ status, role: null, teamLogin: false, inAuthGroup: false, signedIn: true, cguVersion });

  it('never covers an account that has not accepted anything yet: its terms screen owns it', () => {
    expect(view(null)).toBe('none');
  });

  it('still asks an account on an older version', () => {
    expect(view('2026-09-01')).toBe('reaccept');
  });
});
