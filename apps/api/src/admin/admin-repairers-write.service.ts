import { Injectable } from '@nestjs/common';
import type { AdminRevokeVerificationInput, AdminSuspendRepairerInput } from '@revime/shared';
import { isStaffRole } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
// 🛑 ALIASED. This service has a method called `revokeVerification` too, and inside that
// method an unqualified `revokeVerification(...)` would resolve to the IMPORT rather than to
// `this.` - which happens to be what we want, and is exactly the kind of thing that reads as
// a bug and gets "fixed" into infinite recursion. The alias removes the ambiguity.
import {
  revokeVerification as writeRevocation,
  clearVerificationRevocation as clearRevocation,
} from '../verification/revoke.js';

const NOT_FOUND = 'Utilisateur introuvable.';
const SELF = 'Vous ne pouvez pas appliquer cette action à votre propre compte.';
const IS_ADMIN = "Ce compte est un compte administrateur. L'action est refusée.";
const IS_DELETED = "Ce compte est supprimé. Aucune modification n'est possible.";
const NOT_A_REPAIRER = "Ce compte n'a pas le mode réparateur activé.";
const ALREADY_SUSPENDED = 'Le mode réparateur de ce compte est déjà suspendu.';
const NOT_SUSPENDED = "Le mode réparateur de ce compte n'est pas suspendu.";

type Target = {
  id: string;
  role: string | null;
  profile: {
    deletedAt: Date | null;
    repairerEnabled: boolean;
    repairerSuspendedAt: Date | null;
  } | null;
};

/**
 * §8.3's four writes. A sibling of AdminUsersWriteService rather than an extension of it,
 * and the split is the boundary the owner's decision 3 draws: that service writes Better
 * Auth's ACCOUNT ban columns, this one writes Profile's RÉPARATEUR mode state. Merging them
 * would put « stop him working » and « lock him out » behind one door.
 *
 * B2's guard numbers below refer to the design spec §4.2. They do NOT line up with
 * AdminUsersWriteService's own guard numbers, which are B1's; both sets are load-bearing in
 * their own file and neither is renumbered.
 */
