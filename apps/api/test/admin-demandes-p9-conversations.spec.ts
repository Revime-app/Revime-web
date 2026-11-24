import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminDemandesService } from '../src/admin/admin-demandes.service.js';
import { FakeStorageGateway, __resetStorageGateway, storageGateway } from '../src/storage/gateway.js';

const DEMANDE_ROW = {
  id: 'demande-1',
  title: 'iPhone 13 écran cassé',
  description: 'Écran fissuré suite à une chute',
  brand: 'Apple',
  model: 'iPhone 13',
  parts: 'ORIGINAL',
  mode: 'OFFERS',
  budgetCents: 15000,
  locationLabel: 'Lyon 3e',
  postalCode: '69003',
  status: 'OPEN',
  categoryId: 'cat-phones',
  createdAt: new Date('2026-10-10T09:00:00Z'),
  deletedAt: null,
  hiddenAt: null,
  hiddenReason: null,
  deletedReason: null,
  hiddenByUserId: null,
  deletedByUserId: null,
  targetRepairerUserId: null,
  quoteClosedReason: null,
  author: { id: 'client-user-1', name: 'Jean Dupont', email: 'jean@example.com' },
  category: { labelFr: 'Smartphones' },
  photos: [{ storagePath: 'demandes/demande-1/screen.jpg' }],
  offers: [],
  commandes: [],
};

