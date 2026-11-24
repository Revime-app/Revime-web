import { expoClient } from '@better-auth/expo/client';
import { createAuthClient } from 'better-auth/react';
import type { BetterAuthClientPlugin } from 'better-auth/client';
import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins';
import * as SecureStore from 'expo-secure-store';
import { applyDeviceHeaders } from './device-id';

const baseURL = process.env.EXPO_PUBLIC_API_URL!;

// Defensive adapter: catch and suppress SecureStore errors instead of aborting
const safeSecureStore = {
  getItem(key: string, options?: any): string | null {
    try {
      return SecureStore.getItem(key, options);
    } catch (err) {
      console.warn('SecureStore.getItem failed:', key, err);
      return null;
    }
  },
  async setItem(key: string, value: string, options?: any): Promise<void> {
    try {
      await SecureStore.setItem(key, value, options);
    } catch (err) {
      console.warn('SecureStore.setItem failed:', key, err);
    }
  },
};

// Factory to capture the exact inferred type including plugin augmentations
function buildClient() {
  return createAuthClient({
    baseURL,
    // V7 A11 (U2b): this phone's id, so a password login from another one earns a « Nouvelle
    // connexion » e-mail. Read at each request: the id is created once and lives in its own key.
    // 🛑 V7 `FND7-072`: a non-ASCII value here once made every Android auth request throw; the
    // helper keeps the values ASCII and never lets a header problem block the request.
    fetchOptions: {
      onRequest: (context) => {
        applyDeviceHeaders(context.headers);
        return context;
      },
    },
    plugins: [
      expoClient({ scheme: 'revime', storagePrefix: 'revime', storage: safeSecureStore }) as BetterAuthClientPlugin,
      inferAdditionalFields({
        user: {
          firstName: { type: 'string' },
          lastName: { type: 'string' },
          phone: { type: 'string' },
          username: { type: 'string' },
          cguAccepted: { type: 'boolean' },
          // V9 B1: the e-mail form's privacy box.
          privacyAccepted: { type: 'boolean' },
          marketingConsent: { type: 'boolean' },
        },
      }),
      // Required for the verification screen's email half. Without it
      // authClient.emailOtp does not exist at all, so the two email routes are
      // unreachable from the app even though the server serves them.
      emailOTPClient(),
      // CF4-52: no two-factor client plugin - the app has no 2FA step since CF4-51 (dashboard only).
    ],
  });
}

type Client = ReturnType<typeof buildClient>;

// Module-scope init wrapped to fail open and capture errors
let created: Client | null = null;
let initError: unknown = null;
try {
  created = buildClient();
} catch (error) {
  initError = error;
  console.error('authClient init failed:', error);
}

export const authInitError: unknown = initError;

// Fail open: importing this module must never throw. If init failed, any use
// throws a clear error instead, and the startup error screen shows authInitError.
export const authClient: Client =
  created ??
  (new Proxy({} as object, {
    get() {
      throw new Error('Revime auth client failed to initialise; see authInitError');
    },
  }) as Client);
