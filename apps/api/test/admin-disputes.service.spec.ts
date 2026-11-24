import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeStorageGateway, storageGateway } from '../src/storage/gateway.js';
import type { OpenDisputeInput } from '@revime/shared';

// CF4-15 (spec §3). Mocked at module level, same pattern as refund-service.spec.ts:
// resolveRelease's new refusal path needs to inject a createTransfer failure, which
// the real FakePaymentsGateway singleton exposes only on its concrete class, not on
// the PaymentsGateway interface paymentsGateway() returns.
const fakePayments = {
  createTransfer: vi.fn(),
};

vi.mock('../src/payments/gateway.js', () => ({
  paymentsGateway: () => fakePayments,
}));

function makePrismaMock() {
  const mock = {
    dispute: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    commande: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    connectAccount: {
      findUnique: vi.fn(),
    },
    // CMP-D3: a réparateur whose fiscal information is complete, so existing cases are unaffected.
    repairerProfile: {
      findUnique: vi.fn().mockResolvedValue({
        kind: 'INDIVIDUAL',
        fiscalCompletedAt: new Date('2026-10-01T00:00:00Z'),
        user: { profile: { verificationLevel: 'IDENTITY' }, businessVerification: null },
      }),
    },
    commandeStepEvent: {
      create: vi.fn(),
    },
    // CF4-I. Every `openDispute` call now closes a pending request in the same
    // transaction; default to "none pending" (count 0) so tests that do not care
    // about cancellations are unaffected.
    cancellationRequest: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    // Self-referential, same pattern as admin-catalog.service.spec.ts: the
    // resolveRelease test asserts on the OUTER prisma mock's commande.update
    // after `this.prisma.$transaction(async (tx) => ...)` commits, so `tx` must
    // be the same spies the test holds, not a disconnected fresh mock.
    $transaction: vi.fn((callbackOrOps: any) => {
      if (typeof callbackOrOps === 'function') {
        return callbackOrOps(mock);
      }
      return Promise.all(callbackOrOps);
    }),
  } as any;
  return mock;
}

const mockDisputeRecord = {
  id: 'disp-1',
  commandeId: 'cmd-1',
  status: 'OPEN' as const,
  initiator: 'CLIENT' as const,
  openedByUserId: 'usr-client',
  reason: 'Appareil non réparé',
  description: 'Le téléphone ne s\'allume toujours pas après récupération.',
  evidencePhotos: ['https://example.com/photo1.jpg'],
  assignedToUserId: null,
  assignedAt: null,
  resolvedByUserId: null,
  resolvedAt: null,
  verdict: null,
  resolutionNote: null,
  adminNotes: [],
  createdAt: new Date('2026-09-20T10:00:00.000Z'),
  updatedAt: new Date('2026-09-20T10:00:00.000Z'),
  commande: {
    id: 'cmd-1',
    status: 'PAID',
    step: 'AWAITING_VALIDATION',
    delivery: 'PARCEL',
    repairCents: 10000,
    shippingCents: 1000,
    protectionCents: 500,
    insuranceCents: 200,
    totalCents: 11700,
    paidAt: new Date('2026-09-18T12:00:00.000Z'),
    stripeSessionId: 'cs_test_123',
    stripePaymentIntentId: 'pi_test_123',
    stripeChargeId: 'ch_test_123',
    stripeTransferId: null,
    stripeRefundId: null,
    clientUser: {
      id: 'usr-client',
      name: 'Alice Client',
      email: 'alice@example.com',
      phone: '0601020304',
      profile: { city: 'Paris' },
    },
    repairerUser: {
      id: 'usr-repairer',
      name: 'Bob Réparateur',
      email: 'bob@example.com',
      phone: '0611223344',
      profile: {
        kind: 'PRO',
        city: 'Lyon',
        verificationLevel: 'BUSINESS',
      },
    },
    shipments: [
      {
        leg: 'OUTBOUND',
        status: 'DELIVERED',
        carrier: 'CHRONOPOST',
        boxtalOrderId: 'box-1',
        failureReason: null,
      },
      {
        leg: 'RETURN',
        status: 'DELIVERED',
        carrier: 'CHRONOPOST',
        boxtalOrderId: 'box-2',
        failureReason: null,
      },
    ],
    demande: {
      id: 'dem-1',
      title: 'Réparation iPhone 13',
      description: 'Écran brisé',
      photos: [{ storagePath: 'https://example.com/broken.jpg' }],
      conversation: {
        id: 'conv-1',
        messages: [
          {
            id: 'msg-1',
            senderUserId: 'usr-client',
            kind: 'TEXT',
            body: 'Bonjour, avez-vous reçu le colis ?',
            photoPath: null,
            createdAt: new Date('2026-09-19T09:00:00.000Z'),
          },
          {
            id: 'msg-2',
            senderUserId: 'usr-repairer',
            kind: 'TEXT_WITH_PHOTO',
            body: 'Oui bien reçu, voici l\'état',
            photoPath: 'https://example.com/receipt.jpg',
            createdAt: new Date('2026-09-19T09:15:00.000Z'),
          },
          {
            id: 'msg-3',
            senderUserId: 'usr-client',
            kind: 'TEXT',
            body: 'Voici le devis en PDF',
            photoPath: null,
            documentPath: 'conversations/conv-1/devis.pdf',
            documentName: 'devis.pdf',
            documentSizeBytes: 12345,
            createdAt: new Date('2026-09-19T09:30:00.000Z'),
          },
        ],
      },
    },
  },
};

