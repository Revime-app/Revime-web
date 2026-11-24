import type { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation } from './prisma-errors.js';

/**
 * Claims a Stripe event id so a redelivery is a no-op. False when it was already
 * processed.
 *
 * `id` is the NAMESPACED key - `connect:${event.id}` or `identity:${event.id}` -
 * because three endpoints share one table and a mis-subscribed endpoint could
 * otherwise swallow a real charge event. `payments/` still claims the bare id,
 * deliberately. Note any cleanup query using a bare `evt_%` prefix misses the
 * namespaced rows.
 *
 * The CALLER must release the claim on failure. A failed handler that keeps its
 * claim discards Stripe's retry and loses a real event permanently.
 */
export async function claimStripeEvent(
  prisma: PrismaService,
  id: string,
  type: string,
): Promise<boolean> {
  try {
    await prisma.stripeEvent.create({ data: { id, type } });
    return true;
  } catch (e: unknown) {
    if (isUniqueViolation(e)) return false;
    throw e;
  }
}