function createStubPrisma(demandeRow: unknown = DEMANDE_ROW, conversations: unknown[] = []) {
  return {
    demande: {
      findUnique: vi.fn().mockResolvedValue(demandeRow),
    },
    $transaction: vi.fn().mockResolvedValue([
      conversations, // conversations in $transaction
      [],            // conversationReports
      [],            // reviews
      [],            // adminAuditLogs
      0,             // pendingPaymentCount
    ]),
    user: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    conversation: {
      findMany: vi.fn().mockResolvedValue(conversations),
    },
    conversationReport: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    review: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    adminAuditLog: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    commande: {
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

describe('AdminDemandesService - P9 Conversations & Photos', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    __resetStorageGateway();
    process.env.STORAGE_DRIVER = 'fake';
  });

  afterEach(() => {
    process.env = { ...savedEnv };
    __resetStorageGateway();
  });

  it('returns conversations array with thread details, messages, sender roles and timestamps', async () => {
    const thread1 = {
      id: 'conv-1',
      demandeId: 'demande-1',
      clientUserId: 'client-user-1',
      repairerUserId: 'rep-user-1',
      repairer: { id: 'rep-user-1', name: 'Atelier Réparation Lyon' },
      createdAt: new Date('2026-10-10T10:00:00Z'),
      messages: [
        {
          id: 'msg-1',
          kind: 'USER',
          deletedAt: null,
          senderUserId: 'client-user-1',
          body: 'Bonjour, pouvez-vous réparer mon écran aujourd’hui ?',
          createdAt: new Date('2026-10-10T10:05:00Z'),
        },
        {
          id: 'msg-2',
          kind: 'USER',
          deletedAt: null,
          senderUserId: 'rep-user-1',
          body: 'Oui tout à fait, nous avons la pièce en stock.',
          createdAt: new Date('2026-10-10T10:15:00Z'),
        },
      ],
    };

    const thread2 = {
      id: 'conv-2',
      demandeId: 'demande-1',
      clientUserId: 'client-user-1',
      repairerUserId: 'rep-user-2',
      repairer: { id: 'rep-user-2', name: 'iDoc Express' },
      createdAt: new Date('2026-10-10T11:00:00Z'),
      messages: [
        {
          id: 'msg-3',
          kind: 'USER',
          deletedAt: null,
          senderUserId: 'rep-user-2',
          body: 'Bonjour, nous pouvons intervenir demain.',
          createdAt: new Date('2026-10-10T11:05:00Z'),
        },
      ],
    };

    const prisma = createStubPrisma(DEMANDE_ROW, [thread1, thread2]);
    const service = new AdminDemandesService(prisma as never);

    const detail = await service.detail('demande-1');

    expect(detail.conversations).toHaveLength(2);

    // Thread 1
    const t1 = detail.conversations[0]!;
    expect(t1.id).toBe('conv-1');
    expect(t1.repairerId).toBe('rep-user-1');
    expect(t1.repairerName).toBe('Atelier Réparation Lyon');
    expect(t1.messages).toHaveLength(2);
    expect(t1.messages[0]).toEqual({
      id: 'msg-1',
      senderRole: 'CLIENT',
      content: 'Bonjour, pouvez-vous réparer mon écran aujourd’hui ?',
      createdAt: '2026-10-10T10:05:00.000Z',
      deleted: false,
    });
    expect(t1.messages[1]).toEqual({
      id: 'msg-2',
      senderRole: 'REPAIRER',
      content: 'Oui tout à fait, nous avons la pièce en stock.',
      createdAt: '2026-10-10T10:15:00.000Z',
      deleted: false,
    });

    // Thread 2
    const t2 = detail.conversations[1]!;
    expect(t2.id).toBe('conv-2');
    expect(t2.repairerId).toBe('rep-user-2');
    expect(t2.repairerName).toBe('iDoc Express');
    expect(t2.messages).toHaveLength(1);
    expect(t2.messages[0]).toEqual({
      id: 'msg-3',
      senderRole: 'REPAIRER',
      content: 'Bonjour, nous pouvons intervenir demain.',
      createdAt: '2026-10-10T11:05:00.000Z',
      deleted: false,
    });
  });

  it('labels a SYSTEM line as SYSTEM and flags a moderated message, and asks the database for both', async () => {
    const thread = {
      id: 'conv-3',
      demandeId: 'demande-1',
      clientUserId: 'client-user-1',
      repairerUserId: 'rep-user-1',
      repairer: { id: 'rep-user-1', name: 'Atelier Lyon' },
      createdAt: new Date('2026-10-11T10:00:00Z'),
      messages: [
        {
          id: 'msg-sys',
          kind: 'SYSTEM',
          senderUserId: null,
          body: 'Paiement effectué',
          createdAt: new Date('2026-10-11T10:01:00Z'),
          deletedAt: null,
        },
        {
          id: 'msg-del',
          kind: 'USER',
          senderUserId: 'rep-user-1',
          body: 'Message retiré',
          createdAt: new Date('2026-10-11T10:02:00Z'),
          deletedAt: new Date('2026-10-11T11:00:00Z'),
        },
      ],
    };
    const prisma = createStubPrisma(DEMANDE_ROW, [thread]);
    const detail = await new AdminDemandesService(prisma as never).detail('demande-1');

    const [sys, del] = detail.conversations[0]!.messages;
    expect(sys).toMatchObject({ id: 'msg-sys', senderRole: 'SYSTEM', deleted: false });
    expect(del).toMatchObject({ id: 'msg-del', senderRole: 'REPAIRER', deleted: true });

    const select = prisma.conversation.findMany.mock.calls[0]![0].include.messages.select;
    expect(select).toMatchObject({ kind: true, deletedAt: true, body: true, senderUserId: true });
  });

  it('returns empty conversations array when no conversations exist', async () => {
    const prisma = createStubPrisma(DEMANDE_ROW, []);
    const service = new AdminDemandesService(prisma as never);

    const detail = await service.detail('demande-1');

    expect(detail.conversations).toEqual([]);
  });

  it('signs photo URLs properly and returns empty array when no photos attached', async () => {
    const gw = storageGateway() as FakeStorageGateway;
    gw.seed('demandes/demande-1/screen.jpg');

    const prismaWithPhotos = createStubPrisma(DEMANDE_ROW, []);
    const service = new AdminDemandesService(prismaWithPhotos as never);

    const withPhotos = await service.detail('demande-1');
    expect(withPhotos.photoUrls).toHaveLength(1);
    expect(withPhotos.photoUrls[0]).toContain('demandes/demande-1/screen.jpg');

    const prismaNoPhotos = createStubPrisma({ ...DEMANDE_ROW, photos: [] }, []);
    const serviceNoPhotos = new AdminDemandesService(prismaNoPhotos as never);

    const noPhotos = await serviceNoPhotos.detail('demande-1');
    expect(noPhotos.photoUrls).toEqual([]);
  });
});
