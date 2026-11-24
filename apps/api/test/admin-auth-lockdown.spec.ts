import { describe, expect, it } from 'vitest';
import {
  AUTH_DISABLED_ADMIN_PATHS,
  AUTH_KEPT_ADMIN_PATHS,
  actionForAuthPath,
} from '../src/admin/admin-audit-bridge.js';
import { UNUSED_EMAIL_OTP_PATHS } from '../src/auth/throttle/index.js';
import { auth } from '../src/auth/auth.js';

/**
 * The fifteen endpoints Better Auth's admin() plugin ships with no options, read out of
 * node_modules/better-auth/dist/plugins/admin/routes.mjs rather than from documentation.
 */
const ALL = [
  '/admin/ban-user',
  '/admin/create-user',
  '/admin/get-user',
  '/admin/has-permission',
  '/admin/impersonate-user',
  '/admin/list-user-sessions',
  '/admin/list-users',
  '/admin/remove-user',
  '/admin/revoke-user-session',
  '/admin/revoke-user-sessions',
  '/admin/set-role',
  '/admin/set-user-password',
  '/admin/stop-impersonating',
  '/admin/unban-user',
  '/admin/update-user',
];

describe('the Better Auth admin surface is cut to two', () => {
  it('disables thirteen and keeps two, together covering all fifteen exactly once', () => {
    expect(AUTH_DISABLED_ADMIN_PATHS).toHaveLength(13);
    expect(AUTH_KEPT_ADMIN_PATHS).toHaveLength(2);
    expect([...AUTH_DISABLED_ADMIN_PATHS, ...AUTH_KEPT_ADMIN_PATHS].sort()).toEqual([...ALL].sort());
  });

  // 🛑 The reason this piece exists. routes.mjs:780 is internalAdapter.deleteUser.
  it('disables the hard delete and the role escalation', () => {
    expect(AUTH_DISABLED_ADMIN_PATHS).toContain('/admin/remove-user');
    expect(AUTH_DISABLED_ADMIN_PATHS).toContain('/admin/set-role');
  });

  // 🛑 The NEGATIVE half, and it matters as much as the positive: without it a later
  // edit that disables impersonation passes this file silently. Owner kept it on purpose.
  it('keeps impersonation AND its way back, and does not disable either', () => {
    expect(AUTH_KEPT_ADMIN_PATHS).toContain('/admin/impersonate-user');
    expect(AUTH_KEPT_ADMIN_PATHS).toContain('/admin/stop-impersonating');
    expect(AUTH_DISABLED_ADMIN_PATHS).not.toContain('/admin/impersonate-user');
    expect(AUTH_DISABLED_ADMIN_PATHS).not.toContain('/admin/stop-impersonating');
  });

  // 🛑 disabledPaths is matched against normalizePathname(req.url, basePath), which
  // STRIPS the base path (api/index.mjs:165). A value carrying /api/auth would never
  // match, and the lockdown would be a silent no-op that still probes 400.
  it('uses base-path-relative values, never /api/auth-prefixed ones', () => {
    for (const p of [...AUTH_DISABLED_ADMIN_PATHS, ...AUTH_KEPT_ADMIN_PATHS]) {
      expect(p.startsWith('/admin/'), p).toBe(true);
      expect(p).not.toContain('/api/auth');
    }
  });

  // 🛑 Asserts the wiring line in auth.ts is actually present. Deleting it leaves all the
  // other tests green, so without this a deletion regresses to shipping all fifteen.
  // V7 U2 (FND7-034) added the seven unused e-mail-code routes beside the thirteen.
  it('verifies auth.options.disabledPaths is populated with the thirteen, plus the unused code routes', () => {
    expect(auth.options.disabledPaths).toBeDefined();
    expect(auth.options.disabledPaths).toHaveLength(13 + UNUSED_EMAIL_OTP_PATHS.length);
    expect(auth.options.disabledPaths).toEqual(expect.arrayContaining([...AUTH_DISABLED_ADMIN_PATHS]));
    expect(auth.options.disabledPaths).toEqual(expect.arrayContaining([...UNUSED_EMAIL_OTP_PATHS]));
  });
});

describe('actionForAuthPath', () => {
  it('maps the two kept paths to their own actions', () => {
    expect(actionForAuthPath('/admin/impersonate-user')).toBe('auth.admin.impersonate');
    expect(actionForAuthPath('/admin/stop-impersonating')).toBe('auth.admin.stop_impersonating');
  });

  it('maps an unknown /admin/* path to the catch-all rather than refusing the row', () => {
    expect(actionForAuthPath('/admin/some-future-endpoint')).toBe('auth.admin.other');
  });

  it('returns null for anything outside /admin/, so sign-in is not audited', () => {
    expect(actionForAuthPath('/sign-in/email')).toBeNull();
    expect(actionForAuthPath('/get-session')).toBeNull();
  });
});
