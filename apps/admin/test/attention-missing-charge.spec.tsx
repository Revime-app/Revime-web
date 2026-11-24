import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { getStripePaymentUrl } from '../lib/attention-format';
import { AttentionTable, type AttentionItem } from '../app/attention/page';

describe('Bug B3: Commandes à surveiller - Missing Stripe Charge Handling', () => {
  describe('getStripePaymentUrl helper', () => {
    it('generates direct Stripe payment link when stripePaymentIntentId is present', () => {
      const url = getStripePaymentUrl({
        commandeId: '2c53de51-b157-430a-a924-9b63e1316960',
        stripePaymentIntentId: 'pi_3Pxxx12345',
      });
      expect(url).toBe('https://dashboard.stripe.com/payments/pi_3Pxxx12345');
    });

    it('falls back to Stripe search by commandeId when stripePaymentIntentId is missing', () => {
      const url = getStripePaymentUrl({
        commandeId: '2c53de51-b157-430a-a924-9b63e1316960',
        stripePaymentIntentId: null,
      });
      expect(url).toBe('https://dashboard.stripe.com/search?query=2c53de51-b157-430a-a924-9b63e1316960');
    });
  });

  describe('AttentionTable component rendering', () => {
    const chargeMissingItem: AttentionItem = {
      commandeId: 'cmd-charge-missing-1',
      demandeTitle: 'Écran iPhone 12 cassé',
      reason: 'CHARGE_MISSING',
      status: 'PAID',
      step: 'PAID',
      totalCents: 8900,
      since: '2026-10-10T12:00:00.000Z',
      stripePaymentIntentId: 'pi_missing_charge_1',
    };

    const stalledItem: AttentionItem = {
      commandeId: 'cmd-stalled-1',
      demandeTitle: 'Batterie iPad gonflée',
      reason: 'STALLED',
      status: 'PAID',
      step: 'REPAIR_STARTED',
      totalCents: 12000,
      since: '2026-10-09T10:00:00.000Z',
    };

    const cancellationItem: AttentionItem = {
      commandeId: 'cmd-cancel-1',
      demandeTitle: 'Microphone Samsung',
      reason: 'CANCELLATION_REQUESTED',
      status: 'PAID',
      step: 'PAID',
      totalCents: 4500,
      since: '2026-10-11T09:00:00.000Z',
    };

    it('proposes "Vérifier dans Stripe" and "Annuler la commande", and NOT "Rembourser", for CHARGE_MISSING orders (Bug B3)', () => {
      const html = renderToString(
        <AttentionTable
          items={[chargeMissingItem]}
          cancellingId={null}
          onCancel={vi.fn()}
        />
      );

      // Must NOT propose refund: there is no Stripe charge to refund
      expect(html).not.toContain('Rembourser');
      expect(html).not.toContain('/remboursement?commande=cmd-charge-missing-1');

      // Must propose "Vérifier dans Stripe" with external link
      expect(html).toContain('Vérifier dans Stripe');
      expect(html).toContain('https://dashboard.stripe.com/payments/pi_missing_charge_1');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');

      // Must propose "Annuler la commande"
      expect(html).toContain('Annuler la commande');
    });

    it('shows "Annulation..." and disables button when order cancellation is in flight', () => {
      const html = renderToString(
        <AttentionTable
          items={[chargeMissingItem]}
          cancellingId="cmd-charge-missing-1"
          onCancel={vi.fn()}
        />
      );

      expect(html).toContain('Annulation...');
      expect(html).toContain('disabled=""');
    });

    it('preserves existing action links for other attention reasons', () => {
      const html = renderToString(
        <AttentionTable
          items={[stalledItem, cancellationItem]}
          cancellingId={null}
          onCancel={vi.fn()}
        />
      );

      // STALLED order can still be refunded
      expect(html).toContain('/remboursement?commande=cmd-stalled-1');
      expect(html).toContain('Rembourser');

      // CANCELLATION_REQUESTED links to /annulations
      expect(html).toContain('/annulations?id=cmd-cancel-1');
      expect(html).toMatch(/Examiner l.*annulation|Voir la demande/);
    });
  });
});