@Injectable()
export class AdminRepairersWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  private async load(targetId: string): Promise<Target> {
    const row = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        role: true,
        profile: {
          select: { deletedAt: true, repairerEnabled: true, repairerSuspendedAt: true },
        },
      },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    return row;
  }

  /** 🛑 B2 GUARD 3. Same reasoning as B1's guard 1: one admin account, and no unban route. */
  private assertActionable(actorUserId: string, target: Target): void {
    if (target.id === actorUserId) throw new AppException('UNPROCESSABLE_ENTITY', SELF);
    if (isStaffRole(target.role)) throw new AppException('UNPROCESSABLE_ENTITY', IS_ADMIN);
  }

  private assertNotDeleted(target: Target): void {
    if (target.profile?.deletedAt) throw new AppException('UNPROCESSABLE_ENTITY', IS_DELETED);
  }

  /**
   * 🛑 B2 GUARD 5 lives in what these two methods do NOT write. Revocation touches only the
   * verification columns; suspension touches only the suspension columns. Neither implies
   * the other, so a verified réparateur can be stopped for conduct without withdrawing a
   * claim he earned, and a withdrawn claim does not stop him trading.
   */
  async revokeVerification(
    actorUserId: string,
    targetId: string,
    input: AdminRevokeVerificationInput,
  ): Promise<void> {
    const target = await this.load(targetId);
    this.assertNotDeleted(target);
    this.assertActionable(actorUserId, target);
    // B2 GUARD 1 lives in revokeVerification itself, which owns the rung maths and refuses
    // NONE and BASIC. Duplicating it here would be a second copy of a rule.
    await writeRevocation(this.prisma, { userId: targetId, reason: input.reason });
    // CF4-E §3. AFTER writeRevocation resolves, deliberately: it THROWS on refusal or a race
    // (a raced revocation matches no row), so a throw here means nothing was written and there
    // is nothing to notify about - the notification must not fire ahead of a write that may
    // never happen.
    await this.notifications.emit({
      userId: targetId,
      mode: 'REPAIRER',
      type: 'VERIFICATION_REVOKED',
    });
  }

  /**
   * Deliberately NOT assertActionable: clearing a revocation grants nothing and is the
   * recovery path, so blocking it on an admin account would make a mistaken revocation
   * permanent - the exact shape of B1's reactivate exemption.
   */
  async restoreVerification(actorUserId: string, targetId: string): Promise<void> {
    const target = await this.load(targetId);
    this.assertNotDeleted(target);
    await clearRevocation(this.prisma, targetId);
  }

  async suspend(
    actorUserId: string,
    targetId: string,
    input: AdminSuspendRepairerInput,
  ): Promise<void> {
    const target = await this.load(targetId);
    this.assertNotDeleted(target);
    this.assertActionable(actorUserId, target);

    /** 🛑 B2 GUARD 2. Suspending a mode nobody has enabled writes state no read can act on. */
    if (!target.profile?.repairerEnabled) {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_A_REPAIRER);
    }
    // Refused rather than re-stamped: re-stamping would silently replace the operator's
    // original reason and reset the clock, which reads in the audit log as a fresh decision.
    if (target.profile.repairerSuspendedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_SUSPENDED);
    }

    /**
     * No session deletion, unlike B1's account suspend. That one had to end live sessions
     * because Better Auth enforces a ban only at sign-in. Here the enforcement IS in the read
     * predicates and the two user-side guards, which every request re-evaluates - so signing him
     * out would log out his client side, which decision 3 protects.
     *
     * 🛑 NAMED BY FILE, NOT BY SDD TASK NUMBER. This said the enforcement *« will be »* in
     * « Tasks 5, 6, 9 » and « Task 4 »; all four landed, so the tense was wrong in the direction
     * that reads as an unfinished feature - and it cited a workspace that gets deleted, leaving a
     * shipped comment pointing at nothing. The four places are:
     *
     * - `repairers.service.ts` - `listableRepairerWhere`, which the directory and the public
     *   fiche both compose, so a suspended réparateur is unreachable both ways.
     * - `offers/offer-predicates.ts` - `UNSUSPENDED_REPAIRER_WHERE` and `ACCEPTABLE_OFFER_WHERE`,
     *   spread by the filtered offer reads that module's own header enumerates.
     * - `offers.service.ts` - the suspension test at the end of `assertRepairerEnabled`
     *   (guard 6), which is a SECOND check rather than a stricter one, because suspension
     *   deliberately does not touch `repairerEnabled`.
     * - `users.service.ts` - `updateModes` refusing `repairerEnabled: false → true` (guard 7),
     *   without which the target undoes his own suspension.
     */
    await this.prisma.profile.update({
      where: { userId: targetId },
      data: {
        repairerSuspendedAt: new Date(),
        repairerSuspendedUntil: input.until ? new Date(input.until) : null,
        repairerSuspendedReason: input.reason,
      },
    });
  }

  /** The recovery path, so no assertActionable - see restoreVerification. */
  async reactivate(actorUserId: string, targetId: string): Promise<void> {
    const target = await this.load(targetId);
    this.assertNotDeleted(target);
    if (!target.profile?.repairerSuspendedAt) {
      throw new AppException('UNPROCESSABLE_ENTITY', NOT_SUSPENDED);
    }

    // All three together. Leaving `reason` set would make the fiche keep rendering a motive
    // for a suspension that is over - the same reasoning as B1's reactivate clearing
    // banReason so §8.1's KPI #4 stops counting it.
    await this.prisma.profile.update({
      where: { userId: targetId },
      data: {
        repairerSuspendedAt: null,
        repairerSuspendedUntil: null,
        repairerSuspendedReason: null,
      },
    });
  }
}
