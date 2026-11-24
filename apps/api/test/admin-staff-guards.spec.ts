import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PATH_METADATA } from '@nestjs/common/constants.js';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AdminController } from '../src/admin/admin.controller.js';
import { AdminStaffPublicController } from '../src/admin/admin-staff-public.controller.js';
import { AdminRoleGuard } from '../src/admin/admin-role.guard.js';
import { PERMISSION_KEY } from '../src/admin/require-permission.decorator.js';
import { AUDIT_KEY, type AuditMeta } from '../src/admin/admin-audit.decorator.js';
import type { InviteStaffInput, AcceptStaffInvitationInput } from '@revime/shared';

type SessionShape = { user?: { id?: string; role?: string | null }; session?: { twoFactorVerifiedAt?: Date | null } } | undefined;

const ctxFor = (handlerName: keyof AdminController, session: SessionShape) =>
  ({
    getHandler: () => AdminController.prototype[handlerName],
    getClass: () => AdminController,
    switchToHttp: () => ({
      getRequest: () => ({ session }),
    }),
  }) as unknown as ExecutionContext;

const guard = new AdminRoleGuard(new Reflector());
const verified = (role: string | null, id = 'actor-1') => ({
  user: { id, role },
  session: { twoFactorVerifiedAt: new Date() },
});
const unverified = (role: string | null, id = 'actor-1') => ({
  user: { id, role },
  session: { twoFactorVerifiedAt: null },
});

const refusal = (handler: keyof AdminController, session: SessionShape): string | null => {
  try {
    guard.canActivate(ctxFor(handler, session));
    return null;
  } catch (e) {
    const err = e as { getStatus?: () => number; message: string };
    expect(err.getStatus?.()).toBe(403);
    return err.message;
  }
};

const NOT_STAFF = "Accès réservé à l'équipe Revime.";
const NO_2FA = 'Double authentification requise.';
const NOT_ALLOWED = 'Action non autorisée pour votre rôle.';

const STAFF_ADMIN_HANDLERS: (keyof AdminController)[] = [
  'inviteStaff',
  'listStaffInvitations',
  'listStaffMembers',
  'revokeStaffInvitation',
  'resendStaffInvitation',
];

