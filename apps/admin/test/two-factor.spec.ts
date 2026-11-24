import { describe, expect, it } from 'vitest';
import type { AdminMe } from '@revime/shared';
import { gateRoute, parseBackupCode, parseTotpCode, SECURITE_PATH } from '../lib/two-factor';

/** CF4-41 (sub-project N, spec §4.3). Pure helpers of the dashboard's second factor. */

const me = (twoFactorVerified: boolean): AdminMe => ({
  role: 'support',
  permissions: ['dashboard.read'],
  twoFactorVerified,
});

describe('gateRoute', () => {
  it('2FA setup lives in « Paramètres »', () => {
    expect(SECURITE_PATH).toBe('/parametres');
  });

  it('denies without an admin/me answer', () => {
    expect(gateRoute(null, '/')).toBe('deny');
    expect(gateRoute(null, '/parametres')).toBe('deny');
  });

  it('sends an unverified staff session to /parametres (where 2FA is set up) from every page, old /securite included, and lets /parametres through', () => {
    for (const path of ['/', '/utilisateurs', '/utilisateurs/abc', '/litiges']) {
      expect(gateRoute(me(false), path)).toBe('securite');
    }
    expect(gateRoute(me(false), '/securite')).toBe('securite');
    expect(gateRoute(me(false), '/parametres')).toBe('allow');
  });

  it('allows a verified session everywhere', () => {
    for (const path of ['/', '/parametres', '/remboursement']) expect(gateRoute(me(true), path)).toBe('allow');
  });
});

describe('parseTotpCode', () => {
  it('accepts six digits, ignoring spaces', () => {
    expect(parseTotpCode(' 123 456 ')).toEqual({ ok: true, code: '123456' });
    expect(parseTotpCode('000000')).toEqual({ ok: true, code: '000000' });
  });

  it.each(['12345', 'abcdef', '1234567', '', '12 34 5'])('rejects %j', (input) => {
    expect(parseTotpCode(input)).toEqual({
      ok: false,
      error: 'Saisissez le code à 6 chiffres de votre application.',
    });
  });
});

describe('parseBackupCode', () => {
  it('trims', () => {
    expect(parseBackupCode('  AbCd-1234  ')).toEqual({ ok: true, code: 'AbCd-1234' });
  });

  it('rejects empty input', () => {
    expect(parseBackupCode('   ')).toEqual({ ok: false, error: 'Saisissez un code de secours.' });
  });
});
