import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * `CF4-35`. Server-computed app icon badge.
 * Spec: docs/superpowers/specs/2026-10-01-cf4-jk-disputes-push-design.md §4.8
 *
 * count = unread messages across user's conversations (USER not from user, SYSTEM, SUPPORT)
 *       + REVIME dispute messages in user's own spaces newer than dispute read marker
 *       + unread notifications of every type except MESSAGE_RECEIVED (both modes)
 */
@Injectable()
export class BadgeService {
  constructor(private readonly prisma: PrismaService) {}

  async countFor(userId: string): Promise<number> {
    const [conversationCount, disputeCount, notificationCount] = await Promise.all([
      this.countConversationUnread(userId),
      this.countDisputeUnread(userId),
      this.countNotificationUnread(userId),
    ]);

    return conversationCount + disputeCount + notificationCount;
  }

  private async countConversationUnread(userId: string): Promise<number> {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        deletedAt: null,
        OR: [{ clientUserId: userId }, { repairerUserId: userId }],
      },
      select: {
        id: true,
        clientUserId: true,
        clientLastReadAt: true,
        repairerLastReadAt: true,
      },
    });

    if (conversations.length === 0) return 0;

    return this.prisma.message.count({
      where: {
        deletedAt: null,
        AND: [
          {
            OR: [
              { senderUserId: null },
              { senderUserId: { not: userId } },
            ],
          },
          {
            OR: conversations.map((c) => ({
              conversationId: c.id,
              createdAt: {
                gt:
                  (c.clientUserId === userId ? c.clientLastReadAt : c.repairerLastReadAt) ??
                  new Date(0),
              },
            })),
          },
        ],
      },
    });
  }

  private async countDisputeUnread(userId: string): Promise<number> {
    const disputes = await this.prisma.dispute.findMany({
      where: {
        commande: {
          OR: [{ clientUserId: userId }, { repairerUserId: userId }],
        },
      },
      select: {
        id: true,
        clientLastReadAt: true,
        repairerLastReadAt: true,
        commande: {
          select: {
            clientUserId: true,
            repairerUserId: true,
          },
        },
      },
    });

    if (disputes.length === 0) return 0;

    return this.prisma.disputeMessage.count({
      where: {
        deletedAt: null,
        author: 'REVIME',
        OR: disputes.map((d) => {
          const isClient = d.commande.clientUserId === userId;
          const space = isClient ? ('CLIENT' as const) : ('REPAIRER' as const);
          const marker =
            (isClient ? d.clientLastReadAt : d.repairerLastReadAt) ?? new Date(0);
          return {
            disputeId: d.id,
            space,
            createdAt: { gt: marker },
          };
        }),
      },
    });
  }

  private async countNotificationUnread(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId,
        readAt: null,
        type: { not: 'MESSAGE_RECEIVED' },
      },
    });
  }
}
