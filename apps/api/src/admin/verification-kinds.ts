import type { AdminVerificationQueueKind } from '@revime/shared';

/**
 * Extracted verbatim from `AdminRepairersService.verificationQueue()` (Task 5, spec §5).
 * Pure: no I/O. The four rules, their exact detail sentences and their comments moved
 * unchanged - only the surrounding join/precedence/row-shaping logic (now the caller's,
 * `AdminVerificationsService.list()`) was rewritten.
 *
 * §8.3's « file d'attente », reshaped. There is no pending-approval state anywhere in the
 * schema - identity is decided by a Stripe webhook and the registry synchronously - so this
 * queue is driven by evidence that already exists. Four row kinds, one precedence rule.
 *
 * Returns EVERY hit for the profile (not just the highest-precedence one): the old queue
 * picked one row per account, but the new list (spec §5) needs every kind that applies, so
 * each can be placed on its own row (IDENTITY or BUSINESS) rather than collapsed to one.
 */
export function verificationKinds(
  input: {
    profile: {
      userId: string;
      verificationLevel: string | null;
      verifiedAt: Date | null;
      updatedAt: Date;
    };
    identity: {
      status: string;
      verifiedAt: Date | null;
      selfieFraudSignalAt: Date | null;
      updatedAt: Date;
    } | null;
    business: { verifiedAt: Date } | null;
    registryRefused: { target: string; at: Date; outcome: 'REJECTED' | 'FAILED' } | null;
  },
  _now: Date,
): { kind: AdminVerificationQueueKind; detail: string; at: Date }[] {
  const { profile, identity, business, registryRefused } = input;
  const candidates: { kind: AdminVerificationQueueKind; detail: string; at: Date }[] = [];

  // 1. fraud_signal: IdentityVerification has selfieFraudSignalAt
  if (identity?.selfieFraudSignalAt) {
    candidates.push({
      kind: 'fraud_signal',
      detail: `Signal de fraude détecté lors de la vérification d'identité (selfie).`,
      at: identity.selfieFraudSignalAt,
    });
  }

  // 2. level_unbacked: Level without proper backing
  if (profile.verificationLevel === 'IDENTITY') {
    if (!identity || !identity.verifiedAt) {
      // IDENTITY level but no stamped identity verification. The timestamp is the
      // evidence's own, not the profile's: identity.updatedAt (most recent session
      // activity) or profile.updatedAt (last change to the row) as fallback. Never
      // profile.verifiedAt, which can be null for precisely the anomalous rows this
      // queue exists to surface.
      const sessionStatus = identity?.status || 'absente';
      candidates.push({
        kind: 'level_unbacked',
        detail: `Niveau IDENTITY sans vérification Stripe aboutie (session ${sessionStatus}).`,
        at: identity?.updatedAt || profile.updatedAt,
      });
    }
  } else if (profile.verificationLevel === 'BUSINESS') {
    if (!business) {
      // BUSINESS level but no BusinessVerification row. Timestamp: when they completed
      // identity verification (which precedes BUSINESS), or the profile's last update.
      candidates.push({
        kind: 'level_unbacked',
        detail: `Niveau BUSINESS sans vérification de registre aboutie.`,
        at: identity?.verifiedAt || profile.updatedAt,
      });
    }
  }

  // 3. registry_refused: latest REJECTED or FAILED registry attempt with no
  // BusinessVerification since.
  if (registryRefused) {
    candidates.push({
      kind: 'registry_refused',
      // 🛑 TWO SENTENCES, because « refusé » is a FALSE statement about a FAILED attempt:
      // the registry did not refuse the company, the call never reached a verdict. The row
      // KIND is shared (spec §3.2 lists both members under it) and the remedy is the same
      // lookup, but an operator who reads « refusé » for a transport error concludes the
      // company was rejected, which is a different and unestablished claim. It is the same
      // distinction `BusinessService.verify` already draws by answering 503 « réessayez » on
      // a lookup that threw and 422 on a registry that genuinely said no.
      detail:
        registryRefused.outcome === 'FAILED'
          ? `Contrôle registre non abouti (erreur du fournisseur ou du transport) pour le SIREN ${registryRefused.target}.`
          : `Contrôle registre refusé pour le SIREN ${registryRefused.target}.`,
      at: registryRefused.at,
    });
  }

  // 4. identity_stuck: IdentityVerification not VERIFIED and not stamped
  if (identity && identity.status !== 'VERIFIED' && !identity.verifiedAt) {
    candidates.push({
      kind: 'identity_stuck',
      detail: `Vérification d'identité bloquée (${identity.status}).`,
      at: identity.updatedAt,
    });
  }

  return candidates;
}
