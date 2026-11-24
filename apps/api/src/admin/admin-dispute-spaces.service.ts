import { Injectable } from '@nestjs/common';
import type {
  AdminDisputeMessageInput,
  AdminDisputeSpaceMessage,
  AdminDisputeSpacesDto,
  SignAttachmentInput,
} from '@revime/shared';
import { SUPPORT_PREFIX } from '@revime/shared';
import { AppException } from '../common/app-exception.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  attachmentExtension,
  bucketFor,
  checkConversationAttachment,
  checkDisputeAttachment,
  cleanDocumentName,
  conversationAttachmentPath,
  disputeAttachmentPath,
  signAttachmentUrls,
} from '../storage/attachment-paths.js';
import { storageGateway } from '../storage/gateway.js';

const NOT_FOUND = 'Litige introuvable.';
const CONVERSATION_NOT_FOUND = 'Conversation introuvable.';
const DISPUTE_CLOSED = 'Ce litige est clos.';
const INVALID_ATTACHMENT = 'Pièce jointe invalide.';

/**
 * CF5-03. The order's main conversation is the demande's conversation with THIS order's
 * réparateur (Commande has no direct `conversation` relation). Never fall back to another
 * conversation: on a demande with several réparateurs that would post REVIME's message, and
 * its attachment, into a chat the order's parties are not part of.
 */
function mainConversationId(commande: {
  repairerUserId: string;
  demande: { conversations: { id: string; repairerUserId: string }[] } | null;
}): string {
  const id = commande.demande?.conversations.find(
    (c) => c.repairerUserId === commande.repairerUserId,
  )?.id;
  if (!id) throw new AppException('NOT_FOUND', CONVERSATION_NOT_FOUND);
  return id;
}

