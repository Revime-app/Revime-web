import type { PrismaClient } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { identityGateway } from './gateway.js';
// No cycle: `error-codes.ts` imports nothing at all. Checked rather than assumed.
import { SELFIE_FRAUD_CODES } from './error-codes.js';

/**
 * Honours an erasure request against the identity verification, and it is TWO-PART.
 *
 * 🛑 REDACTION IS NECESSARY BUT NOT SUFFICIENT, and the second half is not in this file.
 * Redacting removes the data from OUR view of Stripe; it does NOT remove it from Stripe's own
 * servers. Stripe's own guidance is explicit that the user must be told to contact Stripe support
 * themselves. That half lives in the app - `parametres/confidentialite.tsx` and
 * `parametres/supprimer.tsx`. **Telling a regulator that redaction alone discharges an Article 17
 * request would be a false statement**, which is worse than the not-yet-built problem it replaced.
 *
 * Takes its Prisma client as a PARAMETER rather than being a Nest provider, for the same reason
 * `promote-identity.ts` does: its callers hold different clients. `PrismaService` extends
 * `PrismaClient`, so it satisfies this. Two callers - `IdentityService.requestErasure` and
 * `UsersService.deleteAccount`.
 *
 * 🛑 IT NEVER WRITES `Profile.verificationLevel`. The owner decided on 2026-09-02 that the level
 * survives an erasure, and `promote-identity.ts` already records why there is no demotion
 * counterpart: a verified identity document is a fact about a past moment and does not become
 * false. Revoking would also mean exercising a right un-verifies you, which is the same
 * detriment problem that decided the grant question. Do not add a demotion here.
 */
export async function redactIdentityForUser(prisma: PrismaClient, userId: string): Promise<void> {
  const row = await prisma.identityVerification.findUnique({
    where: { userId },
    // `selfieFraudSignalAt` is selected because the stamp below reads it - see the long note at
    // that stamp for why this function has to write a column it otherwise has no business in.
    select: {
      id: true,
      stripeSessionId: true,
      status: true,
      erasureRequestedAt: true,
      selfieFraudSignalAt: true,
    },
  });

  // Nothing to erase. The app still shows the « contact Stripe » half, because that half is true
  // regardless of whether we hold a session.
  if (!row) return;

  // Idempotent, for the reason `deleteAccount` is: a second request is a retry, not an error, and
  // answering 409 to it would make a dropped response look like a failure the user must act on.
  if (row.erasureRequestedAt) return;

  /**
   * 🛑 STRIPE FORBIDS REDACTING A SESSION MID-CHECK. Read from the SDK's own doc comment: a
   * session can be redacted only from `requires_input` or `verified`. This is a real refusal and
   * the user is told to come back - silently skipping it would leave the request unhonoured with
   * nothing recording that.
   */
  if (row.status === 'PROCESSING') {
    throw new AppException(
      'UNPROCESSABLE_ENTITY',
      'Votre vérification est en cours de traitement. Réessayez la suppression dans quelques minutes.',
    );
  }

  const now = new Date();

  /**
   * 🛑 A CANCELED SESSION CANNOT BE REDACTED AT ALL - it is outside the allowed set above, and
   * Stripe's prose documentation does not say so; only the SDK comment does.
   *
   * So we record that the user asked and stop. `redactionStatus` stays NULL, which is the honest
   * representation: we did not redact anything. For this user the « contact Stripe support » half
   * carries the entire duty, which is why that copy is unconditional in the app rather than shown
   * only on success.
   */
  if (row.status === 'CANCELED') {
    await prisma.identityVerification.update({
      where: { id: row.id },
      data: { erasureRequestedAt: now },
    });
    return;
  }

  // REQUIRES_INPUT or VERIFIED - the two Stripe allows.
  //
  // Note that redacting a REQUIRES_INPUT session CANCELS it, so a réparateur who erases an
  // unfinished verification and then decides to verify after all pays for a new session. That is
  // accepted: the alternative is refusing to erase data he asked us to erase.
  /**
   * 🛑 CAPTURE THE FRAUD EVIDENCE IMMEDIATELY BEFORE DESTROYING IT, and this closes the HALF of the
   * spec's §6.1 that §6.1 does not close. Added 2026-09-02.
   *
   * §6.1 closes the case where the REFUSAL reads `lastErrorCode`, by making it read
   * `selfieFraudSignalAt` instead. It does NOT close the case where the STAMP NEVER FIRES.
   * `syncSession` stamps `selfieFraudSignalAt` from a `lastErrorCode` it reads AFTER THE FACT, so:
   * fail with `selfie_face_mismatch` → request erasure before our `requires_input` webhook has been
   * processed → the redaction lands first → and since §6.1 itself admits it is UNVERIFIED whether
   * redaction preserves `last_error.code`, the stamp may never fire at all. `documentOnlyAvailable`
   * then stays true permanently and the user is routed around the control that caught him - §6.1's
   * laundering hole by a third door. **Stripe retries deliveries for up to three days, so the
   * window is days wide rather than milliseconds.**
   *
   * Reading it here makes the defence INDEPENDENT OF WEBHOOK TIMING, which is what §6.1 says it
   * wants: « Being independent of an unverified vendor behaviour is worth more than being right
   * about it. »
   *
   * `.catch(() => null)` for the same reason the rest of this path is best-effort about Stripe:
   * a retrieve failure must not refuse a user his own Article 17 request. It degrades to the
   * pre-existing behaviour - the webhook stamps if it can - rather than to a refusal.
   */
  const live = await identityGateway()
    .retrieveSession(row.stripeSessionId)
    .catch(() => null);
  const stampFraudSignal =
    live?.lastErrorCode != null &&
    SELFIE_FRAUD_CODES.has(live.lastErrorCode) &&
    row.selfieFraudSignalAt === null;

  const summary = await identityGateway().redactSession(row.stripeSessionId);

  await prisma.identityVerification.update({
    where: { id: row.id },
    data: {
      erasureRequestedAt: now,
      redactionStatus: summary.redactionStatus,
      status: summary.status,
      // 🛑 STAMPED ONCE AND NEVER CLEARED, exactly as `syncSession` does it and for the identical
      // reason. Conditioned on `row.selfieFraudSignalAt === null` so a second erasure cannot move
      // an existing stamp's date - the field is evidence that something happened, not a current
      // status.
      ...(stampFraudSignal ? { selfieFraudSignalAt: now } : {}),
      lastSyncedAt: now,
    },
  });
}
