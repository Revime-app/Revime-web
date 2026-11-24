import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminController } from '../src/admin/admin.controller.js';
import { AppException } from '../src/common/exceptions/app.exception.js';
import { CANCELLATION_REASON_LABEL, formatDisputeReference } from '@revime/shared';

describe('AdminController - GET /admin/commandes/:id (F1 Fiche Commande)', () => {
  let controller: AdminController;
  let prismaMock: any;

  beforeEach(() => {
    prismaMock = {
      commande: {
        findUnique: vi.fn(),
      },
      conversation: {
        findFirst: vi.fn(),
      },
    };
    controller = new (AdminController as any)(prismaMock, null, null, null, null);
    vi.spyOn(controller as any, 'resolveCommandeId').mockImplementation(async (id: any) => id);
  });

  const at = (iso: string) => new Date(iso);
  /** A row shaped like the REAL include: DemandePhoto rows, Offer.priceCents/partsLabel, stepEvents. */
  const row = (over: Record<string, unknown> = {}): any => ({
    id: '2c53de51-b157-430a-9d90-349f481a539b',
    demandeId: 'dem-1',
    clientUserId: 'u-1',
    repairerUserId: 'u-2',
    createdAt: at('2026-10-10T12:00:00.000Z'),
    updatedAt: at('2026-10-12T09:00:00.000Z'),
    status: 'PAID',
    step: 'AWAITING_VALIDATION',
    delivery: 'PARCEL',
    repairCents: 6000,
    shippingCents: 1000,
    protectionCents: 605,
    totalCents: 7605,
    refundRepairCents: null,
    refundShippingCents: null,
    refundProtectionCents: null,
    refundedCents: null,
    disputedAt: null,
    paidAt: at('2026-10-10T12:05:00.000Z'),
    transferredAt: null,
    releasedAt: null,
    stripePaymentIntentId: 'pi_123',
    stripeChargeId: 'ch_123',
    stripeTransferId: null,
    stripeRefundId: null,
    cancellationRequestedAt: null,
    insuranceCents: 0,
    demande: {
      id: 'dem-1',
      title: 'Écran iPhone cassé',
      description: 'Vitre brisée',
      createdAt: at('2026-10-09T10:00:00.000Z'),
      category: { labelFr: 'Smartphones' },
      faultType: { id: 'ft-1', labelFr: 'Écran cassé', slug: 'ecran-casse' },
      photos: [{ storagePath: 'https://cdn.example/broken.jpg' }],
    },
    offer: {
      id: 'off-1',
      priceCents: 6000,
      partsLabel: "Pièces d'origine",
      warrantyLabel: '6 mois',
      comment: 'Réparation rapide',
      createdAt: at('2026-10-09T12:00:00.000Z'),
    },
    client: { id: 'u-1', name: 'Sophie Martin', email: 'sophie@example.com', phone: '0612345678' },
    repairer: { id: 'u-2', name: 'Atelier Express', email: 'atelier@example.com', phone: null },
    shippingAddresses: [
      { role: 'CLIENT', city: 'Lyon' },
      { role: 'REPAIRER', city: 'Villeurbanne' },
    ],
    shipments: [],
    dispute: null,
    review: null,
    cancellationRequests: [],
    stepEvents: [
      { step: 'PAID', at: at('2026-10-10T12:05:00.000Z') },
      { step: 'PARCEL_SENT', at: at('2026-10-10T16:00:00.000Z') },
      { step: 'REPAIR_STARTED', at: at('2026-10-11T08:00:00.000Z') },
      { step: 'AWAITING_VALIDATION', at: at('2026-10-12T08:30:00.000Z') },
    ],
    ...over,
  });

  const timeline = (r: any, key: string) => r.timeline.find((t: any) => t.key === key);

  it('returns the full AdminCommandeDetail from the real relation shapes', async () => {
    prismaMock.commande.findUnique.mockResolvedValue(row());
    prismaMock.conversation.findFirst.mockResolvedValue({ id: 'conv-10' });

    const result = (await controller.summary('2c53de51-b157-430a-9d90-349f481a539b')) as any;

    expect(result.reference).toBe('CMD-2C53DE51');
    expect(prismaMock.commande.findUnique.mock.calls[0]![0].include.demande.include.faultType).toEqual({
      select: { id: true, labelFr: true, slug: true },
    });
    expect(result.demande).toMatchObject({
      title: 'Écran iPhone cassé',
      categoryLabel: 'Smartphones',
      faultType: { id: 'ft-1', labelFr: 'Écran cassé', slug: 'ecran-casse' },
    });
    expect(result.demande.photos).toEqual(['https://cdn.example/broken.jpg']);
    expect(result.offer).toMatchObject({
      amountCents: 6000,
      parts: "Pièces d'origine",
      warranty: '6 mois',
      message: 'Réparation rapide',
    });
    expect(result.client).toMatchObject({ name: 'Sophie Martin', city: 'Lyon' });
    expect(result.repairer).toMatchObject({ name: 'Atelier Express', city: 'Villeurbanne' });
    expect(result.conversationId).toBe('conv-10');
    expect(prismaMock.conversation.findFirst).toHaveBeenCalledWith({
      where: { demandeId: 'dem-1', clientUserId: 'u-1', repairerUserId: 'u-2', deletedAt: null },
      select: { id: true },
    });
  });

  it('dates each milestone from the step events, not from updatedAt (RU-24)', async () => {
    prismaMock.commande.findUnique.mockResolvedValue(row());
    prismaMock.conversation.findFirst.mockResolvedValue(null);

    const result = (await controller.summary('x')) as any;

    expect(timeline(result, 'PARCEL_OR_WORKSHOP').timestamp).toBe('2026-10-10T16:00:00.000Z');
    expect(timeline(result, 'REPAIR_STARTED').timestamp).toBe('2026-10-11T08:00:00.000Z');
    // The client's validation was always null: it read a column that does not exist.
    expect(timeline(result, 'AWAITING_VALIDATION').timestamp).toBe('2026-10-12T08:30:00.000Z');
    expect(result.conversationId).toBeNull();
  });

  it('dates a step from its FIRST event when it was recorded twice', async () => {
    prismaMock.commande.findUnique.mockResolvedValue(
      row({
        stepEvents: [
          { step: 'REPAIR_STARTED', at: at('2026-10-11T08:00:00.000Z') },
          { step: 'REPAIR_STARTED', at: at('2026-10-11T09:30:00.000Z') },
        ],
      }),
    );
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    const result = (await controller.summary('x')) as any;
    expect(timeline(result, 'REPAIR_STARTED').timestamp).toBe('2026-10-11T08:00:00.000Z');
  });

  it('leaves a milestone undated when its step never happened', async () => {
    prismaMock.commande.findUnique.mockResolvedValue(
      row({ step: 'PAID', stepEvents: [{ step: 'PAID', at: at('2026-10-10T12:05:00.000Z') }] }),
    );
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    const result = (await controller.summary('x')) as any;
    expect(timeline(result, 'REPAIR_STARTED').timestamp).toBeNull();
    expect(timeline(result, 'AWAITING_VALIDATION').timestamp).toBeNull();
  });

  describe('dispute (ISS-085, B11)', () => {
    const dispute = (over: Record<string, unknown> = {}) => ({
      id: 'dis-1',
      number: 12,
      status: 'OPEN',
      reason: 'Écran toujours cassé',
      verdict: null,
      createdAt: at('2026-10-11T10:00:00.000Z'),
      resolvedAt: null,
      ...over,
    });

    it('shows a dispute still open on an ordinary order as open, with its number and reason', async () => {
      prismaMock.commande.findUnique.mockResolvedValue(row({ dispute: dispute() }));
      prismaMock.conversation.findFirst.mockResolvedValue(null);
      const result = (await controller.summary('x')) as any;
      expect(result.dispute).toMatchObject({
        disputeNumber: formatDisputeReference(12),
        status: 'OPEN',
        reason: 'Écran toujours cassé',
      });
    });

    it('shows a dispute on a REFUNDED order as resolved, like the list does, not as the stored OPEN', async () => {
      prismaMock.commande.findUnique.mockResolvedValue(
        row({ status: 'REFUNDED', refundedCents: 7605, dispute: dispute() }),
      );
      prismaMock.conversation.findFirst.mockResolvedValue(null);
      const result = (await controller.summary('x')) as any;
      expect(result.dispute.status).toBe('RESOLVED_REFUNDED');
      expect(result.dispute.verdict).toBe('REFUND_CLIENT');
    });
  });

  it('reads the review visibility from deletedAt, the real column', async () => {
    const base = { id: 'r1', rating: 4, comment: 'Bien', createdAt: at('2026-10-13T10:00:00.000Z') };
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    prismaMock.commande.findUnique.mockResolvedValueOnce(row({ review: { ...base, deletedAt: null } }));
    expect(((await controller.summary('x')) as any).review.published).toBe(true);
    prismaMock.commande.findUnique.mockResolvedValueOnce(
      row({ review: { ...base, deletedAt: at('2026-10-14T10:00:00.000Z') } }),
    );
    expect(((await controller.summary('x')) as any).review.published).toBe(false);
  });

  it('labels the cancellation reason in French and names who asked', async () => {
    prismaMock.commande.findUnique.mockResolvedValue(
      row({
        cancellationRequests: [
          { id: 'c2', requestedByUserId: 'u-2', reason: 'OTHER', comment: 'Pièce introuvable', status: 'PENDING', createdAt: at('2026-10-12T10:00:00.000Z') },
          { id: 'c1', requestedByUserId: 'u-1', reason: 'TOO_SLOW', comment: null, status: 'REFUSED', createdAt: at('2026-10-11T10:00:00.000Z') },
        ],
      }),
    );
    prismaMock.conversation.findFirst.mockResolvedValue(null);
    const result = (await controller.summary('x')) as any;
    expect(result.cancellation).toMatchObject({ id: 'c2', requesterRole: 'REPAIRER', status: 'PENDING' });
    expect(result.cancellation.reason).toBe(`${CANCELLATION_REASON_LABEL.OTHER} : Pièce introuvable`);
  });

  it('throws NOT_FOUND 404 when order does not exist', async () => {
    prismaMock.commande.findUnique.mockResolvedValue(null);
    await expect(controller.summary('non-existent-id')).rejects.toThrow(AppException);
  });
});
