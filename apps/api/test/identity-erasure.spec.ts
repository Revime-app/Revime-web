import { beforeEach, describe, expect, it, vi } from 'vitest';
import { redactIdentityForUser } from '../src/identity/redact-identity.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeIdentityGateway, identityGateway, __resetIdentityGateway } from '../src/identity/gateway.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

const USER = 'Xk3fQ2mNpZ8aB7cD4eF5gH6iJ7kL8mN9';

/**
 * 🛑 EVERY FIELD IS REQUIRED, INCLUDING `selfieFraudSignalAt`, AND THAT IS DELIBERATE. It mirrors
 * `redactIdentityForUser`'s own `select` exactly, so a row here is a FAITHFUL row.
 *
 * Making it optional would be a trap rather than a convenience: the fraud stamp is conditioned on
 * `row.selfieFraudSignalAt === null`, an omitted field arrives `undefined`, and `undefined === null`
 * is false - so a test that forgot it would see the stamp silently never fire and pass for the wrong
 * reason. `identity.service.ts`'s `syncSession` comment records the same trap the same way round.
 */
type Row = {
  id: string;
  stripeSessionId: string;
  status: 'REQUIRES_INPUT' | 'PROCESSING' | 'VERIFIED' | 'CANCELED';
  erasureRequestedAt: Date | null;
  selfieFraudSignalAt: Date | null;
} | null;

function harness(row: Row) {
  const update = vi.fn().mockResolvedValue({});
  const profileUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const prisma = {
    identityVerification: { findUnique: vi.fn().mockResolvedValue(row), update },
    profile: { updateMany: profileUpdateMany, update: profileUpdateMany },
  };
  return {
    prisma: prisma as unknown as PrismaClient,
    update,
    profileUpdateMany,
    gateway: identityGateway() as FakeIdentityGateway,
  };
}

beforeEach(() => {
  __resetIdentityGateway();
  // Both, so `identityGateway()` selects the fake. `redactIdentityForUser` does not consult
  // `isConnectEnabled()`, so the flag vars are not needed here - but the driver/key pair is.
  delete process.env.STRIPE_DRIVER;
  delete process.env.STRIPE_SECRET_KEY;
});

