import type { AdminMe } from '@revime/shared';

/**
 * CF4-41 (sub-project N, spec §4.3). Pure helpers of the dashboard's second factor, so the
 * rules are testable without a browser.
 */

/**
 * Where the second factor is set up: the « Sécurité » section of « Paramètres ». The old
 * /securite route only redirects here, so it is not an allowed destination of its own.
 */
export const SECURITE_PATH = '/parametres';

/**
 * Where a page may go, given `GET admin/me`. A staff session that has not proven its second
 * factor sees only « Paramètres ». The API refuses every other admin route to it anyway (403
 * « Double authentification requise. »); this only spares the operator a screen of errors.
 */
export function gateRoute(me: AdminMe | null, pathname: string): 'allow' | 'securite' | 'deny' {
  if (!me) return 'deny';
  if (me.twoFactorVerified) return 'allow';
  return pathname === SECURITE_PATH ? 'allow' : 'securite';
}

type Parsed = { ok: true; code: string } | { ok: false; error: string };

export function parseTotpCode(input: string): Parsed {
  const code = input.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(code)) {
    return { ok: false, error: 'Saisissez le code à 6 chiffres de votre application.' };
  }
  return { ok: true, code };
}

export function parseBackupCode(input: string): Parsed {
  const code = input.trim();
  if (!code) return { ok: false, error: 'Saisissez un code de secours.' };
  return { ok: true, code };
}

/** The `secret` of an `otpauth://` URI, for manual entry when the app cannot scan. */
export function totpSecretOf(totpURI: string): string | null {
  const match = totpURI.match(/[?&]secret=([^&]+)/i);
  return match ? decodeURIComponent(match[1]!) : null;
}
