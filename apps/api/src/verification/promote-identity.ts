import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/**
 * ONE OF THE WRITERS OF Profile.verificationLevel. The complete list is kept in ONE place,
 * promote-basic.ts's header, rather than restated here.
 *
 * 🛑 CORRECTED 2026-09-03 by Stage 6 piece B2: this said « The SECOND of exactly three
 * writers … beside promote-basic.ts and promote-business.ts », and revoke.ts made both the
 * ordinal and the count false. It had already been corrected once, from "the second and last"
 * on 2026-08-19. A number in three files is three things to update; a pointer is one.
 *
 * Takes its Prisma client as a parameter rather than being a Nest provider, for the
 * same reason promote-basic.ts does: its callers hold different clients.
 * PrismaService extends PrismaClient, so it satisfies this.
 */

/**
 * Grants level 2 from a verified Stripe Identity session.
 *
 * The `verificationLevel: 'BASIC'` filter on the write is what makes this both
 * idempotent AND structurally incapable of skipping a rung or demoting anyone. It
 * is a WHERE clause rather than an `if`, so a concurrent promotion cannot race it -
 * the same device promote-basic.ts uses, for the same reason. From BASIC only:
 * level 2 is defined as being above level 1, so a level reachable out of order is
 * not a level, and the clause enforces that rather than a precondition anyone can
 * forget to call.
 *
 * It reads `verifiedAt`, `status` and `decision` (CF4-39, spec §4.2) and grants when:
 * - an operator ACCEPTED the current session (`decision === 'ACCEPTED'`), or
 * - there is no decision AND the CURRENT session is verified (`status === 'VERIFIED'` and
 *   `verifiedAt` set).
 * Never while `decision` is REFUSED or DOCUMENTS_REQUESTED.
 *
 * 🛑 THE `status === 'VERIFIED'` TERM IS REQUIRED, NOT STYLISTIC. `verifiedAt` is a person fact
 * never cleared, so after a refusal and a new (not yet verified) session it is still set, and
 * every webhook on that new session would otherwise re-grant IDENTITY before Stripe verified
 * anything. A verified Stripe session's status is terminal, and this only ever acts on BASIC
 * accounts (no demotion), so accounts already at IDENTITY are unaffected. Not the Connect
 * account, which after Task 1's probe is known to say nothing about who the réparateur is.
 * `BUSINESS` is not granted here at all - Stripe Identity does not check company registries,
 * so SIREN/SIRET has no source in this piece and level 3 belongs to Stage 3b piece 5.
 *
 * There is deliberately no demotion counterpart. A verified identity document is a
 * fact about a past moment and does not become false; an operator's refusal withdraws the level
 * through `AdminIdentityDecisionsService`, not here.
 */
export async function promoteFromIdentityIfEligible(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const identity = await prisma.identityVerification.findUnique({
    where: { userId },
    select: { verifiedAt: true, status: true, decision: true },
  });
  if (!identity) return;
  const eligible =
    identity.decision === 'ACCEPTED' ||
    (identity.decision === null && identity.status === 'VERIFIED' && identity.verifiedAt !== null);
  if (!eligible) return;

  await prisma.profile.updateMany({
    // 🛑 `verificationRevokedAt: null` added by Stage 6 piece B2. Without it, this call -
    // which identity.service.ts:435 makes after EVERY webhook sync - silently re-grants the
    // level an operator revoked, because the guard below only pins the current rung.
    where: { userId, verificationLevel: 'BASIC', verificationRevokedAt: null },
    data: { verificationLevel: 'IDENTITY', verifiedAt: new Date() },
  });
}
