import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DisputesService } from '../src/disputes/disputes.service.js';
import { CommandeAnnouncer } from '../src/commandes/commande-announcer.service.js';
import { AppException } from '../src/common/app-exception.js';
import { disputeAttachmentPath } from '../src/storage/attachment-paths.js';
import { DISPUTE_MOTIFS } from '@revime/shared';

describe('DisputesService.open (CF4-28)', () => {
  const cmdId = '11111111-1111-1111-1111-111111111111';
  const clientId = 'user-client-1';
  const repairerId = 'user-repairer-1';
  const strangerId = 'user-stranger-9';

  let mockPrisma: any;
  let mockTx: any;
  let mockAnnouncer: any;
  let service: DisputesService;

  beforeEach(() => {
    mockTx = {
      commande: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update: vi.fn().mockResolvedValue({ id: cmdId }),
      },
      dispute: {
        upsert: vi.fn().mockResolvedValue({
          id: 'disp-1',
          number: 42,
          commandeId: cmdId,
          status: 'OPEN',
        }),
      },
      disputeMessage: {
        createMany: vi.fn().mockResolvedValue({ count: 3 }),
      },
      cancellationRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    };

    mockPrisma = {
      commande: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn().mockImplementation((fn: (tx: any) => any) => fn(mockTx)),
    };

    mockAnnouncer = {
      announce: vi.fn().mockResolvedValue(undefined),
    };

    service = new DisputesService(mockPrisma as any, mockAnnouncer as any);
  });

  const baseCommande = {
    id: cmdId,
    clientUserId: clientId,
    repairerUserId: repairerId,
    status: 'PAID',
    stripeTransferId: null,
    stripeTransferReversalId: null,
    dispute: null,
  };

  it('stranger gets 404 identical to nonexistent commande', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue(null);
    await expect(
      service.open(strangerId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Ressource introuvable.',
    });

    mockPrisma.commande.findUnique.mockResolvedValue(baseCommande);
    await expect(
      service.open(strangerId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'NOT_FOUND',
      message: 'Ressource introuvable.',
    });
  });

  it('client picking CLIENT_UNREACHABLE throws 422 WRONG_MOTIF', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue(baseCommande);
    await expect(
      service.open(clientId, cmdId, {
        motif: 'CLIENT_UNREACHABLE',
        description: 'Je ne peux pas joindre le client (alors que je suis client).',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: "Ce motif n'est pas disponible.",
    });
  });

  it('REFUNDED, stripeTransferId set, or stripeTransferReversalId set throws NOT_ELIGIBLE', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue({
      ...baseCommande,
      status: 'REFUNDED',
    });
    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: "Cette commande ne permet plus d'ouvrir un litige.",
    });

    mockPrisma.commande.findUnique.mockResolvedValue({
      ...baseCommande,
      stripeTransferId: 'tr_123',
    });
    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: "Cette commande ne permet plus d'ouvrir un litige.",
    });

    mockPrisma.commande.findUnique.mockResolvedValue({
      ...baseCommande,
      stripeTransferReversalId: 'trr_123',
    });
    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: "Cette commande ne permet plus d'ouvrir un litige.",
    });
  });

  it('OPEN or IN_REVIEW dispute throws DISPUTE_ALREADY_OPEN', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue({
      ...baseCommande,
      dispute: { status: 'OPEN' },
    });
    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Un litige est déjà ouvert pour cette commande.',
    });

    mockPrisma.commande.findUnique.mockResolvedValue({
      ...baseCommande,
      dispute: { status: 'IN_REVIEW' },
    });
    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Un litige est déjà ouvert pour cette commande.',
    });
  });

  it('RESOLVED_* dispute throws ALREADY_RESOLVED', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue({
      ...baseCommande,
      dispute: { status: 'RESOLVED_REFUNDED' },
    });
    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Un litige a déjà été traité pour cette commande. Contactez le support.',
    });
  });

  it('attachment under the reparateur prefix from the client throws 422 before any write', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue(baseCommande);

    const forgedRepPath = disputeAttachmentPath(cmdId, 'REPAIRER', 'image/jpeg');

    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [{ kind: 'photo', path: forgedRepPath }],
      }),
    ).rejects.toMatchObject({
      code: 'UNPROCESSABLE_ENTITY',
      message: 'Pièce jointe invalide.',
    });

    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockTx.dispute.upsert).not.toHaveBeenCalled();
  });

  it('CAS updateMany count 0 throws STATE_CHANGED with NO dispute created', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue(baseCommande);
    mockTx.commande.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.open(clientId, cmdId, {
        motif: 'REPAIR_NON_CONFORMING',
        description: 'La réparation ne fonctionne pas du tout.',
        attachments: [],
      }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: "La commande a changé d'état entre-temps.",
    });

    expect(mockTx.commande.updateMany).toHaveBeenCalledWith({
      where: {
        id: cmdId,
        status: 'PAID',
        stripeTransferId: null,
        disputedAt: null,
      },
      data: {
        disputedAt: expect.any(Date),
      },
    });
    expect(mockTx.dispute.upsert).not.toHaveBeenCalled();
  });

  it('happy path (client, 1 photo + 1 pdf): creates dispute and 3 space messages, supersedes cancellation, announces after commit', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue(baseCommande);

    const clientPhotoPath = disputeAttachmentPath(cmdId, 'CLIENT', 'image/jpeg');
    const clientDocPath = disputeAttachmentPath(cmdId, 'CLIENT', 'application/pdf');

    const result = await service.open(clientId, cmdId, {
      motif: 'REPAIR_NON_CONFORMING',
      description: 'La réparation ne fonctionne pas du tout.',
      attachments: [
        { kind: 'photo', path: clientPhotoPath },
        { kind: 'document', path: clientDocPath, name: 'rapport.pdf', sizeBytes: 2048 },
      ],
    });

    expect(result).toEqual({
      number: 42,
      reference: '#LIT-0042',
    });

    expect(mockTx.dispute.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { commandeId: cmdId },
        create: expect.objectContaining({
          commandeId: cmdId,
          status: 'OPEN',
          initiator: 'CLIENT',
          openedByUserId: clientId,
          motif: 'REPAIR_NON_CONFORMING',
          reason: DISPUTE_MOTIFS.REPAIR_NON_CONFORMING.label,
          description: 'La réparation ne fonctionne pas du tout.',
          evidencePhotos: [clientPhotoPath],
        }),
      }),
    );

    expect(mockTx.disputeMessage.createMany).toHaveBeenCalledWith({
      data: [
        {
          disputeId: 'disp-1',
          space: 'CLIENT',
          author: 'PARTY',
          senderUserId: clientId,
          body: 'La réparation ne fonctionne pas du tout.',
          photoPath: null,
          documentPath: null,
          documentName: null,
          documentSizeBytes: null,
        },
        {
          disputeId: 'disp-1',
          space: 'CLIENT',
          author: 'PARTY',
          senderUserId: clientId,
          body: '',
          photoPath: clientPhotoPath,
          documentPath: null,
          documentName: null,
          documentSizeBytes: null,
        },
        {
          disputeId: 'disp-1',
          space: 'CLIENT',
          author: 'PARTY',
          senderUserId: clientId,
          body: '',
          photoPath: null,
          documentPath: clientDocPath,
          documentName: 'rapport.pdf',
          documentSizeBytes: 2048,
        },
      ],
    });

    expect(mockTx.cancellationRequest.updateMany).toHaveBeenCalledWith({
      where: { commandeId: cmdId, status: 'PENDING' },
      data: expect.objectContaining({
        status: 'SUPERSEDED',
        decidedByUserId: clientId,
      }),
    });

    expect(mockTx.commande.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: cmdId },
        data: { cancellationRequestedAt: null },
      }),
    );

    expect(mockAnnouncer.announce).toHaveBeenCalledWith(
      cmdId,
      'DISPUTE_OPENED',
      null,
      { openerUserId: clientId },
    );
  });

  it('reparateur path writes space REPAIRER and initiator REPAIRER', async () => {
    mockPrisma.commande.findUnique.mockResolvedValue(baseCommande);

    const repPhotoPath = disputeAttachmentPath(cmdId, 'REPAIRER', 'image/jpeg');

    const result = await service.open(repairerId, cmdId, {
      motif: 'CLIENT_UNREACHABLE',
      description: 'Le client ne répond plus depuis trois jours.',
      attachments: [{ kind: 'photo', path: repPhotoPath }],
    });

    expect(result).toEqual({
      number: 42,
      reference: '#LIT-0042',
    });

    expect(mockTx.dispute.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          initiator: 'REPAIRER',
          openedByUserId: repairerId,
          motif: 'CLIENT_UNREACHABLE',
          reason: DISPUTE_MOTIFS.CLIENT_UNREACHABLE.label,
        }),
      }),
    );

    expect(mockTx.disputeMessage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          space: 'REPAIRER',
          author: 'PARTY',
          senderUserId: repairerId,
        }),
      ]),
    });

    expect(mockAnnouncer.announce).toHaveBeenCalledWith(
      cmdId,
      'DISPUTE_OPENED',
      null,
      { openerUserId: repairerId },
    );
  });
});

