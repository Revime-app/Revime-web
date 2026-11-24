import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ConversationsService } from '../src/conversations/conversations.service.js';
import { FakeStorageGateway, __resetStorageGateway } from '../src/storage/gateway.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { ModerationService } from '../src/conversations/moderation.service.js';
import type { NotificationsService } from '../src/notifications/notifications.service.js';

describe('CF5-14: ConversationListItem.userRole', () => {
  const USER_ME = 'user-dual-role';
  const OTHER_USER_A = 'other-user-a';
  const OTHER_USER_B = 'other-user-b';

  beforeEach(() => {
    __resetStorageGateway();
    process.env.STORAGE_DRIVER = 'fake';
  });

  afterEach(() => {
    __resetStorageGateway();
  });

  function createServiceWithRows(
    rows: {
      id: string;
      clientUserId: string;
      repairerUserId: string;
      title?: string;
    }[],
  ): ConversationsService {
    const shaped = rows.map((r) => ({
      id: r.id,
      demandeId: 'demande-1',
      clientUserId: r.clientUserId,
      repairerUserId: r.repairerUserId,
      lastMessageAt: new Date('2026-10-04T04:00:00Z'),
      clientLastReadAt: null,
      repairerLastReadAt: null,
      demande: { title: r.title ?? 'Réparation smartphone' },
      client: { username: 'client_usr', profile: { avatarPath: null } },
      repairer: {
        username: 'rep_usr',
        repairerProfile: { displayName: 'Atelier Réparation' },
        profile: { avatarPath: null },
      },
      messages: [{ body: 'Bonjour, devis disponible ?', photoPath: null, documentPath: null }],
    }));

    const prisma = {
      conversation: { findMany: vi.fn().mockResolvedValue(shaped) },
      message: { groupBy: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    return new ConversationsService(
      prisma,
      {} as ModerationService,
      {} as NotificationsService,
    );
  }

  it('assigns userRole: CLIENT when caller is the clientUserId', async () => {
    const service = createServiceWithRows([
      { id: 'c1', clientUserId: USER_ME, repairerUserId: OTHER_USER_A },
    ]);

    const inbox = await service.listInbox(USER_ME);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.userRole).toBe('CLIENT');
  });

  it('assigns userRole: REPAIRER when caller is the repairerUserId', async () => {
    const service = createServiceWithRows([
      { id: 'c2', clientUserId: OTHER_USER_B, repairerUserId: USER_ME },
    ]);

    const inbox = await service.listInbox(USER_ME);
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.userRole).toBe('REPAIRER');
  });

  it('distinguishes client vs repairer roles across multiple conversations in a mixed inbox', async () => {
    const service = createServiceWithRows([
      { id: 'c1', clientUserId: USER_ME, repairerUserId: OTHER_USER_A, title: 'Vélo cassé' },
      { id: 'c2', clientUserId: OTHER_USER_B, repairerUserId: USER_ME, title: 'iPhone écran' },
    ]);

    const inbox = await service.listInbox(USER_ME);
    expect(inbox).toHaveLength(2);
    expect(inbox[0]!.userRole).toBe('CLIENT');
    expect(inbox[1]!.userRole).toBe('REPAIRER');
  });
});
