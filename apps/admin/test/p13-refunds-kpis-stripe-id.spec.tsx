import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { RefundsKpiBanner } from '../components/RefundsKpiBanner';
import { CopyableReference, formatShortReference } from '../components/CopyableReference';
import type { AdminRefundSummary } from '@revime/shared';

describe('P13: Remboursements — Period KPI Banner & Stripe ID Column', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. RefundsKpiBanner Component', () => {
    it('renders all 3 KPI cards with accurate formatted values', () => {
      const summary: AdminRefundSummary = {
        totalRefundedCents: 15450, // 154,50 €
        count: 12,
        averageRefundCents: 1288,  // 12,88 €
      };

      const html = renderToString(<RefundsKpiBanner summary={summary} />);

      expect(html).toContain('data-testid="refunds-kpi-banner"');
      expect(html).toContain('Total remboursé');
      expect(html).toContain('154,50');
      expect(html).toContain('Nombre de remboursements');
      expect(html).toContain('12');
      expect(html).toContain('Montant moyen');
      expect(html).toContain('12,88');
    });

    it('uses pure white surface, line border, and Google Sans typography tokens', () => {
      const summary: AdminRefundSummary = {
        totalRefundedCents: 5000,
        count: 1,
        averageRefundCents: 5000,
      };

      const html = renderToString(<RefundsKpiBanner summary={summary} />);

      expect(html).toContain('var(--paper, #ffffff)');
      expect(html).toContain('var(--line, #dfe2e2)');
      expect(html).toContain('var(--font-google-sans)');
    });
  });

  describe('2. Stripe ID Handling in CopyableReference', () => {
    it('preserves Stripe identifier intact without turning it into CMD-...', () => {
      const stripeId = 're_3Pq1234567890';
      const formatted = formatShortReference(stripeId);
      expect(formatted).toBe('re_3Pq1234567890');
    });

    it('renders CopyableReference for stripeRefundId with copy button and label', () => {
      const stripeId = 're_test_987654';
      const html = renderToString(<CopyableReference value={stripeId} />);

      expect(html).toContain('re_test_987654');
      expect(html).toContain('data-testid="copy-reference-button"');
      expect(html).toContain('aria-label="Copier re_test_987654"');
    });

    it('does not link a bare Stripe id to /commandes (the default CMD prefix used to)', () => {
      const html = renderToString(<CopyableReference value="re_test_987654" />);

      expect(html).not.toContain('href=');
    });
  });
});
