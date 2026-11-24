import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ADMIN_AUDIT_ACTIONS } from '@revime/shared';
import {
  AdminCommunicationsService,
  needsMarketingConsent,
} from '../src/admin/admin-communications.service.js';
import { AdminCommunicationsController } from '../src/admin/admin-communications.controller.js';
import { AUDIT_KEY } from '../src/admin/admin-audit.decorator.js';

const mailSend = vi.hoisted(() => vi.fn());
vi.mock('../src/mail/mail.service.js', () => ({ mailSender: () => ({ send: mailSend }) }));

/** A recipient shaped like the service's real select, opted in to nothing unless told. */
const recipient = (over: Record<string, unknown> = {}): any => ({
  id: 'u1',
  name: 'Sophie Martin',
  email: 'sophie@example.com',
  marketingConsent: false,
  marketingConsentEmail: false,
  repairerProfile: null,
  pushTokens: [{ id: 'pt1', disabledAt: null }],
  ...over,
});
const SEGMENT_ALL = { type: 'SEGMENT' as const, role: 'ALL' as const, verifiedOnly: false, activeOnly: true };

describe('AdminCommunicationsService', () => {
  let service: AdminCommunicationsService;
  let mockPrisma: any;
  let mockPush: any;

  beforeEach(() => {
    mockPrisma = {
      user: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
      },
      pushToken: {
        findMany: vi.fn(),
      },
      adminBroadcast: {
        create: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
    };
    mockPush = {
      dispatch: vi.fn().mockResolvedValue(1),
    };
    mailSend.mockReset();
    mailSend.mockResolvedValue(undefined);
    service = new AdminCommunicationsService(mockPrisma as any, mockPush as any);
  });

  describe('previewAudience', () => {
    it('calculates audience count and channel availability for segment filter', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'u1',
          name: 'Alice Client',
          email: 'alice@test.com',
          city: 'Lyon',
          clientProfile: { id: 'cp1' },
          repairerProfile: null,
          pushTokens: [{ id: 'pt1', disabledAt: null }],
        },
        {
          id: 'u2',
          name: 'Bob Reparateur',
          email: 'bob@test.com',
          city: 'Lyon',
          clientProfile: null,
          repairerProfile: { id: 'rp1' },
          pushTokens: [],
        },
      ]);

      const result = await service.previewAudience({
        type: 'SEGMENT',
        role: 'ALL',
        city: 'Lyon',
        verifiedOnly: false,
        activeOnly: true,
      });

      expect(result.totalRecipients).toBe(2);
      expect(result.emailEligibleCount).toBe(2);
      expect(result.pushEligibleCount).toBe(1);
      expect(result.sampleRecipients.length).toBe(2);
      expect(result.sampleRecipients[0]?.name).toBe('Alice Client');
    });

    it('calculates audience for individual recipient', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: '2c53de51-b157-430a-9d90-349f481a539b',
        name: 'Claire Dupont',
        email: 'claire@test.com',
        repairerProfile: null,
        pushTokens: [{ id: 'pt2', disabledAt: null }],
      });

      const result = await service.previewAudience({
        type: 'INDIVIDUAL',
        userId: '2c53de51-b157-430a-9d90-349f481a539b',
      });

      expect(result.totalRecipients).toBe(1);
      expect(result.emailEligibleCount).toBe(1);
      expect(result.pushEligibleCount).toBe(1);
      expect(result.sampleRecipients[0]?.email).toBe('claire@test.com');
    });

    it('handles non-existent individual recipient safely', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const result = await service.previewAudience({
        type: 'INDIVIDUAL',
        userId: '2c53de51-b157-430a-9d90-349f481a539b',
      });

      expect(result.totalRecipients).toBe(0);
      expect(result.emailEligibleCount).toBe(0);
      expect(result.pushEligibleCount).toBe(0);
      expect(result.sampleRecipients).toEqual([]);
    });
  });

  describe('getHistory', () => {
    it('returns formatted paginated broadcast history', async () => {
      mockPrisma.adminBroadcast.findMany.mockResolvedValue([
        {
          id: 'b1',
          subject: 'Alerte forte demande',
          channelEmail: true,
          channelPush: true,
          targetType: 'SEGMENT',
          targetFilter: { role: 'REPAIRER', city: 'Lyon' },
          totalRecipients: 42,
          sentEmailCount: 42,
          sentPushCount: 38,
          createdAt: new Date('2026-10-16T10:00:00Z'),
          operator: { name: 'Admin Pierre' },
        },
      ]);
      mockPrisma.adminBroadcast.count.mockResolvedValue(1);

      const history = await service.getHistory(1, 10);
      expect(history.total).toBe(1);
      expect(history.items[0]?.subject).toBe('Alerte forte demande');
      expect(history.items[0]?.operatorName).toBe('Admin Pierre');
      expect(history.items[0]?.targetSummary).toContain('Réparateurs');
    });
  });

  describe('sendBroadcast', () => {
    beforeEach(() => {
      mockPrisma.adminBroadcast.create.mockResolvedValue({ id: 'b-new' });
    });

    it('interpolates variables per recipient and dispatches emails and push notifications', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        recipient({ marketingConsent: true, marketingConsentEmail: true }),
      ]);

      const result = await service.sendBroadcast('op-1', {
        target: { ...SEGMENT_ALL, role: 'CLIENT' },
        channels: { email: true, push: true },
        templateKey: 'ANNOUNCEMENT',
        subject: 'Offre spéciale à {{ville}}',
        body: 'Bonjour {{prenom}}, profitez des réparations à {{ville}}.',
      });

      expect(result).toMatchObject({ success: true, sentEmailCount: 1, sentPushCount: 1, skippedNoConsentCount: 0 });
      expect(mailSend).toHaveBeenCalledWith({
        to: 'sophie@example.com',
        subject: 'Offre spéciale à votre secteur',
        text: 'Bonjour Sophie, profitez des réparations à votre secteur.',
      });
      expect(mockPrisma.adminBroadcast.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ operatorId: 'op-1', totalRecipients: 1, sentEmailCount: 1, sentPushCount: 1 }),
        }),
      );
    });

    it('interpolates variables accurately with fallback values', () => {
      const text = 'Bonjour {{prenom}} {{nom}}, bienvenue à {{ville}} !';
      expect(service.interpolateVariables(text, { name: 'Jean Dupont', city: 'Paris', role: 'CLIENT' })).toBe(
        'Bonjour Jean Dupont, bienvenue à Paris !',
      );
      expect(service.interpolateVariables(text, { name: null, city: null, role: 'REPAIRER' })).toBe(
        'Bonjour réparateur , bienvenue à votre secteur !',
      );
    });

    it('puts the subject first in the push text, the only line the phone shows (RU-24)', async () => {
      mockPrisma.user.findMany.mockResolvedValue([recipient({ marketingConsent: true })]);
      await service.sendBroadcast('op-1', {
        target: SEGMENT_ALL,
        channels: { email: false, push: true },
        templateKey: 'ANNOUNCEMENT',
        subject: 'Maintenance ce soir',
        body: 'Le service sera coupé de 22h à 23h.',
      });
      expect(mockPush.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'u1',
          mode: 'CLIENT',
          messagePreview: 'Maintenance ce soir : Le service sera coupé de 22h à 23h.',
        }),
      );
    });

    describe('marketing consent (CNIL / RGPD)', () => {
      const users = () => [
        recipient({ id: 'yes', email: 'yes@x.fr', marketingConsent: true, marketingConsentEmail: true }),
        recipient({ id: 'no', email: 'no@x.fr', marketingConsent: false, marketingConsentEmail: false }),
        recipient({ id: 'emailonly', email: 'eo@x.fr', marketingConsent: false, marketingConsentEmail: true }),
      ];

      it('sends a commercial template only to users who opted in, per channel', async () => {
        mockPrisma.user.findMany.mockResolvedValue(users());
        const r = await service.sendBroadcast('op-1', {
          target: SEGMENT_ALL,
          channels: { email: true, push: true },
          templateKey: 'ANNOUNCEMENT',
          subject: 'Nouveauté',
          body: 'Découvrez notre nouveauté.',
        });
        expect(mailSend.mock.calls.map((c: any[]) => c[0].to).sort()).toEqual(['eo@x.fr', 'yes@x.fr']);
        expect(mockPush.dispatch.mock.calls.map((c: any[]) => c[0].userId)).toEqual(['yes']);
        expect(r.sentEmailCount).toBe(2);
        expect(r.sentPushCount).toBe(1);
        expect(r.skippedNoConsentCount).toBe(2);
        expect(r.totalRecipients).toBe(3);
      });

      it('counts the members left out of an e-mail-only send', async () => {
        mockPrisma.user.findMany.mockResolvedValue(users());
        const r = await service.sendBroadcast('op-1', {
          target: SEGMENT_ALL,
          channels: { email: true, push: false },
          templateKey: 'ANNOUNCEMENT',
          subject: 'Nouveauté',
          body: 'Découvrez notre nouveauté.',
        });
        expect(r).toMatchObject({ sentEmailCount: 2, sentPushCount: 0, skippedNoConsentCount: 1 });
      });

      it('counts the members left out of a push-only send', async () => {
        mockPrisma.user.findMany.mockResolvedValue(users());
        const r = await service.sendBroadcast('op-1', {
          target: SEGMENT_ALL,
          channels: { email: false, push: true },
          templateKey: 'ANNOUNCEMENT',
          subject: 'Nouveauté',
          body: 'Découvrez notre nouveauté.',
        });
        expect(r).toMatchObject({ sentEmailCount: 0, sentPushCount: 1, skippedNoConsentCount: 2 });
      });

      it('treats a custom text as commercial too', async () => {
        mockPrisma.user.findMany.mockResolvedValue(users());
        await service.sendBroadcast('op-1', {
          target: SEGMENT_ALL,
          channels: { email: true, push: false },
          templateKey: 'CUSTOM',
          subject: 'Libre',
          body: 'Un texte libre quelconque.',
        });
        expect(mailSend).toHaveBeenCalledTimes(2);
      });

      it.each(['MAINTENANCE', 'VERIFICATION_REMINDER'] as const)(
        'lets the service template %s reach everyone',
        async (templateKey) => {
          mockPrisma.user.findMany.mockResolvedValue(users());
          const r = await service.sendBroadcast('op-1', {
            target: SEGMENT_ALL,
            channels: { email: true, push: true },
            templateKey,
            subject: 'Information',
            body: 'Une information de service.',
          });
          expect(mailSend).toHaveBeenCalledTimes(3);
          expect(r.skippedNoConsentCount).toBe(0);
        },
      );

      it('does not hold a one-to-one message to a named user to the campaign rule', async () => {
        mockPrisma.user.findUnique.mockResolvedValue(recipient({ email: 'solo@x.fr' }));
        const r = await service.sendBroadcast('op-2', {
          target: { type: 'INDIVIDUAL', userId: '2c53de51-b157-430a-9d90-349f481a539b' },
          channels: { email: true, push: false },
          templateKey: 'CUSTOM',
          subject: 'Direct',
          body: 'Bonjour {{prenom}}, un mot pour vous.',
        });
        expect(r).toMatchObject({ totalRecipients: 1, sentEmailCount: 1, skippedNoConsentCount: 0 });
      });

      it('knows which templates need consent', () => {
        const seg = { type: 'SEGMENT' as const, role: 'ALL' as const, verifiedOnly: false, activeOnly: true };
        expect(needsMarketingConsent({ target: seg, templateKey: 'ANNOUNCEMENT' })).toBe(true);
        expect(needsMarketingConsent({ target: seg, templateKey: 'REPAIRER_OPPORTUNITY' })).toBe(true);
        expect(needsMarketingConsent({ target: seg, templateKey: 'MAINTENANCE' })).toBe(false);
        expect(
          needsMarketingConsent({ target: { type: 'INDIVIDUAL', userId: 'x' }, templateKey: 'ANNOUNCEMENT' }),
        ).toBe(false);
      });

      it('counts the opted-in users in the preview', async () => {
        mockPrisma.user.findMany.mockResolvedValue(users());
        const p = await service.previewAudience(SEGMENT_ALL);
        expect(p).toMatchObject({
          totalRecipients: 3,
          emailEligibleCount: 3,
          pushEligibleCount: 3,
          marketingEmailCount: 2,
          marketingPushCount: 1,
        });
      });
    });

    describe('delivery counts', () => {
      it('isolates a recipient failure so one does not abort the others', async () => {
        mockPrisma.user.findMany.mockResolvedValue([
          recipient({ id: 'u1', email: 'u1@x.fr' }),
          recipient({ id: 'u2', email: 'u2@x.fr' }),
        ]);
        mockPush.dispatch.mockImplementation((input: any) =>
          input.userId === 'u1' ? Promise.reject(new Error('boom')) : Promise.resolve(1),
        );
        mailSend.mockImplementation(async (m: any) => {
          if (m.to === 'u1@x.fr') throw new Error('smtp down');
        });
        const r = await service.sendBroadcast('op-1', {
          target: SEGMENT_ALL,
          channels: { email: true, push: true },
          templateKey: 'MAINTENANCE',
          subject: 'Notification test',
          body: 'Hello {{prenom}} !!',
        });
        expect(r).toMatchObject({ success: true, totalRecipients: 2, sentEmailCount: 1, sentPushCount: 1 });
      });

      it('does not count as sent a push Expo refused (dispatch swallows its own errors)', async () => {
        mockPrisma.user.findMany.mockResolvedValue([recipient({ id: 'u1' }), recipient({ id: 'u2' })]);
        mockPush.dispatch.mockImplementation(async (i: any) => (i.userId === 'u1' ? 0 : 1));
        const r = await service.sendBroadcast('op-1', {
          target: SEGMENT_ALL,
          channels: { email: false, push: true },
          templateKey: 'MAINTENANCE',
          subject: 'Sujet',
          body: 'Un corps de message.',
        });
        expect(r.sentPushCount).toBe(1);
      });

      it('never has more than 25 sends in flight', async () => {
        mockPrisma.user.findMany.mockResolvedValue(
          Array.from({ length: 80 }, (_, i) => recipient({ id: `u${i}`, email: `u${i}@x.fr` })),
        );
        let inFlight = 0;
        let peak = 0;
        mailSend.mockImplementation(async () => {
          inFlight++;
          peak = Math.max(peak, inFlight);
          await new Promise((res) => setTimeout(res, 1));
          inFlight--;
        });
        const r = await service.sendBroadcast('op-1', {
          target: SEGMENT_ALL,
          channels: { email: true, push: false },
          templateKey: 'MAINTENANCE',
          subject: 'Sujet',
          body: 'Un corps de message.',
        });
        expect(r.sentEmailCount).toBe(80);
        expect(peak).toBeLessThanOrEqual(25);
        expect(peak).toBeGreaterThan(1);
      });
    });

    it('refuses an individual target that does not exist instead of reporting success on 0', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.sendBroadcast('op-1', {
          target: { type: 'INDIVIDUAL', userId: '2c53de51-b157-430a-9d90-349f481a539b' },
          channels: { email: true, push: false },
          templateKey: 'CUSTOM',
          subject: 'Direct',
          body: 'Un message pour personne.',
        }),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.adminBroadcast.create).not.toHaveBeenCalled();
    });
  });
});

