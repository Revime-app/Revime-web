import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import type { AdminPaymentListItem } from '@revime/shared';

describe('Bug B12 - PaymentsTable Refunded Order Display Consistency', () => {
  it('renders "—" for escrow step and "Non" for dispute on a REFUNDED order, never "Validation client" or "En litige"', () => {
    const item: AdminPaymentListItem = {
      id: 'cmd-refunded-b12',
      createdAt: '2026-09-15T10:00:00.000Z',
      paidAt: '2026-09-15T10:05:00.000Z',
      status: 'REFUNDED',
      step: 'AWAITING_VALIDATION', // Stale escrow step
      delivery: 'PARCEL',
      totalCents: 15000,
      repairCents: 12000,
      shippingCents: 1800,
      protectionCents: 1200,
      clientName: 'Claire Dupont',
      clientEmail: 'claire@example.com',
      repairerName: 'David Atelier',
      repairerEmail: 'david@example.com',
      isDisputed: false,
      disputeId: 'disp-201',
      disputeStatus: 'RESOLVED_REFUNDED',
      stripeChargeId: 'ch_test_101',
      stripeTransferId: null,
      stripeRefundId: 're_test_101',
      refundedCents: 15000,
      cancellationPending: false,
      payoutStatus: 'NOT_APPLICABLE',
      payoutAmountCents: null,
    };

    const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={vi.fn()} />);

    // Must show status "Remboursée"
    expect(html).toContain('Remboursée');
    // Must NOT show intermediate step "Validation client"
    expect(html).not.toContain('Validation client');
    // Must NOT show "En litige"
    expect(html).not.toContain('En litige');
  });

  it('defense-in-depth: suppresses "En litige" and "Validation client" even if isDisputed is true on a REFUNDED order', () => {
    const legacyItem: AdminPaymentListItem = {
      id: 'cmd-legacy-refunded-b12',
      createdAt: '2026-09-15T10:00:00.000Z',
      paidAt: '2026-09-15T10:05:00.000Z',
      status: 'REFUNDED',
      step: 'AWAITING_VALIDATION',
      delivery: 'PARCEL',
      totalCents: 15000,
      repairCents: 12000,
      shippingCents: 1800,
      protectionCents: 1200,
      clientName: 'Claire Dupont',
      clientEmail: 'claire@example.com',
      repairerName: 'David Atelier',
      repairerEmail: 'david@example.com',
      isDisputed: true, // Legacy or un-healed flag
      disputeId: 'disp-201',
      disputeStatus: 'RESOLVED_REFUNDED',
      stripeChargeId: 'ch_test_101',
      stripeTransferId: null,
      stripeRefundId: 're_test_101',
      refundedCents: 15000,
      cancellationPending: false,
      payoutStatus: 'NOT_APPLICABLE',
      payoutAmountCents: null,
    };

    const html = renderToString(<PaymentsTable items={[legacyItem]} onOpenDispute={vi.fn()} />);

    expect(html).toContain('Remboursée');
    expect(html).not.toContain('Validation client');
    expect(html).not.toContain('En litige');
  });
});
