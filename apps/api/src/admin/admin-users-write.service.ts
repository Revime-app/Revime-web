import { Injectable } from '@nestjs/common';
import type {
  AdminDeleteUserInput,
  AdminModerateUserInput,
  AdminSuspendUserInput,
} from '@revime/shared';
import { isStaffRole } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { isUniqueViolation } from '../common/prisma-errors.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UsersService } from '../users/users.service.js';
import { throttleKey } from '../auth/throttle/auth-throttle.js';

const NOT_FOUND = 'Utilisateur introuvable.';
const SELF = 'Vous ne pouvez pas appliquer cette action à votre propre compte.';
const IS_ADMIN = "Ce compte est un compte administrateur. L'action est refusée.";
const ONLY_SUPER_ADMIN_DELETE_STAFF = 'Seul un Super Admin peut supprimer un compte administrateur.';
const IS_DELETED = 'Ce compte est supprimé. Aucune modification n\'est possible.';

const NOT_LOCKED = 'Aucun blocage de connexion en cours sur ce compte.';
const ONLY_SUPER_ADMIN_UNLOCK_STAFF = 'Seul un Super Admin peut débloquer un compte de l’équipe.';
/** V7 U2: the two counters a person can be locked on. The IP counter belongs to no account. */
const ACCOUNT_LOCK_SCOPES = ['LOGIN_ACCOUNT', 'CODE_ACCOUNT'] as const;

type Target = { id: string; role: string | null; profile: { deletedAt: Date | null } | null };

