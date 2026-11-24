/**
 * CF4-43. The one pure rule the mobile login keeps about two-factor sign-in.
 *
 * 🛑 A 2FA ACCOUNT'S PASSWORD SIGN-IN CAN SUCCEED WITHOUT A SESSION. Better Auth answers
 * 200 `{ twoFactorRedirect: true, twoFactorMethods }` and deletes the session the credential step
 * created (two-factor/index.mjs). Treating « no error » as « signed in » sent the user back to an
 * empty login screen on every attempt.
 *
 * CF4-52: since CF4-51 the server never challenges the app (2FA is for the admin dashboard
 * only), so the app's code step and the TOTP / backup-code parsers that served it are removed.
 * `needsTwoFactor` stays as the login screen's guard against that loop. The dashboard keeps its
 * own parsers in apps/admin/lib/two-factor.ts.
 */
export function needsTwoFactor(data: unknown): boolean {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { twoFactorRedirect?: unknown }).twoFactorRedirect === true
  );
}
