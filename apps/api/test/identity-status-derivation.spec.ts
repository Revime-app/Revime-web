import { describe, expect, it, vi } from 'vitest';
import { IdentityService } from '../src/identity/identity.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const USER = 'Xk3fQ2mNpZ8aB7cD4eF5gH6iJ7kL8mN9';

function serviceWith(row: Record<string, unknown> | null) {
  const prisma = { identityVerification: { findUnique: vi.fn().mockResolvedValue(row) } };
  return new IdentityService(prisma as unknown as PrismaService, { emit: vi.fn() } as never);
}

describe('IdentityService.status - the two derived booleans', () => {
  it('offers the alternative to a user who has never started', async () => {
    const s = await serviceWith(null).status(USER);
    expect(s.documentOnlyAvailable).toBe(true);
    expect(s.documentOnlyRecommended).toBe(false);
    expect(s.status).toBeNull();
  });

  it('withdraws availability once a selfie fraud signal is recorded', async () => {
    const s = await serviceWith({
      status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'selfie_face_mismatch',
      redactionStatus: null, erasureRequestedAt: null, selfieFraudSignalAt: new Date('2026-09-01'),
    }).status(USER);
    expect(s.documentOnlyAvailable).toBe(false);
  });

  it('recommends it after consent_declined', async () => {
    const s = await serviceWith({
      status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'consent_declined',
      redactionStatus: null, erasureRequestedAt: null, selfieFraudSignalAt: null,
    }).status(USER);
    expect(s.documentOnlyAvailable).toBe(true);
    expect(s.documentOnlyRecommended).toBe(true);
  });

  it('recommends it when the document carries no face photo', async () => {
    const s = await serviceWith({
      status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'selfie_document_missing_photo',
      redactionStatus: null, erasureRequestedAt: null, selfieFraudSignalAt: null,
    }).status(USER);
    expect(s.documentOnlyRecommended).toBe(true);
  });

  /**
   * 🛑 AVAILABLE BUT NOT RECOMMENDED, and this row is the one that is easy to get wrong.
   * Dropping the selfie does not help someone whose COUNTRY is unsupported, so promoting it
   * would point at a place that cannot answer - but he is not fraud-signalled, so the quiet
   * control stays. Same for document_* codes and selfie_unverified_other.
   */
  it.each([
    'country_not_supported',
    'under_supported_age',
    'document_type_not_supported',
    'document_expired',
    'document_unverified_other',
    'selfie_unverified_other',
  ])('leaves the alternative available but NOT recommended for %s', async (code) => {
    const s = await serviceWith({
      status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: code,
      redactionStatus: null, erasureRequestedAt: null, selfieFraudSignalAt: null,
    }).status(USER);
    expect(s.documentOnlyAvailable).toBe(true);
    expect(s.documentOnlyRecommended).toBe(false);
  });

  it('serialises erasureRequestedAt as ISO 8601, matching verifiedAt', async () => {
    const s = await serviceWith({
      status: 'CANCELED', verifiedAt: null, lastErrorCode: null,
      redactionStatus: 'PROCESSING', erasureRequestedAt: new Date('2026-09-02T10:00:00.000Z'),
      selfieFraudSignalAt: null,
    }).status(USER);
    expect(s.erasureRequestedAt).toBe('2026-09-02T10:00:00.000Z');
    expect(s.redactionStatus).toBe('PROCESSING');
    // Free, and it pins the `row.lastErrorCode !== null &&` clause that would otherwise rest on
    // types alone: a null code recommends nothing, because there is no failure to remedy.
    expect(s.documentOnlyRecommended).toBe(false);
  });

  /**
   * 🛑 THE TWO BOOLEANS ARE INDEPENDENT, AND THIS IS THE ONLY TEST THAT SAYS SO. Every other row in
   * this file sets at most one of the two inputs, so the tidy-looking coupling
   * `documentOnlyRecommended: available && DOCUMENT_ONLY_REMEDY_CODES.has(...)` passes all eleven of
   * them. Verified by writing that coupling and watching only this test fail.
   *
   * The state is REACHABLE, which is what makes it worth a test rather than a comment.
   * `selfieFraudSignalAt` is a PER-PERSON field and survives `start()`'s repoint; `lastErrorCode` is
   * PER-SESSION and is rewritten by it. So a fraud signal from session 1 plus a `consent_declined`
   * from session 2 lands exactly here: **available false, recommended true.**
   *
   * And that combination is coherent rather than contradictory, because the two answer different
   * questions - **Available decides ACCESS, Recommended decides PROMINENCE.** Recommended is a
   * statement about which remedy fits the last failure; it is not permission. The app must gate on
   * `documentOnlyAvailable` and must never infer access from prominence, or a fraud-signalled user
   * is shown a promoted control that `start()` then refuses with 403 - `CF-10`'s Critical defect,
   * the app answering a server question with data that does not contain the answer.
   */
  it('keeps the two booleans independent: refused access can still carry a recommendation', async () => {
    const s = await serviceWith({
      status: 'REQUIRES_INPUT', verifiedAt: null, lastErrorCode: 'consent_declined',
      redactionStatus: null, erasureRequestedAt: null,
      selfieFraudSignalAt: new Date('2026-08-15T00:00:00.000Z'),
    }).status(USER);

    // The fraud signal decides this one, and it outranks nothing - it is simply a different question.
    expect(s.documentOnlyAvailable).toBe(false);
    // Still true, because `consent_declined` is still the failure the alternative remedies.
    expect(s.documentOnlyRecommended).toBe(true);
  });

  /**
   * 🛑 WHAT THIS FILE DELIBERATELY DOES NOT TEST, recorded so nobody adds it back believing it is a
   * gap. None of the tests above can pin `status()`'s row `select` - a mocked `findUnique` ignores
   * its `select` argument and hands back the whole fixture, so dropping a column leaves every
   * assertion here green.
   *
   * An assertion on the `select` ARGUMENT was written and then removed, because both probes were
   * run on 2026-09-02 and `tsc` already refuses it: Prisma narrows the row to the selected keys, so
   * reading an unselected one is TS2339. The typecheck gate covers it, and duplicating a gate in a
   * test that cannot observe the behaviour is how a suite grows assertions that pass for the wrong
   * reason.
   *
   * Worth knowing which way it would have failed, because the intuitive guess is wrong: an
   * unselected field arrives as `undefined`, and `undefined === null` is false, so a missing
   * `selfieFraudSignalAt` would set `documentOnlyAvailable` false for EVERY user rather than true.
   */
});