describe('AdminStaff Guards & Access Control (CF5-09)', () => {
  describe('AdminRoleGuard on AdminController staff management routes', () => {
    it.each(STAFF_ADMIN_HANDLERS)('refuses non-staff sessions for %s', (handler) => {
      expect(refusal(handler, undefined)).toBe(NOT_STAFF);
      expect(refusal(handler, { user: {} })).toBe(NOT_STAFF);
      expect(refusal(handler, verified(null))).toBe(NOT_STAFF);
      expect(refusal(handler, verified('user'))).toBe(NOT_STAFF);
      expect(refusal(handler, verified('client'))).toBe(NOT_STAFF);
    });

    it.each(STAFF_ADMIN_HANDLERS)('refuses staff sessions without 2FA for %s', (handler) => {
      expect(refusal(handler, unverified('super_admin'))).toBe(NO_2FA);
      expect(refusal(handler, unverified('admin'))).toBe(NO_2FA);
      expect(refusal(handler, unverified('moderation'))).toBe(NO_2FA);
      expect(refusal(handler, unverified('support'))).toBe(NO_2FA);
      expect(refusal(handler, unverified('finance'))).toBe(NO_2FA);
      expect(refusal(handler, unverified('read_only'))).toBe(NO_2FA);
    });

    it.each(STAFF_ADMIN_HANDLERS)(
      'refuses non-super-admin staff roles (admin, moderation, support, finance, read_only) for %s',
      (handler) => {
        const nonSuperAdminRoles = ['admin', 'moderation', 'support', 'finance', 'read_only'];
        for (const role of nonSuperAdminRoles) {
          expect(refusal(handler, verified(role))).toBe(NOT_ALLOWED);
        }
      },
    );

    it.each(STAFF_ADMIN_HANDLERS)('allows Super Admin with 2FA to access %s', (handler) => {
      expect(refusal(handler, verified('super_admin'))).toBeNull();
    });
  });

  describe('Route Metadata & Decorator assertions', () => {
    it.each(STAFF_ADMIN_HANDLERS)('requires permission admin.manage on %s', (handler) => {
      const fn = AdminController.prototype[handler] as unknown as (...args: unknown[]) => unknown;
      const permission = Reflect.getMetadata(PERMISSION_KEY, fn);
      expect(permission).toBe('admin.manage');
    });

    it('has audit metadata configured on write endpoints', () => {
      const metaOf = (name: keyof AdminController) =>
        Reflect.getMetadata(AUDIT_KEY, AdminController.prototype[name] as unknown as (...args: unknown[]) => unknown) as AuditMeta;

      expect(metaOf('inviteStaff')).toEqual({
        action: 'admin.staff_invite',
        targetType: 'StaffInvitation',
        detailFields: ['email', 'role'],
      });

      expect(metaOf('revokeStaffInvitation')).toEqual({
        action: 'admin.staff_invite_revoke',
        targetType: 'StaffInvitation',
        targetParam: 'id',
      });

      expect(metaOf('resendStaffInvitation')).toEqual({
        action: 'admin.staff_invite_resend',
        targetType: 'StaffInvitation',
        targetParam: 'id',
      });
    });
  });

  describe('AdminController delegation to AdminStaffInvitationsService', () => {
    const mockStaffInvitations = {
      createInvitation: vi.fn().mockResolvedValue({ ok: true, id: 'inv-123' }),
      listInvitations: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      listMembers: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      removeMember: vi.fn().mockResolvedValue({ ok: true }),
      revokeInvitation: vi.fn().mockResolvedValue({ ok: true }),
      resendInvitation: vi.fn().mockResolvedValue({ ok: true }),
    };

    const controller = new AdminController(
      {} as never, // prisma
      {} as never, // refunds
      {} as never, // cron
      {} as never, // catalog
      {} as never, // moderationAdmin
      {} as never, // overviewService
      {} as never, // auditService
      {} as never, // users
      {} as never, // usersWrite
      {} as never, // repairers
      {} as never, // repairersWrite
      {} as never, // demandes
      {} as never, // demandesWrite
      {} as never, // offres
      {} as never, // shipments
      {} as never, // disputes
      {} as never, // payments
      {} as never, // catalogAdmin
      {} as never, // stats
      {} as never, // shipmentsList
      {} as never, // refundsList
      {} as never, // verificationsList
      {} as never, // tipsAdmin
      {} as never, // reviewsAdmin
      {} as never, // identityDecisions
      {} as never, // staff
      {} as never, // cancellationsAdmin
      {} as never, // disputeSpaces
      mockStaffInvitations as never,
    );

    const superAdminSession = { user: { id: 'super-admin-1', role: 'super_admin' } } as never;

    it('delegates inviteStaff to createInvitation', async () => {
      const input: InviteStaffInput = { email: 'test@revime.fr', role: 'support', firstName: 'Jean', lastName: 'Dupont' };
      const res = await controller.inviteStaff(superAdminSession, input);
      expect(mockStaffInvitations.createInvitation).toHaveBeenCalledWith('super-admin-1', input);
      expect(res).toEqual({ ok: true, id: 'inv-123' });
    });

    it('delegates listStaffInvitations to listInvitations', async () => {
      const res = await controller.listStaffInvitations();
      expect(mockStaffInvitations.listInvitations).toHaveBeenCalled();
      expect(res).toEqual({ items: [], total: 0 });
    });

    it('delegates listStaffMembers to listMembers', async () => {
      const res = await controller.listStaffMembers();
      expect(mockStaffInvitations.listMembers).toHaveBeenCalled();
      expect(res).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it('delegates removeStaffMember to removeMember', async () => {
      const res = await controller.removeStaffMember(superAdminSession, 'usr-99');
      expect(mockStaffInvitations.removeMember).toHaveBeenCalledWith('super-admin-1', 'usr-99');
      expect(res).toEqual({ ok: true });
    });

    it('delegates revokeStaffInvitation to revokeInvitation', async () => {
      const res = await controller.revokeStaffInvitation(superAdminSession, 'inv-123');
      expect(mockStaffInvitations.revokeInvitation).toHaveBeenCalledWith('super-admin-1', 'inv-123');
      expect(res).toEqual({ ok: true });
    });

    it('delegates resendStaffInvitation to resendInvitation', async () => {
      const res = await controller.resendStaffInvitation(superAdminSession, 'inv-123');
      expect(mockStaffInvitations.resendInvitation).toHaveBeenCalledWith('super-admin-1', 'inv-123');
      expect(res).toEqual({ ok: true });
    });
  });

  describe('AdminStaffPublicController (Public onboarding endpoints)', () => {
    const mockStaffInvitations = {
      verifyToken: vi.fn().mockResolvedValue({
        valid: true,
        email: 'invited@revime.fr',
        role: 'moderation',
        firstName: 'Paul',
        lastName: null,
        isExistingUser: false,
      }),
      acceptInvitation: vi.fn().mockResolvedValue({
        ok: true,
        email: 'invited@revime.fr',
        role: 'moderation',
      }),
    };

    const publicController = new AdminStaffPublicController(mockStaffInvitations as never);

    it('has controller path admin/staff/invitations/public and no AdminRoleGuard', () => {
      const path = Reflect.getMetadata(PATH_METADATA, AdminStaffPublicController);
      expect(path).toBe('admin/staff/invitations/public');
      const guards = Reflect.getMetadata('__guards__', AdminStaffPublicController);
      expect(guards).toBeUndefined();
    });

    it('allows verifying an invitation token without session', async () => {
      const res = await publicController.verify('raw-token-123');
      expect(mockStaffInvitations.verifyToken).toHaveBeenCalledWith('raw-token-123');
      expect(res.valid).toBe(true);
      expect(res.email).toBe('invited@revime.fr');
    });

    it('allows accepting an invitation without session', async () => {
      const input: AcceptStaffInvitationInput = {
        token: 'a'.repeat(32),
        password: 'Password123!',
        firstName: 'Paul',
      };
      const res = await publicController.accept(input);
      expect(mockStaffInvitations.acceptInvitation).toHaveBeenCalledWith(input);
      expect(res).toEqual({ ok: true, email: 'invited@revime.fr', role: 'moderation' });
    });
  });
});
