'use client';

import type { AdminPermission } from '@revime/shared';
import { useAdminMe } from './AdminGate';
import { hasPermission } from '../lib/permissions';

/**
 * CF4-40. Renders its children only when the operator's role holds `p`. Display only: the API
 * answers 403 to the same action regardless, so a hidden button is never the only check.
 */
export function Can({ p, children }: { p: AdminPermission; children: React.ReactNode }) {
  return hasPermission(useAdminMe(), p) ? <>{children}</> : null;
}
