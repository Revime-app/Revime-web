// apps/api/test/pre1-staff-cleanup-and-2fa.spec.ts
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADMIN_ROLES, type AdminPermission } from '@revime/shared';
import { APIError } from 'better-auth/api';
import { Reflector } from '@nestjs/core';
import type { ExecutionContext } from '@nestjs/common';
import { cleanTestStaffAccounts } from '../scripts/clean-test-admins.js';
import { assertStaffMayDisableTwoFactor } from '../src/auth/staff-two-factor.js';
import { AdminRoleGuard } from '../src/admin/admin-role.guard.js';
import { PERMISSION_KEY, STAFF_ONLY_KEY } from '../src/admin/require-permission.decorator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('PRE-1: Clean Test Admin Accounts & Mandatory 2FA Enforcement', () => {
  describe('Migration File Integrity', () => {
    const migrationPath = resolve(
      __dirname,
      '../prisma/migrations/20261017193000_clean_test_admin_accounts/migration.sql',
    );

    it('migration file exists in prisma/migrations', () => {
      expect(existsSync(migrationPath)).toBe(true);
    });

    it('contains the required idempotent SQL statements', () => {
      const sql = readFileSync(migrationPath, 'utf8');
      expect(sql).toContain('UPDATE "user"');
      expect(sql).toContain('SET "role" = NULL');
      expect(sql).toContain('WHERE "role" IS NOT NULL');
      expect(sql).toContain("LIKE '%@repareme.test'");
      expect(sql).toContain('DELETE FROM "session"');
      expect(sql).toContain('WHERE "userId" IN');
      expect(sql).toContain('SELECT "id" FROM "user" WHERE "email" LIKE \'%@repareme.test\'');
    });
  });

  describe('cleanTestStaffAccounts', () => {
    const REAL = [
      { id: 'u1', email: 'owner.one@example.com', role: 'super_admin', twoFactorEnabled: true },
      { id: 'u2', email: 'owner.two@example.com', role: 'super_admin', twoFactorEnabled: true },
      { id: 'u3', email: 'owner.three@example.com', role: 'super_admin', twoFactorEnabled: true },
    ];
    const TEST = [
      { id: 't1', email: 'test1@repareme.test', role: 'admin', twoFactorEnabled: false },
      { id: 't2', email: 'TEST2@REPAREME.TEST', role: 'admin', twoFactorEnabled: false },
    ];

    /** A prisma fake whose second read is what the database holds after the demotion. */
    function fake(before: unknown[], after: unknown[]) {
      return {
        user: {
          findMany: vi.fn().mockResolvedValueOnce(before).mockResolvedValueOnce(after),
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
        session: { deleteMany: vi.fn().mockResolvedValue({ count: 4 }) },
        $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
      };
    }

    it('demotes test staff (any e-mail case) and purges their sessions in ONE transaction, keeping real staff', async () => {
      const prisma = fake([...REAL, ...TEST], REAL);

      const report = await cleanTestStaffAccounts(prisma as never);

      expect(report).toMatchObject({
        beforeCount: 5,
        demotedCount: 2,
        sessionsDeleted: 4,
        superAdminCount: 3,
        missing2faCount: 0,
      });
      expect(report.remainingStaff).toHaveLength(3);
      expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: { in: ['t1', 't2'] } } });
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['t1', 't2'] } },
        data: { role: null },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('writes nothing when no test account holds a staff role', async () => {
      const prisma = fake(REAL, REAL);

      const report = await cleanTestStaffAccounts(prisma as never);

      expect(report.demotedCount).toBe(0);
      expect(report.sessionsDeleted).toBe(0);
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it.each([
      ['one real Super Admin', [REAL[0]!, ...TEST], 1],
      ['no real Super Admin', [{ id: 'f1', email: 'sa@repareme.test', role: 'super_admin', twoFactorEnabled: true }], 0],
      // A fixture Super Admin is not a Super Admin to keep: 3 rows, only 1 of them real.
      [
        'a real one and two fixture ones',
        [REAL[0]!, { id: 'f1', email: 'a@repareme.test', role: 'super_admin', twoFactorEnabled: true }, { id: 'f2', email: 'b@repareme.test', role: 'super_admin', twoFactorEnabled: true }],
        1,
      ],
    ])('refuses BEFORE writing anything when %s would remain', async (_label, before, kept) => {
      const prisma = fake(before, []);

      await expect(cleanTestStaffAccounts(prisma as never)).rejects.toThrow(
        new RegExp(`only ${kept} real Super Admin\\(s\\) would remain.*Nothing was changed`),
      );

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.session.deleteMany).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('fails loudly when a test account still holds a staff role after the demotion', async () => {
      const prisma = fake([...REAL, ...TEST], [...REAL, TEST[0]!]);

      await expect(cleanTestStaffAccounts(prisma as never)).rejects.toThrow(/still holds a staff role/);
    });

    it('reports the Super Admins that REMAIN, not the ones there were before a fixture Super Admin was demoted', async () => {
      const fixtureSuperAdmin = { id: 'f1', email: 'sa@repareme.test', role: 'super_admin', twoFactorEnabled: false };
      const prisma = fake([...REAL, fixtureSuperAdmin], REAL);

      const report = await cleanTestStaffAccounts(prisma as never);

      expect(report.demotedCount).toBe(1);
      expect(report.superAdminCount).toBe(3);
    });

    it('audits and reports 2FA compliance without throwing for remaining staff lacking 2FA', async () => {
      const staff = [REAL[0]!, { ...REAL[1]!, twoFactorEnabled: false }, REAL[2]!];
      const prisma = fake(staff, staff);

      const report = await cleanTestStaffAccounts(prisma as never);

      expect(report.superAdminCount).toBe(3);
      expect(report.missing2faCount).toBe(1);
      expect(report.remainingStaff.find((m) => m.id === 'u2')?.twoFactorEnabled).toBe(false);
    });
  });

  describe('2FA Mandatory Enforcement Guards', () => {
    describe('assertStaffMayDisableTwoFactor', () => {
      it.each([...ADMIN_ROLES])(
        'rejects /two-factor/disable with 403 FORBIDDEN for role: %s',
        async (role) => {
          const ctx = {
            path: '/two-factor/disable',
            context: { session: { user: { role } } },
          };

          const err = await assertStaffMayDisableTwoFactor({} as never, ctx).catch(
            (e: unknown) => e,
          );

          expect(err).toBeInstanceOf(APIError);
          expect((err as APIError).status).toBe('FORBIDDEN');
          expect((err as APIError).message).toBe(
            "La double authentification est obligatoire pour l'équipe.",
          );
        },
      );

      it('allows non-staff roles to disable 2FA', async () => {
        const userCtx = {
          path: '/two-factor/disable',
          context: { session: { user: { role: 'user' } } },
        };
        const nullRoleCtx = {
          path: '/two-factor/disable',
          context: { session: { user: { role: null } } },
        };
        const missingSessionCtx = {
          path: '/two-factor/disable',
          context: { session: null },
        };

        await expect(assertStaffMayDisableTwoFactor({} as never, userCtx)).resolves.toBeUndefined();
        await expect(assertStaffMayDisableTwoFactor({} as never, nullRoleCtx)).resolves.toBeUndefined();
        await expect(assertStaffMayDisableTwoFactor({} as never, missingSessionCtx)).resolves.toBeUndefined();
      });

      it('ignores paths other than /two-factor/disable for staff', async () => {
        const enableCtx = {
          path: '/two-factor/enable',
          context: { session: { user: { role: 'super_admin' } } },
        };

        await expect(assertStaffMayDisableTwoFactor({} as never, enableCtx)).resolves.toBeUndefined();
      });
    });

    describe('AdminRoleGuard', () => {
      const makeContext = (role?: string | null, twoFactorVerifiedAt?: Date | string | null) =>
        ({
          switchToHttp: () => ({
            getRequest: () => ({
              session: {
                user: { role },
                session: { twoFactorVerifiedAt },
              },
            }),
          }),
          getHandler: () => ({}),
          getClass: () => ({}),
        }) as unknown as ExecutionContext;

      it('denies requests without twoFactorVerifiedAt with 403', () => {
        const reflector = new Reflector();
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        const guard = new AdminRoleGuard(reflector);

        const checkRejection = (role: string, twoFactorVerifiedAt?: Date | null) => {
          try {
            guard.canActivate(makeContext(role, twoFactorVerifiedAt));
            expect.unreachable('Should have thrown 403');
          } catch (e: any) {
            expect(e.getStatus?.()).toBe(403);
            expect(e.message).toBe('Double authentification requise.');
          }
        };

        checkRejection('admin', null);
        checkRejection('super_admin', undefined);
        checkRejection('moderation', null);
        checkRejection('support', null);
        checkRejection('finance', null);
        checkRejection('read_only', null);
      });

      it('denies non-staff role with 403 before 2FA check', () => {
        const reflector = new Reflector();
        vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
        const guard = new AdminRoleGuard(reflector);

        const checkNonStaff = (role: string | null | undefined) => {
          try {
            guard.canActivate(makeContext(role, new Date()));
            expect.unreachable('Should have thrown 403');
          } catch (e: any) {
            expect(e.getStatus?.()).toBe(403);
            expect(e.message).toBe("Accès réservé à l'équipe Revime.");
          }
        };

        checkNonStaff('user');
        checkNonStaff(null);
        checkNonStaff(undefined);
        checkNonStaff('repairer');
      });

      it('bypasses 2FA check when endpoint is marked with @StaffOnly', () => {
        const reflector = new Reflector();
        vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
          if (key === STAFF_ONLY_KEY) return true;
          return false;
        });
        const guard = new AdminRoleGuard(reflector);

        // Staff without 2FA verified can still access @StaffOnly (e.g. admin/me)
        expect(guard.canActivate(makeContext('admin', null))).toBe(true);
        expect(guard.canActivate(makeContext('super_admin', undefined))).toBe(true);
      });

      it('allows verified staff with authorized permission', () => {
        const reflector = new Reflector();
        vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
          if (key === PERMISSION_KEY) return 'dashboard.read' as AdminPermission;
          return false;
        });
        const guard = new AdminRoleGuard(reflector);

        expect(guard.canActivate(makeContext('super_admin', new Date()))).toBe(true);
        expect(guard.canActivate(makeContext('read_only', new Date()))).toBe(true);
      });

      it('denies verified staff lacking the required permission with 403', () => {
        const reflector = new Reflector();
        vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
          if (key === PERMISSION_KEY) return 'staff.manage' as AdminPermission;
          return false;
        });
        const guard = new AdminRoleGuard(reflector);

        try {
          guard.canActivate(makeContext('read_only', new Date()));
          expect.unreachable('Should have thrown 403');
        } catch (e: any) {
          expect(e.getStatus?.()).toBe(403);
          expect(e.message).toBe('Action non autorisée pour votre rôle.');
        }
      });
    });
  });
});
