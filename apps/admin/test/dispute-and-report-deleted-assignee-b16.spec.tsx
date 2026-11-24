import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import { DisputeDossierDrawer } from '../app/litiges/DisputeDossierDrawer';
import type { AdminDisputeListItem, AdminDisputeDossierDto } from '@revime/shared';
import { DELETED_USER_NAME } from '@revime/shared';

describe('Bug B16: Admin UI renders "Non assigné" when dispute or report assignee is deleted', () => {
  it('DisputeQueueTable: renders "Non assigné" and never an assignee line reading "Utilisateur supprimé" when assignedToName is DELETED_USER_NAME', () => {
    const item: AdminDisputeListItem = {
      id: 'disp-16',
      commandeId: 'c1234567-1234-4567-8901-234567890123',
      number: 16,
      motif: 'REPAIR_NON_CONFORMING',
      status: 'OPEN',
      initiator: 'CLIENT',
      reason: 'Écran mal fixé',
      clientName: 'Alice',
      clientEmail: 'alice@test.invalid',
      repairerName: 'Bob',
      repairerEmail: 'bob@test.invalid',
      totalCents: 5000,
      repairCents: 4000,
      assignedToUserId: 'deleted-user-id',
      assignedToName: DELETED_USER_NAME,
      createdAt: '2026-10-01T10:00:00.000Z',
      resolvedAt: null,
      verdict: null,
      commandeStatus: 'PAID',
    };

    const html = renderToString(
      <DisputeQueueTable items={[item]} onOpenDossier={vi.fn()} />,
    );

    // Should NOT display "Utilisateur supprimé" as the assignee
    expect(html).not.toContain('Utilisateur supprimé');
    expect(html).not.toContain('Opérateur supprimé');
    // Should display "Non assigné"
    expect(html).toContain('Non assigné');
  });

  it('DisputeDossierDrawer: renders "Non assigné" and shows "M\'assigner ce litige" when assignee is deleted user', () => {
    const mockDossier: AdminDisputeDossierDto = {
      dispute: {
        id: 'disp-16',
        commandeId: 'cmd-16',
        number: 16,
        motif: 'REPAIR_NON_CONFORMING',
        status: 'OPEN',
        initiator: 'CLIENT',
        reason: 'Écran',
        description: 'Détails',
        evidencePhotos: [],
        assignedToUserId: 'deleted-user-id',
        assignedToName: DELETED_USER_NAME,
        assignedAt: '2026-10-01T10:00:00.000Z',
        resolvedByUserId: null,
        resolvedAt: null,
        verdict: null,
        resolutionNote: null,
        adminNotes: [],
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      commande: {
        id: 'cmd-16',
        status: 'PAID',
        step: 'AWAITING_VALIDATION',
        delivery: 'PARCEL',
        repairCents: 4000,
        shippingCents: 1000,
        protectionCents: 500,
        insuranceCents: 0,
        totalCents: 5500,
        paidAt: '2026-10-01T10:00:00.000Z',
        stripeSessionId: null,
        stripePaymentIntentId: null,
        stripeChargeId: 'ch_123',
        stripeTransferId: null,
        stripeRefundId: null,
      },
      client: { id: 'c1', name: 'Alice', email: 'alice@test.fr', phone: null, city: null },
      repairer: { id: 'r1', name: 'Bob', email: 'bob@test.fr', phone: null, kind: 'PRO', city: null, verificationLevel: 'BASIC' },
      shipments: [],
      demande: { id: 'd1', title: 'Réparation', description: '', photos: [] },
      conversation: { id: null, messages: [] },
      timeline: [],
      processingTimeDays: 0,
    };

    const html = renderToString(
      <DisputeDossierDrawer
        disputeId="disp-16"
        isOpen={true}
        onClose={vi.fn()}
        onDisputeUpdated={vi.fn()}
        initialDossier={mockDossier}
      />,
    );

    // Should NOT render deleted user id or name in the assignment banner
    expect(html).not.toContain('deleted-user-id');
    expect(html).not.toContain('Utilisateur supprimé');
    // Must render "Non assigné"
    expect(html).toContain('Non assigné');
    // Must render "M'assigner ce litige" button
    expect(html).toContain("M&#x27;assigner ce litige");
  });

  it('DisputeQueueTable & DisputeDossierDrawer: renders active operator name when valid', () => {
    const item: AdminDisputeListItem = {
      id: 'disp-active',
      commandeId: 'c1234567-1234-4567-8901-234567890123',
      number: 17,
      motif: 'REPAIR_NON_CONFORMING',
      status: 'IN_REVIEW',
      initiator: 'CLIENT',
      reason: 'Écran',
      clientName: 'Alice',
      clientEmail: 'alice@test.invalid',
      repairerName: 'Bob',
      repairerEmail: 'bob@test.invalid',
      totalCents: 5000,
      repairCents: 4000,
      assignedToUserId: 'admin-sarah',
      assignedToName: 'Sarah Admin',
      createdAt: '2026-10-01T10:00:00.000Z',
      resolvedAt: null,
      verdict: null,
      commandeStatus: 'PAID',
    };

    const tableHtml = renderToString(
      <DisputeQueueTable items={[item]} onOpenDossier={vi.fn()} />,
    );
    expect(tableHtml).toContain('lucide-user');
    expect(tableHtml).toContain('Sarah Admin');

    const mockDossier: AdminDisputeDossierDto = {
      dispute: {
        id: 'disp-active',
        commandeId: 'cmd-active',
        number: 17,
        motif: 'REPAIR_NON_CONFORMING',
        status: 'IN_REVIEW',
        initiator: 'CLIENT',
        reason: 'Écran',
        description: null,
        evidencePhotos: [],
        assignedToUserId: 'admin-sarah',
        assignedToName: 'Sarah Admin',
        assignedAt: '2026-10-01T10:00:00.000Z',
        resolvedByUserId: null,
        resolvedAt: null,
        verdict: null,
        resolutionNote: null,
        adminNotes: [],
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      commande: {
        id: 'cmd-active',
        status: 'PAID',
        step: 'AWAITING_VALIDATION',
        delivery: 'PARCEL',
        repairCents: 4000,
        shippingCents: 1000,
        protectionCents: 500,
        insuranceCents: 0,
        totalCents: 5500,
        paidAt: '2026-10-01T10:00:00.000Z',
        stripeSessionId: null,
        stripePaymentIntentId: null,
        stripeChargeId: 'ch_123',
        stripeTransferId: null,
        stripeRefundId: null,
      },
      client: { id: 'c1', name: 'Alice', email: 'alice@test.fr', phone: null, city: null },
      repairer: { id: 'r1', name: 'Bob', email: 'bob@test.fr', phone: null, kind: 'PRO', city: null, verificationLevel: 'BASIC' },
      shipments: [],
      demande: { id: 'd1', title: 'Réparation', description: '', photos: [] },
      conversation: { id: null, messages: [] },
      timeline: [],
      processingTimeDays: 0,
    };

    const drawerHtml = renderToString(
      <DisputeDossierDrawer
        disputeId="disp-active"
        isOpen={true}
        onClose={vi.fn()}
        onDisputeUpdated={vi.fn()}
        initialDossier={mockDossier}
      />,
    );
    expect(drawerHtml).toContain('Sarah Admin');
    expect(drawerHtml).toContain('Désassigner');
  });

  it('DisputeDossierDrawer: renders "Non assigné" and "M\'assigner ce litige" when assignedToName is null', () => {
    const mockDossier: AdminDisputeDossierDto = {
      dispute: {
        id: 'disp-null-name',
        commandeId: 'cmd-null-name',
        number: 18,
        motif: 'REPAIR_NON_CONFORMING',
        status: 'OPEN',
        initiator: 'CLIENT',
        reason: 'Écran',
        description: null,
        evidencePhotos: [],
        assignedToUserId: 'some-orphan-user-id',
        assignedToName: null,
        assignedAt: '2026-10-01T10:00:00.000Z',
        resolvedByUserId: null,
        resolvedAt: null,
        verdict: null,
        resolutionNote: null,
        adminNotes: [],
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      },
      commande: {
        id: 'cmd-null-name',
        status: 'PAID',
        step: 'AWAITING_VALIDATION',
        delivery: 'PARCEL',
        repairCents: 4000,
        shippingCents: 1000,
        protectionCents: 500,
        insuranceCents: 0,
        totalCents: 5500,
        paidAt: '2026-10-01T10:00:00.000Z',
        stripeSessionId: null,
        stripePaymentIntentId: null,
        stripeChargeId: 'ch_123',
        stripeTransferId: null,
        stripeRefundId: null,
      },
      client: { id: 'c1', name: 'Alice', email: 'alice@test.fr', phone: null, city: null },
      repairer: { id: 'r1', name: 'Bob', email: 'bob@test.fr', phone: null, kind: 'PRO', city: null, verificationLevel: 'BASIC' },
      shipments: [],
      demande: { id: 'd1', title: 'Réparation', description: '', photos: [] },
      conversation: { id: null, messages: [] },
      timeline: [],
      processingTimeDays: 0,
    };

    const drawerHtml = renderToString(
      <DisputeDossierDrawer
        disputeId="disp-null-name"
        isOpen={true}
        onClose={vi.fn()}
        onDisputeUpdated={vi.fn()}
        initialDossier={mockDossier}
      />,
    );
    expect(drawerHtml).not.toContain('some-orphan-user-id');
    expect(drawerHtml).toContain('Non assigné');
    expect(drawerHtml).toContain("M&#x27;assigner ce litige");
  });
});
