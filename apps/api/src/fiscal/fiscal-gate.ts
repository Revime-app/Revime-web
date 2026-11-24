import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type {
  BusinessVerificationStatus,
  RepairerKind,
  VerificationLevel,
} from '../generated/prisma/enums.js';

/**
 * CMP-D3, the golden rule: « aucun versement à un réparateur tant que ses informations fiscales ne
 * sont pas complètes ». THIS is the one definition of « complete », and every code path that can
 * move money to a réparateur asks it: the client's release, the held-payout sweep, the admin retry,
 * the admin dispute release, the réparateur's share of a refund and the admin's pay-share.
 *
 * The first three each carried their own copy of this expression until the RU-27 review, and the
 * last three carried none. Add a seventh transfer site and it must call this, not re-derive it.
 *
 * A particulier is complete once `RepairerFiscalDeclaration` was submitted (`fiscalCompletedAt`).
 * A professional is complete when the business verification was approved: the SIRET check is what
 * collects their legal identity and registered address, and the brief allows the fields to live in
 * « Informations professionnelles » as long as step 3 reads « Terminé » once filled.
 */
export type FiscalGateFacts = {
  kind: RepairerKind | null | undefined;
  fiscalCompletedAt: Date | null | undefined;
  verificationLevel: VerificationLevel | null | undefined;
  businessStatus: BusinessVerificationStatus | null | undefined;
};

export function isFiscalComplete(facts: FiscalGateFacts): boolean {
  if (facts.fiscalCompletedAt) return true;
  return (
    facts.kind === 'PRO' &&
    (facts.verificationLevel === 'BUSINESS' || facts.businessStatus === 'APPROVED')
  );
}

const FISCAL_GATE_SELECT = {
  kind: true,
  fiscalCompletedAt: true,
  user: {
    select: {
      profile: { select: { verificationLevel: true } },
      businessVerification: { select: { status: true } },
    },
  },
} satisfies Prisma.RepairerProfileSelect;

/** Reads the facts for one réparateur and applies {@link isFiscalComplete}. No profile means no. */
export async function repairerFiscalComplete(
  prisma: PrismaClient | Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const row = await prisma.repairerProfile.findUnique({
    where: { userId },
    select: FISCAL_GATE_SELECT,
  });
  if (!row) return false;
  return isFiscalComplete({
    kind: row.kind,
    fiscalCompletedAt: row.fiscalCompletedAt,
    verificationLevel: row.user.profile?.verificationLevel,
    businessStatus: row.user.businessVerification?.status,
  });
}

/** What an operator reads when a transfer is refused for this reason. One wording, every site. */
export const FISCAL_INCOMPLETE_MESSAGE =
  "Le versement est bloqué : les informations fiscales du réparateur ne sont pas complétées (DAC7).";
