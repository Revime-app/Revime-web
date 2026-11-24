import { describe, expect, it } from 'vitest';
import { identityNotificationFor } from '../src/identity/identity-notify.js';

/**
 * `identityNotificationFor` — CF4-E §3, Controller Ruling R3.
 *
 * 🛑 R3 OVERRIDES the design spec's original "status changed to REQUIRES_INPUT" rule. A new
 * Stripe session row is created at REQUIRES_INPUT with no error and no prior sync, so a bare
 * status transition would fire IDENTITY_DOCUMENTS_REQUIRED on every fresh session's first
 * webhook. The "refused" signal is `REQUIRES_INPUT` **plus a `lastErrorCode`**, matching
 * `error-codes.ts`'s own definition of a failed check - the same shape
 * `repairerVerificationState` already uses elsewhere to mean "refused" rather than "unstarted".
 */

describe('identityNotificationFor', () => {
  it('IDENTITY_VERIFIED on the first transition to VERIFIED', () => {
    expect(
      identityNotificationFor(
        { status: 'PROCESSING', verifiedAt: null, lastErrorCode: null },
        { status: 'VERIFIED', lastErrorCode: null },
      ),
    ).toBe('IDENTITY_VERIFIED');
  });

  it('null when already stamped verified (redelivery)', () => {
    expect(
      identityNotificationFor(
        { status: 'VERIFIED', verifiedAt: new Date('2026-09-01'), lastErrorCode: null },
        { status: 'VERIFIED', lastErrorCode: null },
      ),
    ).toBeNull();
  });

  it('IDENTITY_DOCUMENTS_REQUIRED: PROCESSING (no code) -> REQUIRES_INPUT + code', () => {
    expect(
      identityNotificationFor(
        { status: 'PROCESSING', verifiedAt: null, lastErrorCode: null },
        { status: 'REQUIRES_INPUT', lastErrorCode: 'document_unverified_other' },
      ),
    ).toBe('IDENTITY_DOCUMENTS_REQUIRED');
  });

  it('IDENTITY_DOCUMENTS_REQUIRED: fresh REQUIRES_INPUT (no code) -> REQUIRES_INPUT + code', () => {
    // A freshly-created session row: stored is REQUIRES_INPUT with no error at all (its
    // very first sync), then the retry attempt fails.
    expect(
      identityNotificationFor(
        { status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: null },
        { status: 'REQUIRES_INPUT', lastErrorCode: 'document_unverified_other' },
      ),
    ).toBe('IDENTITY_DOCUMENTS_REQUIRED');
  });

  it('null: REQUIRES_INPUT (no code) -> REQUIRES_INPUT (no code)', () => {
    // The ordinary "session just created" webhook: nothing failed yet.
    expect(
      identityNotificationFor(
        { status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: null },
        { status: 'REQUIRES_INPUT', lastErrorCode: null },
      ),
    ).toBeNull();
  });

  it('null: REQUIRES_INPUT + code -> REQUIRES_INPUT + code (redelivery, same code)', () => {
    expect(
      identityNotificationFor(
        { status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'document_unverified_other' },
        { status: 'REQUIRES_INPUT', lastErrorCode: 'document_unverified_other' },
      ),
    ).toBeNull();
  });

  it('null: REQUIRES_INPUT + code -> REQUIRES_INPUT + a DIFFERENT code (already refused, no repeat)', () => {
    // R3: once stored is already REQUIRES_INPUT with an error code, a second distinct
    // failure code must not re-notify either - "already refused -> no repeat" applies
    // regardless of which code follows.
    expect(
      identityNotificationFor(
        { status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'document_unverified_other' },
        { status: 'REQUIRES_INPUT', lastErrorCode: 'selfie_face_mismatch' },
      ),
    ).toBeNull();
  });

  it('null: PROCESSING -> PROCESSING', () => {
    expect(
      identityNotificationFor(
        { status: 'PROCESSING', verifiedAt: null, lastErrorCode: null },
        { status: 'PROCESSING', lastErrorCode: null },
      ),
    ).toBeNull();
  });

  it('null: any -> CANCELED', () => {
    expect(
      identityNotificationFor(
        { status: 'PROCESSING', verifiedAt: null, lastErrorCode: null },
        { status: 'CANCELED', lastErrorCode: null },
      ),
    ).toBeNull();
    expect(
      identityNotificationFor(
        { status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'document_unverified_other' },
        { status: 'CANCELED', lastErrorCode: null },
      ),
    ).toBeNull();
  });

  it('null: REQUIRES_INPUT (no code) -> PROCESSING', () => {
    expect(
      identityNotificationFor(
        { status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: null },
        { status: 'PROCESSING', lastErrorCode: null },
      ),
    ).toBeNull();
  });
});
