import type {
  Dispute,
  DisputeInitiator,
  DisputeMotif,
  DisputeSpace,
  Prisma,
} from '../generated/prisma/client.js';
import { closePendingCancellation } from '../cancellations/close-pending.js';

export type CreateDisputeFirstMessage = {
  space: DisputeSpace;
  senderUserId: string;
  body: string;
  photoPath?: string | null;
  documentPath?: string | null;
  documentName?: string | null;
  documentSizeBytes?: number | null;
};

export type CreateDisputeArgs = {
  commandeId: string;
  initiator: DisputeInitiator;
  openedByUserId: string | null;
  motif: DisputeMotif | null;
  reason: string;
  description: string | null;
  evidencePhotos: string[];
  firstMessages?: CreateDisputeFirstMessage[];
  closedByUserId: string;
};

export async function createDispute(
  tx: Prisma.TransactionClient,
  args: CreateDisputeArgs,
): Promise<Dispute> {
  await tx.commande.update({
    where: { id: args.commandeId },
    data: { disputedAt: new Date() },
  });

  const created = await tx.dispute.upsert({
    where: { commandeId: args.commandeId },
    create: {
      commandeId: args.commandeId,
      status: 'OPEN',
      initiator: args.initiator,
      openedByUserId: args.openedByUserId,
      motif: args.motif,
      reason: args.reason,
      description: args.description,
      evidencePhotos: args.evidencePhotos,
    },
    update: {
      status: 'OPEN',
      initiator: args.initiator,
      openedByUserId: args.openedByUserId,
      motif: args.motif,
      reason: args.reason,
      description: args.description,
      evidencePhotos: args.evidencePhotos,
      assignedToUserId: null,
      assignedAt: null,
      resolvedByUserId: null,
      resolvedAt: null,
      verdict: null,
      resolutionNote: null,
    },
  });

  await closePendingCancellation(tx, args.commandeId, 'SUPERSEDED', args.closedByUserId);
  await tx.commande.update({
    where: { id: args.commandeId },
    data: { cancellationRequestedAt: null },
  });

  if (args.firstMessages && args.firstMessages.length > 0) {
    await tx.disputeMessage.createMany({
      data: args.firstMessages.map((msg) => ({
        disputeId: created.id,
        space: msg.space,
        author: 'PARTY' as const,
        senderUserId: msg.senderUserId,
        body: msg.body,
        photoPath: msg.photoPath ?? null,
        documentPath: msg.documentPath ?? null,
        documentName: msg.documentName ?? null,
        documentSizeBytes: msg.documentSizeBytes ?? null,
      })),
    });
  }

  return created;
}
