import { describe, expect, it, vi } from 'vitest';
import { APIError } from 'better-auth/api';
import {
  TWO_FACTOR_VERIFY_PATHS,
  assertStaffMayDisableTwoFactor,
  stampTwoFactorSession,
} from '../src/auth/staff-two-factor.js';
import { auth } from '../src/auth/auth.js';

/**
 * CF4-41, spec §4.3 and decision N5. The stamp is the ONLY writer of
 * Session.twoFactorVerifiedAt, which is AdminRoleGuard's proof of the second factor.
 * Review Focus 1 (other sign-in paths never stamp) and 2 (enable alone never stamps).
 */

const fakePrisma = (updateMany = vi.fn().mockResolvedValue({ count: 1 })) =>
  ({ session: { updateMany } }) as never;

const withSession = (path: string, token: string | null, returned: unknown = { ok: true }) => ({
  path,
  context: { newSession: token ? { session: { token } } : null, returned },
});

describe('stampTwoFactorSession', () => {
  it('names exactly the two verification paths', () => {
    expect([...TWO_FACTOR_VERIFY_PATHS]).toEqual(['/two-factor/verify-totp', '/two-factor/verify-backup-code']);
  });

  it.each(TWO_FACTOR_VERIFY_PATHS)('stamps the new session created by %s', async (path) => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    await stampTwoFactorSession(fakePrisma(updateMany), withSession(path, 'tok-1'));
    expect(updateMany).toHaveBeenCalledTimes(1);
    const arg = updateMany.mock.calls[0]![0];
    expect(arg.where).toEqual({ token: 'tok-1' });
    expect(arg.data.twoFactorVerifiedAt).toBeInstanceOf(Date);
  });

  it.each([
    '/sign-in/email',
    '/sign-in/email-otp',
    '/sign-in/social',
    '/callback/google',
    '/callback/apple',
    '/two-factor/enable',
    '/two-factor/verify-otp',
    '/get-session',
  ])('never stamps on %s, even with a new session', async (path) => {
    const updateMany = vi.fn();
    await stampTwoFactorSession(fakePrisma(updateMany), withSession(path, 'tok-1'));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not stamp a verify path that created no session (failed code)', async () => {
    const updateMany = vi.fn();
    await stampTwoFactorSession(fakePrisma(updateMany), withSession('/two-factor/verify-totp', null));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('does not stamp when the verification returned an error, even if a session was refreshed', async () => {
    const updateMany = vi.fn();
    const err = new APIError('UNAUTHORIZED', { message: 'Invalid code' });
    await stampTwoFactorSession(fakePrisma(updateMany), withSession('/two-factor/verify-totp', 'tok-1', err));
    expect(updateMany).not.toHaveBeenCalled();
  });

  it('never throws when the write fails', async () => {
    const updateMany = vi.fn().mockRejectedValue(new Error('db down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      stampTwoFactorSession(fakePrisma(updateMany), withSession('/two-factor/verify-totp', 'tok-1')),
    ).resolves.toBeUndefined();
    log.mockRestore();
  });
});

describe('assertStaffMayDisableTwoFactor', () => {
  const ctx = (path: string, role: string | null | undefined, hasSession = true) => ({
    path,
    context: { session: hasSession ? { user: { role } } : null },
  });

  it.each(['super_admin', 'admin', 'moderation', 'support', 'finance', 'read_only'])(
    'refuses /two-factor/disable for a %s',
    async (role) => {
      const err = await assertStaffMayDisableTwoFactor(fakePrisma(), ctx('/two-factor/disable', role)).catch(
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(APIError);
      expect((err as APIError).status).toBe('FORBIDDEN');
      expect((err as APIError).message).toBe("La double authentification est obligatoire pour l'équipe.");
    },
  );

  it('lets a non-staff account and a missing session through', async () => {
    await expect(assertStaffMayDisableTwoFactor(fakePrisma(), ctx('/two-factor/disable', null))).resolves.toBeUndefined();
    await expect(assertStaffMayDisableTwoFactor(fakePrisma(), ctx('/two-factor/disable', 'user'))).resolves.toBeUndefined();
    await expect(
      assertStaffMayDisableTwoFactor(fakePrisma(), ctx('/two-factor/disable', undefined, false)),
    ).resolves.toBeUndefined();
  });

  it('ignores every other path', async () => {
    await expect(assertStaffMayDisableTwoFactor(fakePrisma(), ctx('/two-factor/enable', 'super_admin'))).resolves.toBeUndefined();
  });
});

describe('auth configuration', () => {
  const plugins = auth.options.plugins as { id: string; options?: Record<string, unknown> }[];

  it('installs the two-factor plugin with the REVIME Admin issuer', () => {
    const tf = plugins.find((p) => p.id === 'two-factor');
    expect(tf).toBeDefined();
    expect(tf?.options?.issuer).toBe('REVIME Admin');
  });

  it("limits Better Auth's own admin endpoints to super_admin", () => {
    const admin = plugins.find((p) => p.id === 'admin');
    expect(admin?.options?.adminRoles).toEqual(['super_admin']);
  });

  it('declares Session.twoFactorVerifiedAt as a server-only field', () => {
    const field = (auth.options.session as { additionalFields?: Record<string, { input?: boolean }> })
      ?.additionalFields?.twoFactorVerifiedAt;
    expect(field).toMatchObject({ type: 'date', required: false, input: false });
  });
});
