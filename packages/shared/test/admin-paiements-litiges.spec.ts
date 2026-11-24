import { describe, expect, it } from 'vitest';
import {
  adminAuditActionSchema,
  ADMIN_AUDIT_ACTION_LABEL,
  openDisputeSchema,
  assignDisputeSchema,
  addDisputeNoteSchema,
  resolveDisputeSchema,
  adminPaymentListQuerySchema,
  adminDisputeListQuerySchema,
  type DisputeStatusType,
  type DisputeInitiatorType,
  type AdminDisputeListItem,
  type AdminDisputeListResponse,
  type AdminDisputeNoteItem,
  type AdminDisputeDossierDto,
  type AdminPaymentListItem,
  type AdminPaymentMetricsDto,
  type AdminPaymentListResponse,
} from '../src/index.js';

describe("Stage 6D Dispute Audit Actions", () => {
  const disputeActions = [
    'dispute.open',
    'dispute.assign',
    'dispute.unassign',
    'dispute.note',
    'dispute.resolve_release',
    'dispute.resolve_refund',
    'dispute.resolve_dismiss',
  ] as const;

  it('are valid members of adminAuditActionSchema', () => {
    for (const a of disputeActions) {
      expect(adminAuditActionSchema.parse(a)).toBe(a);
    }
  });

  it('have exact French labels in ADMIN_AUDIT_ACTION_LABEL', () => {
    expect(ADMIN_AUDIT_ACTION_LABEL['dispute.open']).toBe("Ouverture d'un litige");
    expect(ADMIN_AUDIT_ACTION_LABEL['dispute.assign']).toBe("Assignation d'un litige");
    expect(ADMIN_AUDIT_ACTION_LABEL['dispute.unassign']).toBe("Désassignation d'un litige");
    expect(ADMIN_AUDIT_ACTION_LABEL['dispute.note']).toBe("Ajout d'une note interne de litige");
    expect(ADMIN_AUDIT_ACTION_LABEL['dispute.resolve_release']).toBe(
      'Arbitrage litige : paiement au réparateur',
    );
    expect(ADMIN_AUDIT_ACTION_LABEL['dispute.resolve_refund']).toBe(
      'Arbitrage litige : remboursement client',
    );
    expect(ADMIN_AUDIT_ACTION_LABEL['dispute.resolve_dismiss']).toBe(
      'Arbitrage litige : la réparation reprend',
    );
  });
});

describe('openDisputeSchema', () => {
  it('validates a correct payload with default initiator', () => {
    const parsed = openDisputeSchema.parse({
      reason: 'Colis endommagé',
    });
    expect(parsed.reason).toBe('Colis endommagé');
    expect(parsed.initiator).toBe('ADMIN');
    expect(parsed.description).toBeUndefined();
    expect(parsed.evidencePhotos).toBeUndefined();
  });

  it('accepts explicit initiator, description, and evidencePhotos', () => {
    const parsed = openDisputeSchema.parse({
      reason: 'Réparation défectueuse',
      description: 'L’écran ne s’allume toujours pas après réparation',
      initiator: 'CLIENT',
      evidencePhotos: ['photo1.jpg', 'photo2.jpg'],
    });
    expect(parsed.initiator).toBe('CLIENT');
    expect(parsed.evidencePhotos).toHaveLength(2);
  });

  it('rejects reason shorter than 3 characters', () => {
    const result = openDisputeSchema.safeParse({ reason: 'ab' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'Le motif doit comporter au moins 3 caractères.',
      );
    }
  });

  it('rejects invalid initiator', () => {
    const result = openDisputeSchema.safeParse({
      reason: 'Litige test',
      initiator: 'UNKNOWN',
    });
    expect(result.success).toBe(false);
  });
});

describe('assignDisputeSchema', () => {
  it('accepts assigneeUserId or empty object', () => {
    expect(assignDisputeSchema.parse({ assigneeUserId: 'admin-123' })).toEqual({
      assigneeUserId: 'admin-123',
    });
    expect(assignDisputeSchema.parse({})).toEqual({});
  });
});

