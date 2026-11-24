import { describe, it, expect } from 'vitest';
import { adminCommandeDetailSchema, type AdminCommandeDetail } from '../src/commande.schemas';

describe('AdminCommandeDetail Schema', () => {
  it('validates a complete commande detail payload', () => {
    const fixture: AdminCommandeDetail = {
      commandeId: '2c53de51-b157-430a-9d90-349f481a539b',
      reference: 'CMD-2C53DE51',
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-10T14:30:00.000Z',
      status: 'PAID',
      step: 'REPAIR_STARTED',
      delivery: 'PARCEL',
      amounts: {
        repairCents: 6000,
        shippingCents: 1000,
        protectionCents: 605,
        totalCents: 7605,
        shareOwedCents: 0,
        suggestedRefund: {
          repairCents: 6000,
          shippingCents: 1000,
          protectionCents: 605,
        },
        refund: null,
      },
      stripe: {
        paymentIntentId: 'pi_3P8qFake123',
        chargeId: 'ch_3P8qFake456',
        transferId: null,
        refundId: null,
        transferSucceeded: false,
        hasCharge: true,
      },
      demande: {
        id: 'dem-123',
        title: 'Écran iPhone 13 cassé',
        description: 'Vitre fissurée suite à une chute.',
        categoryLabel: 'Smartphones',
        faultType: { id: 'ft-1', labelFr: 'Écran cassé', slug: 'ecran-casse' },
        photos: ['https://storage.revime.fr/signed/photo1.jpg'],
        createdAt: '2026-10-09T10:00:00.000Z',
      },
      offer: {
        id: 'off-456',
        amountCents: 6000,
        parts: 'ORIGINAL',
        warranty: '6 mois',
        message: 'Réparation en 48h avec écran d\'origine.',
        createdAt: '2026-10-09T14:00:00.000Z',
      },
      client: {
        userId: 'usr-client-1',
        name: 'Sophie Martin',
        email: 'sophie.martin@example.com',
        city: 'Lyon',
        phone: '0612345678',
      },
      repairer: {
        userId: 'usr-rep-2',
        name: 'Atelier Express',
        email: 'contact@atelierexpress.fr',
        city: 'Villeurbanne',
        phone: '0478123456',
      },
      shipments: [],
      dispute: null,
      review: null,
      cancellation: null,
      timeline: [
        { key: 'CREATED', label: 'Demande publiée', timestamp: '2026-10-09T10:00:00.000Z', completed: true, current: false },
        { key: 'PAID', label: 'Paiement validé & séquestre', timestamp: '2026-10-10T12:00:00.000Z', completed: true, current: false },
        { key: 'REPAIR_STARTED', label: 'Réparation en cours', timestamp: '2026-10-10T14:30:00.000Z', completed: true, current: true },
        { key: 'VALIDATED', label: 'Validation client', timestamp: null, completed: false, current: false },
        { key: 'RELEASED', label: 'Fonds débloqués', timestamp: null, completed: false, current: false },
      ],
      conversationId: 'conv-789',
    };

    const parsed = adminCommandeDetailSchema.parse(fixture);
    expect(parsed.reference).toBe('CMD-2C53DE51');
    expect(parsed.amounts.totalCents).toBe(7605);
    expect(parsed.stripe.hasCharge).toBe(true);
    expect(parsed.timeline.length).toBe(5);
  });

  it('validates optional structures (dispute, review, cancellation)', () => {
    const minimal: AdminCommandeDetail = {
      commandeId: '2c53de51-b157-430a-9d90-349f481a539b',
      reference: 'CMD-2C53DE51',
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-10T14:30:00.000Z',
      status: 'REFUNDED',
      step: null,
      delivery: 'WORKSHOP',
      amounts: {
        repairCents: 5000,
        shippingCents: 0,
        protectionCents: 500,
        totalCents: 5500,
        shareOwedCents: 0,
        suggestedRefund: { repairCents: 5000, shippingCents: 0, protectionCents: 500 },
        refund: { repairCents: 5000, shippingCents: 0, protectionCents: 500, totalCents: 5500 },
      },
      stripe: {
        paymentIntentId: 'pi_123',
        chargeId: 'ch_123',
        transferId: null,
        refundId: 're_123',
        transferSucceeded: false,
        hasCharge: true,
      },
      demande: {
        id: 'dem-1',
        title: 'Microphone HS',
        description: null,
        categoryLabel: null,
        faultType: null,
        photos: [],
        createdAt: '2026-10-09T10:00:00.000Z',
      },
      offer: null,
      client: {
        userId: 'u-1',
        name: 'Client Test',
        email: 'client@test.com',
        city: null,
        phone: null,
      },
      repairer: {
        userId: 'u-2',
        name: 'Reparateur Test',
        email: 'rep@test.com',
        city: null,
        phone: null,
      },
      shipments: [],
      dispute: {
        id: 'disp-1',
        disputeNumber: '#LIT-0001',
        status: 'RESOLVED_REFUNDED',
        reason: 'Appareil non réparé',
        verdict: 'REFUND_CLIENT',
        createdAt: '2026-10-11T09:00:00.000Z',
        resolvedAt: '2026-10-11T15:00:00.000Z',
      },
      review: {
        id: 'rev-1',
        rating: 1,
        comment: 'Décevant',
        published: true,
        createdAt: '2026-10-11T16:00:00.000Z',
      },
      cancellation: {
        id: 'canc-1',
        requesterRole: 'CLIENT',
        reason: 'Délai dépassé',
        status: 'APPROVED',
        createdAt: '2026-10-11T08:00:00.000Z',
      },
      timeline: [],
      conversationId: null,
    };

    const parsed = adminCommandeDetailSchema.parse(minimal);
    expect(parsed.dispute?.disputeNumber).toBe('#LIT-0001');
    expect(parsed.review?.rating).toBe(1);
    expect(parsed.cancellation?.status).toBe('APPROVED');
  });
});
