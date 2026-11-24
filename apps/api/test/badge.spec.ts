import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadgeService } from '../src/push/badge.service.js';
import { PushService, type PushDispatchInput } from '../src/push/push.service.js';
import { __resetPushSender, fakePush } from '../src/push/sender.js';
import { NotificationsController } from '../src/notifications/notifications.controller.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

describe('BadgeService (CF4-35)', () => {
  const userId = 'user-alice-1';

  let mockPrisma: any;
  let badgeService: BadgeService;

  beforeEach(() => {
    mockPrisma = {
      conversation: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        count: vi.fn().mockResolvedValue(0),
      },
      dispute: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      disputeMessage: {
        count: vi.fn().mockResolvedValue(0),
      },
      notification: {
        count: vi.fn().mockResolvedValue(0),
      },
    };

    badgeService = new BadgeService(mockPrisma as any);
  });

  describe('countFor', () => {
    it('returns 0 when there are no unread items anywhere', async () => {
      const count = await badgeService.countFor(userId);
      expect(count).toBe(0);
      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
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
      expect(mockPrisma.dispute.findMany).toHaveBeenCalledWith({
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
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId,
          readAt: null,
          type: { not: 'MESSAGE_RECEIVED' },
        },
      });
    });

    it('counts conversation unread messages (USER from counterpart, SYSTEM, SUPPORT) newer than read marker', async () => {
      const convMarker = new Date('2026-10-01T10:00:00Z');
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          clientUserId: userId,
          clientLastReadAt: convMarker,
          repairerLastReadAt: null,
        },
      ]);
      mockPrisma.message.count.mockResolvedValue(3);

      const count = await badgeService.countFor(userId);
      expect(count).toBe(3);

      expect(mockPrisma.message.count).toHaveBeenCalledWith({
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
              OR: [
                {
                  conversationId: 'conv-1',
                  createdAt: { gt: convMarker },
                },
              ],
            },
          ],
        },
      });
    });

    it('uses repairerLastReadAt when the user is the repairer in a conversation', async () => {
      const repairerMarker = new Date('2026-10-01T12:00:00Z');
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-2',
          clientUserId: 'other-user',
          clientLastReadAt: null,
          repairerLastReadAt: repairerMarker,
        },
      ]);
      mockPrisma.message.count.mockResolvedValue(1);

      const count = await badgeService.countFor(userId);
      expect(count).toBe(1);

      expect(mockPrisma.message.count).toHaveBeenCalledWith({
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
              OR: [
                {
                  conversationId: 'conv-2',
                  createdAt: { gt: repairerMarker },
                },
              ],
            },
          ],
        },
      });
    });

    it('counts REVIME dispute messages in the user space newer than the dispute marker', async () => {
      const disputeMarker = new Date('2026-10-01T09:00:00Z');
      mockPrisma.dispute.findMany.mockResolvedValue([
        {
          id: 'disp-1',
          clientLastReadAt: disputeMarker,
          repairerLastReadAt: null,
          commande: {
            clientUserId: userId,
            repairerUserId: 'other-user',
          },
        },
      ]);
      mockPrisma.disputeMessage.count.mockResolvedValue(2);

      const count = await badgeService.countFor(userId);
      expect(count).toBe(2);

      expect(mockPrisma.disputeMessage.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          author: 'REVIME',
          OR: [
            {
              disputeId: 'disp-1',
              space: 'CLIENT',
              createdAt: { gt: disputeMarker },
            },
          ],
        },
      });
    });

    it('targets REPAIRER space with repairerLastReadAt when user is the repairer', async () => {
      const disputeMarker = new Date('2026-10-01T11:00:00Z');
      mockPrisma.dispute.findMany.mockResolvedValue([
        {
          id: 'disp-2',
          clientLastReadAt: null,
          repairerLastReadAt: disputeMarker,
          commande: {
            clientUserId: 'other-user',
            repairerUserId: userId,
          },
        },
      ]);
      mockPrisma.disputeMessage.count.mockResolvedValue(1);

      const count = await badgeService.countFor(userId);
      expect(count).toBe(1);

      expect(mockPrisma.disputeMessage.count).toHaveBeenCalledWith({
        where: {
          deletedAt: null,
          author: 'REVIME',
          OR: [
            {
              disputeId: 'disp-2',
              space: 'REPAIRER',
              createdAt: { gt: disputeMarker },
            },
          ],
        },
      });
    });

    it('counts unread notifications excluding MESSAGE_RECEIVED without mode filter', async () => {
      mockPrisma.notification.count.mockResolvedValue(4);

      const count = await badgeService.countFor(userId);
      expect(count).toBe(4);

      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          userId,
          readAt: null,
          type: { not: 'MESSAGE_RECEIVED' },
        },
      });
    });

    it('sums conversation unread + dispute unread + notification unread', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        {
          id: 'conv-1',
          clientUserId: userId,
          clientLastReadAt: new Date(0),
          repairerLastReadAt: null,
        },
      ]);
      mockPrisma.message.count.mockResolvedValue(2);

      mockPrisma.dispute.findMany.mockResolvedValue([
        {
          id: 'disp-1',
          clientLastReadAt: new Date(0),
          repairerLastReadAt: null,
          commande: {
            clientUserId: userId,
            repairerUserId: 'other-user',
          },
        },
      ]);
      mockPrisma.disputeMessage.count.mockResolvedValue(1);

      mockPrisma.notification.count.mockResolvedValue(3);

      const total = await badgeService.countFor(userId);
      expect(total).toBe(6); // 2 + 1 + 3
    });
  });

  describe('PushService.dispatch badge integration', () => {
    const input: PushDispatchInput = {
      userId: 'u1',
      notificationId: 'n1',
      mode: 'CLIENT',
      type: 'OFFER_RECEIVED',
      actorName: 'FixLab',
      subject: 'Écran iPhone',
      amountCents: 6500,
      step: null,
      messagePreview: null,
      demandeId: 'd1',
      commandeId: null,
      conversationId: null,
    };

    beforeEach(() => {
      process.env.PUSH_DRIVER = 'fake';
      __resetPushSender();
      fakePush.reset();
    });

    it('computes countFor once and attaches badge to all recipient tokens', async () => {
      const mockBadge = {
        countFor: vi.fn().mockResolvedValue(5),
      };
      const pushPrisma: any = {
        pushToken: {
          findMany: vi.fn().mockResolvedValue([
            { id: 't1', token: 'ExponentPushToken[aaa]' },
            { id: 't2', token: 'ExponentPushToken[bbb]' },
          ]),
          updateMany: vi.fn(),
        },
        pushTicket: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      const pushService = new PushService(pushPrisma, mockBadge as any);
      await pushService.dispatch(input);

      expect(mockBadge.countFor).toHaveBeenCalledTimes(1);
      expect(mockBadge.countFor).toHaveBeenCalledWith('u1');

      expect(fakePush.calls).toHaveLength(1);
      expect(fakePush.calls[0]!).toHaveLength(2);
      expect(fakePush.calls[0]![0]!.badge).toBe(5);
      expect(fakePush.calls[0]![1]!.badge).toBe(5);
    });

    it('still sends the push without badge when countFor fails', async () => {
      const mockBadge = {
        countFor: vi.fn().mockRejectedValue(new Error('DB failure')),
      };
      const pushPrisma: any = {
        pushToken: {
          findMany: vi.fn().mockResolvedValue([
            { id: 't1', token: 'ExponentPushToken[aaa]' },
          ]),
          updateMany: vi.fn(),
        },
        pushTicket: {
          createMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      };

      const pushService = new PushService(pushPrisma, mockBadge as any);
      await pushService.dispatch(input);

      expect(fakePush.calls).toHaveLength(1);
      expect(fakePush.calls[0]![0]!.badge).toBeUndefined();
    });
  });

  describe('NotificationsController GET me/badge', () => {
    it('returns { count } from BadgeService', async () => {
      const mockNotificationsService: any = {};
      const mockPushService: any = {};
      const mockBadgeService: any = {
        countFor: vi.fn().mockResolvedValue(7),
      };

      const controller = new NotificationsController(
        mockNotificationsService,
        mockPushService,
        mockBadgeService,
      );

      const session: any = { user: { id: 'user-bob-42' } };
      const res = await controller.badge(session);

      expect(res).toEqual({ count: 7 });
      expect(mockBadgeService.countFor).toHaveBeenCalledWith('user-bob-42');
    });
  });
});
