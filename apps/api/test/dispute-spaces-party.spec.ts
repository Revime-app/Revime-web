import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisputesService, unreadFor } from '../src/disputes/disputes.service.js';
import { CommandeAnnouncer } from '../src/commandes/commande-announcer.service.js';
import { disputeAttachmentPath } from '../src/storage/attachment-paths.js';
import { FakeStorageGateway, storageGateway } from '../src/storage/gateway.js';

describe('Confidential Dispute Spaces - Party Side (CF4-31)', () => {
  const cmdId = '11111111-1111-1111-1111-111111111111';
  const clientId = 'user-client-1';
  const repairerId = 'user-repairer-1';
  const strangerId = 'user-stranger-9';
  const adminId = 'admin-user-secret-999';

  let mockPrisma: any;
  let mockAnnouncer: any;
  let service: DisputesService;

  beforeEach(() => {
    process.env.STORAGE_DRIVER = 'fake';

    mockPrisma = {
      commande: {
        findUnique: vi.fn(),
      },
      dispute: {
        update: vi.fn().mockResolvedValue({ id: 'disp-1' }),
      },
      disputeMessage: {
        findMany: vi.fn(),
        create: vi.fn(),
        count: vi.fn().mockResolvedValue(0),
      },
    };

    mockAnnouncer = {
      announce: vi.fn().mockResolvedValue(undefined),
    };

    service = new DisputesService(mockPrisma as any, mockAnnouncer as any);
  });

  const baseCommandeWithDispute = {
    id: cmdId,
    clientUserId: clientId,
    repairerUserId: repairerId,
    status: 'PAID',
    dispute: {
      id: 'disp-1',
      number: 101,
      motif: 'REPAIR_NON_CONFORMING',
      reason: 'Réparation non conforme',
      status: 'OPEN',
      initiator: 'CLIENT',
      createdAt: new Date('2026-10-01T08:00:00.000Z'),
      clientLastReadAt: new Date('2026-10-01T09:00:00.000Z'),
      repairerLastReadAt: new Date('2026-10-01T09:00:00.000Z'),
    },
  };

  describe('GET commandes/:id/dispute', () => {
    it('stranger gets 404', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(baseCommandeWithDispute);

      await expect(service.get(strangerId, cmdId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });

    it('returns 404 if commande has no dispute', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue({
        ...baseCommandeWithDispute,
        dispute: null,
      });

      await expect(service.get(clientId, cmdId)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });

    it('queries messages strictly with space equal to caller side (CLIENT)', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(baseCommandeWithDispute);
      const clientDocPath = disputeAttachmentPath(cmdId, 'CLIENT', 'application/pdf');
      (storageGateway() as FakeStorageGateway).seed(clientDocPath);

      mockPrisma.disputeMessage.findMany.mockResolvedValue([
        {
          id: 'msg-1',
          disputeId: 'disp-1',
          space: 'CLIENT',
          author: 'PARTY',
          senderUserId: clientId,
          body: 'Mon message client',
          photoPath: null,
          documentPath: null,
          documentName: null,
          documentSizeBytes: null,
          createdAt: new Date('2026-10-01T08:30:00.000Z'),
        },
        {
          id: 'msg-2',
          disputeId: 'disp-1',
          space: 'CLIENT',
          author: 'REVIME',
          senderUserId: adminId,
          body: 'Bonjour client, REVIME est sur le dossier.',
          photoPath: null,
          documentPath: clientDocPath,
          documentName: 'notice.pdf',
          documentSizeBytes: 1024,
          createdAt: new Date('2026-10-01T09:30:00.000Z'),
        },
      ]);

      const dto = await service.get(clientId, cmdId);

      // Asserts query filters by space = CLIENT
      expect(mockPrisma.disputeMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            disputeId: 'disp-1',
            space: 'CLIENT',
          }),
        }),
      );

      // Verify exact keys of PartyDisputeDto
      expect(Object.keys(dto).sort()).toEqual(
        ['number', 'reference', 'status', 'motifLabel', 'openedAt', 'openedBySide', 'canWrite', 'messages'].sort(),
      );

      expect(dto.number).toBe(101);
      expect(dto.reference).toBe('#LIT-0101');
      expect(dto.openedBySide).toBe('CLIENT');
      expect(dto.canWrite).toBe(true);
      expect(dto.messages).toHaveLength(2);

      // Authors mapped to 'me' and 'revime'
      expect(dto.messages[0]!.author).toBe('me');
      expect(dto.messages[1]!.author).toBe('revime');
      expect(dto.messages[1]!.document).toEqual({
        url: expect.stringContaining(clientDocPath),
        name: 'notice.pdf',
        sizeBytes: 1024,
      });

      // Crucial: no admin senderUserId in serialized output
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain(adminId);
    });

    it('queries messages strictly with space equal to caller side (REPAIRER)', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(baseCommandeWithDispute);
      mockPrisma.disputeMessage.findMany.mockResolvedValue([]);

      await service.get(repairerId, cmdId);

      expect(mockPrisma.disputeMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            disputeId: 'disp-1',
            space: 'REPAIRER',
          }),
        }),
      );
    });
  });

  describe('POST commandes/:id/dispute/messages', () => {
    it('throws 422 if dispute is closed', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue({
        ...baseCommandeWithDispute,
        dispute: {
          ...baseCommandeWithDispute.dispute,
          status: 'RESOLVED_RELEASED',
        },
      });

      await expect(
        service.send(clientId, cmdId, {
          body: 'Est-ce possible de rouvrir ?',
        }),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Ce litige est clos.',
      });
    });

    it('throws 422 if attachment path belongs to the other side', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(baseCommandeWithDispute);
      const repPath = disputeAttachmentPath(cmdId, 'REPAIRER', 'application/pdf');

      await expect(
        service.send(clientId, cmdId, {
          body: 'Voici un document',
          attachment: {
            kind: 'document',
            path: repPath,
          },
        }),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Pièce jointe invalide.',
      });

      expect(mockPrisma.disputeMessage.create).not.toHaveBeenCalled();
    });

    it('saves message in caller space, emits NO notification, and returns DisputeMessageDto', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(baseCommandeWithDispute);
      const clientPhotoPath = disputeAttachmentPath(cmdId, 'CLIENT', 'image/jpeg');
      (storageGateway() as FakeStorageGateway).seed(clientPhotoPath);

      mockPrisma.disputeMessage.create.mockResolvedValue({
        id: 'msg-new',
        disputeId: 'disp-1',
        space: 'CLIENT',
        author: 'PARTY',
        senderUserId: clientId,
        body: 'Voici la photo demandée',
        photoPath: clientPhotoPath,
        documentPath: null,
        documentName: null,
        documentSizeBytes: null,
        createdAt: new Date('2026-10-01T10:00:00.000Z'),
      });

      const res = await service.send(clientId, cmdId, {
        body: 'Voici la photo demandée',
        attachment: {
          kind: 'photo',
          path: clientPhotoPath,
        },
      });

      expect(mockPrisma.disputeMessage.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          disputeId: 'disp-1',
          space: 'CLIENT',
          author: 'PARTY',
          senderUserId: clientId,
          body: 'Voici la photo demandée',
          photoPath: clientPhotoPath,
        }),
      });

      // Emits NO notification
      expect(mockAnnouncer.announce).not.toHaveBeenCalled();

      expect(res).toEqual({
        id: 'msg-new',
        author: 'me',
        body: 'Voici la photo demandée',
        photoUrl: expect.stringContaining(clientPhotoPath),
        document: null,
        createdAt: '2026-10-01T10:00:00.000Z',
      });
    });
  });

  describe('POST commandes/:id/dispute/read', () => {
    it('client markRead updates only clientLastReadAt', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(baseCommandeWithDispute);

      await service.markRead(clientId, cmdId);

      expect(mockPrisma.dispute.update).toHaveBeenCalledWith({
        where: { id: 'disp-1' },
        data: { clientLastReadAt: expect.any(Date) },
      });
      expect(mockPrisma.dispute.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ repairerLastReadAt: expect.anything() }),
        }),
      );
    });

    it('repairer markRead updates only repairerLastReadAt', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue(baseCommandeWithDispute);

      await service.markRead(repairerId, cmdId);

      expect(mockPrisma.dispute.update).toHaveBeenCalledWith({
        where: { id: 'disp-1' },
        data: { repairerLastReadAt: expect.any(Date) },
      });
    });
  });

  describe('POST commandes/:id/dispute/attachments/sign', () => {
    it('signs upload under the caller space even before dispute exists', async () => {
      mockPrisma.commande.findUnique.mockResolvedValue({
        id: cmdId,
        clientUserId: clientId,
        repairerUserId: repairerId,
      });

      const resClient = await service.signUpload(clientId, cmdId, {
        contentType: 'application/pdf',
      });
      expect(resClient.path).toMatch(new RegExp(`^commandes/${cmdId}/litige/client/`));
      expect(resClient.uploadUrl).toBeDefined();

      const resRep = await service.signUpload(repairerId, cmdId, {
        contentType: 'image/jpeg',
      });
      expect(resRep.path).toMatch(new RegExp(`^commandes/${cmdId}/litige/reparateur/`));
      expect(resRep.uploadUrl).toBeDefined();
    });
  });

  describe('unreadFor derivation', () => {
    const dispute = {
      clientLastReadAt: new Date('2026-10-01T10:00:00Z'),
      repairerLastReadAt: new Date('2026-10-01T10:00:00Z'),
      messages: [
        {
          space: 'CLIENT' as const,
          author: 'REVIME' as const,
          createdAt: new Date('2026-10-01T11:00:00Z'),
        },
        {
          space: 'REPAIRER' as const,
          author: 'PARTY' as const,
          createdAt: new Date('2026-10-01T12:00:00Z'),
        },
      ],
    };

    it('returns true for caller when a REVIME message is newer in their space', () => {
      expect(unreadFor(dispute, 'CLIENT')).toBe(true);
    });

    it('returns false when no REVIME message is newer in their space', () => {
      expect(unreadFor(dispute, 'REPAIRER')).toBe(false);
    });

    it('does not leak or count other space REVIME messages', () => {
      const repDispute = {
        clientLastReadAt: new Date('2026-10-01T12:00:00Z'),
        repairerLastReadAt: new Date('2026-10-01T10:00:00Z'),
        messages: [
          {
            space: 'CLIENT' as const,
            author: 'REVIME' as const,
            createdAt: new Date('2026-10-01T11:00:00Z'),
          },
        ],
      };
      // CLIENT read it, but REPAIRER never had a message in their space
      expect(unreadFor(repDispute, 'REPAIRER')).toBe(false);
      expect(unreadFor(repDispute, 'CLIENT')).toBe(false);
    });
  });
});
