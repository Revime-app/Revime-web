import { adminAuditActionSchema } from '@revime/shared';
import type { Prisma } from '../generated/prisma/client.js';

export type AuditRecordInput = {
  actorUserId: string | null;
  actorEmail: string | null;
  /** CF4-40. The actor's staff role when the action ran; null when unknown (bridge rows). */
  actorRole?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  statusCode: number;
  /** 🛑 Must never carry PII beyond what the action needs. */
  detail?: Prisma.InputJsonValue | null;
};

/**
 * The MINIMUM shape this writer needs. Typed structurally rather than as PrismaClient
 * so both callers satisfy it: AdminAuditService holds a PrismaService, and the Better
 * Auth bridge holds the separate module-level client built in auth.ts.
 */
export type AuditCapableClient = {
  adminAuditLog: { create(args: { data: Record<string, unknown> }): Promise<unknown> };
};

const UNKNOWN_ACTOR = 'inconnu';

/**
 * Writes one AdminAuditLog row. 🛑 NEVER THROWS.
 *
 * An audit write that fails must not fail the action it describes: refusing a
 * successful refund because a log insert failed is worse than a missing row, and the
 * design records that the log is not transactional with the action. `auth.ts`'s own
 * `recordEmailAttempt` states the same rule for the same reason.
 *
 * THE ONLY WRITER of this table. Two implementations would mean two copies of the
 * never-throw rule, and one of them would eventually lose it.
 */
export async function writeAuditRow(
  prisma: AuditCapableClient,
  input: AuditRecordInput,
  onError: (message: string, err: unknown) => void,
): Promise<void> {
  const action = adminAuditActionSchema.safeParse(input.action);
  if (!action.success) {
    onError(`Refusing to audit unknown action "${input.action}"`, undefined);
    return;
  }

  try {
    await prisma.adminAuditLog.create({
      data: {
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail ?? UNKNOWN_ACTOR,
        actorRole: input.actorRole ?? null,
        action: action.data,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        statusCode: input.statusCode,
        detail: input.detail ?? undefined,
      },
    });
  } catch (err) {
    onError(`Audit write failed for "${action.data}"`, err);
  }
}
