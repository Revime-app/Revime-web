import { SetMetadata } from '@nestjs/common';
import type { AdminAuditAction } from '@revime/shared';

export const AUDIT_KEY = 'admin:audit';

export type AuditMeta = {
  action: AdminAuditAction;
  /** The model the action targets, e.g. 'Commande'. Free text, read by pieces B and C. */
  targetType?: string;
  /** Which route param holds the target id, e.g. 'id'. */
  targetParam?: string;
  /**
   * Body keys to copy into the audit row's `detail`. OPT-IN, and deliberately so:
   * `detail` is Json and accepts anything, and the service's own rule is that it must
   * never carry PII beyond what the action needs. Naming the keys per handler is what
   * keeps that rule enforceable.
   */
  detailFields?: string[];
};

/**
 * Marks a write handler as audited. AdminAuditInterceptor reads this.
 *
 * 🛑 A write handler without this decorator is a hole in Ch.8's « historisé »
 * requirement, so admin-audit-coverage.spec.ts fails the suite rather than trusting
 * anyone to remember. Add the action to adminAuditActionSchema first: the parameter
 * is typed against it, so an unknown action will not compile.
 */
export const Audit = (action: AdminAuditAction, opts: Omit<AuditMeta, 'action'> = {}) =>
  SetMetadata(AUDIT_KEY, { action, ...opts } satisfies AuditMeta);
