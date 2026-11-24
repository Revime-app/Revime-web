import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import { DisputeDossierDrawer } from '../app/litiges/DisputeDossierDrawer';
import type { AdminDisputeListItem, AdminDisputeDossierDto } from '@revime/shared';

function cleanHtml(html: string): string {
  return html
    .replace(/<!-- -->/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

describe('P19 — Litiges: Contested Escrow Amount & Order Total Reconciliation', () => {
  const sampleDisputeItem: AdminDisputeListItem = {
    id: 'disp-p19-audit',
    commandeId: 'c1111111-2222-3333-4444-555555555555',
    number: 19,
    motif: 'REPAIR_NON_CONFORMING',
    status: 'OPEN',
    initiator: 'CLIENT',
    reason: 'Problème de réparation et litige séquestre',
    clientName: 'Paul Martin',
    clientEmail: 'paul.martin@example.fr',
    repairerName: 'Atelier Saint-Michel',
    repairerEmail: 'contact@saintmichel.fr',
    totalCents: 395, // 3,95 € total bloqué sous séquestre
    repairCents: 100, // 1,00 € prestation réparation
    assignedToUserId: null,
    assignedToName: null,
    createdAt: '2026-10-10T14:00:00.000Z',
    resolvedAt: null,
    verdict: null,
    commandeStatus: 'PAID',
  };

  const sampleDossier: AdminDisputeDossierDto = {
    dispute: {
      id: 'disp-p19-audit',
      commandeId: 'c1111111-2222-3333-4444-555555555555',
      number: 19,
      motif: 'REPAIR_NON_CONFORMING',
      status: 'OPEN',
      initiator: 'CLIENT',
      reason: 'Problème de réparation et litige séquestre',
      description: 'L’appareil présente des dysfonctionnements après intervention.',
      evidencePhotos: [],
      assignedToUserId: null,
      assignedToName: null,
      assignedAt: null,
      resolvedByUserId: null,
      resolvedAt: null,
      verdict: null,
      resolutionNote: null,
      adminNotes: [],
      createdAt: '2026-10-10T14:00:00.000Z',
      updatedAt: '2026-10-10T14:00:00.000Z',
    },
    commande: {
      id: 'c1111111-2222-3333-4444-555555555555',
      status: 'PAID',
      step: 'DELIVERED',
      delivery: 'PARCEL',
      repairCents: 100, // 1,00 €
      shippingCents: 245,
      protectionCents: 50,
      insuranceCents: 0,
      totalCents: 395, // 3,95 €
      paidAt: '2026-10-09T10:00:00.000Z',
      stripeSessionId: null,
      stripePaymentIntentId: null,
      stripeChargeId: null,
      stripeTransferId: null,
      stripeRefundId: null,
    },
    client: {
      id: 'usr-client-19',
      name: 'Paul Martin',
      email: 'paul.martin@example.fr',
      phone: '0601020304',
      city: 'Paris',
    },
    repairer: {
      id: 'usr-rep-19',
      name: 'Atelier Saint-Michel',
      email: 'contact@saintmichel.fr',
      phone: '0102030405',
      kind: 'PRO',
      city: 'Paris',
      verificationLevel: 'VERIFIED',
    },
    shipments: [],
    conversation: {
      id: 'conv-19',
      messages: [],
    },
    demande: {
      id: 'dem-19',
      title: 'Réparation écran iPhone 13',
      description: 'Écran fissuré suite à une chute',
      photos: [],
    },
    timeline: [],
    processingTimeDays: 4,
  };

  describe('1. DisputeQueueTable Montant bloqué formatting', () => {
    it('renders total escrow amount (3,95 €) as primary bold amount and service amount (1,00 €) as sub-line', () => {
      const html = cleanHtml(
        renderToString(
          <DisputeQueueTable
            items={[sampleDisputeItem]}
            onOpenDossier={vi.fn()}
          />,
        ),
      );

      // Primary amount must be the total blocked in escrow: 3,95 €
      expect(html).toContain('3,95 €');
      // Sub-line must clarify: "dont 1,00 € prestation"
      expect(html).toContain('dont 1,00 € prestation');
      // Must NOT display old confusing pattern "sur 3,95 €"
      expect(html).not.toContain('sur 3,95 €');
    });

    it('shows the rows in the order the server sent them: the sort acts on the whole set, not on the page', () => {
      const rowA: AdminDisputeListItem = { ...sampleDisputeItem, id: 'row-a', number: 101, totalCents: 1000, repairCents: 900 };
      const rowB: AdminDisputeListItem = { ...sampleDisputeItem, id: 'row-b', number: 102, totalCents: 2500, repairCents: 200 };

      for (const direction of ['asc', 'desc'] as const) {
        const html = cleanHtml(
          renderToString(
            <DisputeQueueTable
              items={[rowB, rowA]}
              onOpenDossier={vi.fn()}
              sortKey="totalCents"
              sortDirection={direction}
              onSort={vi.fn()}
            />,
          ),
        );
        expect(html.indexOf('#LIT-0102')).toBeGreaterThan(-1);
        expect(html.indexOf('#LIT-0102')).toBeLessThan(html.indexOf('#LIT-0101'));
      }
    });
  });

  describe('2. DisputeDossierDrawer Montants display', () => {
    it('renders reconciled financial breakdown matching queue table amounts', () => {
      const html = cleanHtml(
        renderToString(
          <DisputeDossierDrawer
            disputeId="disp-p19-audit"
            isOpen={true}
            onClose={vi.fn()}
            onDisputeUpdated={vi.fn()}
            initialDossier={sampleDossier}
          />,
        ),
      );

      // Financial section title
      expect(html).toContain('Récapitulatif financier de la commande');

      // Escrow card: Total bloqué = 3,95 €
      expect(html).toContain('Total bloqué');
      expect(html).toContain('3,95 €');
      expect(html).toContain('Sur compte séquestre');

      // Prestation card: Part réparateur = 1,00 €
      expect(html).toContain('Part réparateur');
      expect(html).toContain('1,00 €');
      expect(html).toContain('Prestation réparation');
    });
  });
});
