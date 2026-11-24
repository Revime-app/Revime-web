/**
 * « Paramètres › Sécurité »: the content of the 2FA setup guide, as data so it is testable
 * and the component stays a renderer. Any app implementing standard TOTP works; these are
 * three free, well-known ones on both stores.
 */
export type AuthenticatorApp = { name: string; ios: string; android: string };

export const AUTHENTICATOR_APPS: readonly AuthenticatorApp[] = [
  {
    name: 'Google Authenticator',
    ios: 'https://apps.apple.com/app/google-authenticator/id388497605',
    android: 'https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2',
  },
  {
    name: 'Microsoft Authenticator',
    ios: 'https://apps.apple.com/app/microsoft-authenticator/id983156458',
    android: 'https://play.google.com/store/apps/details?id=com.azure.authenticator',
  },
  {
    name: '2FAS',
    ios: 'https://apps.apple.com/app/2fas-auth/id1217793794',
    android: 'https://play.google.com/store/apps/details?id=com.twofasapp',
  },
];

/**
 * The base32 key, upper-cased and in blocks of 4 (« JBSW Y3DP … »). Authenticator apps
 * ignore spaces and case, so the grouped form can be typed or pasted as is.
 */
export function formatSecretForEntry(secret: string): string {
  const clean = secret.replace(/[\s=]/g, '').toUpperCase();
  return clean.match(/.{1,4}/g)?.join(' ') ?? '';
}
