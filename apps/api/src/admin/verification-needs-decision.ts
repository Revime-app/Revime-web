import { identityRowStatus } from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { LIVE } from './admin-constants.js';

/**
 * B6: the ONE rule for « an operator can decide on this verification », read by the Vérifications list
 * (in memory, row by row), the dashboard tile and the sidebar badge (as Prisma filters). They used to
 * keep a rule each, so the list said 22, its « Décider » answered « Aucune vérification d'identité à
 * décider », and the tile said 2. Change a rule HERE, in both of its forms below, or not at all.
 */

type IdentityFacts = Parameters<typeof identityRowStatus>[0] & { selfieFraudSignalAt: Date | null };

/** Not yet decided, and either documents waiting on an operator or a selfie fraud signal. */
export function identityNeedsDecision(facts: IdentityFacts): boolean {
  if (facts.decision != null) return false;
  if (facts.selfieFraudSignalAt !== null) return true;
  const status = identityRowStatus(facts);
  return status === 'DOCUMENTS_REQUIRED' || status === 'PROCESSING';
}

/** The accounts the list shows: a live réparateur profile. */
const LISTED_REPAIRER = { repairerEnabled: true, ...LIVE } as const;

/** `identityNeedsDecision` as a filter. `verifiedAt: null` is `identityRowStatus`'s « verified wins » shortcut. */
export const IDENTITY_NEEDS_DECISION_WHERE = {
  decision: null,
  user: { profile: { is: LISTED_REPAIRER } },
  OR: [
    { selfieFraudSignalAt: { not: null } },
    { verifiedAt: null, status: 'PROCESSING' },
    { verifiedAt: null, status: 'REQUIRES_INPUT', lastErrorCode: { not: null } },
  ],
} satisfies Prisma.IdentityVerificationWhereInput;

/**
 * A business dossier submitted and awaiting its decision. The list also lets an anomalous registry hit
 * raise a row (`verification-kinds.ts`), which has no stored column to filter on: those rows alone are
 * listed without being counted.
 */
export const BUSINESS_NEEDS_DECISION_WHERE = {
  status: 'PENDING',
  user: {
    profile: { is: LISTED_REPAIRER },
    // The list's population: IDENTITY or BUSINESS level, or any account that has an identity session.
    OR: [
      { profile: { is: { verificationLevel: { in: ['IDENTITY', 'BUSINESS'] } } } },
      { identityVerification: { isNot: null } },
    ],
  },
} satisfies Prisma.BusinessVerificationWhereInput;
