import type { IdentitySessionSummary } from './gateway.js';

/**
 * The Stripe Identity session status vocabulary, exported from `gateway.ts`'s own
 * `IdentitySessionSummary['status']` rather than redeclared here - see that file's
 * `summariseSession` for the one place Stripe's raw strings are translated into it.
 */
export type IdentityStatus = IdentitySessionSummary['status'];

/**
 * CF4-E §3 - identity outcome notifications.
 *
 * 🛑 CONTROLLER RULING R3 OVERRIDES THE DESIGN SPEC'S ORIGINAL RULE. The spec's own
 * "status changed to REQUIRES_INPUT" test is wrong: a brand-new Stripe Identity session row
 * is CREATED at REQUIRES_INPUT with no error at all (see `identity.service.ts`'s `start()`
 * upsert), so a bare status transition would fire IDENTITY_DOCUMENTS_REQUIRED on the very
 * first webhook of every session that has not failed anything yet.
 *
 * "Refused" is instead defined the same way the rest of this codebase's error-code plumbing
 * defines it (`error-codes.ts`): REQUIRES_INPUT **plus a `lastErrorCode`**. A session sitting
 * at REQUIRES_INPUT with no code has simply not been attempted yet - there is nothing to
 * notify about.
 *
 * Both notifications fire AT MOST ONCE per real-world event, by construction:
 * - IDENTITY_VERIFIED only on the transition INTO verified - `stored.verifiedAt === null` is
 *   exactly `syncSession`'s own "stamped once, never cleared" guard, so a redelivery of the
 *   same `verified` event (Stripe retries) sees `stored.verifiedAt` already set and emits
 *   nothing.
 * - IDENTITY_DOCUMENTS_REQUIRED only on the transition INTO a refusal - `stored.status ===
 *   'REQUIRES_INPUT' && stored.lastErrorCode !== null` means "already refused", which blocks
 *   both an exact redelivery of the same failure AND a second distinct failure code landing
 *   before anything cleared the first: once refused, no repeat until the row moves off
 *   REQUIRES_INPUT (a fresh session, or a pass).
 */
export function identityNotificationFor(
  stored: { status: IdentityStatus; verifiedAt: Date | null; lastErrorCode: string | null },
  session: { status: IdentityStatus; lastErrorCode: string | null },
): 'IDENTITY_VERIFIED' | 'IDENTITY_DOCUMENTS_REQUIRED' | null {
  if (session.status === 'VERIFIED' && stored.verifiedAt === null) {
    return 'IDENTITY_VERIFIED';
  }

  const alreadyRefused = stored.status === 'REQUIRES_INPUT' && stored.lastErrorCode !== null;
  if (session.status === 'REQUIRES_INPUT' && session.lastErrorCode !== null && !alreadyRefused) {
    return 'IDENTITY_DOCUMENTS_REQUIRED';
  }

  return null;
}
