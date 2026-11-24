import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';
import type { DisputeTimelineEvent } from '@revime/shared';

function makePrismaMock() {
  const mock = {
    dispute: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    commande: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn((cb: any) => (typeof cb === 'function' ? cb(mock) : Promise.all(cb))),
  } as any;
  return mock;
}

describe('AdminDisputesService P18 - Unified Chronology Timeline & Processing Time', () => {
  let prisma: any;
  let service: AdminDisputesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminDisputesService(prisma, {} as any, { announce: vi.fn() } as any);
  });

  it('compiles full chronological timeline from opened, assigned, notes, messages and resolution', async () => {
    const createdAt = new Date('2026-10-01T08:00:00.000Z');
    const assignedAt = new Date('2026-10-02T10:00:00.000Z');
    const noteCreatedAt = '2026-10-03T11:00:00.000Z';
    const messageCreatedAt = new Date('2026-10-04T14:30:00.000Z');
    const resolvedAt = new Date('2026-10-06T16:00:00.000Z');

    const mockDisputeRecord = {
      id: 'disp-p18-full',
      commandeId: 'cmd-p18',
      number: 18,
      status: 'RESOLVED_REFUNDED',
      initiator: 'CLIENT',
      reason: 'Écran de remplacement fissuré',
      description: 'Le nouvel écran s’est fissuré après 2 jours',
      motif: 'POOR_WORKMANSHIP',
      evidencePhotos: [],
      assignedToUserId: 'usr-admin-1',
      assignedAt,
      resolvedByUserId: 'usr-admin-arbitre',
      resolvedAt,
      verdict: 'REFUND_CLIENT',
      resolutionNote: 'Remboursement accordé suite aux photos fournies',
      adminNotes: [
        {
          id: 'note-1',
          adminUserId: 'usr-admin-1',
          adminName: 'Claire Admin',
          note: 'Appel passé avec le réparateur pour demander des explications.',
          createdAt: noteCreatedAt,
        },
      ],
      messages: [
        {
          id: 'msg-space-1',
          space: 'CLIENT',
          author: 'PARTY',
          senderUserId: 'usr-client-1',
          body: 'Voici les précisions demandées.',
          createdAt: messageCreatedAt,
        },
      ],
      createdAt,
      updatedAt: resolvedAt,
      commande: {
        id: 'cmd-p18',
        status: 'REFUNDED',
        repairCents: 12000,
        totalCents: 15000,
        refundedCents: 15000,
        client: { id: 'usr-client-1', name: 'Jean Client', email: 'jean@client.fr' },
        repairer: { id: 'usr-repairer-1', name: 'Atelier Express', email: 'atelier@rep.fr' },
        shipments: [],
        demande: { photos: [], conversations: [] },
      },
    };

    prisma.dispute.findUnique.mockResolvedValue(mockDisputeRecord);
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id === 'usr-admin-1') {
        return Promise.resolve({ id: 'usr-admin-1', name: 'Claire Admin', email: 'claire@revime.fr' });
      }
      if (where.id === 'usr-admin-arbitre') {
        return Promise.resolve({ id: 'usr-admin-arbitre', name: 'Marc Arbitre', email: 'marc@revime.fr' });
      }
      return Promise.resolve(null);
    });

    const dossier = await service.getDossier('disp-p18-full');

    expect(dossier).toBeDefined();
    // FND-632: the sheet names the resolver instead of printing the raw user id
    expect(dossier.dispute.resolvedByName).toBe('Marc Arbitre');
    expect(dossier.processingTimeDays).toBe(5); // 2026-10-06 minus 2026-10-01 = 5 days

    expect(dossier.timeline).toBeDefined();
    expect(Array.isArray(dossier.timeline)).toBe(true);
    expect(dossier.timeline.length).toBe(5);

    // Verify chronological ordering
    const timestamps = dossier.timeline.map((e: DisputeTimelineEvent) => new Date(e.timestamp).getTime());
    for (let i = 1; i < timestamps.length; i++) {
      expect(timestamps[i]!).toBeGreaterThanOrEqual(timestamps[i - 1]!);
    }

    // 1. DISPUTE_OPENED
    const openedEvent = dossier.timeline.find((e: DisputeTimelineEvent) => e.type === 'DISPUTE_OPENED');
    expect(openedEvent).toBeDefined();
    expect(openedEvent?.actorRole).toBe('CLIENT');
    expect(openedEvent?.actorName).toBe('Jean Client');
    expect(openedEvent?.summary).toContain('Écran de remplacement fissuré');

    // 2. ASSIGNED
    const assignedEvent = dossier.timeline.find((e: DisputeTimelineEvent) => e.type === 'ASSIGNED');
    expect(assignedEvent).toBeDefined();
    expect(assignedEvent?.actorRole).toBe('ADMIN');
    expect(assignedEvent?.actorName).toBe('Claire Admin');
    expect(assignedEvent?.summary).toContain('Claire Admin');

    // 3. NOTE_ADDED
    const noteEvent = dossier.timeline.find((e: DisputeTimelineEvent) => e.type === 'NOTE_ADDED');
    expect(noteEvent).toBeDefined();
    expect(noteEvent?.actorRole).toBe('ADMIN');
    expect(noteEvent?.actorName).toBe('Claire Admin');
    expect(noteEvent?.summary).toContain('Appel passé avec le réparateur');

    // 4. MESSAGE_EXCHANGED
    const msgEvent = dossier.timeline.find((e: DisputeTimelineEvent) => e.type === 'MESSAGE_EXCHANGED');
    expect(msgEvent).toBeDefined();
    expect(msgEvent?.actorRole).toBe('CLIENT');
    expect(msgEvent?.actorName).toBe('Jean Client');
    expect(msgEvent?.summary).toContain('Voici les précisions demandées.');

    // 5. DISPUTE_RESOLVED
    const resolvedEvent = dossier.timeline.find((e: DisputeTimelineEvent) => e.type === 'DISPUTE_RESOLVED');
    expect(resolvedEvent).toBeDefined();
    expect(resolvedEvent?.actorRole).toBe('ADMIN');
    expect(resolvedEvent?.actorName).toBe('Marc Arbitre');
    expect(resolvedEvent?.summary).toContain('REFUND_CLIENT');
  });

  it('calculates processingTimeDays for ongoing unresolved dispute relative to now', async () => {
    // 3 days ago
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000 - 3600 * 1000);

    const mockUnresolved = {
      id: 'disp-ongoing',
      commandeId: 'cmd-ongoing',
      number: 19,
      status: 'OPEN',
      initiator: 'REPAIRER',
      reason: 'Non-réception de la pièce',
      assignedToUserId: null,
      assignedAt: null,
      resolvedByUserId: null,
      resolvedAt: null,
      adminNotes: [],
      messages: [],
      createdAt: threeDaysAgo,
      updatedAt: threeDaysAgo,
      commande: {
        id: 'cmd-ongoing',
        status: 'PAID',
        repairCents: 8000,
        totalCents: 9500,
        client: { id: 'c-1', name: 'Alice Client', email: 'alice@c.fr' },
        repairer: { id: 'r-1', name: 'Bob Reparateur', email: 'bob@r.fr' },
      },
    };

    prisma.dispute.findUnique.mockResolvedValue(mockUnresolved);

    const dossier = await service.getDossier('disp-ongoing');

    expect(dossier.processingTimeDays).toBe(3);
    expect(dossier.timeline.length).toBe(1);
    expect(dossier.timeline[0]?.type).toBe('DISPUTE_OPENED');
    expect(dossier.timeline[0]?.actorRole).toBe('REPAIRER');
    expect(dossier.timeline[0]?.actorName).toBe('Bob Reparateur');
  });
});
