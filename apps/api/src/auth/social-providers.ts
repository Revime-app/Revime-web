import type { BetterAuthOptions } from 'better-auth';
import { apple } from 'better-auth/social-providers';

/**
 * Builds the `socialProviders` map from the environment.
 *
 * Extracted from auth.ts so it can be tested WITHOUT importing auth.ts, which
 * constructs a PrismaClient at module scope and would open a database
 * connection from a unit test. This file imports no database code (only
 * Better Auth's Apple provider factory, for the step-up's Apple id-token check).
 *
 * The project convention is absent-credential-means-absent-provider, the same
 * fail-closed shape STORAGE_DRIVER uses for the photo gateway. A missing
 * provider answers 404 PROVIDER_NOT_FOUND, which `authErrorMessageFr` already
 * maps to « Ce mode de connexion n'est pas disponible. »
 */
export type SocialProviderEnv = {
  GOOGLE_CLIENT_ID?: string | undefined;
  GOOGLE_CLIENT_SECRET?: string | undefined;
  APPLE_CLIENT_ID?: string | undefined;
};

/** Present AND non-blank. `apps/api/.env` ships these keys empty, so truthiness alone is wrong. */
function value(raw: string | undefined): string | null {
  const trimmed = raw?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Present-and-non-blank, returned as an OMITTED key rather than an empty string.
 *
 * `firstName` and `lastName` are nullable columns, and writing `''` would give
 * « no name » two representations. Accueil branches on
 * `me?.firstName?.trim()` (index.tsx:104), so an empty string reaches the same
 * fallback but leaves a meaningless row value behind.
 */
function named(raw: unknown): string | undefined {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed.length > 0 ? trimmed : undefined;
}

/** Only the keys that have values, so `...userMap` never overwrites with undefined. */
function nameFields(first: unknown, last: unknown): { firstName?: string; lastName?: string } {
  const firstName = named(first);
  const lastName = named(last);
  return { ...(firstName ? { firstName } : {}), ...(lastName ? { lastName } : {}) };
}

/** Google's OIDC profile carries the split; Better Auth's own mapping ignores it. */
export function splitGoogleName(profile: {
  given_name?: unknown;
  family_name?: unknown;
}): { firstName?: string; lastName?: string } {
  return nameFields(profile.given_name, profile.family_name);
}

/**
 * Apple's name arrives in the ID token's `user` payload, which apple.ts:198-206
 * already reads to build `name`.
 *
 * Absent far more often than present: Apple supplies it only on the FIRST
 * authorization for a given Apple ID and app, and the user can decline the
 * FULL_NAME scope. Returning `{}` is the normal path, not an error path.
 */
export function splitAppleName(profile: {
  user?: { name?: { firstName?: unknown; lastName?: unknown } } | undefined;
}): { firstName?: string; lastName?: string } {
  return nameFields(profile.user?.name?.firstName, profile.user?.name?.lastName);
}

/**
 * V9 U3. Better Auth's own Apple id-token check, for the step-up's Apple confirmation: the same verifier
 * the sign-in uses (Apple's keys, issuer, audience = the bundle id, at most one hour old). Null without
 * an Apple client id.
 */
export function buildAppleIdTokenVerifier(env: SocialProviderEnv): ((token: string) => Promise<boolean>) | null {
  const appleId = value(env.APPLE_CLIENT_ID);
  if (!appleId) return null;
  const provider = apple({ clientId: appleId, appBundleIdentifier: appleId });
  return (token) => provider.verifyIdToken(token);
}

export function buildSocialProviders(
  env: SocialProviderEnv,
): NonNullable<BetterAuthOptions['socialProviders']> {
  const providers: NonNullable<BetterAuthOptions['socialProviders']> = {};

  const googleId = value(env.GOOGLE_CLIENT_ID);
  const googleSecret = value(env.GOOGLE_CLIENT_SECRET);
  // BOTH, not either. The previous ternary keyed on the id and asserted the
  // secret with `!`, so a half-configured environment registered a provider
  // that failed at the token exchange instead of never appearing.
  if (googleId && googleSecret) {
    providers.google = {
      clientId: googleId,
      clientSecret: googleSecret,
      mapProfileToUser: splitGoogleName,
    };
  }

  const appleId = value(env.APPLE_CLIENT_ID);
  if (appleId) {
    // No clientSecret, deliberately. verifyIdToken validates against Apple's
    // public JWKS with audience `appBundleIdentifier ?? clientId`
    // (@better-auth/core/src/social-providers/apple.ts:136-175), so the secret
    // is only read by createAuthorizationURL -- the redirect flow, which we do
    // not use. Omitting it makes that flow throw CLIENT_ID_AND_SECRET_REQUIRED,
    // so there is exactly one Apple path and the library enforces it.
    providers.apple = {
      clientId: appleId,
      appBundleIdentifier: appleId,
      mapProfileToUser: splitAppleName,
      // V9 U3 (`ISS9-007`): the TEMP CF4-04 diagnostic wrapper is gone; the library verifies alone.
    };
  }

  return providers;
}
