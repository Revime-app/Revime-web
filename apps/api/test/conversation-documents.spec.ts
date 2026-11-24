import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ConversationsService } from '../src/conversations/conversations.service.js';
import { conversationAttachmentPath } from '../src/storage/attachment-paths.js';
import { AppException } from '../src/common/app-exception.js';
import { FakeStorageGateway, storageGateway } from '../src/storage/gateway.js';

describe('Conversation Documents (CF4-34)', () => {
  const convId = '11111111-1111-1111-1111-111111111111';
  const otherConvId = '99999999-9999-9999-9999-999999999999';
  const userId = 'user-client';
  const otherUserId = 'user-repairer';

  beforeEach(() => {
    process.env.MESSAGING_ENABLED = 'true';
    process.env.STORAGE_DRIVER = 'fake';
  });

  const makeService = (overrides: {
    findParticipant?: any;
    messages?: any[];
    inboxRows?: any[];
    countUnread?: any;
    createMessage?: any;
    updateConversation?: any;
  } = {}) => {
    const defaultParticipant = {
      id: convId,
      clientUserId: userId,
      repairerUserId: otherUserId,
      demandeId: 'demande-1',
      demande: { title: 'Réparation vélo' },
      client: { username: 'client1', profile: null },
      repairer: { username: 'rep1', repairerProfile: { displayName: 'Atelier' }, profile: null },
    };

    const mockPrisma = {
      conversation: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(overrides.findParticipant ?? defaultParticipant)),
        findMany: vi.fn().mockImplementation(() => Promise.resolve(overrides.inboxRows ?? [])),
        update: overrides.updateConversation ?? vi.fn().mockResolvedValue({ id: convId }),
      },
      message: {
        count: vi.fn().mockResolvedValue(0),
        findMany: vi.fn().mockImplementation(() => Promise.resolve(overrides.messages ?? [])),
        groupBy: vi.fn().mockResolvedValue([]),
        create: overrides.createMessage ?? vi.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'msg-1', ...data })),
      },
      user: {
        findFirst: vi.fn().mockResolvedValue({ username: 'client1', repairerProfile: null }),
      },
      commande: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      offer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      $transaction: vi.fn().mockImplementation((ops: any[]) => Promise.all(ops)),
    };

    const mockModeration = {
      blockStateFor: vi.fn().mockResolvedValue({ active: false, byMe: false }),
    };

    const mockNotifications = {
      emit: vi.fn().mockResolvedValue(undefined),
      markConversationNotificationRead: vi.fn().mockResolvedValue(undefined),
    };

    const service = new ConversationsService(
      mockPrisma as any,
      mockModeration as any,
      mockNotifications as any,
    );

    return { service, mockPrisma, mockNotifications };
  };

  it('sendMessage with documentPath under ANOTHER conversation throws 422 and does not write', async () => {
    const createMessage = vi.fn();
    const { service } = makeService({ createMessage });

    const forgedPath = conversationAttachmentPath(otherConvId, 'application/pdf');

    await expect(
      service.sendMessage(userId, convId, {
        body: 'Voici la facture',
        documentPath: forgedPath,
        documentName: 'facture.pdf',
        documentSizeBytes: 1024,
      }),
    ).rejects.toThrow('Pièce jointe invalide.');

    expect(createMessage).not.toHaveBeenCalled();
  });

  it('valid document stores documentPath, documentName, documentSizeBytes, only writes USER kind, and notifies with 📄 Document', async () => {
    const createMessage = vi.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'msg-doc-1',
        createdAt: new Date('2026-10-01T10:00:00Z'),
        ...data,
      }),
    );
    const { service, mockNotifications } = makeService({ createMessage });

    const validPath = conversationAttachmentPath(convId, 'application/pdf');

    const result = await service.sendMessage(userId, convId, {
      body: '',
      documentPath: validPath,
      documentName: 'devis.pdf',
      documentSizeBytes: 2048,
    });

    expect(createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: convId,
          senderUserId: userId,
          body: '',
          documentPath: validPath,
          documentName: 'devis.pdf',
          documentSizeBytes: 2048,
          kind: 'USER',
        }),
      }),
    );

    expect(result.kind).toBe('USER');
    expect(mockNotifications.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        messagePreview: '📄 Document',
      }),
    );
  });

  it('getThread returns signed document object from the attachment bucket', async () => {
    const docPath = conversationAttachmentPath(convId, 'application/pdf');
    const fakeGateway = storageGateway() as FakeStorageGateway;
    fakeGateway.seed(docPath);

    const messages = [
      {
        id: 'msg-1',
        body: '',
        photoPath: null,
        documentPath: docPath,
        documentName: 'rapport.pdf',
        documentSizeBytes: 5000,
        senderUserId: userId,
        kind: 'USER',
        createdAt: new Date('2026-10-01T10:00:00Z'),
      },
    ];

    const { service } = makeService({ messages });
    const thread = await service.getThread(userId, convId);

    expect(thread.messages).toHaveLength(1);
    expect(thread.messages[0]!.document).toEqual({
      url: expect.stringContaining(docPath),
      name: 'rapport.pdf',
      sizeBytes: 5000,
    });
  });

  it('inbox preview displays 📄 Document for a document-only message', async () => {
    const docPath = conversationAttachmentPath(convId, 'application/pdf');
    const inboxRows = [
      {
        id: convId,
        demandeId: 'demande-1',
        clientUserId: userId,
        lastMessageAt: new Date('2026-10-01T10:00:00Z'),
        clientLastReadAt: null,
        repairerLastReadAt: null,
        demande: { title: 'Réparation vélo' },
        client: { username: 'client1', profile: null },
        repairer: { username: 'rep1', repairerProfile: { displayName: 'Atelier' }, profile: null },
        messages: [
          {
            body: '',
            photoPath: null,
            documentPath: docPath,
          },
        ],
      },
    ];

    const { service } = makeService({ inboxRows });
    const inbox = await service.listInbox(userId);

    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.preview).toBe('📄 Document');
  });
});
