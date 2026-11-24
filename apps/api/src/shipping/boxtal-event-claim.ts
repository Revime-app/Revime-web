import { isUniqueViolation } from '../common/prisma-errors.js';
import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * Claims a Boxtal event id so a redelivery is a no-op. False when already processed. Boxtal
 * retries ten times over 24 hours on any non-2xx (spec §3.3) - the probe saw it redeliver four
 * events the moment a callback became reachable - so the same event arriving more than once is
 * normal, not a fault. The CALLER releases the claim if processing throws, so the retry gets
 * another chance; same shape as `claimStripeEvent`.
 */
export async function claimBoxtalEvent(prisma: PrismaService, id: string, type: string): Promise<boolean> {
  try {
    await prisma.boxtalEvent.create({ data: { id, type } });
    return true;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}