describe('CommandeAnnouncer (CF4-28)', () => {
  it('with opener: notifies ONLY the other party with actorName set', async () => {
    const mockPrisma = {
      commande: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cmd-1',
          clientUserId: 'client-1',
          repairerUserId: 'rep-1',
          demandeId: 'd-1',
          repairCents: 5000,
          transferredCents: null,
          demande: { title: 'Réparation vélo' },
          client: { username: 'john_client' },
          repairer: { username: 'pro_rep', repairerProfile: { displayName: 'Atelier Super' } },
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const mockNotifications = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    const announcer = new CommandeAnnouncer(mockPrisma as any, mockNotifications as any);

    // Client is opener -> notifies only repairer with client's @username
    await announcer.announce('cmd-1', 'DISPUTE_OPENED', null, { openerUserId: 'client-1' });

    expect(mockNotifications.emit).toHaveBeenCalledTimes(1);
    expect(mockNotifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rep-1',
        mode: 'REPAIRER',
        type: 'DISPUTE_OPENED',
        actorName: '@john_client',
      }),
    );

    mockNotifications.emit.mockClear();

    // Repairer is opener -> notifies only client with repairer's displayName
    await announcer.announce('cmd-1', 'DISPUTE_OPENED', null, { openerUserId: 'rep-1' });

    expect(mockNotifications.emit).toHaveBeenCalledTimes(1);
    expect(mockNotifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'client-1',
        mode: 'CLIENT',
        type: 'DISPUTE_OPENED',
        actorName: 'Atelier Super',
      }),
    );
  });

  it('without opener: notifies both parties as before', async () => {
    const mockPrisma = {
      commande: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'cmd-1',
          clientUserId: 'client-1',
          repairerUserId: 'rep-1',
          demandeId: 'd-1',
          repairCents: 5000,
          transferredCents: null,
          demande: { title: 'Réparation vélo' },
          client: { username: 'john_client' },
          repairer: { username: 'pro_rep', repairerProfile: { displayName: 'Atelier Super' } },
        }),
      },
      conversation: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    };

    const mockNotifications = {
      emit: vi.fn().mockResolvedValue(undefined),
    };

    const announcer = new CommandeAnnouncer(mockPrisma as any, mockNotifications as any);

    await announcer.announce('cmd-1', 'DISPUTE_OPENED');

    expect(mockNotifications.emit).toHaveBeenCalledTimes(2);
    expect(mockNotifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'client-1',
        mode: 'CLIENT',
        type: 'DISPUTE_OPENED',
      }),
    );
    expect(mockNotifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rep-1',
        mode: 'REPAIRER',
        type: 'DISPUTE_OPENED',
      }),
    );
  });
});
