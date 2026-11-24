import { can, type AdminMe, type AdminPermission } from '@revime/shared';

/**
 * CF4-40 (sub-project N, spec §4.4). Whether to SHOW an action. Never the protection: every
 * admin route answers 403 to a role without the permission, whatever this returns.
 *
 * Reads the role through the shared matrix rather than `me.permissions`, so the dashboard and
 * the API cannot disagree about what a role means.
 */
export function hasPermission(me: AdminMe | null, p: AdminPermission): boolean {
  if (!me || !me.twoFactorVerified) return false;
  return can(me.role, p);
}

/** « Rôle dans l'équipe » and « Réinitialiser la double authentification »: Super Admin, not on self. */
export function staffControlsVisible(me: AdminMe | null, targetUserId: string, actorUserId: string): boolean {
  return hasPermission(me, 'admin.manage') && targetUserId !== actorUserId;
}
