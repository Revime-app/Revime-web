import type { Prisma } from '../generated/prisma/client.js';

/**
 * Posts one SYSTEM message into the conversation of a (demande, réparateur) pair, creating the
 * conversation if the pair never talked. Runs inside the caller's transaction so the notice
 * commits or rolls back with the state change it records.
 *
 * Returns the conversation id, or `null` when nothing was posted because an operator closed
 * that channel. A closed conversation is neither revived nor touched (not even `lastMessageAt`),
 * the same rule `ConversationsService.openForPayment` and `getOrCreate` apply.
 *
 * `lastMessageAt` is stamped with the message, as `sendMessage` does: `listInbox` filters
 * `lastMessageAt: { not: null }`, so without it the thread would reach neither inbox.
 */
export async function postSystemNotice(
  tx: Prisma.TransactionClient,
  input: { demandeId: string; clientUserId: string; repairerUserId: string; body: string; now: Date },
): Promise<string | null> {
  const pair = {
    demandeId_repairerUserId: { demandeId: input.demandeId, repairerUserId: input.repairerUserId },
  };
  const existing = await tx.conversation.findUnique({ where: pair, select: { id: true, deletedAt: true } });
  if (existing?.deletedAt) return null;

  const conversation = await tx.conversation.upsert({
    where: pair,
    create: {
      demandeId: input.demandeId,
      clientUserId: input.clientUserId,
      repairerUserId: input.repairerUserId,
      lastMessageAt: input.now,
    },
    update: { lastMessageAt: input.now },
    select: { id: true },
  });
  await tx.message.create({
    data: {
      conversationId: conversation.id,
      senderUserId: null,
      kind: 'SYSTEM',
      body: input.body,
      createdAt: input.now,
    },
  });
  return conversation.id;
}
