import { describe, expect, it } from 'vitest';
import { auth } from '../src/auth/auth.js';
import { UNUSED_EMAIL_OTP_PATHS } from '../src/auth/throttle/index.js';

/**
 * V7 A11 (U2), on the REAL auth.ts. The lock-out behaviour itself is driven through a real Better
 * Auth instance in v7-u2-auth-throttle-flow.spec.ts; this pins that auth.ts installs it, without
 * touching a database (the disabled-path refusal happens in the router, before any endpoint runs).
 */
describe('auth.ts wires the U2 lock-out', () => {
  it('lifts the login lock when a password reset completes', () => {
    expect(typeof auth.options.emailAndPassword?.onPasswordReset).toBe('function');
  });

  it('keeps the e-mail verification code routes the app uses', () => {
    expect(auth.options.disabledPaths).not.toContain('/email-otp/send-verification-otp');
    expect(auth.options.disabledPaths).not.toContain('/email-otp/verify-email');
  });

  it.each(UNUSED_EMAIL_OTP_PATHS)('answers 404 on the unused code route %s (FND7-034)', async (path) => {
    const res = await auth.handler(
      new Request(`http://localhost:3002/api/auth${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: 'revime://' },
        body: JSON.stringify({ email: 'victim@example.com', otp: '123456', type: 'sign-in' }),
      }),
    );
    expect(res.status).toBe(404);
  });
});
