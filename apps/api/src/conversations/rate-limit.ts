import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * A CHOICE, not a measurement - recorded that way in the design's §13 alongside
 * piece 5's five-second registry timeout.
 *
 * Sized to never bite a real conversation: two people arranging a repair exchange
 * tens of messages, not hundreds. Low enough that this route is not a bulk channel.
 *
 * What it deliberately does NOT bound is the number of CHANNELS a réparateur can
 * open. The design's §3.3 makes an offer the price of contact, and the client
 * instructed « aucune limite au nombre d'offres par demande », so capping channels
 * would mean capping offers. The offer itself is the meaningful friction.
 */
export const MAX_MESSAGES_PER_USER_PER_DAY = 200;

const DAY_SECONDS = 86_400;

export type MessageLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type PrismaLike = Pick<PrismaService, 'message'>;

/**
 * `Message` is its own ledger, so there is no second table - the same reasoning
 * that let piece 5 reuse `VerificationAttempt` instead of adding one, and the
 * `[senderUserId, createdAt]` index is what makes the count cheap.
 *
 * Two deliberate differences from `checkLimit`:
 *
 * - **No cooldown.** A cooldown between messages would punish the ordinary rhythm
 *   of a conversation, which is the opposite of an SMS send.
 * - **Soft-deleted rows still count.** A message a moderator removed was still
 *   sent, and excluding it would hand a spammer a refill every time he was
 *   moderated - the amplification `checkLimit` avoids in the other direction.
 *
 * The window is TRAILING, never calendar: a calendar day would introduce a timezone
 * question this codebase does not otherwise have and hand a spammer a free refill
 * at midnight.
 */
export async function checkMessageLimit(
  prisma: PrismaLike,
  args: { userId: string },
): Promise<MessageLimitVerdict> {
  const daySince = new Date(Date.now() - DAY_SECONDS * 1000);

  const sent = await prisma.message.count({
    where: { senderUserId: args.userId, createdAt: { gte: daySince } },
  });

  if (sent >= MAX_MESSAGES_PER_USER_PER_DAY) {
    return { allowed: false, retryAfterSeconds: DAY_SECONDS };
  }
  return { allowed: true };
}
