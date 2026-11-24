import type { PrismaClient } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';

/**
 * ONE OF THE WRITERS OF Profile.verificationLevel. The complete list is kept in ONE place,
 * promote-basic.ts's header, and is a LIST rather than a count for the reason recorded there.
 *
 * 🛑 NOT « the only writer that lowers the level », which is what this header said when the
 * file was created. demoteBasicOnContactChange lowers BASIC to NONE and its own doc calls the
 * asymmetry deliberate. What is actually distinctive here is narrower: this is the only writer
 * an OPERATOR drives, and the only one that leaves a durable marker behind.
 *
 * Takes its Prisma client as a parameter rather than being a Nest provider, matching its three
 * sibling files. PrismaService extends PrismaClient, so it satisfies this.
 */

type Level = 'NONE' | 'BASIC' | 'IDENTITY' | 'BUSINESS';

/**
 * Exactly one rung down, and never to NONE.
 *
 * BASIC is a verified email or phone: evidence gathered by a different mechanism, still
 * intact, and carrying no public badge. Dropping to NONE would discard a sound claim in
 * order to withdraw an unsound one.
 */
const ONE_RUNG_DOWN: Partial<Record<Level, Level>> = {
  IDENTITY: 'BASIC',
  BUSINESS: 'IDENTITY',
};

export const REVOKE_NOT_APPLICABLE =
  "Ce compte ne porte aucune vérification d'identité ou d'entreprise à retirer.";
export const RESTORE_NOT_APPLICABLE = "Ce compte ne porte aucune révocation à annuler.";
/**
 * The raced-revocation message. Exported because the route and its test both need it, and
 * because a 409 an operator can act on is worth asserting on rather than matching by regex.
 */
export const REVOKE_RACED =
  'Le niveau de vérification de ce compte a changé pendant votre action. Rechargez la fiche puis réessayez.';
const NO_PROFILE = 'Utilisateur introuvable.';

/**
 * 🛑 B2 GUARD 1. Only IDENTITY and BUSINESS are revocable. verifiedBadgeFor
 * (offer.schemas.ts:245-246) returns null for NONE and BASIC, so neither renders a public
 * claim there is anything to withdraw - and BASIC already has a withdrawal path in
 * demoteBasicOnContactChange.
 *
 * 🛑 ONE STATEMENT, AND THE ONE STATEMENT *IS* THE ATOMICITY GUARANTEE. The level and the
 * marker must land together: identity.service.ts:435 calls promoteFromIdentityIfEligible
 * after every webhook sync, so a marker written separately from the level lets a webhook
 * land in between and re-promote the account just revoked. A single `updateMany` is already
 * atomic, so there is deliberately NO `$transaction` wrapper here - it would add ceremony
 * without adding a guarantee.
 *
 * The corollary binds anyone extending this function: the moment a SECOND write belongs in
 * this operation - an audit row, a notification, a réparateur-suspension marker - the two
 * must be wrapped in `prisma.$transaction`, because from that point on atomicity stops being
 * free. Adding a write here without the wrapper re-opens the exact hole this closes.
 *
 * The WHERE pins the level that was OBSERVED, so a concurrent promotion cannot make this
 * write land on a rung the target was not computed from: a raced revocation matches no row and
 * writes nothing.
 *
 * 🛑 AND THE NO-OP IS REPORTED, not swallowed. `count === 0` throws CONFLICT. Returning
 * `{ from, to }` after writing nothing would make the route answer success and let Task 3's
 * `@Audit('repairer.verification_revoke')` record a revocation THAT NEVER HAPPENED - a false
 * row in the one artefact whose entire value is that it is true. Silence about the row is not
 * the same as silence to the caller.
 *
 * This is not the expected-level parameter spec §6 rejected. That was a value supplied BY the
 * caller, which this function would then have to trust; this is a no-op the function detected
 * itself, from state it read itself.
 */
export async function revokeVerification(
  prisma: PrismaClient,
  args: { userId: string; reason: string },
): Promise<{ from: Level; to: Level }> {
  const profile = await prisma.profile.findUnique({
    where: { userId: args.userId },
    // 🛑 `verificationLevel` ONLY. `verificationRevokedAt` was selected here and read by
    // nothing, which reads as a guard against revoking an already-revoked account. There is no
    // such guard: nothing below tests the marker, so a BUSINESS account already revoked once
    // can be revoked again down to BASIC. A selected column nobody reads is a claim about
    // behaviour that the code does not make, so it is removed rather than explained.
    select: { verificationLevel: true },
  });
  if (!profile) throw new AppException('NOT_FOUND', NO_PROFILE);

  const from = profile.verificationLevel as Level;
  const to = ONE_RUNG_DOWN[from];
  if (!to) throw new AppException('UNPROCESSABLE_ENTITY', REVOKE_NOT_APPLICABLE);

  const { count } = await prisma.profile.updateMany({
    where: { userId: args.userId, verificationLevel: from },
    data: {
      verificationLevel: to,
      verificationRevokedAt: new Date(),
      verificationRevokedReason: args.reason,
    },
  });
  if (count === 0) throw new AppException('CONFLICT', REVOKE_RACED);

  return { from, to };
}

/**
 * Clearing the marker REMOVES THE BLOCK and GRANTS NOTHING - it writes no verificationLevel at
 * all (spec §4.1, from B1 §11.1 item 2). A mistaken revocation is therefore correctable without
 * ever fabricating a verified claim, which is what the owner's revoke-only decision requires.
 *
 * 🛑 « REMOVES THE BLOCK », NOT « re-opens the automatic path », which is what this said first
 * and overstated for IDENTITY. promoteFromIdentityIfEligible has exactly ONE caller -
 * identity.service.ts:435, inside the webhook sync - so after a clear the IDENTITY level comes
 * back only if Stripe sends another event for that session, which for an already-verified
 * session it will not. Regaining IDENTITY therefore needs a FRESH verification. BUSINESS is
 * genuinely different: business.service.ts:123 is a user-driven, re-runnable registry check, so
 * for that rung the automatic path really is re-opened.
 *
 * `verifiedAt` is deliberately untouched by both functions. It records when a level was
 * granted; the revocation columns record that it was withdrawn. Rewriting the grant date
 * would destroy the only remaining evidence of the original check.
 */
export async function clearVerificationRevocation(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const profile = await prisma.profile.findUnique({
    where: { userId },
    select: { verificationRevokedAt: true },
  });
  if (!profile) throw new AppException('NOT_FOUND', NO_PROFILE);
  if (profile.verificationRevokedAt === null) {
    throw new AppException('UNPROCESSABLE_ENTITY', RESTORE_NOT_APPLICABLE);
  }

  await prisma.profile.updateMany({
    where: { userId },
    data: { verificationRevokedAt: null, verificationRevokedReason: null },
  });
}