@Injectable()
export class AdminUsersWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
  ) {}

  private async load(targetId: string): Promise<Target> {
    const row = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, profile: { select: { deletedAt: true } } },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    return row;
  }

  /**
   * 🛑 GUARD 1.
   * Self-suspension is refused. Staff accounts cannot be suspended directly.
   */
  private assertActionable(actorUserId: string, target: Target): void {
    if (target.id === actorUserId) throw new AppException('UNPROCESSABLE_ENTITY', SELF);
    if (isStaffRole(target.role)) throw new AppException('UNPROCESSABLE_ENTITY', IS_ADMIN);
  }

  /** 🛑 GUARD 4. A tombstone's username follows the `deleted_<id>` format and its ban is
   *  load-bearing, so rewriting either is meaningless at best. */
  private assertNotDeleted(target: Target): void {
    if (target.profile?.deletedAt) throw new AppException('UNPROCESSABLE_ENTITY', IS_DELETED);
  }

  async suspend(actorUserId: string, targetId: string, input: AdminSuspendUserInput): Promise<void> {
    const target = await this.load(targetId);
    this.assertNotDeleted(target);
    this.assertActionable(actorUserId, target);

    // The reason can never be `account_deleted`: adminSuspendUserSchema refuses it, so
    // §8.1's KPI #4 cannot be silently emptied by an operator's free text.
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: targetId },
        data: {
          banned: true,
          banReason: input.reason,
          banExpires: input.until ? new Date(input.until) : null,
        },
      }),
      /**
       * 🛑 GUARD 3. Better Auth enforces the ban in databaseHooks.session.create.before,
       * so it blocks a NEW sign-in and leaves live sessions alone. deleteAccount already
       * does this, with the comment « the ban blocks a NEW sign-in; this ends the ones
       * already open ». Without it a suspended user stays signed in.
       */
      this.prisma.session.deleteMany({ where: { userId: targetId } }),
    ]);
  }

  async reactivate(actorUserId: string, targetId: string): Promise<void> {
    const target = await this.load(targetId);
    this.assertNotDeleted(target);
    // Deliberately NOT assertActionable: clearing a ban is not punitive and an admin
    // account CAN be reactivated. Applying Guard 1 here would mean a suspended admin
    // could never be un-suspended through this dashboard, which is the exact incident
    // Guard 1 exists to prevent.

    // All three together. Leaving banReason set would keep §8.1's KPI #4 counting it.
    await this.prisma.user.update({
      where: { id: targetId },
      data: { banned: false, banReason: null, banExpires: null },
    });
  }

  /**
   * V7 A11 (U2, Q6). Lifts the login and code locks and their ladders, and closes the open history
   * rows with the operator's id; the @Audit interceptor writes the audit row. Not punitive, so like
   * `reactivate` it applies to staff accounts too, but only from a super admin: a staff account's
   * lock is the D3 protection on this dashboard.
   */
  async unlockLogin(actorUserId: string, targetId: string): Promise<void> {
    const target = await this.prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, email: true, role: true, profile: { select: { deletedAt: true } } },
    });
    if (!target) throw new AppException('NOT_FOUND', NOT_FOUND);
    this.assertNotDeleted(target);
    if (isStaffRole(target.role)) {
      const actor = await this.prisma.user.findUnique({ where: { id: actorUserId }, select: { role: true } });
      if (actor?.role !== 'super_admin') throw new AppException('FORBIDDEN', ONLY_SUPER_ADMIN_UNLOCK_STAFF);
    }

    const now = new Date();
    const key = throttleKey(target.email);
    const locked = await this.prisma.authThrottle.count({
      where: { scope: { in: [...ACCOUNT_LOCK_SCOPES] }, key, lockedUntil: { gt: now } },
    });
    if (locked === 0) throw new AppException('UNPROCESSABLE_ENTITY', NOT_LOCKED);

    await this.prisma.$transaction([
      this.prisma.authThrottle.deleteMany({ where: { scope: { in: [...ACCOUNT_LOCK_SCOPES] }, key } }),
      this.prisma.authLockEvent.updateMany({
        where: { userId: targetId, unlockedAt: null, lockedUntil: { gt: now } },
        data: { unlockedAt: now, unlockedByUserId: actorUserId, unlockReason: 'ADMIN' },
      }),
    ]);
  }

  async moderate(
    actorUserId: string,
    targetId: string,
    input: AdminModerateUserInput,
  ): Promise<void> {
    const target = await this.load(targetId);
    this.assertNotDeleted(target);
    // Deliberately NOT assertActionable: renaming a public handle is auditable,
    // reversible, and carries no self-lockout risk.

    // Only the public-facing fields, per the owner's decision: contact and legal-identity
    // fields stay read-only because editing them breaks a verified claim or sign-in.
    const data: { username?: string; name?: string } = {};
    if (input.username !== undefined) data.username = input.username;
    if (input.name !== undefined) data.name = input.name;

    const writes = [];
    if (Object.keys(data).length > 0) {
      // usernameSchema already lowercased it, which is what makes the plain @unique on
      // that column sufficient. A collision is caught and returned as a French 409.
      writes.push(this.prisma.user.update({ where: { id: targetId }, data }));
    }

    if (input.removeAvatar === true) {
      if (!target.profile) {
        throw new AppException('UNPROCESSABLE_ENTITY', 'Aucun profil à modifier.');
      }
      writes.push(this.prisma.profile.update({ where: { userId: targetId }, data: { avatarPath: null } }));
    }

    if (writes.length > 0) {
      try {
        await this.prisma.$transaction(writes);
      } catch (e) {
        // A P2002 on the username column. The user.update shape only writes username
        // and name, so a uniqueness violation can only be on username.
        if (isUniqueViolation(e)) {
          throw new AppException('CONFLICT', "Ce nom d'utilisateur est déjà pris.");
        }
        throw e;
      }
    }
  }

  /**
   * §8.2's « Supprimer un compte », delegating to CF-47's soft delete.
   *
   * NOT a hard delete, on the owner's decision and on the roadmap's standing
   * anonymise-in-place constraint: 27 of 28 User foreign keys cascade, so a row delete
   * is a cascade through the money trail rather than a privacy operation.
   *
   * `reason` is deliberately not written here: the @Audit interceptor copies it into the
   * audit row's `detail` via `detailFields: ['reason']`, and that row is the ONLY
   * surviving record of the deletion once the scrub has run. The parameter stays so all
   * four write methods have the same shape and so the route's schema requirement is
   * visible at the service boundary.
   */
  async remove(actorUserId: string, targetId: string, _input: AdminDeleteUserInput): Promise<void> {
    const target = await this.load(targetId);
    if (target.id === actorUserId) throw new AppException('UNPROCESSABLE_ENTITY', SELF);

    /**
     * CF5-08: The owner (Super Admin) must be able to delete staff accounts.
     * Non-super-admins cannot delete staff members.
     * UsersService.deleteAccount enforces the >= 2 active Super Admin threshold and clears roles.
     */
    if (isStaffRole(target.role)) {
      const actor = await this.load(actorUserId);
      if (actor.role !== 'super_admin') {
        throw new AppException('UNPROCESSABLE_ENTITY', ONLY_SUPER_ADMIN_DELETE_STAFF);
      }
    }

    // Deliberately NOT assertNotDeleted: deleteAccount is idempotent on an already
    // deleted account (`if (!profile || profile.deletedAt) return`), and refusing here
    // would make a retry look like a failure.
    // V9 U3 (`DEC9-10` (2)): no one signs in with Apple / Google here, so only a still valid token is
    // revoked, and an unrevoked one is logged, never alerted.
    await this.users.deleteAccount(targetId, { revoke: { source: 'ADMIN', confirmation: null } });
  }
}
