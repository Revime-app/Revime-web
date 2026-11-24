import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PushService, type PushDispatchInput } from '../src/push/push.service.js';
import { __resetPushSender, fakePush, soundFor } from '../src/push/sender.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

describe('Push Sound & Android Channel (CF4-36)', () => {
  describe('soundFor', () => {
    it('revime-v2 tokens get the sound and channel of the notification type', () => {
      expect(soundFor('revime-v2', 'OFFER_RECEIVED')).toEqual({
        sound: 'revime_offre_recue.wav',
        channelId: 'revime_offre_recue',
      });
      expect(soundFor('revime-v2', 'DISPUTE_MESSAGE')).toEqual({
        sound: 'revime_litige.wav',
        channelId: 'revime_litige',
      });
      expect(soundFor('revime-v2', 'MESSAGE_RECEIVED')).toEqual({
        sound: 'revime_message.wav',
        channelId: 'revime_message',
      });
      expect(soundFor('revime-v2', 'COMMANDE_STEP')).toEqual({
        sound: 'revime_notification.wav',
        channelId: 'revime_notification',
      });
    });

    it('revime tokens (builds 20-23) keep the placeholder whatever the type', () => {
      expect(soundFor('revime', 'OFFER_RECEIVED')).toEqual({
        sound: 'revime.wav',
        channelId: 'revime',
      });
      expect(soundFor('revime', 'DISPUTE_OPENED')).toEqual({
        sound: 'revime.wav',
        channelId: 'revime',
      });
    });

    it('returns default and default channel for null or unflagged token', () => {
      expect(soundFor(null, 'OFFER_RECEIVED')).toEqual({
        sound: 'default',
        channelId: 'default',
      });
      expect(soundFor(undefined, 'OFFER_RECEIVED')).toEqual({
        sound: 'default',
        channelId: 'default',
      });
      expect(soundFor('other', 'OFFER_RECEIVED')).toEqual({
        sound: 'default',
        channelId: 'default',
      });
    });
  });

  describe('PushService.register soundChannel', () => {
    let mockPrisma: any;
    let service: PushService;

    beforeEach(() => {
      mockPrisma = {
        pushToken: {
          upsert: vi.fn().mockResolvedValue({ id: 'tok-1' }),
        },
      };
      service = new PushService(mockPrisma as any);
    });

    it('upserts soundChannel: "revime" on create and update when sound is revime', async () => {
      await service.register('user-1', {
        token: 'ExponentPushToken[flagged]',
        platform: 'ANDROID',
        sound: 'revime',
      });

      expect(mockPrisma.pushToken.upsert).toHaveBeenCalledOnce();
      const call = mockPrisma.pushToken.upsert.mock.calls[0]![0];
      expect(call.where).toEqual({ token: 'ExponentPushToken[flagged]' });
      expect(call.create).toMatchObject({
        userId: 'user-1',
        token: 'ExponentPushToken[flagged]',
        platform: 'ANDROID',
        soundChannel: 'revime',
      });
      expect(call.update).toMatchObject({
        userId: 'user-1',
        platform: 'ANDROID',
        soundChannel: 'revime',
        disabledAt: null,
      });
    });

    it('upserts soundChannel: "revime-v2" when sound is revime-v2', async () => {
      await service.register('user-1', {
        token: 'ExponentPushToken[v2]',
        platform: 'IOS',
        sound: 'revime-v2',
      });
      const call = mockPrisma.pushToken.upsert.mock.calls[0]![0];
      expect(call.create).toMatchObject({ soundChannel: 'revime-v2' });
      expect(call.update).toMatchObject({ soundChannel: 'revime-v2' });
    });

    it('upserts soundChannel: null on create and update when sound is omitted', async () => {
      await service.register('user-1', {
        token: 'ExponentPushToken[unflagged]',
        platform: 'IOS',
      });

      expect(mockPrisma.pushToken.upsert).toHaveBeenCalledOnce();
      const call = mockPrisma.pushToken.upsert.mock.calls[0]![0];
      expect(call.create).toMatchObject({
        userId: 'user-1',
        token: 'ExponentPushToken[unflagged]',
        platform: 'IOS',
        soundChannel: null,
      });
      expect(call.update).toMatchObject({
        userId: 'user-1',
        platform: 'IOS',
        soundChannel: null,
        disabledAt: null,
      });
    });
  });

  describe('PushService.dispatch sound and channel selection per token', () => {
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

    it('gives each token the sound its build bundles, in one dispatch', async () => {
      const pushPrisma: any = {
        pushToken: {
          findMany: vi.fn().mockResolvedValue([
            { id: 't1', token: 'ExponentPushToken[v2]', soundChannel: 'revime-v2' },
            { id: 't2', token: 'ExponentPushToken[flagged]', soundChannel: 'revime' },
            { id: 't3', token: 'ExponentPushToken[legacy]', soundChannel: null },
          ]),
          updateMany: vi.fn(),
        },
        pushTicket: { createMany: vi.fn().mockResolvedValue({ count: 3 }) },
      };

      await new PushService(pushPrisma).dispatch({ ...input, type: 'OFFER_ACCEPTED' });

      const messages = fakePush.calls[0]!;
      expect(messages.map((m) => [m.to, m.sound, m.channelId])).toEqual([
        ['ExponentPushToken[v2]', 'revime_offre_acceptee.wav', 'revime_offre_acceptee'],
        ['ExponentPushToken[flagged]', 'revime.wav', 'revime'],
        ['ExponentPushToken[legacy]', 'default', 'default'],
      ]);
    });

    it('selects revime.wav/revime for flagged tokens and default/default for others', async () => {
      const pushPrisma: any = {
        pushToken: {
          findMany: vi.fn().mockResolvedValue([
            { id: 't1', token: 'ExponentPushToken[flagged]', soundChannel: 'revime' },
            { id: 't2', token: 'ExponentPushToken[legacy]', soundChannel: null },
          ]),
          updateMany: vi.fn(),
        },
        pushTicket: {
          createMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      const pushService = new PushService(pushPrisma);
      await pushService.dispatch(input);

      expect(fakePush.calls).toHaveLength(1);
      const messages = fakePush.calls[0]!;
      expect(messages).toHaveLength(2);

      expect(messages[0]).toMatchObject({
        to: 'ExponentPushToken[flagged]',
        sound: 'revime.wav',
        channelId: 'revime',
      });

      expect(messages[1]).toMatchObject({
        to: 'ExponentPushToken[legacy]',
        sound: 'default',
        channelId: 'default',
      });
    });
  });
});
