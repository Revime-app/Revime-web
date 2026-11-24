import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
// Value import: Nest reads design:paramtypes to inject it.
import { Reflector } from '@nestjs/core';
import { can, isStaffRole, type AdminPermission } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { PERMISSION_KEY, STAFF_ONLY_KEY } from './require-permission.decorator.js';

type GuardRequest = {
  session?: {
    user?: { role?: string | null };
    session?: { twoFactorVerifiedAt?: Date | string | null };
  };
};

/**
 * CF4-40 / CF4-41, spec §4.2. First failure wins:
 * 1. a staff role (the six of the shared matrix);
 * 2. the second factor proven on THIS session (`Session.twoFactorVerifiedAt`, stamped only by
 *    staff-two-factor.ts) - never `user.twoFactorEnabled`, which an email-code, Apple or Google
 *    session would carry without having proven anything (decision N5);
 * 3. the handler's `@RequirePermission`, checked against the fixed matrix.
 * A handler with no metadata is refused: deny by default.
 */
@Injectable()
export class AdminRoleGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<GuardRequest>();
    const role = req.session?.user?.role;
    if (!isStaffRole(role)) {
      throw new AppException('FORBIDDEN', "Accès réservé à l'équipe Revime.");
    }

    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(STAFF_ONLY_KEY, targets)) return true;

    if (!req.session?.session?.twoFactorVerifiedAt) {
      throw new AppException('FORBIDDEN', 'Double authentification requise.');
    }

    const permission = this.reflector.getAllAndOverride<AdminPermission | undefined>(PERMISSION_KEY, targets);
    if (!permission || !can(role, permission)) {
      throw new AppException('FORBIDDEN', 'Action non autorisée pour votre rôle.');
    }
    return true;
  }
}

export { AdminRoleGuard as AdminAuthGuard };