describe('AdminCommunicationsController', () => {
  let controller: AdminCommunicationsController;
  let mockService: any;

  beforeEach(() => {
    mockService = {
      previewAudience: vi.fn(),
      getHistory: vi.fn(),
      sendBroadcast: vi.fn(),
    };
    controller = new AdminCommunicationsController(mockService as any);
  });

  it('delegates preview requests to the service', async () => {
    const previewResult = {
      totalRecipients: 5,
      emailEligibleCount: 5,
      pushEligibleCount: 3,
      sampleRecipients: [],
    };
    mockService.previewAudience.mockResolvedValue(previewResult);

    const target = {
      type: 'SEGMENT' as const,
      role: 'REPAIRER' as const,
      city: 'Paris',
      verifiedOnly: false,
      activeOnly: true,
    };

    const res = await controller.preview(target);
    expect(res).toEqual(previewResult);
    expect(mockService.previewAudience).toHaveBeenCalledWith(target);
  });

  it('delegates history requests with pagination params', async () => {
    const historyResult = {
      items: [],
      total: 0,
    };
    mockService.getHistory.mockResolvedValue(historyResult);

    const res = await controller.history('2', '15');
    expect(res).toEqual(historyResult);
    expect(mockService.getHistory).toHaveBeenCalledWith(2, 15);
  });

  it('delegates send broadcast requests to the service with the SESSION user as operator', async () => {
    const sendResult = {
      success: true,
      broadcastId: 'b-ctrl-1',
      sentEmailCount: 10,
      sentPushCount: 8,
      totalRecipients: 10,
      skippedNoConsentCount: 0,
    };
    mockService.sendBroadcast.mockResolvedValue(sendResult);

    const payload = {
      target: { type: 'SEGMENT' as const, role: 'ALL' as const, verifiedOnly: false, activeOnly: true },
      channels: { email: true, push: true },
      templateKey: 'ANNOUNCEMENT' as const,
      subject: 'Annonce importante',
      body: 'Corps du message à envoyer.',
    };

    const res = await controller.send({ user: { id: 'op-admin-42' } } as any, payload);
    expect(res).toEqual(sendResult);
    expect(mockService.sendBroadcast).toHaveBeenCalledWith('op-admin-42', payload);
  });

  it('refuses a preview for clients of a city: they have no stored location', async () => {
    await expect(
      controller.preview({ type: 'SEGMENT', role: 'CLIENT', city: 'Lyon', verifiedOnly: false, activeOnly: true }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(mockService.previewAudience).not.toHaveBeenCalled();
  });

  it('is audited by the interceptor with an action the journal knows, not by a hand-built row', () => {
    expect(Reflect.getMetadata(AUDIT_KEY, controller.send)).toMatchObject({
      action: 'broadcast.send',
      targetType: 'AdminBroadcast',
    });
    expect(ADMIN_AUDIT_ACTIONS).toContain('broadcast.send');
  });
});
