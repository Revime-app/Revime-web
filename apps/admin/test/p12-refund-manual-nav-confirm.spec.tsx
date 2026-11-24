import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { AdminNav, NAV_CATEGORIES, ROUTE_TITLES } from '../components/AdminNav';
import {
  RefundConfirmModal,
  handleRefundModalKeyDown,
  handleBackdropClick,
  type RefundConfirmModalProps,
} from '../components/RefundConfirmModal';
import { RefundForm, type RefundFormSummary } from '../components/RefundForm';
import { formatEuros } from '../lib/money';

// Mock next/navigation for AdminNav rendering
vi.mock('next/navigation', () => ({
  usePathname: () => '/remboursement',
}));

describe('P12: Remboursement Manuel — Navigation & Explicit Confirmation Modal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Sidebar Navigation Integration', () => {
    it('includes "/remboursement" with label "Remboursement manuel" under finance category', () => {
      const financeCat = NAV_CATEGORIES.find((cat) => cat.id === 'finance');
      expect(financeCat).toBeDefined();
      const item = financeCat?.items.find((i) => i.href === '/remboursement');
      expect(item).toBeDefined();
      expect(item?.label).toBe('Remboursement manuel');
    });

    it('has "/remboursement" mapped to "Remboursement manuel" in ROUTE_TITLES', () => {
      expect(ROUTE_TITLES['/remboursement']).toBe('Remboursement manuel');
    });

    it('renders navigation link with href="/remboursement" in AdminNav', () => {
      const html = renderToString(<AdminNav />);
      expect(html).toContain('href="/remboursement"');
      expect(html).toContain('Remboursement manuel');
    });
  });

  describe('2. RefundConfirmModal Component', () => {
    const defaultProps: RefundConfirmModalProps = {
      isOpen: true,
      onClose: vi.fn(),
      onConfirm: vi.fn(),
      submitting: false,
      commandeId: '2c53de51-0000-4000-8000-000000000001',
      clientName: 'Jean Dupont',
      repairerName: 'Atelier Express',
      breakdown: {
        repairCents: 4500,
        shippingCents: 1105,
        protectionCents: 500,
      },
      totalClientCents: 6105,
    };

    it('renders nothing when isOpen is false', () => {
      const html = renderToString(<RefundConfirmModal {...defaultProps} isOpen={false} />);
      expect(html).toBe('');
    });

    it('renders accessible modal dialog when isOpen is true', () => {
      const html = renderToString(<RefundConfirmModal {...defaultProps} />);
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Confirmation du remboursement');
    });

    it('displays commande reference, client name, and repairer name', () => {
      const html = renderToString(<RefundConfirmModal {...defaultProps} />);
      expect(html).toContain('CMD-2C53DE51');
      expect(html).toContain('Jean Dupont');
      expect(html).toContain('Atelier Express');
    });

    it('displays itemized breakdown of refunded amounts', () => {
      const html = renderToString(<RefundConfirmModal {...defaultProps} />);
      expect(html).toContain('Réparation remboursée');
      expect(html).toContain(formatEuros(4500));
      expect(html).toContain('Livraison remboursée');
      expect(html).toContain(formatEuros(1105));
      expect(html).toContain('Frais de protection');
      expect(html).toContain(formatEuros(500));
    });

    it('displays highlighted total amount and irreversibility warning', () => {
      const html = renderToString(<RefundConfirmModal {...defaultProps} />);
      expect(html).toContain('Total remboursé au client');
      expect(html).toContain(formatEuros(6105));
      expect(html).toContain('Attention : Ce montant sera immédiatement crédité sur la carte bancaire du client via Stripe. Cette opération est irréversible.');
    });

    it('renders confirm button in Bleu Ink with total amount and cancel button', () => {
      const html = renderToString(<RefundConfirmModal {...defaultProps} />);
      expect(html).toContain(`Confirmer le remboursement de ${formatEuros(6105)}`);
      expect(html).toContain('Annuler');
      // Verify Bleu Ink primary styling
      expect(html).toContain('var(--navy, #25324f)');
    });

    it('displays loading text in confirm button when submitting', () => {
      const html = renderToString(<RefundConfirmModal {...defaultProps} submitting={true} />);
      expect(html).toContain('Traitement…');
    });

    describe('Keyboard and Click Handlers', () => {
      it('triggers onClose when Escape key is pressed and not submitting', () => {
        const onClose = vi.fn();
        handleRefundModalKeyDown({ key: 'Escape' }, false, onClose);
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('does NOT trigger onClose when Escape key is pressed while submitting', () => {
        const onClose = vi.fn();
        handleRefundModalKeyDown({ key: 'Escape' }, true, onClose);
        expect(onClose).not.toHaveBeenCalled();
      });

      it('does NOT trigger onClose for other keys', () => {
        const onClose = vi.fn();
        handleRefundModalKeyDown({ key: 'Enter' }, false, onClose);
        expect(onClose).not.toHaveBeenCalled();
      });

      it('triggers onClose when backdrop is clicked and not submitting', () => {
        const onClose = vi.fn();
        handleBackdropClick(false, onClose);
        expect(onClose).toHaveBeenCalledTimes(1);
      });

      it('does NOT trigger onClose when backdrop is clicked while submitting', () => {
        const onClose = vi.fn();
        handleBackdropClick(true, onClose);
        expect(onClose).not.toHaveBeenCalled();
      });
    });
  });

  describe('3. RefundForm Modal Integration', () => {
    const summary: RefundFormSummary = {
      order: {
        repairCents: 8000,
        shippingCents: 1000,
        insuranceCents: 200,
        protectionCents: 500,
        transferred: false,
      },
      suggestion: {
        repairCents: 8000,
        shippingCents: 1200,
        protectionCents: 500,
      },
    };

    it('renders form with Rembourser submit button and accepts commande details props', () => {
      const html = renderToString(
        <RefundForm
          summary={summary}
          mode="commande"
          onSubmit={vi.fn()}
          commandeId="2c53de51-0000-4000-8000-000000000001"
          clientName="Jean Dupont"
          repairerName="Atelier Express"
        />
      );
      expect(html).toContain('Rembourser');
      // When modal is closed (initial state), dialog is not rendered
      expect(html).not.toContain('role="dialog"');
    });
  });
});
