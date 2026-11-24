import type { Prisma } from '../generated/prisma/client.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * CF4-I (spec §4.2). The write that closes the PENDING `CancellationRequest` on a commande and
 * clears its freeze flag - in ONE `$transaction` with whatever else the caller is doing to that
 * commande, never on its own. Three callers share this: `CancellationsService.withdraw` (Task
 * 4, status WITHDRAWN, not exported through here - it has its own simpler write), the refund
 * engine's final transaction (Task 6, status APPROVED after a successful refund) and
 * `AdminDisputesService.openDispute` (Task 6, status SUPERSEDED when a dispute opens while a
 * request is pending).
 *
 * Returns the Prisma OPERATION (not a promise already run), so the caller can place it inside
 * an array-form `$transaction` alongside its own writes at whatever index ordering its own
 * invariants need (Review Focus 1, 2: the commande's own CAS write stays index 0).
 *
 * `decidedByUserId` is the admin who acted, or null when the system did (there is no such
 * caller yet, but the type stays honest about the column, which is nullable for exactly this
 * reason).
 */
export function closePendingCancellation(
  tx: Pick<PrismaService, 'cancellationRequest'>,
  commandeId: string,
  status: 'APPROVED' | 'SUPERSEDED',
  decidedByUserId: string | null,
) {
  return tx.cancellationRequest.updateMany({
    where: { commandeId, status: 'PENDING' },
    data: { status, decidedAt: new Date(), decidedByUserId },
  });
}