describe('addDisputeNoteSchema', () => {
  it('accepts note of 2 or more characters', () => {
    expect(addDisputeNoteSchema.parse({ note: 'OK' })).toEqual({ note: 'OK' });
  });

  it('rejects note shorter than 2 characters', () => {
    const result = addDisputeNoteSchema.safeParse({ note: 'a' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'La note doit comporter au moins 2 caractères.',
      );
    }
  });
});

describe('resolveDisputeSchema', () => {
  it('accepts resolutionNote of 3 or more characters', () => {
    const parsed = resolveDisputeSchema.parse({
      resolutionNote: 'Remboursement accordé suite expertise transporteur.',
    });
    expect(parsed.resolutionNote).toBe(
      'Remboursement accordé suite expertise transporteur.',
    );
  });

  it('rejects resolutionNote shorter than 3 characters', () => {
    const result = resolveDisputeSchema.safeParse({ resolutionNote: 'ab' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe(
        'La justification de décision doit comporter au moins 3 caractères.',
      );
    }
  });
});

describe('adminPaymentListQuerySchema', () => {
  it('provides default pagination values', () => {
    const parsed = adminPaymentListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it('coerces string numbers for page and pageSize', () => {
    const parsed = adminPaymentListQuerySchema.parse({
      page: '2',
      pageSize: '50',
    });
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(50);
  });

  it('accepts valid filters', () => {
    const parsed = adminPaymentListQuerySchema.parse({
      q: 'jean',
      status: 'PAID',
      step: 'REPAIR_DONE',
      delivery: 'PARCEL',
      disputed: 'true',
    });
    expect(parsed.status).toBe('PAID');
    expect(parsed.step).toBe('REPAIR_DONE');
    expect(parsed.delivery).toBe('PARCEL');
    expect(parsed.disputed).toBe('true');
  });

  it('rejects invalid filter values', () => {
    expect(
      adminPaymentListQuerySchema.safeParse({ status: 'INVALID' }).success,
    ).toBe(false);
    expect(
      adminPaymentListQuerySchema.safeParse({ step: 'INVALID' }).success,
    ).toBe(false);
    expect(
      adminPaymentListQuerySchema.safeParse({ delivery: 'INVALID' }).success,
    ).toBe(false);
    expect(
      adminPaymentListQuerySchema.safeParse({ disputed: 'maybe' }).success,
    ).toBe(false);
  });
});

describe('adminDisputeListQuerySchema', () => {
  it('provides default pagination values', () => {
    const parsed = adminDisputeListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it('coerces string numbers for page and pageSize', () => {
    const parsed = adminDisputeListQuerySchema.parse({
      page: '3',
      pageSize: '10',
    });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(10);
  });

  it('accepts valid filters', () => {
    const parsed = adminDisputeListQuerySchema.parse({
      q: 'litige',
      status: 'OPEN',
      assigned: 'admin-42',
    });
    expect(parsed.status).toBe('OPEN');
    expect(parsed.assigned).toBe('admin-42');
  });

  it('rejects invalid status', () => {
    expect(
      adminDisputeListQuerySchema.safeParse({ status: 'CLOSED' }).success,
    ).toBe(false);
  });
});

describe('Type compatibility tests for DTOs', () => {
  it('ensures DTO structures match expected shapes', () => {
    const disputeItem: AdminDisputeListItem = {
      id: 'disp-1',
      commandeId: 'cmd-1',
      status: 'OPEN',
      initiator: 'CLIENT',
      reason: 'Colis perdu',
      clientName: 'Alice Martin',
      clientEmail: 'alice@example.com',
      repairerName: 'Bob Reparation',
      repairerEmail: 'bob@example.com',
      totalCents: 12000,
      repairCents: 10000,
      assignedToUserId: null,
      createdAt: '2026-09-21T20:00:00.000Z',
      resolvedAt: null,
      verdict: null,
    };
    expect(disputeItem.id).toBe('disp-1');

    const disputeListResponse: AdminDisputeListResponse = {
      items: [disputeItem],
      total: 1,
      page: 1,
      pageSize: 25,
      openCount: 1,
      inReviewCount: 0,
      resolvedCount: 0,
    };
    expect(disputeListResponse.total).toBe(1);

    const noteItem: AdminDisputeNoteItem = {
      id: 'note-1',
      adminUserId: 'admin-1',
      adminName: 'Super Admin',
      note: 'En attente de retour Boxtal',
      createdAt: '2026-09-21T21:00:00.000Z',
    };
    expect(noteItem.adminName).toBe('Super Admin');

    const dossier: AdminDisputeDossierDto = {
      dispute: {
        id: 'disp-1',
        commandeId: 'cmd-1',
        status: 'OPEN',
        initiator: 'CLIENT',
        reason: 'Colis perdu',
        description: 'Aucune nouvelle',
        evidencePhotos: ['https://example.com/p1.jpg'],
        assignedToUserId: null,
        assignedAt: null,
        resolvedByUserId: null,
        resolvedAt: null,
        verdict: null,
        resolutionNote: null,
        adminNotes: [noteItem],
        createdAt: '2026-09-21T20:00:00.000Z',
        updatedAt: '2026-09-21T20:00:00.000Z',
      },
      commande: {
        id: 'cmd-1',
        status: 'PAID',
        step: 'PARCEL_SENT',
        delivery: 'PARCEL',
        repairCents: 10000,
        shippingCents: 1500,
        protectionCents: 500,
        insuranceCents: 0,
        totalCents: 12000,
        paidAt: '2026-09-20T10:00:00.000Z',
        stripeSessionId: 'sess_1',
        stripePaymentIntentId: 'pi_1',
        stripeChargeId: 'ch_1',
        stripeTransferId: null,
        stripeRefundId: null,
      },
      client: {
        id: 'user-client',
        name: 'Alice Martin',
        email: 'alice@example.com',
        phone: '0601020304',
        city: 'Paris',
      },
      repairer: {
        id: 'user-repairer',
        name: 'Bob Reparation',
        email: 'bob@example.com',
        phone: '0605060708',
        kind: 'PRO',
        city: 'Lyon',
        verificationLevel: 'BUSINESS',
      },
      shipments: [
        {
          leg: 'OUTBOUND',
          status: 'IN_TRANSIT',
          carrierLabel: 'Mondial Relay',
          boxtalOrderId: 'box_123',
          failureReason: null,
        },
      ],
      conversation: {
        id: 'conv-1',
        messages: [
          {
            id: 'msg-1',
            senderUserId: 'user-client',
            kind: 'TEXT',
            body: 'Bonjour, avez-vous reçu le colis ?',
            photoPath: null,
            createdAt: '2026-09-20T12:00:00.000Z',
          },
        ],
      },
      demande: {
        id: 'dem-1',
        title: 'Réparation écran iPhone 13',
        description: 'Vitre brisée suite à chute',
        photos: ['demande_p1.jpg'],
      },
    };
    expect(dossier.dispute.id).toBe('disp-1');

    const paymentItem: AdminPaymentListItem = {
      id: 'cmd-1',
      createdAt: '2026-09-20T09:00:00.000Z',
      paidAt: '2026-09-20T10:00:00.000Z',
      status: 'PAID',
      step: 'PARCEL_SENT',
      delivery: 'PARCEL',
      totalCents: 12000,
      repairCents: 10000,
      shippingCents: 1500,
      protectionCents: 500,
      clientName: 'Alice Martin',
      clientEmail: 'alice@example.com',
      repairerName: 'Bob Reparation',
      repairerEmail: 'bob@example.com',
      isDisputed: true,
      disputeId: 'disp-1',
      disputeStatus: 'OPEN',
      stripeChargeId: 'ch_1',
      stripeTransferId: null,
      stripeRefundId: null,
    };
    expect(paymentItem.isDisputed).toBe(true);

    const metrics: AdminPaymentMetricsDto = {
      totalVolumeCents: 120000,
      commissionCents: 12000,
      escrowCents: 50000,
      refundedCents: 15000,
      disputedCount: 2,
    };
    expect(metrics.disputedCount).toBe(2);

    const paymentResponse: AdminPaymentListResponse = {
      items: [paymentItem],
      metrics,
      total: 1,
      page: 1,
      pageSize: 25,
    };
    expect(paymentResponse.total).toBe(1);
  });
});
