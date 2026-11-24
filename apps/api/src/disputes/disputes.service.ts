import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  DISPUTE_MOTIFS,
  formatDisputeRef,
  orderNumberFor,
  motifsFor,
  type DisputeMessageDto,
  type DisputeSide,
  type DocumentDto,
  type OpenDisputeByPartyInput,
  type PartyDisputeDto,
  type SendDisputeMessageInput,
  type SignAttachmentInput,
} from '@revime/shared';
import type { DisputeMessageAuthor, DisputeSpace } from '../generated/prisma/client.js';
import { AppException } from '../common/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CommandeAnnouncer } from '../commandes/commande-announcer.service.js';
import {
  attachmentExtension,
  bucketFor,
  checkDisputeAttachment,
  cleanDocumentName,
  disputeAttachmentPath,
  signAttachmentUrls,
} from '../storage/attachment-paths.js';
import { storageGateway } from '../storage/gateway.js';
import { AdminAlertsService } from '../admin/admin-alerts.service.js';
import { createDispute, type CreateDisputeFirstMessage } from './dispute-create.js';

const NOT_FOUND = 'Ressource introuvable.';
const ONLY_PAID_CAN_DISPUTE = "Cette commande ne permet plus d'ouvrir un litige.";
const WRONG_MOTIF = "Ce motif n'est pas disponible.";
const DISPUTE_ALREADY_OPEN = 'Un litige est déjà ouvert pour cette commande.';
const ALREADY_RESOLVED = 'Un litige a déjà été traité pour cette commande. Contactez le support.';
const STATE_CHANGED = "La commande a changé d'état entre-temps.";
const INVALID_ATTACHMENT = 'Pièce jointe invalide.';
const DISPUTE_CLOSED = 'Ce litige est clos.';

export function unreadFor(
  dispute: {
    clientLastReadAt?: Date | null;
    repairerLastReadAt?: Date | null;
    messages?: { space: DisputeSpace; author: DisputeMessageAuthor; createdAt: Date }[];
  },
  side: DisputeSide,
): boolean {
  const lastReadAt =
    (side === 'CLIENT' ? dispute.clientLastReadAt : dispute.repairerLastReadAt) ?? new Date(0);
  return (dispute.messages ?? []).some(
    (m) => m.space === side && m.author === 'REVIME' && m.createdAt > lastReadAt,
  );
}

