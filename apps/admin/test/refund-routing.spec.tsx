import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import type { AdminPaymentListItem } from '@revime/shared';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import { resolveRefundCommandeId } from '../lib/refund-form';

describe('Bug B1: Refund Routing & Pre-filling (?commande= vs ?id=)', () => {
  describe('PaymentsTable refund navigation link', () => {
    const mockPayment: AdminPaymentListItem = {
      id: 'cmd-test-12345',
      createdAt: '2026-10-12T10:00:00.000Z',
      paidAt: '2026-10-12T10:05:00.000Z',
      status: 'PAID',
      step: 'IN_REPAIR',
      delivery: 'HOME',
      totalCents: 5000,
      repairCents: 4000,
      shippingCents: 500,
      protectionCents: 500,
      clientName: 'Alice Dupont',
      clientEmail: 'alice@example.com',
      repairerName: 'Bob Reparateur',
      repairerEmail: 'bob@example.com',
      isDisputed: false,
      disputeId: null,
      disputeStatus: null,
      stripeChargeId: 'ch_test123',
      stripeTransferId: null,
      stripeRefundId: null,
      refundedCents: null,
      cancellationPending: false,
      payoutStatus: 'NOT_APPLICABLE',
      payoutAmountCents: null,
    };

    it('renders "Rembourser" link pointing to /remboursement?commande=... instead of ?id=...', () => {
      const html = renderToString(
        <PaymentsTable items={[mockPayment]} onOpenDispute={vi.fn()} />
      );

      // Must link using ?commande=
      expect(html).toContain('href="/remboursement?commande=cmd-test-12345"');
      // Must not use deprecated ?id= parameter
      expect(html).not.toContain('href="/remboursement?id=');
      expect(html).toContain('Rembourser');
    });
  });

  describe('resolveRefundCommandeId (defense in depth for /remboursement)', () => {
    it('resolves commandeId when ?commande= is present', () => {
      const params = new URLSearchParams('commande=cmd-abc-789');
      expect(resolveRefundCommandeId(params)).toBe('cmd-abc-789');
    });

    it('falls back to ?id= if legacy or external link uses it', () => {
      const params = new URLSearchParams('id=cmd-legacy-456');
      expect(resolveRefundCommandeId(params)).toBe('cmd-legacy-456');
    });

    it('prioritizes ?commande= over ?id= when both are present', () => {
      const params = new URLSearchParams('commande=cmd-canonical&id=cmd-fallback');
      expect(resolveRefundCommandeId(params)).toBe('cmd-canonical');
    });

    it('returns empty string when neither param is present', () => {
      const params = new URLSearchParams('');
      expect(resolveRefundCommandeId(params)).toBe('');
    });
  });
});