describe('AdminDisputesService', () => {
  let prisma: any;
  let refundService: any;
  let service: AdminDisputesService;

  beforeEach(() => {
    process.env.STORAGE_DRIVER = 'fake';
    prisma = makePrismaMock();
    refundService = {
      refund: vi.fn().mockResolvedValue({ refundCents: 0, totalCents: 0 }),
    };
    fakePayments.createTransfer.mockReset().mockResolvedValue({ id: 'tr_fake_default' });
    service = new AdminDisputesService(prisma, refundService, { announce: vi.fn() } as never);
  });

  describe('list', () => {
    it('returns paginated items and calculates status tab counts', async () => {
      const rows = [mockDisputeRecord];
      prisma.dispute.findMany.mockResolvedValue(rows);
      prisma.dispute.count
        .mockResolvedValueOnce(1) // total for query
        .mockResolvedValueOnce(5) // openCount
        .mockResolvedValueOnce(3) // inReviewCount
        .mockResolvedValueOnce(8); // resolvedCount

      const result = await service.list({
        page: 1,
        pageSize: 25,
      });

      expect(result).toEqual({
        items: [
          {
            id: 'disp-1',
            commandeId: 'cmd-1',
            number: 0,
            motif: null,
            status: 'OPEN',
            initiator: 'CLIENT',
            reason: 'Appareil non réparé',
            clientName: 'Alice Client',
            clientEmail: 'alice@example.com',
            repairerName: 'Bob Réparateur',
            repairerEmail: 'bob@example.com',
            totalCents: 11700,
            repairCents: 10000,
            assignedToUserId: null,
            assignedToName: null,
            createdAt: '2026-09-20T10:00:00.000Z',
            resolvedAt: null,
            verdict: null,
            commandeStatus: 'PAID',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 25,
        openCount: 5,
        inReviewCount: 3,
        resolvedCount: 8,
      });
    });

    it('resolves the assigned operator to a display name (never shows the raw user id)', async () => {
      prisma.dispute.findMany.mockResolvedValue([
        { ...mockDisputeRecord, id: 'disp-a', assignedToUserId: 'op-1' },
        { ...mockDisputeRecord, id: 'disp-b', assignedToUserId: 'op-2' },
        { ...mockDisputeRecord, id: 'disp-c', assignedToUserId: 'op-gone' },
      ]);
      prisma.dispute.count.mockResolvedValue(0);
      prisma.user.findMany.mockResolvedValue([
        { id: 'op-1', name: 'Malek Klimane', email: 'malek@example.com' },
        { id: 'op-2', name: '', email: 'ops@example.com' },
      ]);

      const result = await service.list({});

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: { in: ['op-1', 'op-2', 'op-gone'] } } }),
      );
      expect(result.items.map((i) => i.assignedToName)).toEqual([
        'Malek Klimane',
        'ops@example.com',
        null,
      ]);
    });

    it('does not query users when no dispute is assigned', async () => {
      prisma.dispute.findMany.mockResolvedValue([mockDisputeRecord]);
      prisma.dispute.count.mockResolvedValue(0);

      await service.list({});

      expect(prisma.user.findMany).not.toHaveBeenCalled();
    });

    it('filters by status tab OPEN and IN_REVIEW', async () => {
      prisma.dispute.findMany.mockResolvedValue([]);
      prisma.dispute.count.mockResolvedValue(0);

      await service.list({ status: 'OPEN' });
      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'OPEN' }),
        }),
      );

      await service.list({ status: 'IN_REVIEW' });
      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'IN_REVIEW' }),
        }),
      );
    });

    it('filters by status tab RESOLVED covering all three resolved terminal states', async () => {
      prisma.dispute.findMany.mockResolvedValue([]);
      prisma.dispute.count.mockResolvedValue(0);

      await service.list({ status: 'RESOLVED_REFUNDED' as any });
      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: expect.anything(),
          }),
        }),
      );
    });

    it('filters by assignment: unassigned, specific user, or all', async () => {
      prisma.dispute.findMany.mockResolvedValue([]);
      prisma.dispute.count.mockResolvedValue(0);

      // Unassigned
      await service.list({ assigned: 'unassigned' });
      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assignedToUserId: null }),
        }),
      );

      // Specific user
      await service.list({ assigned: 'usr_admin_123' });
      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assignedToUserId: 'usr_admin_123' }),
        }),
      );
    });

    it('applies text search query across commande ID, client, and repairer names/emails', async () => {
      prisma.dispute.findMany.mockResolvedValue([]);
      prisma.dispute.count.mockResolvedValue(0);

      await service.list({ q: 'Alice' });
      expect(prisma.dispute.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ commandeId: expect.anything() }),
              expect.objectContaining({ commande: expect.anything() }),
            ]),
          }),
        }),
      );
    });
  });

  describe('getDossier', () => {
    it('returns complete AdminDisputeDossierDto with financial facts, parties, messages, and shipments', async () => {
      prisma.dispute.findUnique.mockResolvedValue(mockDisputeRecord);

      const dossier = await service.getDossier('disp-1');

      expect(dossier.dispute.id).toBe('disp-1');
      expect(dossier.dispute.status).toBe('OPEN');
      expect(dossier.dispute.reason).toBe('Appareil non réparé');
      expect(dossier.commande.totalCents).toBe(11700);
      expect(dossier.commande.repairCents).toBe(10000);
      expect(dossier.client.name).toBe('Alice Client');
      expect(dossier.client.city).toBe('Paris');
      expect(dossier.repairer.name).toBe('Bob Réparateur');
      expect(dossier.repairer.kind).toBe('PRO');
      expect(dossier.shipments).toHaveLength(2);
      expect(dossier.shipments[0]?.carrierLabel).toBe('CHRONOPOST');
      expect(dossier.conversation?.messages).toHaveLength(3);
      expect(dossier.conversation?.messages[0]).toMatchObject({
        id: 'msg-1',
        senderUserId: 'usr-client',
        senderRole: 'CLIENT',
        senderName: 'Alice Client',
      });
      expect(dossier.conversation?.messages[1]).toMatchObject({
        id: 'msg-2',
        senderUserId: 'usr-repairer',
        senderRole: 'REPAIRER',
        senderName: 'Bob Réparateur',
      });
      expect(dossier.conversation?.messages[2]).toMatchObject({
        id: 'msg-3',
        senderUserId: 'usr-client',
        senderRole: 'CLIENT',
        senderName: 'Alice Client',
        documentPath: 'conversations/conv-1/devis.pdf',
        documentName: 'devis.pdf',
        documentSizeBytes: 12345,
      });
      expect(dossier.demande.title).toBe('Réparation iPhone 13');
      expect(dossier.demande.photos).toEqual(['https://example.com/broken.jpg']);
    });

    it('signs storage paths in evidencePhotos and preserves absolute URLs (Bug B8)', async () => {
      const storagePath = 'commandes/cmd-1/litige/client/broken-screen.jpg';
      (storageGateway() as FakeStorageGateway).seed(storagePath);
      const disputeWithStoragePath = {
        ...mockDisputeRecord,
        evidencePhotos: [storagePath, 'https://external.example.com/already-signed.jpg'],
      };
      prisma.dispute.findUnique.mockResolvedValue(disputeWithStoragePath);

      const dossier = await service.getDossier('disp-1');

      expect(dossier.dispute.evidencePhotos).toBeDefined();
      expect(dossier.dispute.evidencePhotos).toHaveLength(2);
      expect(dossier.dispute.evidencePhotos![0]).not.toBe(storagePath);
      expect(dossier.dispute.evidencePhotos![0]).toContain('http');
      expect(dossier.dispute.evidencePhotos![1]).toBe('https://external.example.com/already-signed.jpg');
    });

    // RU-13 review: the first B8 spec only covered the evidence photos. The photos and documents of the thread
    // and the photos of the demande came back unsigned (a broken image) with every spec green.
    it('signs the photo and the document of a message and the photos of the demande (Bug B8)', async () => {
      const gateway = storageGateway() as FakeStorageGateway;
      gateway.seed('conversations/conv-1/photo.jpg');
      gateway.seed('conversations/conv-1/devis.pdf');
      gateway.seed('demandes/usr-client/dem-1/front.jpg');
      prisma.dispute.findUnique.mockResolvedValue({
        ...mockDisputeRecord,
        commande: {
          ...mockDisputeRecord.commande,
          demande: {
            ...mockDisputeRecord.commande.demande,
            photos: [{ storagePath: 'demandes/usr-client/dem-1/front.jpg' }],
            conversation: {
              id: 'conv-1',
              messages: [
                {
                  id: 'msg-a',
                  senderUserId: 'usr-client',
                  kind: 'TEXT_WITH_PHOTO',
                  body: 'Photo',
                  photoPath: 'conversations/conv-1/photo.jpg',
                  documentPath: 'conversations/conv-1/devis.pdf',
                  createdAt: new Date('2026-09-19T09:00:00.000Z'),
                },
              ],
            },
          },
        },
      });

      const dossier = await service.getDossier('disp-1');

      expect(dossier.conversation?.messages[0]?.photoPath).toMatch(/^https:\/\/fake\.storage\.local\/.+photo\.jpg\?signed=1$/);
      expect(dossier.conversation?.messages[0]?.documentPath).toMatch(/^https:\/\/fake\.storage\.local\/.+devis\.pdf\?signed=1$/);
      expect(dossier.demande.photos).toEqual([expect.stringMatching(/^https:\/\/fake\.storage\.local\/.+front\.jpg\?signed=1$/)]);
    });

    it('asks storage to sign only storage paths, never a URL already loadable (Bug B8)', async () => {
      const sign = vi.spyOn(storageGateway(), 'createSignedReadUrls');
      prisma.dispute.findUnique.mockResolvedValue({
        ...mockDisputeRecord,
        evidencePhotos: ['https://external.example.com/a.jpg', 'data:image/png;base64,AAAA'],
      });

      await service.getDossier('disp-1');

      for (const [paths] of sign.mock.calls) {
        expect(paths).not.toContain('https://external.example.com/a.jpg');
        expect(paths).not.toContain('data:image/png;base64,AAAA');
      }
      sign.mockRestore();
    });

    it('throws 404 Ressource introuvable if dispute does not exist', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.getDossier('non-existent')).rejects.toThrow(AppException);
      await expect(service.getDossier('non-existent')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });
  });

  describe('openDispute', () => {
    const input: OpenDisputeInput = {
      reason: 'Colis endommagé à la réception',
      description: 'Le colis est arrivé écrasé par le transporteur.',
      initiator: 'CLIENT',
    };

    it('throws 404 Ressource introuvable if commande does not exist', async () => {
      prisma.commande.findUnique.mockResolvedValue(null);

      await expect(service.openDispute('admin-1', 'unknown-cmd', input)).rejects.toThrow(AppException);
      await expect(service.openDispute('admin-1', 'unknown-cmd', input)).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });

    it('throws 422 if commande is not PAID', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-pending',
        status: 'PENDING_PAYMENT',
        dispute: null,
      });

      await expect(service.openDispute('admin-1', 'cmd-pending', input)).rejects.toThrow(AppException);
      await expect(service.openDispute('admin-1', 'cmd-pending', input)).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: "Seule une commande payée peut faire l'objet d'un litige.",
      });
    });

    it('throws 422 if an active dispute is already open on this commande', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-disputed',
        status: 'PAID',
        dispute: { id: 'disp-existing', status: 'OPEN' },
      });

      await expect(service.openDispute('admin-1', 'cmd-disputed', input)).rejects.toThrow(AppException);
      await expect(service.openDispute('admin-1', 'cmd-disputed', input)).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Un litige est déjà ouvert sur cette commande.',
      });
    });

    it('creates dispute and locks commande by setting disputedAt', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-ok',
        status: 'PAID',
        dispute: null,
      });
      prisma.dispute.upsert.mockResolvedValue({
        id: 'disp-new',
        commandeId: 'cmd-ok',
        status: 'OPEN',
        initiator: 'CLIENT',
        openedByUserId: 'admin-1',
        reason: input.reason,
        description: input.description,
      });

      const res = await service.openDispute('admin-1', 'cmd-ok', input);

      expect(res).toMatchObject({ ok: true, disputeId: 'disp-new' });
      expect(prisma.commande.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cmd-ok' },
          data: expect.objectContaining({
            disputedAt: expect.any(Date),
          }),
        }),
      );
      expect(prisma.dispute.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { commandeId: 'cmd-ok' },
          create: expect.objectContaining({
            commandeId: 'cmd-ok',
            status: 'OPEN',
            initiator: 'CLIENT',
            openedByUserId: 'admin-1',
            reason: input.reason,
            description: input.description,
          }),
          update: expect.objectContaining({
            status: 'OPEN',
            initiator: 'CLIENT',
            openedByUserId: 'admin-1',
            reason: input.reason,
            description: input.description,
            assignedToUserId: null,
            assignedAt: null,
            resolvedByUserId: null,
            resolvedAt: null,
            verdict: null,
            resolutionNote: null,
          }),
        }),
      );
    });

    // CF4-I (spec §4.2, I12). Opening a dispute closes a pending cancellation request
    // SUPERSEDED, in the SAME transaction as the flag clear and dispute upsert.
    it('closes a pending cancellation request SUPERSEDED and clears the flag, in one transaction', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-ok',
        status: 'PAID',
        dispute: null,
      });
      prisma.dispute.upsert.mockResolvedValue({
        id: 'disp-new',
        commandeId: 'cmd-ok',
        status: 'OPEN',
        initiator: 'CLIENT',
        openedByUserId: 'admin-1',
        reason: input.reason,
        description: input.description,
      });
      prisma.cancellationRequest = { updateMany: vi.fn().mockResolvedValue({ count: 1 }) };

      await service.openDispute('admin-1', 'cmd-ok', input);

      expect(prisma.cancellationRequest.updateMany).toHaveBeenCalledWith({
        where: { commandeId: 'cmd-ok', status: 'PENDING' },
        data: { status: 'SUPERSEDED', decidedAt: expect.any(Date), decidedByUserId: 'admin-1' },
      });
      // Everything ran through the ONE $transaction call this mock records.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });

    it('resets cleanly via upsert if a closed dispute already existed on the commande', async () => {
      prisma.commande.findUnique.mockResolvedValue({
        id: 'cmd-resolved',
        status: 'PAID',
        dispute: { id: 'disp-old', status: 'RESOLVED_REFUNDED' },
      });
      prisma.dispute.upsert.mockResolvedValue({
        id: 'disp-old',
        commandeId: 'cmd-resolved',
        status: 'OPEN',
      });

      const res = await service.openDispute('admin-1', 'cmd-resolved', input);
      expect(res).toMatchObject({ ok: true, disputeId: 'disp-old' });
      expect(prisma.dispute.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { commandeId: 'cmd-resolved' },
          update: expect.objectContaining({
            status: 'OPEN',
            resolvedAt: null,
            verdict: null,
          }),
        }),
      );
    });
  });

  describe('assign & unassign', () => {
    it('assign updates assignee, timestamp and transitions status to IN_REVIEW if OPEN', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        assignedToUserId: null,
      });
      prisma.dispute.update.mockResolvedValue({
        id: 'disp-1',
        status: 'IN_REVIEW',
        assignedToUserId: 'admin-2',
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-2',
        name: 'Admin Deux',
        role: 'admin',
        profile: { deletedAt: null },
      });

      await service.assign('admin-1', 'disp-1', 'admin-2');

      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-1' },
          data: expect.objectContaining({
            assignedToUserId: 'admin-2',
            assignedAt: expect.any(Date),
            status: 'IN_REVIEW',
          }),
        }),
      );
    });

    it('assign throws 404 if dispute not found', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.assign('admin-1', 'disp-404')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });

    it('unassign clears assignee and assignment timestamp', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        assignedToUserId: 'admin-2',
        assignedAt: new Date(),
      });
      prisma.dispute.update.mockResolvedValue({
        id: 'disp-1',
        assignedToUserId: null,
        assignedAt: null,
      });

      await service.unassign('disp-1');

      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-1' },
          data: expect.objectContaining({
            assignedToUserId: null,
            assignedAt: null,
          }),
        }),
      );
    });

    it('unassign throws 404 if dispute not found', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.unassign('disp-404')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });
  });

  describe('addNote', () => {
    it('appends structured note with author name, admin ID, and UUID', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        adminNotes: [
          {
            id: 'note-0',
            adminUserId: 'admin-prev',
            adminName: 'Jean Dupont',
            note: 'Première note',
            createdAt: '2026-09-20T11:00:00.000Z',
          },
        ],
      });
      prisma.user.findUnique.mockResolvedValue({
        id: 'admin-1',
        name: 'Sophie Martin',
      });
      prisma.dispute.update.mockResolvedValue({});

      await service.addNote('admin-1', 'disp-1', 'Contact pris avec le client.');

      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-1' },
          data: expect.objectContaining({
            adminNotes: expect.arrayContaining([
              expect.objectContaining({ id: 'note-0' }),
              expect.objectContaining({
                adminUserId: 'admin-1',
                adminName: 'Sophie Martin',
                note: 'Contact pris avec le client.',
              }),
            ]),
          }),
        }),
      );
    });

    it('throws 404 if dispute not found', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.addNote('admin-1', 'disp-404', 'Note')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });
  });

  describe('resolveRelease', () => {
    it('executes transfer if funds not yet transferred, updates commande to RELEASED, clears disputedAt, and stamps dispute', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          step: 'AWAITING_VALIDATION',
          repairCents: 10000,
          repairerUserId: 'usr-repairer',
          stripeChargeId: 'ch_test_123',
          stripeTransferId: null,
        },
      });
      prisma.connectAccount.findUnique.mockResolvedValue({
        stripeAccountId: 'acct_test_repairer',
      });

      await service.resolveRelease('admin-1', 'disp-1', 'Réparation validée après vérification des photos.');

      // Updates commande
      expect(prisma.commande.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cmd-1' },
          data: expect.objectContaining({
            step: 'RELEASED',
            releasedAt: expect.any(Date),
            disputedAt: null,
            // This call made the transfer, so it dates it.
            transferredAt: expect.any(Date),
          }),
        }),
      );

      // Updates dispute
      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-1' },
          data: expect.objectContaining({
            status: 'RESOLVED_RELEASED',
            resolvedByUserId: 'admin-1',
            resolvedAt: expect.any(Date),
            verdict: 'RELEASE_REPAIRER',
            resolutionNote: 'Réparation validée après vérification des photos.',
          }),
        }),
      );
    });

    it('throws 422 if dispute is already resolved', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'RESOLVED_RELEASED',
      });

      await expect(service.resolveRelease('admin-1', 'disp-1', 'Note')).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Ce litige est déjà résolu.',
      });
    });

    it('throws 404 if dispute not found', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.resolveRelease('admin-1', 'disp-404', 'Note')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });

    // CF4-15 (spec §3). The rule changed: a failed transfer used to be swallowed
    // ("Degrade gracefully") and the release proceeded funds-less. Now BOTH refusal
    // paths (no ConnectAccount, createTransfer throws) refuse the whole release -
    // no $transaction, no dispute write, no announce - so an admin cannot believe
    // funds moved when they did not.
    it('throws UNPROCESSABLE_ENTITY and writes nothing when the réparateur has no ConnectAccount', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          step: 'AWAITING_VALIDATION',
          repairCents: 10000,
          repairerUserId: 'usr-repairer',
          stripeChargeId: 'ch_test_123',
          stripeTransferId: null,
        },
      });
      prisma.connectAccount.findUnique.mockResolvedValue(null);

      await expect(service.resolveRelease('admin-1', 'disp-1', 'Note suffisamment longue.')).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Le réparateur ne peut pas recevoir de paiement.',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.commande.update).not.toHaveBeenCalled();
      expect(prisma.dispute.update).not.toHaveBeenCalled();
    });

    it('CMP-D3: refuses to release to a réparateur without fiscal information; the dispute stays open', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          step: 'AWAITING_VALIDATION',
          repairCents: 10000,
          repairerUserId: 'usr-repairer',
          stripeChargeId: 'ch_test_123',
          stripeTransferId: null,
        },
      });
      prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_test_repairer' });
      prisma.repairerProfile.findUnique.mockResolvedValue({
        kind: 'INDIVIDUAL',
        fiscalCompletedAt: null,
        user: { profile: { verificationLevel: 'IDENTITY' }, businessVerification: null },
      });

      await expect(service.resolveRelease('admin-1', 'disp-1', 'Note suffisamment longue.')).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: expect.stringContaining('informations fiscales'),
      });

      expect(fakePayments.createTransfer).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.dispute.update).not.toHaveBeenCalled();
    });

    it('does not ask about fiscal information when the transfer already left (nothing to pay)', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          step: 'RELEASED',
          repairCents: 10000,
          repairerUserId: 'usr-repairer',
          stripeChargeId: 'ch_test_123',
          stripeTransferId: 'tr_already',
          transferredCents: 10000,
        },
      });

      await service.resolveRelease('admin-1', 'disp-1', 'Note suffisamment longue.');

      expect(prisma.repairerProfile.findUnique).not.toHaveBeenCalled();
      expect(fakePayments.createTransfer).not.toHaveBeenCalled();
      // The transfer is older than this release: its date is not rewritten to today.
      expect(prisma.commande.update.mock.calls[0]![0].data).not.toHaveProperty('transferredAt');
    });

    it('throws UNPROCESSABLE_ENTITY and writes nothing when createTransfer fails', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'OPEN',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          step: 'AWAITING_VALIDATION',
          repairCents: 10000,
          repairerUserId: 'usr-repairer',
          stripeChargeId: 'ch_test_123',
          stripeTransferId: null,
        },
      });
      prisma.connectAccount.findUnique.mockResolvedValue({ stripeAccountId: 'acct_test_repairer' });
      fakePayments.createTransfer.mockRejectedValueOnce(new Error('Fake transfer failure for test'));

      await expect(service.resolveRelease('admin-1', 'disp-1', 'Note suffisamment longue.')).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Le versement au réparateur a échoué. Réessayez dans quelques minutes.',
      });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.commande.update).not.toHaveBeenCalled();
      expect(prisma.dispute.update).not.toHaveBeenCalled();
    });
  });

  describe('resolveRefund', () => {
    // CF4-D task 6 (spec §6). The admin now chooses the three amounts himself;
    // resolveRefund is a pass-through to RefundService.refund, not a full-refund
    // policy. Verdict follows what RefundService actually reports it moved
    // (result.refundCents vs result.totalCents), not what the admin sent
    // (RefundService itself may clamp/plan differently).
    it('delegates the admin-chosen breakdown to RefundService, stamps REFUND_CLIENT when the refund equals the total', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'IN_REVIEW',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          repairCents: 10000,
          shippingCents: 1000,
          insuranceCents: 200,
          protectionCents: 500,
        },
      });
      refundService.refund.mockResolvedValue({ refundCents: 11700, totalCents: 11700 });

      await service.resolveRefund('admin-1', 'disp-1', {
        motif: 'DISPUTE_DECISION',
        resolutionNote: 'Colis perdu définitivement par le transporteur.',
        repairCents: 10000,
        shippingCents: 1200,
        protectionCents: 500,
      });

      expect(refundService.refund).toHaveBeenCalledWith(
        'admin-1',
        'cmd-1',
        {
          motif: 'DISPUTE_DECISION',
          note: 'Colis perdu définitivement par le transporteur.',
          repairCents: 10000,
          shippingCents: 1200,
          protectionCents: 500,
        },
        'DISPUTE_REFUNDED',
      );

      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-1' },
          data: expect.objectContaining({
            status: 'RESOLVED_REFUNDED',
            resolvedByUserId: 'admin-1',
            resolvedAt: expect.any(Date),
            verdict: 'REFUND_CLIENT',
            resolutionNote: 'Colis perdu définitivement par le transporteur.',
          }),
        }),
      );
    });

    it('stamps PARTIAL_REFUND when the refund is less than the commande total', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'IN_REVIEW',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          repairCents: 10000,
          shippingCents: 1000,
          insuranceCents: 200,
          protectionCents: 500,
        },
      });
      refundService.refund.mockResolvedValue({ refundCents: 5000, totalCents: 11700 });

      await service.resolveRefund('admin-1', 'disp-1', {
        motif: 'DISPUTE_DECISION',
        resolutionNote: 'Réparation partiellement effectuée, remboursement partiel accordé.',
        repairCents: 5000,
        shippingCents: 0,
        protectionCents: 0,
      });

      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-1' },
          data: expect.objectContaining({
            status: 'RESOLVED_REFUNDED',
            verdict: 'PARTIAL_REFUND',
            resolutionNote: 'Réparation partiellement effectuée, remboursement partiel accordé.',
          }),
        }),
      );
    });

    it('does not update the dispute when RefundService throws (dispute stays open)', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'IN_REVIEW',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
          repairCents: 10000,
          shippingCents: 1000,
          insuranceCents: 200,
          protectionCents: 500,
        },
      });
      refundService.refund.mockRejectedValue(new AppException('UNPROCESSABLE_ENTITY', 'Le remboursement a échoué.'));

      await expect(
        service.resolveRefund('admin-1', 'disp-1', {
          motif: 'DISPUTE_DECISION',
          resolutionNote: 'Note suffisamment longue.',
          repairCents: 10000,
          shippingCents: 1200,
          protectionCents: 500,
        }),
      ).rejects.toThrow(AppException);

      expect(prisma.dispute.update).not.toHaveBeenCalled();
    });

    it('throws 422 if dispute is already resolved', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'RESOLVED_REFUNDED',
      });

      await expect(
        service.resolveRefund('admin-1', 'disp-1', {
          motif: 'DISPUTE_DECISION',
          resolutionNote: 'Note',
          repairCents: 0,
          shippingCents: 0,
          protectionCents: 0,
        }),
      ).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Ce litige est déjà résolu.',
      });
    });

    it('throws 404 if dispute not found', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(
        service.resolveRefund('admin-1', 'disp-404', {
          motif: 'DISPUTE_DECISION',
          resolutionNote: 'Note',
          repairCents: 0,
          shippingCents: 0,
          protectionCents: 0,
        }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });
  });

  describe('resolveDismiss', () => {
    it('stamps dispute RESOLVED_DISMISSED, records verdict, and clears commande disputedAt without moving funds', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'IN_REVIEW',
        commandeId: 'cmd-1',
        commande: {
          id: 'cmd-1',
          status: 'PAID',
        },
      });

      await service.resolveDismiss('admin-1', 'disp-1', 'Litige sans fondement, le client a confirmé la réception.');

      expect(refundService.refund).not.toHaveBeenCalled();

      expect(prisma.commande.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cmd-1' },
          data: expect.objectContaining({
            disputedAt: null,
          }),
        }),
      );

      expect(prisma.dispute.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'disp-1' },
          data: expect.objectContaining({
            status: 'RESOLVED_DISMISSED',
            resolvedByUserId: 'admin-1',
            resolvedAt: expect.any(Date),
            verdict: 'DISMISSED',
            resolutionNote: 'Litige sans fondement, le client a confirmé la réception.',
          }),
        }),
      );
    });

    it('throws 422 if dispute is already resolved', async () => {
      prisma.dispute.findUnique.mockResolvedValue({
        id: 'disp-1',
        status: 'RESOLVED_DISMISSED',
      });

      await expect(service.resolveDismiss('admin-1', 'disp-1', 'Note')).rejects.toMatchObject({
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Ce litige est déjà résolu.',
      });
    });

    it('throws 404 if dispute not found', async () => {
      prisma.dispute.findUnique.mockResolvedValue(null);

      await expect(service.resolveDismiss('admin-1', 'disp-404', 'Note')).rejects.toMatchObject({
        code: 'NOT_FOUND',
        message: 'Ressource introuvable.',
      });
    });
  });
});
