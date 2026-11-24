import type { Prisma, PrismaClient } from '../generated/prisma/client.js';

/**
 * ONE OF THE WRITERS OF Profile.verificationLevel. The complete list is kept in ONE place,
 * promote-basic.ts's header, rather than restated here.
 *
 * 🛑 CORRECTED 2026-09-03 by Stage 6 piece B2: this said « The THIRD and last writer », which
 * revoke.ts falsified - and "last" was the kind of claim that invites nobody to re-check it.
 *
 * Takes its Prisma client as a parameter rather than being a Nest provider, for the
 * same reason its two siblings do. PrismaService extends PrismaClient, so it
 * satisfies this.
 */

/**
 * Grants level 3 from a verified company-registry check.
 *
 * 🛑 CF5-07 (2026-10-03): this function is called from the admin approval path
 * when an operator approves the business verification.
 *
 * The `verificationLevel: 'IDENTITY'` filter is the client's own rule made
 * structural - « toutes les informations du niveau 2 », 2026-08-13. It is a WHERE
 * clause rather than an `if`, so it is idempotent, cannot be raced into skipping a
 * rung, and cannot be forgotten by a caller. Identical device to
 * promote-identity.ts's 'BASIC' filter one rung down.
 *
 * It also closes a hole rather than merely following an instruction: gate.ts lets
 * BUSINESS satisfy an IDENTITY gate, and SIREN/SIRET are public data, so granting
 * this from BASIC would let a réparateur skip the document-and-selfie check by
 * typing a number anyone can look up.
 *
 * There is deliberately no demotion counterpart and no re-check. A company can close
 * after this runs, and V1 does nothing about it: the design's §3.3 records that
 * decision, and `verifiedAt` plus the stored snapshot are what a later job would
 * need.
 */
export async function promoteToBusinessIfEligible(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const business = await prisma.businessVerification.findUnique({
    where: { userId },
    select: { status: true, verifiedAt: true },
  });
  if (!business || business.status !== 'APPROVED' || !business.verifiedAt) return;

  const promoted = await prisma.profile.updateMany({
    // 🛑 `verificationRevokedAt: null` added by Stage 6 piece B2. See promote-identity.ts.
    where: { userId, verificationLevel: 'IDENTITY', verificationRevokedAt: null },
    data: { verificationLevel: 'BUSINESS', verifiedAt: new Date() },
  });

  // V7 D4: an approved business IS a professional. `kind` is self-declared at signup, and this used
  // to leave it alone, so an approved individual read « Niveau : Professionnel » beside « Type :
  // Particulier », kept the private-individual counter and missed the fiscal stamp below. Keyed on
  // the profile ENDING at BUSINESS rather than on `promoted.count`, so a re-approval of an account
  // already at BUSINESS (production's `@nes`) is corrected too, while a revoked account is not.
  // Before the stamp, so the PRO filter there sees the new kind.
  await prisma.repairerProfile.updateMany({
    where: { userId, kind: 'INDIVIDUAL', user: { profile: { verificationLevel: 'BUSINESS' } } },
    data: { kind: 'PRO' },
  });

  // CMP-D3: an approved business verification satisfies the fiscal step for a PRO, so the profile
  // reads « complétées » everywhere `fiscalCompletedAt` is read. Only when THIS call promoted him: a
  // revoked account (filtered out above) or one already promoted must not be stamped, and only a PRO,
  // because an individual's step is the declaration form, not a company check. Payout eligibility
  // does not depend on this stamp: `isFiscalComplete` (fiscal-gate.ts) reads the verification itself.
  if (promoted.count > 0) {
    await prisma.repairerProfile.updateMany({
      where: { userId, kind: 'PRO', fiscalCompletedAt: null },
      data: { fiscalCompletedAt: new Date() },
    });
  }
}
