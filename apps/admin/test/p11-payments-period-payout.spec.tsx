import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { PaymentsTable } from '../app/paiements/PaymentsTable';
import { PaymentsFilterBar } from '../app/paiements/PaymentsFilterBar';
import { PaymentsKpiCards } from '../app/paiements/PaymentsKpiCards';
import PaiementsPage, { sendAbandonStalePaymentsRequest } from '../app/paiements/page';
import type { AdminPaymentListItem, AdminPaymentMetricsDto } from '@revime/shared';

describe('P11 Paiements — Period Filters, Repairer Payout & Stale Abandonment', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe('1. Period filter dropdown', () => {
    it('renders the period select with 4 period options', () => {
      const html = renderToString(
        <PaymentsFilterBar
          searchInput=""
          onSearchInputChange={() => {}}
          status="ALL"
          onStatusChange={() => {}}
          step="ALL"
          onStepChange={() => {}}
          delivery="ALL"
          onDeliveryChange={() => {}}
          disputed="ALL"
          onDisputedChange={() => {}}
          period="all"
          onPeriodChange={() => {}}
          hasActiveFilters={false}
          onResetFilters={() => {}}
        />
      );

      expect(html).toContain('aria-label="Filtrer par période"');
      expect(html).toContain('Tout l&#x27;historique');
      expect(html).toContain('7 derniers jours');
      expect(html).toContain('30 derniers jours');
      expect(html).toContain('Ce mois-ci');
    });

    it('displays period note in KPI cards when period is set', () => {
      const sampleMetrics: AdminPaymentMetricsDto = {
        totalVolumeCents: 100000,
        commissionCents: 15000,
        escrowCents: 70000,
        refundedCents: 5000,
        disputedCount: 1,
      };

      const html7d = renderToString(<PaymentsKpiCards metrics={sampleMetrics} period="7d" />);
      expect(html7d).toContain('7 derniers jours');

      const htmlMonth = renderToString(<PaymentsKpiCards metrics={sampleMetrics} period="month" />);
      expect(htmlMonth).toContain('Ce mois-ci');

      const htmlAll = renderToString(<PaymentsKpiCards metrics={sampleMetrics} period="all" />);
      expect(htmlAll).toContain('Toutes commandes payées');
    });
  });

  describe('2. « Versement réparateur » column in PaymentsTable', () => {
    const makeItem = (overrides: Partial<AdminPaymentListItem>): AdminPaymentListItem => ({
      id: 'cmd-test-payout',
      createdAt: '2026-10-10T12:00:00.000Z',
      paidAt: '2026-10-10T12:05:00.000Z',
      status: 'PAID',
      step: 'PARCEL_SENT',
      delivery: 'PARCEL',
      totalCents: 10000,
      repairCents: 8000,
      shippingCents: 1200,
      protectionCents: 800,
      clientName: 'Client Test',
      clientEmail: 'client@test.com',
      repairerName: 'Rep Test',
      repairerEmail: 'rep@test.com',
      isDisputed: false,
      disputeId: null,
      disputeStatus: null,
      stripeChargeId: 'ch_1',
      stripeTransferId: null,
      stripeRefundId: null,
      refundedCents: null,
      cancellationPending: false,
      payoutStatus: 'NOT_APPLICABLE',
      payoutAmountCents: null,
      ...overrides,
    });

    it('renders column header "Versement réparateur"', () => {
      const html = renderToString(<PaymentsTable items={[]} onOpenDispute={() => {}} />);
      expect(html).toContain('Versement réparateur');
    });

    it('renders green badge for TRANSFERRED payoutStatus with amount', () => {
      const item = makeItem({
        id: 'cmd-transferred',
        payoutStatus: 'TRANSFERRED',
        payoutAmountCents: 8500,
      });

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={() => {}} />);
      expect(html).toContain('Transféré');
      expect(html).toContain('85,00');
      expect(html).toContain('var(--badge-success-text)');
      expect(html).toContain('var(--badge-success-bg)');
    });

    it('renders amber badge for PENDING payoutStatus with amount', () => {
      const item = makeItem({
        id: 'cmd-pending',
        payoutStatus: 'PENDING',
        payoutAmountCents: 6200,
      });

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={() => {}} />);
      expect(html).toContain('En attente');
      expect(html).toContain('62,00');
      expect(html).toContain('var(--badge-warning-text)');
      expect(html).toContain('var(--badge-warning-bg)');
    });

    it('renders red badge for FAILED payoutStatus', () => {
      const item = makeItem({
        id: 'cmd-failed',
        payoutStatus: 'FAILED',
        payoutAmountCents: null,
      });

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={() => {}} />);
      expect(html).toContain('Échoué');
      expect(html).toContain('var(--badge-danger-text)');
      expect(html).toContain('var(--badge-danger-bg)');
    });

    it('renders a REVERSED transfer as « Annulé » in the danger colours, not as « Échoué »', () => {
      const item = makeItem({ id: 'cmd-reversed', payoutStatus: 'REVERSED', payoutAmountCents: 8000 });

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={() => {}} />);
      expect(html).toContain('Annulé');
      expect(html).not.toContain('Échoué');
      expect(html).toContain('var(--badge-danger-bg)');
    });

    it('renders em dash — for NOT_APPLICABLE payoutStatus', () => {
      const item = makeItem({
        id: 'cmd-na',
        status: 'REFUNDED',
        payoutStatus: 'NOT_APPLICABLE',
        payoutAmountCents: null,
      });

      const html = renderToString(<PaymentsTable items={[item]} onOpenDispute={() => {}} />);
      expect(html).toContain('—');
      expect(html).not.toContain('Transféré');
      expect(html).not.toContain('En attente');
    });
  });

  describe('3. Stale Payments Abandonment', () => {
    it('sendAbandonStalePaymentsRequest dispatches POST /api/proxy/admin/payments/abandon-stale', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ count: 4 }),
      });

      const res = await sendAbandonStalePaymentsRequest(mockFetch as unknown as typeof fetch);
      expect(res).toEqual({ ok: true, count: 4 });
      expect(mockFetch).toHaveBeenCalledWith('/api/proxy/admin/payments/abandon-stale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('sendAbandonStalePaymentsRequest returns error on non-ok response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const res = await sendAbandonStalePaymentsRequest(mockFetch as unknown as typeof fetch);
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe("Impossible d'abandonner les paiements périmés.");
      }
    });

    it('renders abandon stale payments action button in PaiementsPage header', () => {
      const html = renderToString(<PaiementsPage />);
      expect(html).toContain('Abandonner les paiements périmés');
      expect(html).toContain('&gt; 24 h');
    });
  });
});
