import { z } from 'zod';

/**
 * CF4-40 (sub-project N), spec §4.1. Six FIXED staff roles and a FIXED permission matrix
 * (decision N1): not configurable, no per-account overrides. The client confirms the matrix;
 * a changed cell is a code change, pinned cell by cell by admin-permissions-contract.spec.ts.
 *
 * `User.role` holds one of these values, or null for a non-staff account.
 */
export const ADMIN_ROLES = ['super_admin', 'admin', 'moderation', 'support', 'finance', 'read_only'] as const;
export const adminRoleSchema = z.enum(ADMIN_ROLES);
export type AdminRole = z.infer<typeof adminRoleSchema>;

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  super_admin: 'Super administrateur',
  admin: 'Admin',
  moderation: 'Modération',
  support: 'Support',
  finance: 'Finance',
  read_only: 'Lecture seule',
};

/** The fourteen permissions, in spec §4.1's order. Each admin route declares exactly one. */
export const ADMIN_PERMISSIONS = [
  'dashboard.read',
  'conversations.read',
  'users.moderate',
  'users.delete',
  'verification.decide',
  'content.moderate',
  'reports.handle',
  'disputes.handle',
  'disputes.resolve',
  'refunds.issue',
  'shipping.operate',
  'catalog.manage',
  'admin.manage',
  'compliance.read',
  'payments.manage',
] as const;
export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Record<AdminRole, readonly AdminPermission[]> = {
  super_admin: ADMIN_PERMISSIONS,
  admin: ADMIN_PERMISSIONS.filter((p) => p !== 'admin.manage'),
  moderation: ['dashboard.read', 'conversations.read', 'users.moderate', 'content.moderate', 'reports.handle'],
  support: [
    'dashboard.read',
    'conversations.read',
    'verification.decide',
    'reports.handle',
    'disputes.handle',
    'shipping.operate',
  ],
  finance: ['dashboard.read', 'disputes.handle', 'disputes.resolve', 'refunds.issue', 'payments.manage'],
  read_only: ['dashboard.read'],
};

/**
 * 🛑 hasOwnProperty, not `role in ROLE_PERMISSIONS`: `'toString' in {}` is true, so a role
 * string equal to a prototype key would otherwise resolve to a function and throw or pass.
 */
export function isStaffRole(role: string | null | undefined): role is AdminRole {
  return typeof role === 'string' && Object.prototype.hasOwnProperty.call(ROLE_PERMISSIONS, role);
}

/** Unknown role, null role or unknown permission → false. Deny by default. */
export function can(role: string | null | undefined, p: AdminPermission): boolean {
  if (!isStaffRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(p);
}

/** Body of `PATCH admin/users/:id/role` (spec §4.4). `null` removes the account from the team. */
export const adminRoleChangeInputSchema = z.object({ role: adminRoleSchema.nullable() });
export type AdminRoleChangeInput = z.infer<typeof adminRoleChangeInputSchema>;

/** `GET admin/me` (spec §4.4). Reachable by a staff session before its second factor. */
export type AdminMe = {
  role: AdminRole;
  permissions: AdminPermission[];
  twoFactorVerified: boolean;
};
