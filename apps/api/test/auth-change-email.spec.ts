import { describe, expect, it } from 'vitest';
import { auth } from '../src/auth/auth.js';

/**
 * P25. Better Auth answers `POST /change-email` with CHANGE_EMAIL_DISABLED (400) unless
 * `user.changeEmail.enabled` is set (better-auth `routes/update-user.mjs`), so the dashboard's form
 * could never succeed while every spec of it mocked the client. This reads the real configuration.
 */
describe('P25: changing the sign-in e-mail is enabled, and only through a verified new address', () => {
  const user = (auth.options as { user?: { changeEmail?: Record<string, unknown>; additionalFields?: object } }).user;

  it('enables the change-email endpoint', () => {
    expect(user?.changeEmail?.enabled).toBe(true);
  });

  it('never applies a new address before it is verified', () => {
    // either of these would change the e-mail without the owner of the NEW address clicking a link
    expect(user?.changeEmail?.updateEmailWithoutVerification).toBeUndefined();
  });

  it('can mail the verification link (the endpoint needs sendVerificationEmail)', () => {
    expect(typeof auth.options.emailVerification?.sendVerificationEmail).toBe('function');
  });

  it('kept the signup fields next to it', () => {
    expect(user?.additionalFields).toBeDefined();
  });
});
