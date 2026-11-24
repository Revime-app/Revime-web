import { BASE_ERROR_CODES } from '@better-auth/core/error';
import { describe, expect, it } from 'vitest';
import {
  AUTH_ERROR_FALLBACK_FR,
  AUTH_ERROR_MESSAGES_FR,
  authErrorMessageFr,
} from '@revime/shared';

/**
 * This suite guards @revime/shared, not the admin app, but it lives here on
 * purpose: packages/shared has no test runner, admin's vitest is database-free
 * so it can run in CI, and the admin login screen is where the English leak was
 * actually observed in a browser. Admin resolves both @revime/shared and
 * @better-auth/core/error, which is what makes the coverage assertion possible.
 */
describe('Better Auth error messages in French', () => {
  it('maps every code Better Auth can emit', () => {
    // Not a style check: an upgrade that adds a code would otherwise fall
    // through to a generic sentence with nobody noticing it had appeared.
    const unmapped = Object.keys(BASE_ERROR_CODES).filter(
      (code) => !(code in AUTH_ERROR_MESSAGES_FR),
    );
    expect(unmapped).toEqual([]);
  });

  it('never returns one of Better Auth’s English strings', () => {
    // BASE_ERROR_CODES values are objects, not strings: defineErrorCodes wraps
    // each one as { code, message }. Comparing against the raw values instead of
    // their .message silently compares French against objects, matches nothing,
    // and passes for the wrong reason. Hence the control below.
    const english = new Set<string>(
      Object.values(BASE_ERROR_CODES).map((entry) => entry.message),
    );

    // Control: proves the set really holds English prose, so a pass above means
    // "no leak" rather than "nothing was ever compared".
    expect(english.has('Invalid email or password')).toBe(true);

    const leaks = Object.entries(AUTH_ERROR_MESSAGES_FR)
      .filter(([, message]) => english.has(message))
      .map(([code]) => code);
    expect(leaks).toEqual([]);
  });

  it('translates the code the admin login screen actually returned', () => {
    // Proven live against the deployed API: POST /api/auth/sign-in/email with
    // unknown credentials answers 401 {"code":"INVALID_EMAIL_OR_PASSWORD"}.
    expect(authErrorMessageFr('INVALID_EMAIL_OR_PASSWORD')).toBe(
      'Adresse e-mail ou mot de passe incorrect.',
    );
  });

  it('translates a repeat signup', () => {
    expect(authErrorMessageFr('USER_ALREADY_EXISTS')).toBe(
      'Un compte existe déjà avec cette adresse e-mail.',
    );
  });

  it('prefers the call site’s own sentence for an unknown code', () => {
    expect(authErrorMessageFr('SOME_FUTURE_CODE', 'Identifiants incorrects.')).toBe(
      'Identifiants incorrects.',
    );
  });

  it('falls back to French when the error carries no code at all', () => {
    // error.code is optional in Better Auth's client types, so undefined is a
    // real case and must not produce "undefined" on screen.
    expect(authErrorMessageFr(undefined)).toBe(AUTH_ERROR_FALLBACK_FR);
    expect(authErrorMessageFr(null)).toBe(AUTH_ERROR_FALLBACK_FR);
    expect(authErrorMessageFr('')).toBe(AUTH_ERROR_FALLBACK_FR);
  });
});
