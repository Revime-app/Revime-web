import { describe, expect, it } from 'vitest';
import {
  ADMIN_AUDIT_ACTION_LABEL,
  ADMIN_PERMISSIONS,
  ADMIN_ROLES,
  ADMIN_ROLE_LABEL,
  ROLE_PERMISSIONS,
  adminAuditActionSchema,
  adminRoleChangeInputSchema,
  can,
  isStaffRole,
  type AdminPermission,
  type AdminRole,
} from '@revime/shared';

/**
 * CF4-40, spec §4.1. The matrix is copied here as a literal table ON PURPOSE: a changed cell
 * in the shared module must fail this test, so the client-confirmed matrix cannot drift in
 * silence. Columns in the spec's order: super_admin, admin, moderation, support, finance, read_only.
 */
const X = true;
const _ = false;
const MATRIX: Record<AdminPermission, [boolean, boolean, boolean, boolean, boolean, boolean]> = {
  'dashboard.read': [X, X, X, X, X, X],
  'conversations.read': [X, X, X, X, _, _],
  'users.moderate': [X, X, X, _, _, _],
  'users.delete': [X, X, _, _, _, _],
  'verification.decide': [X, X, _, X, _, _],
  'content.moderate': [X, X, X, _, _, _],
  'reports.handle': [X, X, X, X, _, _],
  'disputes.handle': [X, X, _, X, X, _],
  'disputes.resolve': [X, X, _, _, X, _],
  'refunds.issue': [X, X, _, _, X, _],
  'shipping.operate': [X, X, _, X, _, _],
  'catalog.manage': [X, X, _, _, _, _],
  'admin.manage': [X, _, _, _, _, _],
  'compliance.read': [X, X, _, _, _, _],
  'payments.manage': [X, X, _, _, X, _],
};
const ROLE_ORDER: AdminRole[] = ['super_admin', 'admin', 'moderation', 'support', 'finance', 'read_only'];

describe('CF4-40 roles and permissions (shared)', () => {
  it('lists the six roles in the spec order', () => {
    expect([...ADMIN_ROLES]).toEqual(ROLE_ORDER);
  });

  it('lists the fifteen permissions in the spec order', () => {
    expect([...ADMIN_PERMISSIONS]).toEqual(Object.keys(MATRIX));
  });

  it('labels each role exactly', () => {
    expect(ADMIN_ROLE_LABEL).toEqual({
      super_admin: 'Super administrateur',
      admin: 'Admin',
      moderation: 'Modération',
      support: 'Support',
      finance: 'Finance',
      read_only: 'Lecture seule',
    });
  });

  for (const [permission, row] of Object.entries(MATRIX) as [AdminPermission, boolean[]][]) {
    ROLE_ORDER.forEach((role, i) => {
      it(`${role} ${row[i] ? 'has' : 'lacks'} ${permission}`, () => {
        expect(can(role, permission)).toBe(row[i]);
        expect(ROLE_PERMISSIONS[role].includes(permission)).toBe(row[i]);
      });
    });
  }

  it('refuses unknown and empty roles', () => {
    for (const role of ['admin_old', '', null, undefined, 'toString', '__proto__', 'constructor']) {
      expect(can(role as string | null | undefined, 'dashboard.read')).toBe(false);
    }
  });

  it('refuses an unknown permission even for super_admin', () => {
    expect(can('super_admin', 'nope' as never)).toBe(false);
  });

  it('recognises exactly the six staff roles', () => {
    for (const role of ROLE_ORDER) expect(isStaffRole(role)).toBe(true);
    for (const role of ['admin ', 'user', '', null, undefined, 'toString']) {
      expect(isStaffRole(role as string | null | undefined)).toBe(false);
    }
  });

  it('validates the role-change body', () => {
    expect(adminRoleChangeInputSchema.safeParse({ role: 'finance' }).success).toBe(true);
    expect(adminRoleChangeInputSchema.safeParse({ role: null }).success).toBe(true);
    expect(adminRoleChangeInputSchema.safeParse({ role: 'owner' }).success).toBe(false);
    expect(adminRoleChangeInputSchema.safeParse({}).success).toBe(false);
  });

  it('declares the two new audit actions with their labels', () => {
    expect(adminAuditActionSchema.safeParse('admin.role_change').success).toBe(true);
    expect(adminAuditActionSchema.safeParse('admin.2fa_reset').success).toBe(true);
    expect(ADMIN_AUDIT_ACTION_LABEL['admin.role_change']).toBe('Changement de rôle');
    expect(ADMIN_AUDIT_ACTION_LABEL['admin.2fa_reset']).toBe(
      'Réinitialisation de la double authentification',
    );
  });
});