export async function checkDisputeMessageLimit(
  prisma: Pick<PrismaService, 'disputeMessage'>,
  userId: string,
): Promise<void> {
  const daySince = new Date(Date.now() - 86_400 * 1000);
  const sent = await prisma.disputeMessage.count({
    where: { senderUserId: userId, createdAt: { gte: daySince } },
  });
  if (sent >= 200) {
    throw new AppException(
      'TOO_MANY_REQUESTS',
      "Vous avez envoyé trop de messages aujourd'hui. Réessayez demain.",
    );
  }
}

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly announcer: CommandeAnnouncer,
    @Optional() private readonly alerts?: AdminAlertsService,
  ) {}

  async open(
    userId: string,
    commandeId: string,
    input: OpenDisputeByPartyInput,
  ): Promise<{ number: number; reference: string }> {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: { dispute: true },
    });

    if (!commande) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (commande.clientUserId !== userId && commande.repairerUserId !== userId) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const side: DisputeSide = commande.clientUserId === userId ? 'CLIENT' : 'REPAIRER';

    const allowedMotifs = motifsFor(side);
    if (!allowedMotifs.includes(input.motif)) {
      throw new AppException('UNPROCESSABLE_ENTITY', WRONG_MOTIF);
    }

    if (
      commande.status !== 'PAID' ||
      commande.stripeTransferId != null ||
      commande.stripeTransferReversalId != null
    ) {
      throw new AppException('UNPROCESSABLE_ENTITY', ONLY_PAID_CAN_DISPUTE);
    }

    if (commande.dispute) {
      if (['OPEN', 'IN_REVIEW'].includes(commande.dispute.status)) {
        throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_ALREADY_OPEN);
      }
      if (commande.dispute.status.startsWith('RESOLVED_')) {
        throw new AppException('UNPROCESSABLE_ENTITY', ALREADY_RESOLVED);
      }
    }

    for (const att of input.attachments ?? []) {
      if (!checkDisputeAttachment(att.path, commandeId, side, att.kind)) {
        throw new AppException('UNPROCESSABLE_ENTITY', INVALID_ATTACHMENT);
      }
    }

    const reason = DISPUTE_MOTIFS[input.motif].label;
    const evidencePhotos = (input.attachments ?? [])
      .filter((a) => a.kind === 'photo')
      .map((a) => a.path);

    const firstMessages: CreateDisputeFirstMessage[] = [
      {
        space: side,
        senderUserId: userId,
        body: input.description,
      },
    ];

    for (const att of input.attachments ?? []) {
      if (att.kind === 'photo') {
        firstMessages.push({
          space: side,
          senderUserId: userId,
          body: '',
          photoPath: att.path,
          documentPath: null,
          documentName: null,
          documentSizeBytes: null,
        });
      } else {
        firstMessages.push({
          space: side,
          senderUserId: userId,
          body: '',
          photoPath: null,
          documentPath: att.path,
          documentName: cleanDocumentName(att.name),
          documentSizeBytes: att.sizeBytes ?? null,
        });
      }
    }

    const dispute = await this.prisma.$transaction(async (tx) => {
      const cas = await tx.commande.updateMany({
        where: {
          id: commandeId,
          status: 'PAID',
          stripeTransferId: null,
          disputedAt: null,
        },
        data: {
          disputedAt: new Date(),
        },
      });

      if (cas.count === 0) {
        throw new AppException('CONFLICT', STATE_CHANGED);
      }

      return createDispute(tx, {
        commandeId,
        initiator: side,
        openedByUserId: userId,
        motif: input.motif,
        reason,
        description: input.description,
        evidencePhotos,
        firstMessages,
        closedByUserId: userId,
      });
    });

    await this.announcer.announce(commandeId, 'DISPUTE_OPENED', null, { openerUserId: userId });

    // F7: a party opening a dispute is the first thing the admin bell is for.
    await this.alerts?.raise({
      type: 'DISPUTE_NEW',
      title: `Nouveau litige ${formatDisputeRef(dispute.number)}`,
      message: `Un ${side === 'CLIENT' ? 'client' : 'réparateur'} a ouvert un litige sur la commande ${orderNumberFor(commandeId)} : ${reason}`,
      targetType: 'Dispute',
      targetId: dispute.id,
      link: `/litiges?disputeId=${dispute.id}`,
      metadata: { commandeId, initiator: side },
    });

    return {
      number: dispute.number,
      reference: formatDisputeRef(dispute.number),
    };
  }

  async get(userId: string, commandeId: string): Promise<PartyDisputeDto> {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: { dispute: true },
    });

    if (!commande || (commande.clientUserId !== userId && commande.repairerUserId !== userId)) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }
    if (!commande.dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const side: DisputeSide = commande.clientUserId === userId ? 'CLIENT' : 'REPAIRER';

    const messages = await this.prisma.disputeMessage.findMany({
      where: {
        disputeId: commande.dispute.id,
        space: side,
      },
      orderBy: { createdAt: 'asc' },
    });

    const photoPaths = messages.map((m) => m.photoPath).filter((p): p is string => Boolean(p));
    const documentPaths = messages.map((m) => m.documentPath).filter((p): p is string => Boolean(p));
    const signed = await signAttachmentUrls({ photo: photoPaths, document: documentPaths });

    const openedBySide: 'CLIENT' | 'REPAIRER' | 'REVIME' =
      commande.dispute.initiator === 'CLIENT'
        ? 'CLIENT'
        : commande.dispute.initiator === 'REPAIRER'
          ? 'REPAIRER'
          : 'REVIME';

    const canWrite = ['OPEN', 'IN_REVIEW'].includes(commande.dispute.status);

    const motifLabel = commande.dispute.motif
      ? (DISPUTE_MOTIFS[commande.dispute.motif]?.label ?? null)
      : (commande.dispute.reason ?? null);

    return {
      number: commande.dispute.number,
      reference: formatDisputeRef(commande.dispute.number),
      status: commande.dispute.status,
      motifLabel,
      openedAt: commande.dispute.createdAt.toISOString(),
      openedBySide,
      canWrite,
      messages: messages.map((m) => ({
        id: m.id,
        author: m.author === 'PARTY' ? 'me' : 'revime',
        body: m.body,
        photoUrl: m.photoPath ? (signed.get(m.photoPath) ?? null) : null,
        document: m.documentPath
          ? {
              url: signed.get(m.documentPath) ?? '',
              name: m.documentName ?? 'document.pdf',
              sizeBytes: m.documentSizeBytes ?? null,
            }
          : null,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async send(
    userId: string,
    commandeId: string,
    input: SendDisputeMessageInput,
  ): Promise<DisputeMessageDto> {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: { dispute: true },
    });

    if (!commande || (commande.clientUserId !== userId && commande.repairerUserId !== userId)) {
      this.logger.warn(`[send] Commande not found or user not participant: commandeId=${commandeId} userId=${userId}`);
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }
    if (!commande.dispute) {
      this.logger.warn(`[send] No dispute on commande: commandeId=${commandeId}`);
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (!['OPEN', 'IN_REVIEW'].includes(commande.dispute.status)) {
      this.logger.warn(`[send] Dispute not open: disputeId=${commande.dispute.id} status=${commande.dispute.status}`);
      throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_CLOSED);
    }

    await checkDisputeMessageLimit(this.prisma, userId);

    const side: DisputeSide = commande.clientUserId === userId ? 'CLIENT' : 'REPAIRER';

    if (
      input.attachment &&
      !checkDisputeAttachment(input.attachment.path, commandeId, side, input.attachment.kind)
    ) {
      this.logger.warn(`[send] Invalid attachment: path=${input.attachment.path} commandeId=${commandeId}`);
      throw new AppException('UNPROCESSABLE_ENTITY', INVALID_ATTACHMENT);
    }

    const photoPath = input.attachment?.kind === 'photo' ? input.attachment.path : null;
    const documentPath = input.attachment?.kind === 'document' ? input.attachment.path : null;
    const documentName = documentPath ? cleanDocumentName(input.attachment?.name) : null;
    const documentSizeBytes = documentPath ? (input.attachment?.sizeBytes ?? null) : null;

    const message = await this.prisma.disputeMessage.create({
      data: {
        disputeId: commande.dispute.id,
        space: side,
        author: 'PARTY',
        senderUserId: userId,
        body: input.body ?? '',
        photoPath,
        documentPath,
        documentName,
        documentSizeBytes,
      },
    });

    this.logger.log(
      `[send] Saved disputeMessage: id=${message.id} disputeId=${commande.dispute.id} space=${side} author=PARTY`,
    );

    let photoUrl: string | null = null;
    let document: DocumentDto | null = null;

    if (message.photoPath || message.documentPath) {
      const signed = await signAttachmentUrls({
        photo: message.photoPath ? [message.photoPath] : [],
        document: message.documentPath ? [message.documentPath] : [],
      });
      if (message.photoPath) photoUrl = signed.get(message.photoPath) ?? null;
      if (message.documentPath) {
        document = {
          url: signed.get(message.documentPath) ?? '',
          name: message.documentName ?? 'document.pdf',
          sizeBytes: message.documentSizeBytes ?? null,
        };
      }
    }

    return {
      id: message.id,
      author: 'me',
      body: message.body,
      photoUrl,
      document,
      createdAt: message.createdAt.toISOString(),
    };
  }

  async markRead(userId: string, commandeId: string): Promise<void> {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
      include: { dispute: true },
    });

    if (!commande || (commande.clientUserId !== userId && commande.repairerUserId !== userId)) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }
    if (!commande.dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const side: DisputeSide = commande.clientUserId === userId ? 'CLIENT' : 'REPAIRER';
    const field = side === 'CLIENT' ? 'clientLastReadAt' : 'repairerLastReadAt';

    await this.prisma.dispute.update({
      where: { id: commande.dispute.id },
      data: { [field]: new Date() },
    });
  }

  async signUpload(
    userId: string,
    commandeId: string,
    input: SignAttachmentInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    const commande = await this.prisma.commande.findUnique({
      where: { id: commandeId },
    });

    if (!commande || (commande.clientUserId !== userId && commande.repairerUserId !== userId)) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const side: DisputeSide = commande.clientUserId === userId ? 'CLIENT' : 'REPAIRER';
    const path = disputeAttachmentPath(commandeId, side, input.contentType);
    const ext = attachmentExtension(input.contentType);
    const bucket = bucketFor(ext);
    const { uploadUrl } = await storageGateway().createSignedUpload(path, input.contentType, bucket);

    return { path, uploadUrl };
  }
}
