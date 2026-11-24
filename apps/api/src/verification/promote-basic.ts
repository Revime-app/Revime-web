import type { PrismaClient } from '../generated/prisma/client.js';
import { mailSender } from '../mail/mail.service.js';
import { renderAccountConfirmedEmail } from '../mail/confirmation-email.template.js';

/**
 * ONE OF THE WRITERS OF Profile.verificationLevel. They are LISTED rather than counted,
 * because this sentence has already been corrected twice for carrying a number that went
 * stale - and it was wrong again before Stage 6 piece B2, since demoteBasicOnContactChange
 * lives in this file and writes the column too, so "exactly three" counted grant paths
 * while claiming to count writers.
 *
 * The complete list, as of 2026-09-03:
 *   - promoteToBasicIfEligible        (here)              NONE     -> BASIC
 *   - demoteBasicOnContactChange      (here)              BASIC    -> NONE
 *   - promoteFromIdentityIfEligible   (promote-identity)  BASIC    -> IDENTITY
 *   - promoteToBusinessIfEligible     (promote-business)  IDENTITY -> BUSINESS
 *   - revokeVerification              (revoke.ts)         one rung down, + a marker
 *
 * Nothing else in the application may write it. Add to the list above when that changes.
 *
 * Takes its Prisma client as a parameter rather than being a Nest provider,
 * because it has two callers holding two different clients: VerificationService
 * via PrismaService, and Better Auth's afterEmailVerification hook, which uses
 * the separate PrismaClient constructed in auth.ts. Same shape as
 * ensure-profile.ts and normalise-phone.ts, which take the client the same way
 * for the same reason. PrismaService extends PrismaClient, so it satisfies this.
 *
 * 🛑 promoteToBasicIfEligible IS DELIBERATELY NOT GUARDED ON verificationRevokedAt, unlike
 * its two promoting siblings. BASIC gates publishing, editing and offering through gate.ts's
 * assertBasicVerified, so barring a revoked account from BASIC would stop him publishing a
 * demande AS A CLIENT the day VERIFICATION_GATE_ENABLED is switched on. B2's spec §4.1
 * records why B1's « all three promoters » was not followed;
 * promoter-revocation-guards.spec.ts pins the absence. (This notice used to sit above both
 * exported functions; it is about the promoter alone, and demoteBasicOnContactChange has no
 * marker to consult in the first place.)
 */

type Contact = 'email' | 'phone';
type ContactState = { emailVerified: boolean; phoneVerifiedAt: Date | null };

/**
 * The ONE place the two contact columns are read as "verified or not". `emailVerified` is
 * Better Auth's boolean; `phoneVerifiedAt` is piece 4's timestamp, non-null once a Verify
 * code was approved for the number the row holds.
 */
function isVerified(state: ContactState, contact: Contact): boolean {
  return contact === 'email' ? state.emailVerified : state.phoneVerifiedAt !== null;
}

/**
 * BASIC is the client's level 1.
 * As of V2 Client Feedback (CF2-03), BOTH email and phone verifications are strictly mandatory.
 * An account must have both verified before receiving BASIC verification level.
 */
export async function promoteToBasicIfEligible(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, emailVerified: true, phoneVerifiedAt: true },
  });
  if (!user) return;
  // Both must be verified:
  if (!isVerified(user, 'email') || !isVerified(user, 'phone')) return;

  const res = await prisma.profile.updateMany({
    where: { userId, verificationLevel: 'NONE' },
    data: { verificationLevel: 'BASIC', verifiedAt: new Date() },
  });

  if (res.count > 0 && user.email) {
    try {
      const { html, text } = renderAccountConfirmedEmail({ name: user.name });
      await mailSender().send({
        to: user.email,
        subject: 'Compte confirmé avec succès - Bienvenue sur REVIME',
        text,
        html,
      });
    } catch (err) {
      console.error(`[verification] Failed to send welcome confirmation email to ${user.email}:`, err);
    }
  }
}

/**
 * Called when a verified contact detail changes, so the level stops asserting
 * something nobody verified.
 *
 * Under the mandatory BOTH rule, if either contact detail changes, the account
 * no longer satisfies both conditions and drops from BASIC to NONE.
 */
export async function demoteBasicOnContactChange(
  prisma: PrismaClient,
  userId: string,
  changed: Contact,
): Promise<void> {
  await prisma.profile.updateMany({
    where: { userId, verificationLevel: 'BASIC' },
    data: { verificationLevel: 'NONE', verifiedAt: null },
  });
}
