import { Injectable } from '@nestjs/common';
import crypto from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import {
  deriveUsername,
  isStaffRole,
  ADMIN_ROLES,
  type AdminRole,
  type InviteStaffInput,
  type AcceptStaffInvitationInput,
  type StaffInvitationItem,
  type StaffInvitationsListResponse,
  type StaffInvitationStatus,
  type StaffMemberItem,
  type VerifyStaffInvitationResponse,
  type AdminStaffListQuery,
  type AdminStaffListResponse,
} from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { mailSender } from '../mail/mail.service.js';
import { renderStaffInvitationEmail } from '../mail/staff-invitation-email.template.js';
import { ensureProfileForUser } from '../auth/ensure-profile.js';
import { adminLinkOrigin } from '../auth/admin-origins.js';

type Tx = Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

@Injectable()
export class AdminStaffInvitationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Invites a new staff member. Generates a secure random 32-byte token,
   * stores its SHA-256 hash in PostgreSQL with a 7-day validity window,
   * and sends an invitation email.
   */
  async createInvitation(actorId: string, input: InviteStaffInput): Promise<{ ok: true; id: string }> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { role: true },
    });
    if (existingUser && isStaffRole(existingUser.role)) {
      throw new AppException('CONFLICT', "Cet utilisateur fait déjà partie de l'équipe.");
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const invitation = await this.prisma.$transaction(async (tx: Tx) => {
      await tx.staffInvitation.updateMany({
        where: {
          email: input.email,
          acceptedAt: null,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });

      return tx.staffInvitation.create({
        data: {
          email: input.email,
          role: input.role,
          firstName: input.firstName?.trim() || null,
          lastName: input.lastName?.trim() || null,
          tokenHash,
          invitedById: actorId,
          expiresAt,
        },
      });
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, firstName: true, email: true },
    });
    const inviterName = actor?.firstName || actor?.name || actor?.email || null;
    const origin = adminLinkOrigin();
    const url = `${origin}/invitation?token=${rawToken}`;
    const { subject, html, text } = renderStaffInvitationEmail({
      url,
      role: input.role,
      firstName: input.firstName?.trim() || null,
      inviterName,
    });

    await mailSender().send({
      to: input.email,
      subject,
      html,
      text,
    });

    return { ok: true, id: invitation.id };
  }

  /**
   * Lists all staff invitations, computing dynamic statuses (ACCEPTED, REVOKED, EXPIRED, PENDING).
   */
  async listInvitations(): Promise<StaffInvitationsListResponse> {
    const invitations = await this.prisma.staffInvitation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        invitedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    const now = new Date();
    const items: StaffInvitationItem[] = invitations.map((inv) => {
      let status: StaffInvitationStatus;
      if (inv.acceptedAt !== null) {
        status = 'ACCEPTED';
      } else if (inv.revokedAt !== null) {
        status = 'REVOKED';
      } else if (inv.expiresAt < now) {
        status = 'EXPIRED';
      } else {
        status = 'PENDING';
      }

      return {
        id: inv.id,
        email: inv.email,
        role: inv.role as AdminRole,
        firstName: inv.firstName,
        lastName: inv.lastName,
        invitedBy: {
          id: inv.invitedBy.id,
          name: inv.invitedBy.name,
          email: inv.invitedBy.email,
        },
        expiresAt: inv.expiresAt.toISOString(),
        acceptedAt: inv.acceptedAt ? inv.acceptedAt.toISOString() : null,
        revokedAt: inv.revokedAt ? inv.revokedAt.toISOString() : null,
        status,
        createdAt: inv.createdAt.toISOString(),
      };
    });

    return { items, total: items.length };
  }

  /**
   * Lists active staff members (excluding soft-deleted accounts) with search, pagination, and latest login date.
   */
  async listMembers(query?: AdminStaffListQuery): Promise<AdminStaffListResponse> {
    const page = Math.max(1, query?.page ?? 1);
    const pageSize = Math.max(1, Math.min(100, query?.pageSize ?? 20));
    const q = query?.q?.trim();

    const where: Prisma.UserWhereInput = {
      role: { in: [...ADMIN_ROLES] },
      profile: { deletedAt: null },
    };

    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [total, users] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          name: true,
          firstName: true,
          lastName: true,
          role: true,
          twoFactorEnabled: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const staff = users.filter((u): u is typeof u & { role: AdminRole } => isStaffRole(u.role));
    const userIds = staff.map((u) => u.id);
    const latestSessions =
      userIds.length > 0
        ? await this.prisma.session.groupBy({
            by: ['userId'],
            where: { userId: { in: userIds } },
            _max: { createdAt: true },
          })
        : [];

    const lastLoginMap = new Map<string, string>();
    for (const s of latestSessions) {
      if (s._max?.createdAt) {
        lastLoginMap.set(s.userId, s._max.createdAt.toISOString());
      }
    }

    const items: StaffMemberItem[] = staff.map((u) => ({
      id: u.id,
      email: u.email,
      name: u.name,
      firstName: u.firstName,
      lastName: u.lastName,
      role: u.role,
      twoFactorEnabled: Boolean(u.twoFactorEnabled),
      createdAt: u.createdAt.toISOString(),
      lastLoginAt: lastLoginMap.get(u.id) ?? null,
    }));

    return {
      items,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Removes a member from the staff team, revoking their staff role (role: 'user') and deleting their sessions.
   * Prohibits self-removal and protects the minimum 2 active Super Admins guarantee.
   */
  async removeMember(actorId: string, targetId: string): Promise<{ ok: true }> {
    if (actorId === targetId) {
      throw new AppException('UNPROCESSABLE_ENTITY', "Vous ne pouvez pas vous retirer vous-même de l'équipe.");
    }

    try {
      await this.prisma.$transaction(
        async (tx: Tx) => {
          const target = await tx.user.findUnique({
            where: { id: targetId },
            select: { id: true, role: true, profile: { select: { deletedAt: true } } },
          });

          if (!target) {
            throw new AppException('NOT_FOUND', 'Utilisateur introuvable.');
          }
          if (target.profile?.deletedAt) {
            throw new AppException('UNPROCESSABLE_ENTITY', "Ce compte est supprimé. Aucune modification n'est possible.");
          }
          if (!isStaffRole(target.role)) {
            throw new AppException('UNPROCESSABLE_ENTITY', "Ce compte ne fait pas partie de l'équipe.");
          }

          if (target.role === 'super_admin') {
            const remaining = await tx.user.count({
              where: {
                role: 'super_admin',
                profile: { deletedAt: null },
              },
            });
            if (remaining <= 2) {
              throw new AppException('CONFLICT', 'La plateforme doit conserver au moins 2 Super Admins actifs en permanence.');
            }
          }

          await tx.user.update({
            where: { id: targetId },
            data: { role: 'user' },
          });

          await tx.session.deleteMany({
            where: { userId: targetId },
          });

          // He is no longer staff: what was assigned to him would stay assigned to a plain user
          // (the same release as deleting an account, B16).
          await tx.dispute.updateMany({
            where: { assignedToUserId: targetId },
            data: { assignedToUserId: null, assignedAt: null },
          });
          await tx.conversationReport.updateMany({
            where: { assignedToUserId: targetId },
            data: { assignedToUserId: null, assignedAt: null },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (err) {
      if ((err as { code?: string } | null)?.code === 'P2034') {
        throw new AppException('CONFLICT', 'Une autre modification de rôle est en cours. Réessayez.');
      }
      throw err;
    }

    return { ok: true };
  }

  /**
   * Revokes an existing invitation.
   */
  async revokeInvitation(_actorId: string, invitationId: string): Promise<{ ok: true }> {
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      throw new AppException('NOT_FOUND', 'Invitation introuvable.');
    }
    if (invitation.acceptedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette invitation a déjà été acceptée.');
    }
    if (invitation.revokedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette invitation a déjà été révoquée.');
    }

    await this.prisma.staffInvitation.update({
      where: { id: invitationId },
      data: { revokedAt: new Date() },
    });

    return { ok: true };
  }

  /**
   * Revokes an existing invitation and issues a fresh one with a new token and 7-day expiration.
   */
  async resendInvitation(actorId: string, invitationId: string): Promise<{ ok: true }> {
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { id: invitationId },
    });
    if (!invitation) {
      throw new AppException('NOT_FOUND', 'Invitation introuvable.');
    }
    if (invitation.acceptedAt !== null) {
      throw new AppException('UNPROCESSABLE_ENTITY', 'Cette invitation a déjà été acceptée.');
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction(async (tx: Tx) => {
      await tx.staffInvitation.update({
        where: { id: invitationId },
        data: { revokedAt: new Date() },
      });

      await tx.staffInvitation.create({
        data: {
          email: invitation.email,
          role: invitation.role,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          tokenHash,
          invitedById: actorId,
          expiresAt,
        },
      });
    });

    const actor = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true, firstName: true, email: true },
    });
    const inviterName = actor?.firstName || actor?.name || actor?.email || null;
    const origin = adminLinkOrigin();
    const url = `${origin}/invitation?token=${rawToken}`;
    const { subject, html, text } = renderStaffInvitationEmail({
      url,
      role: invitation.role as AdminRole,
      firstName: invitation.firstName,
      inviterName,
    });

    await mailSender().send({
      to: invitation.email,
      subject,
      html,
      text,
    });

    return { ok: true };
  }

  /**
   * Verifies an invitation token hash, returning invitation details and whether an existing user matches.
   */
  async verifyToken(token: string): Promise<VerifyStaffInvitationResponse> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invitation = await this.prisma.staffInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invitation || invitation.revokedAt !== null) {
      throw new AppException('NOT_FOUND', 'Invitation introuvable ou révoquée.');
    }
    if (invitation.acceptedAt !== null) {
      throw new AppException('GONE', 'Cette invitation a déjà été utilisée.');
    }
    if (invitation.expiresAt < new Date()) {
      throw new AppException('GONE', 'Cette invitation a expiré.');
    }

    const user = await this.prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });

    return {
      valid: true,
      email: invitation.email,
      role: invitation.role as AdminRole,
      firstName: invitation.firstName,
      lastName: invitation.lastName,
      isExistingUser: Boolean(user),
    };
  }

  /**
   * Accepts an invitation, setting the user password and assigning the staff role.
   * Runs in a Serializable transaction for strict replay protection.
   */
  async acceptInvitation(
    input: AcceptStaffInvitationInput,
  ): Promise<{ ok: true; email: string; role: AdminRole }> {
    const tokenHash = crypto.createHash('sha256').update(input.token).digest('hex');
    const hashedPassword = await hashPassword(input.password);

    let acceptedRole: AdminRole;
    let acceptedEmail: string;

    await this.prisma.$transaction(
      async (tx: Tx) => {
        const invitation = await tx.staffInvitation.findUnique({
          where: { tokenHash },
        });

        if (!invitation || invitation.revokedAt !== null) {
          throw new AppException('NOT_FOUND', 'Invitation introuvable ou révoquée.');
        }
        if (invitation.acceptedAt !== null) {
          throw new AppException('GONE', 'Cette invitation a déjà été utilisée.');
        }
        if (invitation.expiresAt < new Date()) {
          throw new AppException('GONE', 'Cette invitation a expiré.');
        }

        acceptedRole = invitation.role as AdminRole;
        acceptedEmail = invitation.email;

        const user = await tx.user.findUnique({
          where: { email: invitation.email },
        });

        const firstName = input.firstName?.trim() || invitation.firstName || null;
        const lastName = input.lastName?.trim() || invitation.lastName || null;
        const fullName =
          [firstName, lastName].filter(Boolean).join(' ') ||
          invitation.email.split('@')[0] ||
          'Collaborateur';

        if (user) {
          await tx.user.update({
            where: { id: user.id },
            data: {
              role: invitation.role,
              ...(firstName ? { firstName } : {}),
              ...(lastName ? { lastName } : {}),
              ...(fullName ? { name: fullName } : {}),
            },
          });

          const existingAccount = await tx.account.findFirst({
            where: { userId: user.id, providerId: 'credential' },
          });

          if (existingAccount) {
            await tx.account.update({
              where: { id: existingAccount.id },
              data: { password: hashedPassword },
            });
          } else {
            await tx.account.create({
              data: {
                id: crypto.randomUUID(),
                accountId: user.id,
                providerId: 'credential',
                userId: user.id,
                password: hashedPassword,
              },
            });
          }

          await tx.session.deleteMany({
            where: { userId: user.id },
          });
        } else {
          const userId = crypto.randomUUID();
          let username = deriveUsername(invitation.email, () => false);
          const clash = await tx.user.findFirst({ where: { username }, select: { id: true } });
          if (clash) {
            const tried = new Set<string>([username]);
            for (let attempt = 0; attempt < 50; attempt++) {
              const candidate = deriveUsername(invitation.email, (c) => tried.has(c));
              tried.add(candidate);
              const candidateClash = await tx.user.findFirst({
                where: { username: candidate },
                select: { id: true },
              });
              if (!candidateClash) {
                username = candidate;
                break;
              }
            }
          }

          await tx.user.create({
            data: {
              id: userId,
              email: invitation.email,
              name: fullName,
              firstName,
              lastName,
              username,
              role: invitation.role,
              emailVerified: true,
            },
          });

          await tx.account.create({
            data: {
              id: crypto.randomUUID(),
              accountId: userId,
              providerId: 'credential',
              userId: userId,
              password: hashedPassword,
            },
          });

          await ensureProfileForUser(tx as any, { id: userId });
        }

        await tx.staffInvitation.update({
          where: { id: invitation.id },
          data: { acceptedAt: new Date() },
        });
      },
      { isolationLevel: 'Serializable' },
    );

    return {
      ok: true,
      email: acceptedEmail!,
      role: acceptedRole!,
    };
  }
}
