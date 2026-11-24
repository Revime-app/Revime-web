import { Injectable } from '@nestjs/common';
import { isStaffRole, type AdminRoleChangeInput } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
// Value import: Nest reads design:paramtypes to inject it.
import { PrismaService } from '../prisma/prisma.service.js';

const NOT_FOUND = 'Utilisateur introuvable.';
const IS_DELETED = "Ce compte est supprimé. Aucune modification n'est possible.";
const OWN_ROLE = 'Vous ne pouvez pas modifier votre propre rôle.';
const OWN_2FA = 'Vous ne pouvez pas réinitialiser votre propre double authentification.';
// CF5-01: client requirement - at least 2 active Super Admins at all times
const LAST_SUPER_ADMIN = 'La plateforme doit conserver au moins 2 Super Admins actifs en permanence.';
const NOT_STAFF = "Ce compte ne fait pas partie de l'équipe.";
const CONCURRENT = 'Une autre modification de rôle est en cours. Réessayez.';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * CF4-40 / CF4-41 (sub-project N), spec §4.3 - §4.4. Only reachable through
 * `admin.manage` (Super Admin), audited by the controller's @Audit.
 *
 * 🛑 Both writes delete the target's sessions IN THE SAME TRANSACTION. Sessions are read from
 * the database on every request (no cookieCache), so a demoted or reset operator's next request
 * is a 401 rather than one more request under the old role (Review Focus 5).
 */
@Injectable()
export class AdminStaffService {
  constructor(private readonly prisma: PrismaService) {}

  async changeRole(actorId: string, targetId: string, input: AdminRoleChangeInput): Promise<{ ok: true }> {
    if (actorId === targetId) throw new AppException('UNPROCESSABLE_ENTITY', OWN_ROLE);
    try {
      await this.prisma.$transaction(
        async (tx: Tx) => {
          const target = await this.loadIn(tx, targetId);
          if (target.profile?.deletedAt) throw new AppException('UNPROCESSABLE_ENTITY', IS_DELETED);
          /**
           * 🛑 Count and write in ONE Serializable transaction (Review Focus 3). Under READ
           * COMMITTED, two Super Admins demoting each other at once would each read a count of
           * two and both succeed, leaving none. Serializable makes one of them fail with P2034.
           *
           * CF5-01: client requirement - at least 2 active Super Admins at all times,
           * and tombstones (deletedAt != null) must be excluded from the count.
           */
          if (target.role === 'super_admin' && input.role !== 'super_admin') {
            const remaining = await tx.user.count({
              where: {
                role: 'super_admin',
                profile: { deletedAt: null },
              },
            });
            if (remaining <= 2) throw new AppException('CONFLICT', LAST_SUPER_ADMIN);
          }
          await tx.user.update({ where: { id: targetId }, data: { role: input.role } });
          await tx.session.deleteMany({ where: { userId: targetId } });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'P2034') throw new AppException('CONFLICT', CONCURRENT);
      throw err;
    }
    return { ok: true };
  }

  async resetTwoFactor(actorId: string, targetId: string): Promise<{ ok: true }> {
    if (actorId === targetId) throw new AppException('UNPROCESSABLE_ENTITY', OWN_2FA);
    await this.prisma.$transaction(async (tx: Tx) => {
      const target = await this.loadIn(tx, targetId);
      if (!isStaffRole(target.role)) throw new AppException('UNPROCESSABLE_ENTITY', NOT_STAFF);
      await clearTwoFactor(tx, targetId);
    });
    return { ok: true };
  }

  private async loadIn(tx: Tx, targetId: string) {
    const row = await tx.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true, profile: { select: { deletedAt: true } } },
    });
    if (!row) throw new AppException('NOT_FOUND', NOT_FOUND);
    return row;
  }
}

type TwoFactorClearable = {
  twoFactor: { deleteMany(args: { where: { userId: string } }): Promise<unknown> };
  user: { update(args: { where: { id: string }; data: { twoFactorEnabled: boolean } }): Promise<unknown> };
  session: { deleteMany(args: { where: { userId: string } }): Promise<unknown> };
};

/**
 * The three writes of a 2FA reset. Shared with scripts/reset-admin-2fa.ts so the recovery path
 * cannot drift from the dashboard one. The next sign-in lands the operator on /securite.
 */
export async function clearTwoFactor(tx: TwoFactorClearable, userId: string): Promise<void> {
  await tx.twoFactor.deleteMany({ where: { userId } });
  await tx.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } });
  await tx.session.deleteMany({ where: { userId } });
}
