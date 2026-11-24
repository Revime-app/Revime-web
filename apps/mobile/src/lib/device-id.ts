import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { DEVICE_ID_HEADER, DEVICE_LABEL_HEADER } from '@revime/shared';

/**
 * V7 A11 (U2b). This phone's id for the « Nouvelle connexion » e-mail, sent on every Better Auth
 * request (`auth-client.ts`).
 *
 * 🛑 ITS OWN SECURE-STORE KEY, NOT A COOKIE. The Expo auth client wipes its stored cookies at
 * sign-out (`@better-auth/expo/dist/client.js`, `clearSessionCache`), so a cookie id would make every
 * login after a sign-out look like a new phone. This key is never touched by sign-out.
 *
 * 🛑 NOT `crypto.getRandomValues`: there is no global `crypto` in Expo SDK 57 / RN 0.86 (AGENTS.md,
 * « A GREEN TYPECHECK DOES NOT MEAN A WEB API EXISTS »), and `expo-crypto` would be a native module and
 * a build. `Math.random` is enough here: the id is never shown or sent anywhere but our API, which
 * keeps only its hash, and guessing it would only spare someone an e-mail, not let him in.
 */
export const DEVICE_ID_KEY = 'revime_device_id';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function newId(): string {
  let id = '';
  for (let i = 0; i < 32; i++) id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return id;
}

function deviceId(): string {
  try {
    const stored = SecureStore.getItem(DEVICE_ID_KEY);
    if (stored && /^[A-Za-z0-9]{32}$/.test(stored)) return stored;
    const id = newId();
    SecureStore.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch (err) {
    // A secure store that refuses still gets a header; the next launch may simply look like a new phone.
    console.warn('[device-id] secure store unavailable', err);
    return newId();
  }
}

/**
 * 🛑 PRINTABLE ASCII ONLY (V7 `FND7-072`). This is an HTTP header VALUE, and on Android Expo's native
 * `fetch` (OkHttp) throws on any char outside 0x20..0x7E before the request is sent. The first version
 * read « Android · application Revime »: the « · » (U+00B7) made every sign-in, sign-up and session
 * load fail on Android, while iOS accepted it. `test/v7-android-device-header.spec.ts` holds every
 * platform's value to OkHttp's rule.
 */
function deviceLabel(): string {
  if (Platform.OS === 'ios') return `${(Platform as { isPad?: boolean }).isPad ? 'iPad' : 'iPhone'} - application Revime`;
  if (Platform.OS === 'android') return 'Android - application Revime';
  return 'Application Revime';
}

let cached: Record<string, string> | null = null;

function storedId(): string | null {
  try {
    return SecureStore.getItem(DEVICE_ID_KEY);
  } catch {
    return null;
  }
}

/** The two headers, read once per launch. Never throws. */
export function deviceHeaders(): Record<string, string> {
  if (cached && storedId() === cached[DEVICE_ID_HEADER]) return cached;
  cached = { [DEVICE_ID_HEADER]: deviceId(), [DEVICE_LABEL_HEADER]: deviceLabel() };
  return cached;
}

/**
 * Adds the two headers to an auth request. 🛑 A failure here only costs a « Nouvelle connexion »
 * e-mail, so it must never stop the request itself (`FND7-072`: it once blocked every Android login).
 */
export function applyDeviceHeaders(headers: { set(name: string, value: string): void }): void {
  try {
    for (const [name, value] of Object.entries(deviceHeaders())) headers.set(name, value);
  } catch (err) {
    console.warn('[device-id] headers skipped', err);
  }
}
