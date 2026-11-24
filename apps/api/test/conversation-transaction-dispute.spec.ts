import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConversationsService } from '../src/conversations/conversations.service.js';

describe('ConversationsService — Transaction dispute flag (Bug V4)', () => {
  const convId = '11111111-1111-1111-1111-111111111111';
  const userId = 'user-client';
  const otherUserId = 'user-repairer';
  const commandeId = 'cmd-12345678-0000-0000-0000-000000000000';

  beforeEach(() => {
    process.env.MESSAGING_ENABLED = 'true';
    process.env.STORAGE_DRIVER = 'fake';
  });

  const makeService = (commandeOverride: any) => {
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
        findFirst: vi.fn().mockResolvedValue(defaultParticipant),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      commande: {
        findFirst: vi.fn().mockResolvedValue(commandeOverride),
      },
      offer: {
        findMany: vi.fn().mockResolvedValue([]),
      },
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

    return { service, mockPrisma };
  };

  it('populates transaction.disputeOpen = true and dispute.status = "OPEN" when activeCommande has an OPEN dispute', async () => {
    const mockCommande = {
      id: commandeId,
      status: 'PAID',
      step: 'REPAIR_STARTED',
      totalCents: 10000,
      updatedAt: new Date('2026-10-12T10:00:00Z'),
      demande: { title: 'Écran iPhone' },
      dispute: {
        id: 'disp-1',
        number: 42,
        status: 'OPEN',
        clientLastReadAt: new Date('2026-10-12T10:00:00Z'),
        repairerLastReadAt: null,
        messages: [],
      },
    };

    const { service } = makeService(mockCommande);
    const result = await service.getThread(userId, convId);

    expect(result.transaction).not.toBeNull();
    expect(result.transaction?.disputeOpen).toBe(true);
    expect(result.dispute).not.toBeNull();
  });

  it('populates transaction.disputeOpen = false when activeCommande has no dispute', async () => {
    const mockCommande = {
      id: commandeId,
      status: 'PAID',
      step: 'REPAIR_STARTED',
      totalCents: 10000,
      updatedAt: new Date('2026-10-12T10:00:00Z'),
      demande: { title: 'Écran iPhone' },
      dispute: null,
    };

    const { service } = makeService(mockCommande);
    const result = await service.getThread(userId, convId);

    expect(result.transaction).not.toBeNull();
    expect(result.transaction?.disputeOpen).toBe(false);
    expect(result.dispute).toBeNull();
  });

  it('populates transaction.disputeOpen = false when activeCommande dispute is RESOLVED_REFUNDED', async () => {
    const mockCommande = {
      id: commandeId,
      status: 'REFUNDED',
      step: 'REPAIR_STARTED',
      totalCents: 10000,
      updatedAt: new Date('2026-10-12T10:00:00Z'),
      demande: { title: 'Écran iPhone' },
      dispute: {
        id: 'disp-1',
        number: 42,
        status: 'RESOLVED_REFUNDED',
        clientLastReadAt: new Date('2026-10-12T10:00:00Z'),
        repairerLastReadAt: null,
        messages: [],
      },
    };

    const { service } = makeService(mockCommande);
    const result = await service.getThread(userId, convId);

    expect(result.transaction).not.toBeNull();
    expect(result.transaction?.disputeOpen).toBe(false);
    expect(result.dispute).not.toBeNull();
  });
});
