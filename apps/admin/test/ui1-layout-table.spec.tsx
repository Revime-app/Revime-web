import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import { DisputeQueueTable } from '../app/litiges/DisputeQueueTable';
import type { AdminPaymentListItem, AdminDisputeListItem } from '@revime/shared';

describe('UI1 - Full-Width Layout, Compact Columns & Payment Tooltips', () => {
  it('PaymentsTable: renders single-line compact total with breakdown tooltip and info indicator', () => {
    const item: AdminPaymentListItem = {
      id: 'cmd-test-ui1-001',
      createdAt: '2026-10-10T12:00:00.000Z',
      paidAt: '2026-10-10T12:05:00.000Z',
      status: 'PAID',
      step: 'REPAIR_IN_PROGRESS',
      delivery: 'WORKSHOP',
      totalCents: 10636,
      repairCents: 8000,
      shippingCents: 2000,
      protectionCents: 636,
      clientName: 'Alice Martin Long Client Name Very Long',
      clientEmail: 'alice.verylongemailaddress@domainexample.com',
      repairerName: 'Bob Reparateur Atelier High Tech',
      repairerEmail: 'bob.repairerlongcontact@atelier.com',
      isDisputed: false,
      disputeId: null,
      disputeStatus: null,
      stripeChargeId: 'ch_test_ui1',
      stripeTransferId: null,
      stripeRefundId: null,
      refundedCents: null,
      cancellationPending: false,
      payoutStatus: 'NOT_APPLICABLE',
      payoutAmountCents: null,
    };

    const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={vi.fn()} />);

    const normalizedHtml = html.replace(/\u202F|\u00A0/g, ' ');

    // Total display checks
    expect(normalizedHtml).toContain('106,36 €');
    expect(normalizedHtml).toContain('lucide-info');
    expect(normalizedHtml).toContain('Détail du montant');
    expect(normalizedHtml).toContain('Réparation : 80,00 €');
    expect(normalizedHtml).toContain('Commission : 6,36 €');
    expect(normalizedHtml).toContain('Port : 20,00 €');

    // Must NOT contain the old multi-line subtext that spanned 6 lines
    expect(html).not.toContain('Rép. 80,00 · Prot. 6,36');

    // Compact Client / Réparateur column checks
    expect(html).toContain('title="Alice Martin Long Client Name Very Long"');
    expect(html).toContain('title="alice.verylongemailaddress@domainexample.com"');
    expect(html).toContain('title="Bob Reparateur Atelier High Tech"');
    expect(html).toContain('title="bob.repairerlongcontact@atelier.com"');
    expect(html).toContain('text-overflow:ellipsis');
  });

  it('PaymentsTable: renders refunded row in compact single line with refund amount and total reference', () => {
    const item: AdminPaymentListItem = {
      id: 'cmd-test-ui1-refunded',
      createdAt: '2026-10-10T12:00:00.000Z',
      paidAt: '2026-10-10T12:05:00.000Z',
      status: 'REFUNDED',
      step: null,
      delivery: 'HOME',
      totalCents: 10636,
      repairCents: 8000,
      shippingCents: 2000,
      protectionCents: 636,
      clientName: 'Claire Dupont',
      clientEmail: 'claire@example.com',
      repairerName: 'David Atelier',
      repairerEmail: 'david@example.com',
      isDisputed: false,
      disputeId: null,
      disputeStatus: 'RESOLVED_REFUNDED',
      stripeChargeId: 'ch_test_ui1',
      stripeTransferId: null,
      stripeRefundId: 're_test_ui1',
      refundedCents: 10636,
      cancellationPending: false,
      payoutStatus: 'NOT_APPLICABLE',
      payoutAmountCents: null,
    };

    const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={vi.fn()} />);

    const normalizedHtml = html.replace(/\u202F|\u00A0/g, ' ');
    expect(normalizedHtml).toContain('106,36 €');
    expect(normalizedHtml).toContain('(sur 106,36 €)');
    expect(normalizedHtml).toContain('lucide-info');
    expect(normalizedHtml).toContain('Remboursé : 106,36 € sur 106,36 €');
  });

  it('DisputeQueueTable: compacts client & repairer columns and has lowered minWidth', () => {
    const disputeItem: AdminDisputeListItem = {
      id: 'disp-test-ui1-001',
      number: 14,
      createdAt: '2026-10-10T14:00:00.000Z',
      status: 'OPEN',
      initiator: 'CLIENT',
      reason: "L'écran ne s'allume plus du tout après la réparation",
      motif: 'REPAIR_NON_CONFORMING',
      repairCents: 8000,
      totalCents: 10636,
      commandeId: 'cmd-dispute-ui1',
      commandeStatus: 'PAID',
      clientName: 'Alexandre Le Grand Client Avec Nom Très Long',
      clientEmail: 'alexandre.treslongemail@entreprise.fr',
      repairerName: 'Centre De Reparation Express Phone Paris',
      repairerEmail: 'contact.paris@reparation-express.fr',
      assignedToUserId: null,
      assignedToName: null,
      resolvedAt: null,
      verdict: null,
    };

    const html = renderToString(<DisputeQueueTable items={[disputeItem]} onOpenDossier={vi.fn()} />);

    // Fluid table width: minWidth 920px (down from 1100px)
    expect(html).toContain('min-width:920px');

    // Compact Client & Réparateur columns with text ellipsis and tooltips
    expect(html).toContain('title="Alexandre Le Grand Client Avec Nom Très Long"');
    expect(html).toContain('title="alexandre.treslongemail@entreprise.fr"');
    expect(html).toContain('title="Centre De Reparation Express Phone Paris"');
    expect(html).toContain('title="contact.paris@reparation-express.fr"');
    expect(html).toContain('text-overflow:ellipsis');
  });
});
