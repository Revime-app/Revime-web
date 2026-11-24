import { Injectable } from '@nestjs/common';
import type { IdentityAcceptInput, IdentityDecision, IdentityRefuseInput } from '@revime/shared';
import { isStaffRole } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
// 🛑 VALUE import, not `import type`: Nest resolves constructor parameters from
// `design:paramtypes`, and a type-only import is erased. `admin-module-di.spec.ts` gates it.
import { NotificationsService } from '../notifications/notifications.service.js';
import { promoteFromIdentityIfEligible } from '../verification/promote-identity.js';

// B2's guard messages, COPIED rather than imported from admin-repairers-write.service.ts (plan
// Task 4): that file keeps them private, and a shared import would couple two write services'
// wording to one refactor.
const NOT_FOUND = 'Utilisateur introuvable.';
const SELF = 'Vous ne pouvez pas appliquer cette action à votre propre compte.';
const IS_ADMIN = "Ce compte est un compte administrateur. L'action est refusée.";
const IS_DELETED = "Ce compte est supprimé. Aucune modification n'est possible.";

const NO_IDENTITY = "Aucune vérification d'identité à décider pour ce compte.";
const ALREADY_REFUSED = 'Cette vérification est déjà refusée.';
const ALREADY_REQUESTED = 'De nouveaux documents ont déjà été demandés.';
const ALREADY_ACCEPTED = 'Cette vérification est déjà acceptée.';
const STRIPE_VERIFIED = 'Stripe a déjà vérifié cette identité.';
const STALE = "Cette vérification vient d'être modifiée. Rechargez la page.";

type Target = {
  id: string;
  role: string | null;
  profile: { deletedAt: Date | null } | null;
  identityVerification: { status: string; decision: IdentityDecision | null } | null;
};

/**
 * CF4-39 (sub-project M, spec §4.4). An operator's accept / refuse / request-documents on a
 * réparateur's CURRENT identity session.
 *
 * Stripe stays the gate (M1): these override it on the current session only, and `start()`
 * clears them when a new session begins (M3). Refuse and request-documents have the same effect
 * (M4): validation withdrawn, the level drops to BASIC, restart allowed.
 *
 * 🛑 EVERY ROW WRITE IS CONDITIONAL ON THE `decision` READ (L's pattern). A double-click or a
 * second operator matches no row, gets CONFLICT, and overwrites nothing - not the motif, not the
 * author, not the date. Review Focus 4.
 *
 * 🛑 THE NOTIFICATION FIRES AFTER THE TRANSACTION COMMITS, never before: a refused or raced
 * write throws out of `$transaction`, so there is nothing to tell anyone about (same reasoning
 * as B2's revoke).
 */
@Injectable()
export class AdminIdentityDecisionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async load(actorUserId: string, targetId: string) {
    const target: Target | null = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        role: true,
        profile: { select: { deletedAt: true } },
        identityVerification: { select: { status: true, decision: true } },
      },
    });
    if (!target) throw new AppException('NOT_FOUND', NOT_FOUND);
    if (target.profile?.deletedAt) throw new AppException('UNPROCESSABLE_ENTITY', IS_DELETED);
    if (target.id === actorUserId) throw new AppException('UNPROCESSABLE_ENTITY', SELF);
    if (isStaffRole(target.role)) throw new AppException('UNPROCESSABLE_ENTITY', IS_ADMIN);
    if (!target.identityVerification) throw new AppException('UNPROCESSABLE_ENTITY', NO_IDENTITY);
    return target.identityVerification;
  }

  async refuse(actorUserId: string, targetId: string, input: IdentityRefuseInput): Promise<{ ok: true }> {
    return this.withdraw(actorUserId, targetId, input, 'REFUSED', ALREADY_REFUSED);
  }

  async requestDocuments(
    actorUserId: string,
    targetId: string,
    input: IdentityRefuseInput,
  ): Promise<{ ok: true }> {
    return this.withdraw(actorUserId, targetId, input, 'DOCUMENTS_REQUESTED', ALREADY_REQUESTED);
  }

  /**
   * Accepts an identity Stripe did not verify (M5; the operator checked the documents in Stripe's
   * dashboard - REVIME stores none), or reverses a mistaken refusal. The promoter runs in the same
   * transaction and keeps its own guards: a revoked account stays revoked (the decision is still
   * recorded).
   */
  async accept(actorUserId: string, targetId: string, input: IdentityAcceptInput): Promise<{ ok: true }> {
    const identity = await this.load(actorUserId, targetId);
    const observed = identity.decision;
    if (observed === 'ACCEPTED') throw new AppException('CONFLICT', ALREADY_ACCEPTED);
    if (observed === null && identity.status === 'VERIFIED') {
      throw new AppException('UNPROCESSABLE_ENTITY', STRIPE_VERIFIED);
    }

    await this.prisma.$transaction(async (tx) => {
      const written = await tx.identityVerification.updateMany({
        where: { userId: targetId, decision: observed },
        data: {
          decision: 'ACCEPTED',
          decisionMotif: null,
          decisionNote: input.note ?? null,
          decidedAt: new Date(),
          decidedByUserId: actorUserId,
        },
      });
      if (written.count === 0) throw new AppException('CONFLICT', STALE);
      await promoteFromIdentityIfEligible(tx, targetId);
    });

    await this.notifications.emit({ userId: targetId, mode: 'REPAIRER', type: 'IDENTITY_VERIFIED' });
    return { ok: true };
  }

  private async withdraw(
    actorUserId: string,
    targetId: string,
    input: IdentityRefuseInput,
    decision: 'REFUSED' | 'DOCUMENTS_REQUESTED',
    alreadyMessage: string,
  ): Promise<{ ok: true }> {
    const identity = await this.load(actorUserId, targetId);
    const observed = identity.decision;
    if (observed === decision) throw new AppException('CONFLICT', alreadyMessage);

    await this.prisma.$transaction(async (tx) => {
      const written = await tx.identityVerification.updateMany({
        where: { userId: targetId, decision: observed },
        data: {
          decision,
          decisionMotif: input.motif,
          decisionNote: input.note ?? null,
          decidedAt: new Date(),
          decidedByUserId: actorUserId,
        },
      });
      if (written.count === 0) throw new AppException('CONFLICT', STALE);
      // A PRO at BUSINESS drops to BASIC too: BUSINESS is promoted only from IDENTITY, and he
      // re-runs the SIREN check from the app once a new session is verified (spec §4.4).
      await tx.profile.updateMany({
        where: { userId: targetId, verificationLevel: { in: ['IDENTITY', 'BUSINESS'] } },
        data: { verificationLevel: 'BASIC' },
      });
    });

    await this.notifications.emit({
      userId: targetId,
      mode: 'REPAIRER',
      type: 'IDENTITY_DOCUMENTS_REQUIRED',
    });
    return { ok: true };
  }
}
