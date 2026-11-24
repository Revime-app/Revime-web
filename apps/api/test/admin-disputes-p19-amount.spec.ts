import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AdminDisputesService } from '../src/admin/admin-disputes.service.js';

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

describe('AdminDisputesService P19 - Escrow & Service Amount Reconciliation', () => {
  let prisma: any;
  let service: AdminDisputesService;

  beforeEach(() => {
    prisma = makePrismaMock();
    service = new AdminDisputesService(prisma, {} as any, { announce: vi.fn() } as any);
  });

  const mockDisputeRecord = {
    id: 'disp-p19-escrow-1',
    commandeId: 'cmd-p19-1',
    number: 19,
    status: 'OPEN',
    initiator: 'CLIENT',
    reason: 'Prestation incomplète et colis retour endommagé',
    description: 'Le réparateur n’a pas réparé le bouton home et l’écran a été rayé.',
    motif: 'POOR_WORKMANSHIP',
    evidencePhotos: [],
    assignedToUserId: null,
    assignedAt: null,
    resolvedByUserId: null,
    resolvedAt: null,
    verdict: null,
    resolutionNote: null,
    adminNotes: [],
    messages: [],
    createdAt: new Date('2026-10-10T12:00:00.000Z'),
    updatedAt: new Date('2026-10-10T12:00:00.000Z'),
    commande: {
      id: 'cmd-p19-1',
      status: 'PAID',
      repairCents: 100, // 1,00 € prestation
      shippingCents: 245, // 2,45 € transport
      protectionCents: 50, // 0,50 € protection
      insuranceCents: 0,
      totalCents: 395, // 3,95 € total séquestre
      client: { id: 'usr-client-19', name: 'Claire Client', email: 'claire@client.fr' },
      repairer: { id: 'usr-rep-19', name: 'Atelier Phone', email: 'contact@atelierphone.fr' },
      shipments: [],
      demande: { photos: [], conversations: [] },
    },
  };

  it('AdminDisputesService.list accurately populates totalCents and repairCents from commande', async () => {
    prisma.dispute.count.mockResolvedValue(1);
    prisma.dispute.findMany.mockResolvedValue([mockDisputeRecord]);

    const result = await service.list({ page: 1, pageSize: 20 });

    expect(result.items).toHaveLength(1);
    const item = result.items[0]!;
    expect(item.id).toBe('disp-p19-escrow-1');
    // Total blocked in escrow
    expect(item.totalCents).toBe(395);
    // Repair service amount
    expect(item.repairCents).toBe(100);
  });

  it('AdminDisputesService.getDossier accurately populates commande.totalCents and commande.repairCents', async () => {
    prisma.dispute.findUnique.mockResolvedValue(mockDisputeRecord);

    const dossier = await service.getDossier('disp-p19-escrow-1');

    expect(dossier.dispute.id).toBe('disp-p19-escrow-1');
    expect(dossier.commande.id).toBe('cmd-p19-1');
    // Total blocked in escrow
    expect(dossier.commande.totalCents).toBe(395);
    // Repair service amount
    expect(dossier.commande.repairCents).toBe(100);
    // Ancillary amounts are also populated correctly
    expect(dossier.commande.shippingCents).toBe(245);
    expect(dossier.commande.protectionCents).toBe(50);
  });

  it('Both list and dossier agree identically on totalCents and repairCents (reconciliation check)', async () => {
    prisma.dispute.count.mockResolvedValue(1);
    prisma.dispute.findMany.mockResolvedValue([mockDisputeRecord]);
    prisma.dispute.findUnique.mockResolvedValue(mockDisputeRecord);

    const listRes = await service.list({ page: 1, pageSize: 10 });
    const dossier = await service.getDossier('disp-p19-escrow-1');

    const listItem = listRes.items[0]!;
    expect(listItem.totalCents).toBe(dossier.commande.totalCents);
    expect(listItem.repairCents).toBe(dossier.commande.repairCents);
    expect(listItem.totalCents).toBe(395);
    expect(listItem.repairCents).toBe(100);
  });

  it('handles null or missing commande amounts gracefully with fallback to 0', async () => {
    const recordWithoutAmounts = {
      ...mockDisputeRecord,
      id: 'disp-p19-zero',
      commande: {
        id: 'cmd-zero',
        status: 'PAID',
        client: { id: 'c1', name: 'C', email: 'c@c.fr' },
        repairer: { id: 'r1', name: 'R', email: 'r@r.fr' },
        shipments: [],
        demande: { photos: [], conversations: [] },
      },
    };

    prisma.dispute.count.mockResolvedValue(1);
    prisma.dispute.findMany.mockResolvedValue([recordWithoutAmounts]);
    prisma.dispute.findUnique.mockResolvedValue(recordWithoutAmounts);

    const listRes = await service.list({ page: 1, pageSize: 10 });
    const dossier = await service.getDossier('disp-p19-zero');

    expect(listRes.items[0]!.totalCents).toBe(0);
    expect(listRes.items[0]!.repairCents).toBe(0);
    expect(dossier.commande.totalCents).toBe(0);
    expect(dossier.commande.repairCents).toBe(0);
  });
});