describe('redactIdentityForUser', () => {
  it('does nothing when the user has no identity row', async () => {
    const { prisma, update, gateway } = harness(null);

    await expect(redactIdentityForUser(prisma, USER)).resolves.toBeUndefined();

    expect(update).not.toHaveBeenCalled();
    expect(gateway.redactCalls).toHaveLength(0);
  });

  it('is idempotent: a second request returns without redacting again', async () => {
    const { prisma, update, gateway } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'VERIFIED',
      erasureRequestedAt: new Date('2026-09-01'),
      selfieFraudSignalAt: null,
    });

    await expect(redactIdentityForUser(prisma, USER)).resolves.toBeUndefined();

    expect(gateway.redactCalls).toHaveLength(0);
    expect(update).not.toHaveBeenCalled();
  });

  /** Stripe forbids redacting mid-check, so this is a real refusal rather than a courtesy. */
  it('refuses while the session is PROCESSING, and says so in French', async () => {
    const { prisma, update, gateway } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'PROCESSING',
      erasureRequestedAt: null,
      selfieFraudSignalAt: null,
    });

    await expect(redactIdentityForUser(prisma, USER)).rejects.toBeInstanceOf(AppException);
    await expect(redactIdentityForUser(prisma, USER)).rejects.toThrowError(/quelques minutes/i);
    expect(gateway.redactCalls).toHaveLength(0);

    /**
     * ADDED BEYOND THE BRIEF, and both lines close a way this test could pass while the branch is
     * wrong.
     *
     * The CODE is part of the produced interface - a 422 says « the request was understood and is
     * refused for now », which is what makes « réessayez » true. `toBeInstanceOf(AppException)`
     * holds for every code in `STATUS_BY_CODE`, so a later change to CONFLICT or INTERNAL would
     * keep this file green while telling the app something else entirely.
     *
     * And a refusal must not STAMP. `erasureRequestedAt` is the audit record of an Article 17
     * request; writing it on a refusal would claim we honoured a request we declined, and the two
     * assertions above cannot see a write.
     */
    await expect(redactIdentityForUser(prisma, USER)).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
    });
    expect(update).not.toHaveBeenCalled();
  });

  /**
   * 🛑 A CANCELED SESSION CANNOT BE REDACTED AT ALL - the SDK's allowed set is
   * {requires_input, verified}. So we record that the user asked and leave redactionStatus null;
   * the « contact Stripe support » half of the duty carries the whole weight for this user.
   */
  it('stamps the request but does NOT call redact for a CANCELED session', async () => {
    const { prisma, update, gateway } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'CANCELED',
      erasureRequestedAt: null,
      selfieFraudSignalAt: null,
    });

    await redactIdentityForUser(prisma, USER);

    expect(gateway.redactCalls).toHaveLength(0);
    /**
     * 🛑 THE `where` IS PINNED, AND IT IS NOT A TAUTOLOGY. Added 2026-09-02, on all three writing
     * paths.
     *
     * `IdentityVerification` carries both `id` and `stripeSessionId`, both unique, and this file
     * seeds them as different strings precisely so the two cannot be confused. Swapping
     * `{ id: row.id }` for `{ id: row.stripeSessionId }` throws Prisma `P2025` - **AFTER the
     * redaction has already run on the two redact paths**, which leaves a document redacted at
     * Stripe with `erasureRequestedAt` never stamped: a row claiming no Article 17 request was made,
     * against a session that has been redacted. Nothing else in this file can see that, because
     * every other assertion reads `.data`.
     */
    expect(update.mock.calls[0]![0].where).toEqual({ id: 'iv_1' });
    const data = update.mock.calls[0]![0].data;
    expect(data.erasureRequestedAt).toBeInstanceOf(Date);
    expect(data.redactionStatus).toBeUndefined();
  });

  it('redacts a VERIFIED session and records Stripe\'s progress', async () => {
    const { prisma, update, profileUpdateMany, gateway } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'VERIFIED',
      erasureRequestedAt: null,
      selfieFraudSignalAt: null,
    });
    // The fake must hold the session the row names, or `redactSession` rejects.
    gateway.seed({
      id: 'vs_1',
      status: 'VERIFIED',
      url: null,
      lastErrorCode: null,
      redactionStatus: null,
    });

    await redactIdentityForUser(prisma, USER);

    expect(gateway.redactCalls).toEqual(['vs_1']);
    // The `where`, for the reason spelled out on the CANCELED test above - and on this path the
    // wrong key throws only AFTER Stripe has redacted.
    expect(update.mock.calls[0]![0].where).toEqual({ id: 'iv_1' });
    const data = update.mock.calls[0]![0].data;
    expect(data.erasureRequestedAt).toBeInstanceOf(Date);
    // Redaction begins as `processing` and completes up to four days later, so PROCESSING here is
    // the honest value rather than REDACTED.
    expect(data.redactionStatus).toBe('PROCESSING');
    // A verified session stays verified through a redaction - only `redaction.status` moves.
    expect(data.status).toBe('VERIFIED');

    /**
     * 🛑 ADDED BEYOND THE BRIEF, AND THIS IS THE LINE THAT ACTUALLY GUARDS THE LEVEL. The
     * « never writes Profile.verificationLevel » test below states a TOTALITY, but it exercises a
     * CANCELED row - and CANCELED is the one branch that returns before the redact call, so it is
     * the branch where the demotion instinct does NOT land. A demotion added on THIS path, which
     * is where the erasure actually happens and therefore where a « tidy up » would put it, was
     * measured to pass all seven tests including that one.
     *
     * A VERIFIED row is also the only row for which a demotion would do observable harm: it is the
     * row that was granted IDENTITY in the first place.
     */
    expect(profileUpdateMany).not.toHaveBeenCalled();
  });

  /**
   * ADDED BEYOND THE BRIEF, because without it the `status` write above passes for an incidental
   * reason. On a VERIFIED row `summary.status` and `row.status` are the SAME value, so an
   * implementation writing `status: row.status` keeps that test green - and leaves the row saying
   * REQUIRES_INPUT for a session Stripe has just cancelled, so the app offers a « reprendre »
   * control for a session that is gone. REQUIRES_INPUT is the ONLY branch where the two values
   * differ, so it is the only one that can fail for that bug.
   *
   * It is also the branch that carries the billing consequence: redacting an unfinished
   * verification CANCELS it, so verifying afterwards costs a newly billed session.
   */
  it('redacts a REQUIRES_INPUT session and records the CANCELED status the redaction caused', async () => {
    const { prisma, update, profileUpdateMany, gateway } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'REQUIRES_INPUT',
      erasureRequestedAt: null,
      selfieFraudSignalAt: null,
    });
    gateway.seed({
      id: 'vs_1',
      status: 'REQUIRES_INPUT',
      url: 'https://verify.stripe.com/start/unfinished',
      lastErrorCode: null,
      redactionStatus: null,
    });

    await redactIdentityForUser(prisma, USER);

    expect(gateway.redactCalls).toEqual(['vs_1']);
    // The `where`, for the reason spelled out on the CANCELED test above.
    expect(update.mock.calls[0]![0].where).toEqual({ id: 'iv_1' });
    const data = update.mock.calls[0]![0].data;
    expect(data.erasureRequestedAt).toBeInstanceOf(Date);
    expect(data.redactionStatus).toBe('PROCESSING');
    // 🛑 CANCELED, NOT REQUIRES_INPUT. Read from the SDK's own comment on `redact`: redacting a
    // session in this state automatically cancels it. The row has to say so.
    expect(data.status).toBe('CANCELED');
    // The second redact-path branch, for the reason given in the VERIFIED test above.
    expect(profileUpdateMany).not.toHaveBeenCalled();
  });

  /**
   * 🛑 THE FRAUD SIGNAL IS CAPTURED BEFORE THE REDACTION DESTROYS ITS SOURCE. Added 2026-09-02, and
   * it closes the half of the spec's §6.1 that §6.1 leaves open.
   *
   * §6.1 makes the REFUSAL read `selfieFraudSignalAt` instead of `lastErrorCode`, so a redaction
   * cannot launder it. It says nothing about the STAMP never firing: `syncSession` stamps from a
   * `lastErrorCode` it reads after the fact, so a user who fails the face match and erases before
   * our `requires_input` webhook is processed may never be stamped at all - §6.1 itself records that
   * whether redaction preserves `last_error.code` is UNVERIFIED. `documentOnlyAvailable` would then
   * stay true for good.
   *
   * The row is REQUIRES_INPUT with NO stamp and the LIVE session carries the fraud code, which is
   * exactly that window. Proven to fail: deleting the `...(stampFraudSignal ? … : {})` spread leaves
   * `data.selfieFraudSignalAt` undefined here while every other test in this file stays green.
   */
  it('stamps selfieFraudSignalAt from the LIVE session before redacting, so the defence does not depend on webhook timing', async () => {
    const { prisma, update, gateway } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'REQUIRES_INPUT',
      erasureRequestedAt: null,
      // 🛑 NULL IS THE SCENARIO. The whole point is that the webhook has NOT stamped yet.
      selfieFraudSignalAt: null,
    });
    gateway.seed({
      id: 'vs_1',
      status: 'REQUIRES_INPUT',
      url: 'https://verify.stripe.com/start/failed',
      // One of `SELFIE_FRAUD_CODES`. Read from `error-codes.ts` rather than invented.
      lastErrorCode: 'selfie_face_mismatch',
      redactionStatus: null,
    });

    await redactIdentityForUser(prisma, USER);

    // The PREMISE: the redaction really did run, so the evidence really was about to be destroyed.
    // Without this the test would pass on a path that never redacted anything.
    expect(gateway.redactCalls).toEqual(['vs_1']);
    const data = update.mock.calls[0]![0].data;
    expect(data.selfieFraudSignalAt).toBeInstanceOf(Date);
  });

  /**
   * The NEGATIVE half, and it is what stops the fix from becoming a blanket stamp. A verification
   * that failed for a DOCUMENT reason - or did not fail at all - must not be marked as a suspected
   * fraud, because the stamp is never cleared and it permanently removes the non-biometric route
   * from that account. `document_unverified_other` is deliberately EXCLUDED from
   * `SELFIE_FRAUD_CODES`; see `error-codes.ts` for why each exclusion is a decision.
   *
   * Asserted as ABSENCE rather than as a null check: the property is that the field is not written
   * here at all, by any value.
   */
  it('does NOT stamp selfieFraudSignalAt when the live session carries a non-fraud error code', async () => {
    const { prisma, update, gateway } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'REQUIRES_INPUT',
      erasureRequestedAt: null,
      selfieFraudSignalAt: null,
    });
    gateway.seed({
      id: 'vs_1',
      status: 'REQUIRES_INPUT',
      url: 'https://verify.stripe.com/start/failed',
      lastErrorCode: 'document_unverified_other',
      redactionStatus: null,
    });

    await redactIdentityForUser(prisma, USER);

    expect(gateway.redactCalls).toEqual(['vs_1']);
    expect(update.mock.calls[0]![0].data).not.toHaveProperty('selfieFraudSignalAt');
  });

  /**
   * 🛑 THE LEVEL SURVIVES. The owner's decision of 2026-09-02, and promote-identity.ts already
   * documents why there is no demotion counterpart. This assertion is what stops a later "tidy
   * up" from adding one.
   */
  it('never writes Profile.verificationLevel', async () => {
    const { prisma, profileUpdateMany } = harness({
      id: 'iv_1',
      stripeSessionId: 'vs_1',
      status: 'CANCELED',
      erasureRequestedAt: null,
      selfieFraudSignalAt: null,
    });

    await redactIdentityForUser(prisma, USER);

    expect(profileUpdateMany).not.toHaveBeenCalled();
  });
});