@Injectable()
export class AdminDisputeSpacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async get(disputeId: string): Promise<AdminDisputeSpacesDto> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    const photoPaths = dispute.messages
      .map((m: any) => m.photoPath)
      .filter((p: string | null): p is string => Boolean(p));
    const documentPaths = dispute.messages
      .map((m: any) => m.documentPath)
      .filter((p: string | null): p is string => Boolean(p));

    const signed = await signAttachmentUrls({ photo: photoPaths, document: documentPaths });

    const mapMessage = (m: (typeof dispute.messages)[number]): AdminDisputeSpaceMessage => ({
      id: m.id,
      author: m.author,
      senderUserId: m.senderUserId,
      body: m.body,
      photoUrl: m.photoPath ? (signed.get(m.photoPath) ?? null) : null,
      document: m.documentPath
        ? {
            url: signed.get(m.documentPath) ?? '',
            name: m.documentName ?? 'document.pdf',
            sizeBytes: m.documentSizeBytes ?? null,
          }
        : null,
      createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
    });

    return {
      client: dispute.messages.filter((m: any) => m.space === 'CLIENT').map(mapMessage),
      repairer: dispute.messages.filter((m: any) => m.space === 'REPAIRER').map(mapMessage),
    };
  }

  async post(
    adminUserId: string,
    disputeId: string,
    input: AdminDisputeMessageInput,
  ): Promise<{ ok: true }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        commande: {
          select: {
            id: true,
            clientUserId: true,
            repairerUserId: true,
            demandeId: true,
            status: true,
            step: true,
            totalCents: true,
            demande: {
              select: {
                id: true,
                title: true,
                conversations: {
                  select: { id: true, repairerUserId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    if (input.space === 'CLIENT' || input.space === 'REPAIRER') {
      if (!['OPEN', 'IN_REVIEW'].includes(dispute.status)) {
        throw new AppException('UNPROCESSABLE_ENTITY', DISPUTE_CLOSED);
      }

      if (
        input.attachment &&
        !checkDisputeAttachment(
          input.attachment.path,
          dispute.commandeId,
          input.space,
          input.attachment.kind,
        )
      ) {
        throw new AppException('UNPROCESSABLE_ENTITY', INVALID_ATTACHMENT);
      }

      const photoPath = input.attachment?.kind === 'photo' ? input.attachment.path : null;
      const documentPath = input.attachment?.kind === 'document' ? input.attachment.path : null;
      const documentName = documentPath ? cleanDocumentName(input.attachment?.name) : null;
      const documentSizeBytes = documentPath ? (input.attachment?.sizeBytes ?? null) : null;

      await this.prisma.disputeMessage.create({
        data: {
          disputeId: dispute.id,
          space: input.space,
          author: 'REVIME',
          senderUserId: adminUserId,
          body: input.body,
          photoPath,
          documentPath,
          documentName,
          documentSizeBytes,
        },
      });

      const recipientUserId =
        input.space === 'CLIENT'
          ? dispute.commande.clientUserId
          : dispute.commande.repairerUserId;
      const recipientMode = input.space === 'CLIENT' ? 'CLIENT' : 'REPAIRER';

      await this.notifications.emit({
        userId: recipientUserId,
        mode: recipientMode,
        type: 'DISPUTE_MESSAGE',
        actorName: 'REVIME — Support',
        commandeId: dispute.commandeId,
        demandeId: dispute.commande.demandeId ?? undefined,
        subject: dispute.commande.demande?.title ?? 'Commande',
      });

      return { ok: true };
    }

    // MAIN conversation
    const commande = dispute.commande;
    const conversationId = mainConversationId(commande);

    if (
      input.attachment &&
      !checkConversationAttachment(
        input.attachment.path,
        conversationId,
        input.attachment.kind,
      )
    ) {
      throw new AppException('UNPROCESSABLE_ENTITY', INVALID_ATTACHMENT);
    }

    const photoPath = input.attachment?.kind === 'photo' ? input.attachment.path : null;
    const documentPath = input.attachment?.kind === 'document' ? input.attachment.path : null;
    const documentName = documentPath ? cleanDocumentName(input.attachment?.name) : null;
    const documentSizeBytes = documentPath ? (input.attachment?.sizeBytes ?? null) : null;

    const storedBody = SUPPORT_PREFIX + input.body;

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        kind: 'SUPPORT',
        senderUserId: null,
        body: storedBody,
        photoPath,
        documentPath,
        documentName,
        documentSizeBytes,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });

    const messagePreview =
      input.body ||
      (photoPath ? '📷 Photo' : '') ||
      (documentPath ? '📄 Document' : '');

    await this.notifications.emit({
      userId: dispute.commande.clientUserId,
      mode: 'CLIENT',
      type: 'MESSAGE_RECEIVED',
      actorName: 'REVIME — Support',
      conversationId,
      messageId: message.id,
      commandeId: dispute.commandeId,
      demandeId: dispute.commande.demandeId ?? undefined,
      subject: dispute.commande.demande?.title ?? 'Commande',
      messagePreview,
    });

    await this.notifications.emit({
      userId: dispute.commande.repairerUserId,
      mode: 'REPAIRER',
      type: 'MESSAGE_RECEIVED',
      actorName: 'REVIME — Support',
      conversationId,
      messageId: message.id,
      commandeId: dispute.commandeId,
      demandeId: dispute.commande.demandeId ?? undefined,
      subject: dispute.commande.demande?.title ?? 'Commande',
      messagePreview,
    });

    return { ok: true };
  }

  async signUpload(
    disputeId: string,
    space: 'MAIN' | 'CLIENT' | 'REPAIRER',
    input: SignAttachmentInput,
  ): Promise<{ path: string; uploadUrl: string }> {
    const dispute = await this.prisma.dispute.findUnique({
      where: { id: disputeId },
      include: {
        commande: {
          select: {
            id: true,
            clientUserId: true,
            repairerUserId: true,
            demandeId: true,
            demande: {
              select: {
                id: true,
                title: true,
                conversations: {
                  select: { id: true, repairerUserId: true },
                },
              },
            },
          },
        },
      },
    });

    if (!dispute) {
      throw new AppException('NOT_FOUND', NOT_FOUND);
    }

    let path: string;
    if (space === 'MAIN') {
      const conversationId = mainConversationId(dispute.commande);
      path = conversationAttachmentPath(conversationId, input.contentType);
    } else {
      path = disputeAttachmentPath(dispute.commandeId, space, input.contentType);
    }

    const ext = attachmentExtension(input.contentType);
    const bucket = bucketFor(ext);
    const { uploadUrl } = await storageGateway().createSignedUpload(
      path,
      input.contentType,
      bucket,
    );

    return { path, uploadUrl };
  }
}
