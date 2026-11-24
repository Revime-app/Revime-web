import { SetMetadata } from '@nestjs/common';
import type { AdminPermission } from '@revime/shared';

/**
 * CF4-40, decision N2. Every AdminController handler declares exactly ONE of these;
 * admin-permission-coverage.spec.ts enumerates them by name, and AdminRoleGuard refuses a
 * handler that declares neither (deny by default).
 */
export const PERMISSION_KEY = 'revime:admin-permission';
export const STAFF_ONLY_KEY = 'revime:admin-staff-only';

export const RequirePermission = (p: AdminPermission) => SetMetadata(PERMISSION_KEY, p);

/**
 * Staff role required; neither the second factor nor a permission. Only `GET admin/me` carries
 * it, so a staff session that has not proven its second factor can learn it must go to /securite.
 */
export const StaffOnly = () => SetMetadata(STAFF_ONLY_KEY, true);
