import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDisputeSpacesService } from '../src/admin/admin-dispute-spaces.service.js';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { CronService } from '../src/cron/cron.service.js';
import { SUPPORT_PREFIX } from '@revime/shared';
import {
  conversationAttachmentPath,
  disputeAttachmentPath,
} from '../src/storage/attachment-paths.js';
import { FakeStorageGateway, storageGateway } from '../src/storage/gateway.js';

describe('Admin Dispute Spaces (CF4-30, CF4-32)', () => {
  const disputeId = 'disp-1111-1111-1111-111111111111';
  const commandeId = 'cmd-2222-2222-2222-222222222222';
  const conversationId = 'conv-3333-3333-3333-333333333333';
  const clientUserId = 'user-client-1';
  const repairerUserId = 'user-repairer-1';
  const adminUserId = 'admin-user-1';

  let mockPrisma: any;
  let mockNotifications: any;
  let service: AdminDisputeSpacesService;

  beforeEach(() => {
    process.env.STORAGE_DRIVER = 'fake';

    mockPrisma = {
      dispute: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
      disputeMessage: {
        findMany: vi.fn(),
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'dmsg-new',
            ...data,
            createdAt: new Date('2026-10-01T12:00:00Z'),
          }),
        ),
      },
      message: {
        create: vi.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'msg-new',
            ...data,
            createdAt: new Date('2026-10-01T12:00:00Z'),
          }),
        ),
      },
      conversation: {
        update: vi.fn().mockResolvedValue({ id: conversationId }),
      },
      commande: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    mockNotifications = {
      emit: vi.fn().mockResolvedValue('notif-id'),
    };

    service = new AdminDisputeSpacesService(mockPrisma as any, mockNotifications as any);
  });

  const baseDispute = {
    id: disputeId,
    commandeId,
    status: 'OPEN',
    number: 42,
    motif: 'REPAIR_NON_CONFORMING',
    reason: 'Réparation non conforme',
    createdAt: new Date('2026-10-01T10:00:00Z'),
    commande: {
      id: commandeId,
      clientUserId,
      repairerUserId,
      status: 'PAID',
      step: 'AWAITING_VALIDATION',
      totalCents: 15000,
      // CF5-03: the real shape. Commande has no `conversation` relation; the main
      // conversation is the demande's one with THIS order's réparateur.
      demande: {
        title: 'Réparation iPhone 13 écran cassé',
        conversations: [{ id: conversationId, repairerUserId }],
      },
    },
    messages: [],
  };

  describe('GET admin/litiges/:id/espaces', () => {
    it('throws 404 if dispute not found', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.get('nonexistent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('returns client and repairer spaces separately with signed URLs', async () => {
      const clientDocPath = disputeAttachmentPath(commandeId, 'CLIENT', 'application/pdf');
      const repairerPhotoPath = disputeAttachmentPath(commandeId, 'REPAIRER', 'image/jpeg');

      (storageGateway() as FakeStorageGateway).seed(clientDocPath);
      (storageGateway() as FakeStorageGateway).seed(repairerPhotoPath);

      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...baseDispute,
        messages: [
          {
            id: 'm1',
            space: 'CLIENT',
            author: 'PARTY',
            senderUserId: clientUserId,
            body: 'Bonjour REVIME, l écran est mal fixé.',
            photoPath: null,
            documentPath: clientDocPath,
            documentName: 'devis.pdf',
            documentSizeBytes: 1024,
            createdAt: new Date('2026-10-01T10:05:00Z'),
          },
          {
            id: 'm2',
            space: 'CLIENT',
            author: 'REVIME',
            senderUserId: adminUserId,
            body: 'Bien reçu, nous examinons la situation.',
            photoPath: null,
            documentPath: null,
            documentName: null,
            documentSizeBytes: null,
            createdAt: new Date('2026-10-01T10:15:00Z'),
          },
          {
            id: 'm3',
            space: 'REPAIRER',
            author: 'PARTY',
            senderUserId: repairerUserId,
            body: 'Voici la photo avant réparation.',
            photoPath: repairerPhotoPath,
            documentPath: null,
            documentName: null,
            documentSizeBytes: null,
            createdAt: new Date('2026-10-01T10:10:00Z'),
          },
        ],
      });

      const res = await service.get(disputeId);

      expect(res.client).toHaveLength(2);
      expect(res.repairer).toHaveLength(1);

      expect(res.client[0]).toMatchObject({
        id: 'm1',
        author: 'PARTY',
        senderUserId: clientUserId,
        body: 'Bonjour REVIME, l écran est mal fixé.',
        document: {
          name: 'devis.pdf',
          sizeBytes: 1024,
        },
      });
      expect(res.client[0]!.document?.url).toBeTruthy();

      expect(res.client[1]!).toMatchObject({
        id: 'm2',
        author: 'REVIME',
        senderUserId: adminUserId,
        body: 'Bien reçu, nous examinons la situation.',
      });

      expect(res.repairer[0]!).toMatchObject({
        id: 'm3',
        author: 'PARTY',
        senderUserId: repairerUserId,
        body: 'Voici la photo avant réparation.',
      });
      expect(res.repairer[0]!.photoUrl).toBeTruthy();
    });
  });

  describe('POST admin/litiges/:id/messages', () => {
    it('throws 404 if dispute not found', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(null);

      await expect(
        service.post(adminUserId, 'nonexistent', {
          space: 'MAIN',
          body: 'Hello',
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('rejects space write after resolution with 422', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...baseDispute,
        status: 'RESOLVED_REFUNDED',
      });

      await expect(
        service.post(adminUserId, disputeId, {
          space: 'CLIENT',
          body: 'Trop tard',
        }),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Ce litige est clos.',
      });

      await expect(
        service.post(adminUserId, disputeId, {
          space: 'REPAIRER',
          body: 'Trop tard aussi',
        }),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Ce litige est clos.',
      });
    });

    it('allows MAIN write after resolution (announcing decision)', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...baseDispute,
        status: 'RESOLVED_REFUNDED',
      });

      const res = await service.post(adminUserId, disputeId, {
        space: 'MAIN',
        body: 'Le litige est résolu par un remboursement.',
      });

      expect(res).toEqual({ ok: true });
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          kind: 'SUPPORT',
          senderUserId: null,
          body: `${SUPPORT_PREFIX}Le litige est résolu par un remboursement.`,
        }),
      });
    });

    it('MAIN creates a SUPPORT row with exact prefix and notifies both parties', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(baseDispute);

      const res = await service.post(adminUserId, disputeId, {
        space: 'MAIN',
        body: 'REVIME intervient pour clarifier.',
      });

      expect(res).toEqual({ ok: true });

      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          conversationId,
          kind: 'SUPPORT',
          senderUserId: null,
          body: `${SUPPORT_PREFIX}REVIME intervient pour clarifier.`,
          photoPath: null,
          documentPath: null,
          documentName: null,
          documentSizeBytes: null,
        },
      });

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: conversationId },
        data: { lastMessageAt: expect.any(Date) },
      });

      // Emits MESSAGE_RECEIVED to both client and repairer
      expect(mockNotifications.emit).toHaveBeenCalledTimes(2);
      expect(mockNotifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: clientUserId,
          mode: 'CLIENT',
          type: 'MESSAGE_RECEIVED',
          actorName: 'REVIME — Support',
          conversationId,
        }),
      );
      expect(mockNotifications.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: repairerUserId,
          mode: 'REPAIRER',
          type: 'MESSAGE_RECEIVED',
          actorName: 'REVIME — Support',
          conversationId,
        }),
      );
    });

    it('CF5-03: MAIN picks the conversation with this order’s réparateur among several', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue({
        ...baseDispute,
        commande: {
          ...baseDispute.commande,
          demande: {
            ...baseDispute.commande.demande,
            conversations: [
              { id: 'conv-other', repairerUserId: 'user-repairer-other' },
              { id: conversationId, repairerUserId },
            ],
          },
        },
      });

      await service.post(adminUserId, disputeId, { space: 'MAIN', body: 'Bonjour' });

      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ conversationId }),
      });
    });

    it('CF5-03: MAIN never falls back to another réparateur’s conversation (404, nothing written)', async () => {
      const onlyOther = {
        ...baseDispute,
        commande: {
          ...baseDispute.commande,
          demande: {
            ...baseDispute.commande.demande,
            conversations: [{ id: 'conv-other', repairerUserId: 'user-repairer-other' }],
          },
        },
      };
      mockPrisma.dispute.findUnique.mockResolvedValue(onlyOther);

      await expect(
        service.post(adminUserId, disputeId, { space: 'MAIN', body: 'Bonjour' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Conversation introuvable.' });
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
      expect(mockNotifications.emit).not.toHaveBeenCalled();

      await expect(
        service.signUpload(disputeId, 'MAIN', { contentType: 'image/jpeg' }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND', message: 'Conversation introuvable.' });
    });

    it('CLIENT creates a REVIME row in CLIENT space and emits DISPUTE_MESSAGE to client only', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(baseDispute);

      const res = await service.post(adminUserId, disputeId, {
        space: 'CLIENT',
        body: 'Message privé pour le client',
      });

      expect(res).toEqual({ ok: true });

      expect(mockPrisma.disputeMessage.create).toHaveBeenCalledWith({
        data: {
          disputeId,
          space: 'CLIENT',
          author: 'REVIME',
          senderUserId: adminUserId,
          body: 'Message privé pour le client',
          photoPath: null,
          documentPath: null,
          documentName: null,
          documentSizeBytes: null,
        },
      });

      // Emits DISPUTE_MESSAGE to client only
      expect(mockNotifications.emit).toHaveBeenCalledTimes(1);
      expect(mockNotifications.emit).toHaveBeenCalledWith({
        userId: clientUserId,
        mode: 'CLIENT',
        type: 'DISPUTE_MESSAGE',
        actorName: 'REVIME — Support',
        commandeId,
        demandeId: undefined,
        subject: 'Réparation iPhone 13 écran cassé',
      });
    });

    it('REPAIRER creates a REVIME row in REPAIRER space and emits DISPUTE_MESSAGE to repairer only', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(baseDispute);

      const res = await service.post(adminUserId, disputeId, {
        space: 'REPAIRER',
        body: 'Message privé pour le réparateur',
      });

      expect(res).toEqual({ ok: true });

      expect(mockPrisma.disputeMessage.create).toHaveBeenCalledWith({
        data: {
          disputeId,
          space: 'REPAIRER',
          author: 'REVIME',
          senderUserId: adminUserId,
          body: 'Message privé pour le réparateur',
          photoPath: null,
          documentPath: null,
          documentName: null,
          documentSizeBytes: null,
        },
      });

      // Emits DISPUTE_MESSAGE to repairer only
      expect(mockNotifications.emit).toHaveBeenCalledTimes(1);
      expect(mockNotifications.emit).toHaveBeenCalledWith({
        userId: repairerUserId,
        mode: 'REPAIRER',
        type: 'DISPUTE_MESSAGE',
        actorName: 'REVIME — Support',
        commandeId,
        demandeId: undefined,
        subject: 'Réparation iPhone 13 écran cassé',
      });
    });

    it('rejects an invalid attachment path with 422', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(baseDispute);

      await expect(
        service.post(adminUserId, disputeId, {
          space: 'CLIENT',
          body: 'Voici un doc',
          attachment: {
            kind: 'document',
            path: 'malicious/path.pdf',
          },
        }),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Pièce jointe invalide.',
      });
    });
  });

  describe('signUpload', () => {
    it('generates a signed upload for MAIN, CLIENT, and REPAIRER spaces', async () => {
      mockPrisma.dispute.findUnique.mockResolvedValue(baseDispute);

      const mainSign = await service.signUpload(disputeId, 'MAIN', {
        contentType: 'application/pdf',
      });
      expect(mainSign.path).toContain(`conversations/${conversationId}/`);
      expect(mainSign.path.endsWith('.pdf')).toBe(true);
      expect(mainSign.uploadUrl).toBeTruthy();

      const clientSign = await service.signUpload(disputeId, 'CLIENT', {
        contentType: 'image/jpeg',
      });
      expect(clientSign.path).toContain(`commandes/${commandeId}/litige/client/`);
      expect(clientSign.path.endsWith('.jpg')).toBe(true);

      const repairerSign = await service.signUpload(disputeId, 'REPAIRER', {
        contentType: 'application/pdf',
      });
      expect(repairerSign.path).toContain(`commandes/${commandeId}/litige/reparateur/`);
      expect(repairerSign.path.endsWith('.pdf')).toBe(true);
    });
  });

  describe('Search #LIT- in AdminDisputesService.list', () => {
    it('filters number = 42 for q: "#LIT-0042" and q: "42"', async () => {
      const disputesAdmin = new AdminDisputesService(
        mockPrisma as any,
        {} as any,
        {} as any,
      );

      mockPrisma.dispute.findMany.mockResolvedValue([]);
      mockPrisma.dispute.count.mockResolvedValue(0);

      await disputesAdmin.list({ q: '#LIT-0042' });

      expect(mockPrisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ number: 42 }]),
          }),
        }),
      );

      await disputesAdmin.list({ q: '42' });

      expect(mockPrisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([{ number: 42 }]),
          }),
        }),
      );
    });
  });

  describe('DISPUTE_REPLY attention condition in CronService', () => {
    it('is present when a space’s latest row is PARTY newer than REVIME’s latest there', async () => {
      const cronPrisma: any = {
        commande: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        dispute: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: disputeId,
              status: 'OPEN',
              commande: {
                id: commandeId,
                status: 'PAID',
                step: 'AWAITING_VALIDATION',
                totalCents: 15000,
                demande: { title: 'Test Demande' },
              },
              messages: [
                {
                  space: 'CLIENT',
                  author: 'REVIME',
                  createdAt: new Date('2026-10-01T10:00:00Z'),
                },
                {
                  space: 'CLIENT',
                  author: 'PARTY',
                  createdAt: new Date('2026-10-01T11:00:00Z'),
                },
              ],
            },
          ]),
        },
      };

      const cron = new CronService(
        { adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) }, ...cronPrisma } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as never, // FiscalService (CMP-D3), unused here
        {} as never, // SetupRemindersService (V8 E1), unused here
      );
      const items = await cron.attentionItems();

      const replyItem = items.find((i) => i.reason === 'DISPUTE_REPLY');
      expect(replyItem).toBeDefined();
      expect(replyItem?.commandeId).toBe(commandeId);
      expect(replyItem?.since).toBe('2026-10-01T11:00:00.000Z');
    });

    it('clears (absent) once a REVIME row follows', async () => {
      const cronPrisma: any = {
        commande: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        dispute: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: disputeId,
              status: 'OPEN',
              commande: {
                id: commandeId,
                status: 'PAID',
                step: 'AWAITING_VALIDATION',
                totalCents: 15000,
                demande: { title: 'Test Demande' },
              },
              messages: [
                {
                  space: 'CLIENT',
                  author: 'REVIME',
                  createdAt: new Date('2026-10-01T10:00:00Z'),
                },
                {
                  space: 'CLIENT',
                  author: 'PARTY',
                  createdAt: new Date('2026-10-01T11:00:00Z'),
                },
                {
                  space: 'CLIENT',
                  author: 'REVIME',
                  createdAt: new Date('2026-10-01T12:00:00Z'),
                },
              ],
            },
          ]),
        },
      };

      const cron = new CronService(
        { adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) }, ...cronPrisma } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as never, // FiscalService (CMP-D3), unused here
        {} as never, // SetupRemindersService (V8 E1), unused here
      );
      const items = await cron.attentionItems();

      const replyItem = items.find((i) => i.reason === 'DISPUTE_REPLY');
      expect(replyItem).toBeUndefined();
    });

    it('is absent for a resolved dispute', async () => {
      const cronPrisma: any = {
        commande: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        dispute: {
          findMany: vi.fn().mockResolvedValue([]), // prisma query filters status: { in: ['OPEN', 'IN_REVIEW'] }
        },
      };

      const cron = new CronService(
        { adminAuditLog: { findMany: vi.fn().mockResolvedValue([]) }, ...cronPrisma } as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as never, // FiscalService (CMP-D3), unused here
        {} as never, // SetupRemindersService (V8 E1), unused here
      );
      const items = await cron.attentionItems();

      const replyItem = items.find((i) => i.reason === 'DISPUTE_REPLY');
      expect(replyItem).toBeUndefined();
    });
  });
});
