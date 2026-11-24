import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { isOrderRefundable, getUnrefundableReason } from '../lib/refund-form';
import { RemboursementOrderDetails, type RemboursementSummary } from '../app/remboursement/page';

describe('Bug B2: Block Refund for Unpaid Orders (PENDING_PAYMENT / ABANDONED)', () => {
  const baseSummary: RemboursementSummary = {
    commandeId: '2c53de51-0000-4000-8000-000000000001',
    demandeTitle: 'Écran iPhone 13 fissuré',
    clientName: 'Jean Dupont',
    repairerName: 'Atelier Express',
    clientCity: 'Paris',
    repairerCity: 'Lyon',
    delivery: 'HOME',
    status: 'PENDING_PAYMENT',
    step: null,
    repairCents: 6000,
    shippingCents: 1105,
    protectionCents: 500,
    insuranceCents: 0,
    totalCents: 7605,
    transferred: false,
    refunded: false,
    disputed: false,
    suggestion: { repairCents: 6000, shippingCents: 1105, protectionCents: 500 },
    refund: null,
    shareOwedCents: 0,
    cancellationPending: false,
  };

  describe('isOrderRefundable helper', () => {
    it('returns true ONLY for PAID orders', () => {
      expect(isOrderRefundable('PAID')).toBe(true);
    });

    it('returns false for PENDING_PAYMENT, ABANDONED, and REFUNDED orders', () => {
      expect(isOrderRefundable('PENDING_PAYMENT')).toBe(false);
      expect(isOrderRefundable('ABANDONED')).toBe(false);
      expect(isOrderRefundable('REFUNDED')).toBe(false);
      expect(isOrderRefundable('UNKNOWN')).toBe(false);
    });
  });

  describe('getUnrefundableReason helper', () => {
    it('returns clear explanatory note for PENDING_PAYMENT', () => {
      const reason = getUnrefundableReason('PENDING_PAYMENT');
      expect(reason).toContain('attente de paiement');
      expect(reason).toContain('non payée');
    });

    it('returns clear explanatory note for ABANDONED', () => {
      const reason = getUnrefundableReason('ABANDONED');
      expect(reason).toContain('abandonnée');
    });
  });

  describe('RemboursementOrderDetails component rendering', () => {
    it('blocks refund form and displays warning alert for PENDING_PAYMENT order (Bug B2 symptom)', () => {
      const summary: RemboursementSummary = {
        ...baseSummary,
        status: 'PENDING_PAYMENT',
      };

      const html = renderToString(
        <RemboursementOrderDetails
          summary={summary}
          canRefund={true}
          onRefundSubmit={vi.fn()}
          onPayShare={vi.fn()}
          payShareBusy={false}
          payShareError={null}
        />
      );

      // Must display prominent unrefundable warning
      expect(html).toContain('Remboursement impossible');
      expect(html).toContain('Cette commande est en attente de paiement (non payée)');

      // Must NOT render the RefundForm or its submit button
      expect(html).not.toContain('<form');
      expect(html).not.toContain('Rembourser au client');
    });

    it('renders active RefundForm when order is PAID', () => {
      const summary: RemboursementSummary = {
        ...baseSummary,
        status: 'PAID',
      };

      const html = renderToString(
        <RemboursementOrderDetails
          summary={summary}
          canRefund={true}
          onRefundSubmit={vi.fn()}
          onPayShare={vi.fn()}
          payShareBusy={false}
          payShareError={null}
        />
      );

      // Must NOT display unrefundable alert
      expect(html).not.toContain('Remboursement impossible');

      // Must render RefundForm with inputs and buttons
      expect(html).toContain('Motif du remboursement');
      expect(html).toContain('Tout rembourser');
      expect(html).toContain('<button type="submit">Rembourser</button>');
    });

    it('blocks refund form and displays warning alert when PAID order has missing Stripe charge (Bug B3)', () => {
      const summary: RemboursementSummary = {
        ...baseSummary,
        status: 'PAID',
        hasStripeCharge: false,
      };

      const html = renderToString(
        <RemboursementOrderDetails
          summary={summary}
          canRefund={true}
          onRefundSubmit={vi.fn()}
          onPayShare={vi.fn()}
          payShareBusy={false}
          payShareError={null}
        />
      );

      // Must display unrefundable alert with missing charge explanation
      expect(html).toContain('Remboursement impossible');
      expect(html).toContain('Cette commande ne dispose pas de charge Stripe à rembourser');

      // Must NOT render RefundForm
      expect(html).not.toContain('<form');
      expect(html).not.toContain('Tout rembourser');
    });
  });
});
