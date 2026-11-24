import { createAuthClient } from 'better-auth/react';
import { twoFactorClient } from 'better-auth/client/plugins';

/**
 * Better Auth client configured for same-origin requests.
 *
 * `baseURL: ''` tells Better Auth to call `/api/auth/*` on the admin's own origin,
 * which is proxied to the API in `app/api/auth/[...all]/route.ts`. This ensures
 * the session cookie is first-party and survives Safari's third-party cookie blocking.
 *
 * CF4-41: `twoFactorClient()` adds `twoFactor.*` (enable, verifyTotp, verifyBackupCode). No
 * `twoFactorPage`: the login screen reads `twoFactorRedirect` from the sign-in answer itself.
 */
export const authClient = createAuthClient({ baseURL: '', plugins: [twoFactorClient()] });

export const { signIn, signOut, useSession, twoFactor, updateUser } = authClient;

export const changePassword = (data: Parameters<typeof authClient.changePassword>[0]) =>
  authClient.changePassword(data);

export const changeEmail = (data: Parameters<typeof authClient.changeEmail>[0]) =>
  authClient.changeEmail(data);

export const listSessions = () =>
  authClient.listSessions();

export const revokeSession = (data: Parameters<typeof authClient.revokeSession>[0]) =>
  authClient.revokeSession(data);

export const revokeOtherSessions = () =>
  authClient.revokeOtherSessions();
